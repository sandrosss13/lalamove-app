import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { deleteOrderPhotos } from "@/lib/order-photo-storage";
import {
  isOrderPhotoEditableStatus,
  type OrderPhotoErrorCode,
} from "@/lib/order-photos/rules";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** `{ error: CODE }` with the given status — the shape of every refusal here. */
function photoError(
  error: OrderPhotoErrorCode,
  status: number,
): NextResponse<{ error: OrderPhotoErrorCode }> {
  return NextResponse.json({ error }, { status });
}

/**
 * DELETE /api/orders/[id]/photos/[photoId] — remove one cargo photo from the
 * caller's order. `204` with no body on success.
 *
 * The same rules as adding one: the caller must be the order's client (a
 * missing order, somebody else's, and a photo that is not on this order are
 * all the same `404`), and the order must still be `INITIATED` — a paid order's
 * photos are what a carrier was shown, so they are frozen (`409`).
 *
 * The row goes first, then the object. The row is what every page reads, so
 * once it is gone the photo is gone as far as anybody can see; a Storage
 * failure after that leaves an orphaned object, which is logged and is a
 * tidiness problem rather than a correctness one.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return photoError("UNAUTHORIZED", 401);
  }

  const { id, photoId } = await params;

  // Scoped through the order's `clientId`, which is the ownership check.
  const photo = await prisma.orderPhoto.findFirst({
    where: { id: photoId, orderId: id, order: { clientId: session.user.id } },
    select: {
      id: true,
      storagePath: true,
      order: { select: { status: true } },
    },
  });

  if (!photo) {
    return photoError("NOT_FOUND", 404);
  }

  if (!isOrderPhotoEditableStatus(photo.order.status)) {
    return photoError("ORDER_NOT_EDITABLE", 409);
  }

  // Conditional on the order still being editable, so a payment landing
  // between the read above and this write cannot be followed by a removal.
  const { count } = await prisma.orderPhoto.deleteMany({
    where: {
      id: photo.id,
      order: { status: photo.order.status },
    },
  });

  if (count === 0) {
    // Either it was paid in between, or a concurrent DELETE won the race. The
    // second is a success from the caller's point of view, the first is not;
    // re-reading tells them apart.
    const stillThere = await prisma.orderPhoto.findUnique({
      where: { id: photo.id },
      select: { id: true },
    });
    if (stillThere) {
      return photoError("ORDER_NOT_EDITABLE", 409);
    }

    return new NextResponse(null, { status: 204 });
  }

  try {
    await deleteOrderPhotos([photo.storagePath]);
  } catch (error) {
    console.error("Failed to remove a deleted cargo photo's object", {
      photoId: photo.id,
      error,
    });
  }

  return new NextResponse(null, { status: 204 });
}
