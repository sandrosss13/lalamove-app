import { NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import {
  deleteOrderPhotos,
  getOrderPhotoSignedUrl,
  uploadOrderPhoto,
} from "@/lib/order-photo-storage";
import {
  canAddOrderPhoto,
  isOrderPhotoEditableStatus,
  ORDER_PHOTO_MAX_BYTES,
  ORDER_PHOTO_MULTIPART_OVERHEAD_BYTES,
  orderPhotoStoragePath,
  validateOrderPhoto,
  type OrderPhotoErrorCode,
} from "@/lib/order-photos/rules";
import { prisma } from "@/lib/prisma";

// Buffers the upload and talks to Supabase with the service role key: Node
// only, never the edge.
export const runtime = "nodejs";

/** The one multipart field this endpoint reads. */
const FILE_FIELD = "file";

/** `{ error: CODE }` with the given status — the shape of every refusal here. */
function photoError(
  error: OrderPhotoErrorCode,
  status: number,
): NextResponse<{ error: OrderPhotoErrorCode }> {
  return NextResponse.json({ error }, { status });
}

/**
 * Thrown inside the insert transaction when the re-check under the row lock
 * refuses, so the transaction rolls back and the handler can answer with the
 * code. A class rather than a sentinel value because `$transaction` only rolls
 * back on a throw.
 */
class PhotoRefusal extends Error {
  constructor(
    readonly code: OrderPhotoErrorCode,
    readonly status: number,
  ) {
    super(code);
  }
}

/**
 * POST /api/orders/[id]/photos — attach one cargo photo to the caller's order.
 *
 * `multipart/form-data` with a single `file` field; one photo per request, so a
 * failed upload costs the client one photo rather than the batch. Answers
 * `201 { photo: { id, url } }`, `url` being a short-lived signed read URL.
 *
 * Called by the booking form between `POST /api/orders` (which returns the new
 * order's id) and the redirect to checkout, which is why the order must still
 * be `INITIATED`: once checkout settles it the order is on the load board, and
 * what a carrier was shown is frozen. See `src/lib/order-photos/rules.ts` for
 * every rule a file has to pass.
 *
 * Ownership is the `clientId` scope on the lookup, exactly as
 * `POST /api/orders/[id]/pay` does it: somebody else's order and a missing one
 * are the same `404`, so this endpoint cannot be used to probe which ids exist.
 *
 * ## Order of operations
 *
 * Validate the bytes, upload the object, *then* insert the row inside a
 * transaction that locks the order and re-checks the status and the count. The
 * count is also checked before the upload so the common case of a fourth photo
 * is refused without spending a Storage write; the re-check under the lock is
 * what actually holds the line against two uploads racing for the third slot,
 * or a payment landing mid-upload. A refused or failed insert removes the
 * object it just wrote, best-effort.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return photoError("UNAUTHORIZED", 401);
  }

  const { id } = await params;

  // Refuse an obviously oversized body before buffering any of it. Only a
  // cheap first line — `Content-Length` can be absent or wrong — so the parsed
  // file is measured again below.
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength >
      ORDER_PHOTO_MAX_BYTES + ORDER_PHOTO_MULTIPART_OVERHEAD_BYTES
  ) {
    return photoError("FILE_TOO_LARGE", 413);
  }

  const order = await prisma.order.findFirst({
    where: { id, clientId: session.user.id },
    select: { id: true, status: true, _count: { select: { photos: true } } },
  });

  if (!order) {
    return photoError("NOT_FOUND", 404);
  }

  if (!isOrderPhotoEditableStatus(order.status)) {
    return photoError("ORDER_NOT_EDITABLE", 409);
  }

  if (!canAddOrderPhoto(order._count.photos)) {
    return photoError("PHOTO_LIMIT", 409);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return photoError("INVALID_REQUEST", 400);
  }

  const file = formData.get(FILE_FIELD);
  // A string here is a text field named `file`, not an upload.
  if (!(file instanceof File)) {
    return photoError("FILE_REQUIRED", 400);
  }

  // Checked on the `File` before reading it into memory, then again by the
  // rules on the bytes actually received.
  if (file.size > ORDER_PHOTO_MAX_BYTES) {
    return photoError("FILE_TOO_LARGE", 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const verdict = validateOrderPhoto({ declaredType: file.type, bytes });
  if (!verdict.ok) {
    return photoError(
      verdict.error,
      verdict.error === "FILE_TOO_LARGE" ? 413 : 400,
    );
  }

  // `order.id` from the database, never the raw URL segment, goes into the
  // path, and the file name is generated — nothing the client typed reaches it.
  const storagePath = orderPhotoStoragePath(
    order.id,
    verdict.contentType,
    crypto.randomUUID(),
  );

  try {
    await uploadOrderPhoto(storagePath, bytes, verdict.contentType);
  } catch (error) {
    console.error("Cargo photo upload failed", { orderId: order.id, error });
    return photoError("UPLOAD_FAILED", 500);
  }

  let photoId: string;
  try {
    photoId = await prisma.$transaction(async (tx) => {
      // Row lock on the order: serialises concurrent uploads to it, and waits
      // out a payment's conditional `updateMany` so the status read below is
      // the settled one.
      const [locked] = await tx.$queryRaw<{ status: OrderStatus }[]>`
        SELECT "status" FROM "Order"
        WHERE "id" = ${order.id}
        FOR UPDATE
      `;

      // Re-read under the lock: the order may have been paid (or removed)
      // since the check above.
      if (!locked || !isOrderPhotoEditableStatus(locked.status)) {
        throw new PhotoRefusal("ORDER_NOT_EDITABLE", 409);
      }

      const existing = await tx.orderPhoto.count({
        where: { orderId: order.id },
      });
      if (!canAddOrderPhoto(existing)) {
        throw new PhotoRefusal("PHOTO_LIMIT", 409);
      }

      const created = await tx.orderPhoto.create({
        data: {
          orderId: order.id,
          storagePath,
          contentType: verdict.contentType,
          sizeBytes: bytes.length,
        },
        select: { id: true },
      });

      return created.id;
    });
  } catch (error) {
    // The object is written but will never have a row: remove it rather than
    // leave an orphan in the bucket. Best-effort — a failure here is logged,
    // and the refusal (or the original failure) is still what the client hears.
    await deleteOrderPhotos([storagePath]).catch((cleanupError: unknown) => {
      console.error("Failed to remove an unrecorded cargo photo", {
        storagePath,
        cleanupError,
      });
    });

    if (error instanceof PhotoRefusal) {
      return photoError(error.code, error.status);
    }

    console.error("Failed to record cargo photo", { orderId: order.id, error });
    return photoError("UPLOAD_FAILED", 500);
  }

  // The row is committed, so the photo exists whether or not a URL can be
  // signed right now. A signing failure is reported as an empty URL rather than
  // an error: answering 500 would invite a retry that the count would refuse.
  let url = "";
  try {
    url = await getOrderPhotoSignedUrl(storagePath);
  } catch (error) {
    console.error("Failed to sign a new cargo photo URL", { photoId, error });
  }

  return NextResponse.json({ photo: { id: photoId, url } }, { status: 201 });
}
