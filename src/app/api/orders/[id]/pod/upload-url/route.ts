import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type {
  OrderActionErrorResponse,
  PodUploadUrlResponse,
} from "@/lib/mobile-api/contracts";
import { orderActionError } from "@/lib/orders/action-errors";
import {
  isAllowedPodContentType,
  isPodKind,
  podObjectPath,
} from "@/lib/orders/pod-rules";
import { createPodUploadUrl, discardPodObjects } from "@/lib/pod-storage";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { prisma } from "@/lib/prisma";
import {
  releasePendingUpload,
  reservePendingUpload,
} from "@/lib/uploads/pending-uploads";
import { MAX_PENDING_POD_UPLOADS } from "@/lib/uploads/rules";
import {
  asRecord,
  lockOrderForPod,
  nonEmptyString,
  podInvalidState,
  readPodJsonBody,
  resolvePodContext,
} from "../guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/orders/[id]/pod/upload-url — issue a signed upload URL for one
 * proof-of-delivery image (a photo, or the recipient's signature).
 *
 * The app uploads the bytes straight to Supabase Storage with the returned
 * `path`/`token`, then calls `POST /api/orders/[id]/pod` to record the result.
 * The file never passes through a route handler.
 *
 * The content type is checked here so an unsupported file gets a readable 400
 * before any bytes move, but that check is advisory — a signed upload URL
 * cannot pin what is later PUT to it. The register route re-checks the type
 * and the size against what Storage actually recorded.
 *
 * ## The bound on outstanding uploads
 *
 * Issuing a URL records a `PendingUpload` row for its path, under the order's
 * row lock, and is refused — 429 `TOO_MANY_PENDING_UPLOADS`, with a
 * `Retry-After` — once `MAX_PENDING_POD_UPLOADS` are outstanding for the order.
 * Registering an upload removes its row, so a driver who uploads and registers
 * never meets the limit however many photos they retake; only uploads that are
 * started and abandoned count, and each stops counting when its URL expires.
 * The same call sweeps those expired rows and **deletes their objects**, which
 * is what reclaims an abandoned upload.
 *
 * Counted in the database, not in memory, because the deployment is serverless.
 * It bounds how *many* unregistered objects an order can have; what each one
 * may be is the bucket's own limit — `REQUIRED_BUCKET_LIMITS` in
 * `src/lib/uploads/rules.ts`.
 *
 * The three-photo cap is separate and still enforced at registration.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<PodUploadUrlResponse | OrderActionErrorResponse>> {
  const t = await getRequestTranslations();
  const { id } = await params;

  const guard = await resolvePodContext(request, id, t);
  if ("response" in guard) {
    return guard.response;
  }

  const parsedBody = await readPodJsonBody(request, t);
  if ("response" in parsedBody) {
    return parsedBody.response;
  }

  const fields = asRecord(parsedBody.body);
  if (fields === null) {
    return orderActionError(
      t("common.shared.requestBodyMustBeAJson"),
      "INVALID_REQUEST",
      400,
    );
  }

  const { kind } = fields;
  if (!isPodKind(kind)) {
    return orderActionError(
      t("errors.ordersPod.kindMustBePhotoOrSignature"),
      "INVALID_REQUEST",
      400,
    );
  }

  const fileName = nonEmptyString(fields.fileName);
  if (fileName === null) {
    return orderActionError(
      t("common.shared.filenameIsRequiredAndMustBe"),
      "INVALID_REQUEST",
      400,
    );
  }

  const contentType = nonEmptyString(fields.contentType);
  if (contentType === null) {
    return orderActionError(
      t("common.shared.contenttypeIsRequiredAndMustBe"),
      "INVALID_REQUEST",
      400,
    );
  }

  if (!isAllowedPodContentType(kind, contentType)) {
    return orderActionError(
      kind === "PHOTO"
        ? t("errors.ordersPod.photoMustBeJpgOrPng")
        : t("errors.ordersPod.signatureMustBePng"),
      "UNSUPPORTED_CONTENT_TYPE",
      400,
    );
  }

  const { context } = guard;
  const path = podObjectPath(
    context.orderId,
    kind,
    crypto.randomUUID(),
    fileName,
  );
  const now = new Date();

  // The lock every POD write takes, so two issues for one order are counted in
  // turn — and so the status is re-read under it, like every other POD write.
  const reservation = await prisma.$transaction(async (tx) => {
    if (!(await lockOrderForPod(tx, context))) {
      return null;
    }

    return reservePendingUpload(
      tx,
      { orderId: context.orderId },
      path,
      MAX_PENDING_POD_UPLOADS,
      now,
    );
  });

  if (reservation === null) {
    return podInvalidState(t);
  }

  // Uploads whose URL expired unregistered: their rows are gone as of the
  // commit above, so their objects go now. Best-effort, as every other discard.
  await discardPodObjects(reservation.expiredPaths);

  if (!reservation.reserved) {
    const response = orderActionError(
      t("errors.uploads.tooManyPendingUploads", {
        minutes: Math.ceil(reservation.retryAfterSeconds / 60),
      }),
      "TOO_MANY_PENDING_UPLOADS",
      429,
    );
    response.headers.set("Retry-After", String(reservation.retryAfterSeconds));

    return response;
  }

  try {
    const { signedUrl, token } = await createPodUploadUrl(path);

    return hubApiOk<PodUploadUrlResponse>({ path, signedUrl, token });
  } catch (error) {
    // A missing `delivery-proofs` bucket (a manual provisioning step, so the
    // expected first-run failure), absent Supabase env vars, or a Storage
    // outage — none is the driver's fault and none should be an unhandled 500.
    console.error("Failed to create a proof-of-delivery upload URL:", error);

    // No URL was issued, so nothing can be uploaded to this path: give the
    // slot back rather than let a Storage outage use up the order's budget.
    await releasePendingUpload(path);

    return orderActionError(
      t("common.shared.couldNotPrepareTheUploadPlease"),
      "STORAGE_UNAVAILABLE",
      502,
    );
  }
}
