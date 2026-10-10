import type { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import type {
  OrderActionErrorCode,
  OrderActionErrorResponse,
  PodRegisterResponse,
} from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { orderActionError } from "@/lib/orders/action-errors";
import { ORDER_PROOF_SELECT, toOrderProof } from "@/lib/orders/pod";
import {
  MAX_POD_PHOTOS,
  isAllowedPodContentType,
  isPodKind,
  isPodObjectPath,
  maxPodBytes,
  resolveTakenAt,
  type PodKind,
} from "@/lib/orders/pod-rules";
import {
  discardPodObjects,
  getPodObjectInfo,
  type PodObjectInfo,
} from "@/lib/pod-storage";
import { prisma } from "@/lib/prisma";
import {
  claimPendingUpload,
  releasePendingUpload,
} from "@/lib/uploads/pending-uploads";
import {
  asRecord,
  lockOrderForPod,
  nonEmptyString,
  podInvalidState,
  readPodJsonBody,
  resolvePodContext,
  type PodContext,
} from "./guard";

export const dynamic = "force-dynamic";

const BYTES_PER_MB = 1024 * 1024;

/** A validated register body. */
type RegisterInput =
  | {
      kind: "PHOTO";
      path: string;
      takenAt: Date;
      replacesPhotoId: string | null;
    }
  | { kind: "SIGNATURE"; path: string };

/** A refusal decided before or inside the write, not yet a response. */
type Refusal = { message: string; code: OrderActionErrorCode; status: number };

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 */
function parseRegisterBody(
  fields: Record<string, unknown>,
  context: PodContext,
  t: RequestTranslator,
): { data: RegisterInput } | { refusal: Refusal } {
  const { orderId } = context;

  const invalid = (message: string): { refusal: Refusal } => ({
    refusal: { message, code: "INVALID_REQUEST", status: 400 },
  });

  const { kind } = fields;
  if (!isPodKind(kind)) {
    return invalid(t("errors.ordersPod.kindMustBePhotoOrSignature"));
  }

  const path = nonEmptyString(fields.path);
  if (path === null) {
    return invalid(t("errors.ordersPod.pathIsRequired"));
  }

  // Before any Storage round trip — see `isPodObjectPath` for what a path from
  // another order would otherwise be handed back as.
  if (!isPodObjectPath(path, orderId, kind)) {
    return invalid(t("errors.ordersPod.thatUploadDoesNotBelongTo"));
  }

  if (kind === "SIGNATURE") {
    return { data: { kind, path } };
  }

  // The device's claim is kept only inside the job's own window; outside it
  // the server's clock is recorded instead — see `resolveTakenAt`.
  const takenAt = resolveTakenAt(fields.takenAt, {
    startedAt: context.inTransitAt,
    now: new Date(),
  });
  if (takenAt === null) {
    return invalid(t("errors.ordersPod.takenAtInvalid"));
  }

  let replacesPhotoId: string | null = null;
  if (fields.replacesPhotoId !== undefined && fields.replacesPhotoId !== null) {
    replacesPhotoId = nonEmptyString(fields.replacesPhotoId);
    if (replacesPhotoId === null) {
      return invalid(t("errors.ordersPod.replacesPhotoIdInvalid"));
    }
  }

  return { data: { kind, path, takenAt, replacesPhotoId } };
}

/**
 * Judges an uploaded object by what Storage recorded for it, or returns `null`
 * when it may be registered.
 *
 * The size check is the server-side limit the onboarding documents flow never
 * had: nothing about a signed upload URL bounds the bytes PUT to it, so the
 * only place a per-file cap can be enforced is here, after the fact, against
 * the recorded size. A size Storage did not report is treated as over the
 * limit — unverifiable fails closed.
 */
function refusalForObject(
  kind: PodKind,
  info: PodObjectInfo,
  t: RequestTranslator,
): Refusal | null {
  if (
    info.contentType === null ||
    !isAllowedPodContentType(kind, info.contentType)
  ) {
    return {
      message:
        kind === "PHOTO"
          ? t("errors.ordersPod.photoMustBeJpgOrPng")
          : t("errors.ordersPod.signatureMustBePng"),
      code: "UNSUPPORTED_CONTENT_TYPE",
      status: 400,
    };
  }

  const maxBytes = maxPodBytes(kind);
  if (info.sizeBytes === null || info.sizeBytes > maxBytes) {
    const max = maxBytes / BYTES_PER_MB;

    return {
      message:
        kind === "PHOTO"
          ? t("errors.ordersPod.photoTooLarge", { max })
          : t("errors.ordersPod.signatureTooLarge", { max }),
      code: "FILE_TOO_LARGE",
      status: 400,
    };
  }

  return null;
}

/** What the write transaction decided. */
type WriteOutcome =
  | { refusal: Refusal }
  | { invalidState: true }
  /** Objects no row points at any more, to delete once committed. */
  | { discard: string[] };

/**
 * Records the upload under the order's row lock.
 *
 * Both branches are **idempotent on the path**: registering a path that is
 * already this order's photo (or already its signature) changes nothing and
 * succeeds. A phone that lost the response to a register call retries it, and
 * the alternative — a 400 for the retry — would leave the app unable to tell a
 * recorded photo from a rejected one.
 *
 * A path that is *not* already registered must have a live `PendingUpload` —
 * the row written when its upload URL was issued — and registering consumes
 * it. That is what frees the order's upload budget, and what makes a path
 * registrable exactly once and only while its URL is still valid (see
 * `src/lib/uploads/pending-uploads.ts` for why the row is required rather than
 * merely tidied up).
 */
async function writeProof(
  context: PodContext,
  input: RegisterInput,
  t: RequestTranslator,
): Promise<WriteOutcome> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockOrderForPod(tx, context))) {
      return { invalidState: true };
    }

    const { orderId } = context;

    // The 400 for a path with no live `PendingUpload`: this server did not
    // issue it for this order, or its URL has expired (and the sweep owns the
    // object now). One answer with "the upload never arrived" — to the app
    // both mean "start this upload again".
    const notPending: WriteOutcome = {
      refusal: {
        message: t("errors.ordersPod.couldNotVerifyUpload"),
        code: "UPLOAD_NOT_FOUND",
        status: 400,
      },
    };
    const now = new Date();

    if (input.kind === "SIGNATURE") {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        select: { podSignaturePath: true },
      });
      const previous = current?.podSignaturePath ?? null;

      if (previous === input.path) {
        return { discard: [] };
      }

      // After the idempotency check: a path already registered has, correctly,
      // no pending row left to claim.
      if (!(await claimPendingUpload(tx, { orderId }, input.path, now))) {
        return notPending;
      }

      await tx.order.update({
        where: { id: orderId },
        data: { podSignaturePath: input.path },
      });

      return { discard: previous === null ? [] : [previous] };
    }

    const photos = await tx.podPhoto.findMany({
      where: { orderId },
      select: { id: true, storagePath: true },
    });

    if (photos.some((photo) => photo.storagePath === input.path)) {
      return { discard: [] };
    }

    if (!(await claimPendingUpload(tx, { orderId }, input.path, now))) {
      return notPending;
    }

    const replaced =
      input.replacesPhotoId === null
        ? null
        : photos.find((photo) => photo.id === input.replacesPhotoId);

    // An id that names no photo on *this* order — including a real photo on
    // somebody else's — is one answer, so ids cannot be probed.
    if (replaced === undefined) {
      return {
        refusal: {
          message: t("errors.ordersPod.photoNotFound"),
          code: "NOT_FOUND",
          status: 404,
        },
      };
    }

    if (replaced === null && photos.length >= MAX_POD_PHOTOS) {
      return {
        refusal: {
          message: t("errors.ordersPod.photoLimit", { max: MAX_POD_PHOTOS }),
          code: "POD_PHOTO_LIMIT",
          status: 409,
        },
      };
    }

    if (replaced !== null) {
      await tx.podPhoto.delete({ where: { id: replaced.id } });
    }

    await tx.podPhoto.create({
      data: { orderId, storagePath: input.path, takenAt: input.takenAt },
    });

    return { discard: replaced === null ? [] : [replaced.storagePath] };
  });
}

/**
 * POST /api/orders/[id]/pod — record a proof-of-delivery image the app has just
 * uploaded to Storage.
 *
 * Body: `{ kind: "PHOTO", path, takenAt?, replacesPhotoId? }` or
 * `{ kind: "SIGNATURE", path }`, where `path` came from
 * `POST /api/orders/[id]/pod/upload-url`. The bytes never pass through here.
 *
 * Only the assigned driver, only while the order is `IN_TRANSIT`; at most
 * three photos and one signature. A new signature replaces the old one; a photo
 * is replaced by naming it in `replacesPhotoId`, or removed with
 * `DELETE /api/orders/[id]/pod/photos/[photoId]`.
 *
 * Answers with the order's whole proof after the write, signed, so the app
 * redraws its thumbnails from one response.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<PodRegisterResponse | OrderActionErrorResponse>> {
  const t = await getRequestTranslations();
  const { id } = await params;

  const guard = await resolvePodContext(request, id, t);
  if ("response" in guard) {
    return guard.response;
  }

  const { context } = guard;

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

  const parsed = parseRegisterBody(fields, context, t);
  if ("refusal" in parsed) {
    const { message, code, status } = parsed.refusal;
    return orderActionError(message, code, status);
  }

  const input = parsed.data;

  // What the app *claimed* when the URL was issued binds nothing. What Storage
  // recorded is what a signed read URL will serve, and how much the bucket is
  // holding — verify both before a row points at the object.
  let info: PodObjectInfo;
  try {
    info = await getPodObjectInfo(input.path);
  } catch (error) {
    console.error("Failed to verify a proof-of-delivery upload:", error);
    return orderActionError(
      t("errors.ordersPod.couldNotVerifyUpload"),
      "UPLOAD_NOT_FOUND",
      400,
    );
  }

  const objectRefusal = refusalForObject(input.kind, info, t);
  if (objectRefusal) {
    // Refused objects are removed rather than left for the driver to retry
    // against: the path is spent, and the bucket should not keep a file no row
    // will ever reference.
    await discardPodObjects([input.path]);
    await releasePendingUpload(input.path);
    return orderActionError(
      objectRefusal.message,
      objectRefusal.code,
      objectRefusal.status,
    );
  }

  let outcome: WriteOutcome;
  try {
    outcome = await writeProof(context, input, t);
  } catch (error) {
    // `PodPhoto.storagePath` is unique. Reaching this means the path is already
    // a photo row the idempotency check above could not see — two registrations
    // of one path racing. The winner recorded it; report the loser plainly.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return orderActionError(
        t("errors.ordersPod.thatUploadDoesNotBelongTo"),
        "INVALID_REQUEST",
        400,
      );
    }

    throw error;
  }

  if ("invalidState" in outcome) {
    return podInvalidState(t);
  }

  if ("refusal" in outcome) {
    const { message, code, status } = outcome.refusal;

    // The upload was valid but is not going to be recorded (the cap, an
    // unknown `replacesPhotoId`, or a URL that expired before this call), so
    // its object is orphaned unless removed — and its slot is given back.
    // Safe to delete: every refusal here is for a path no row points at.
    await discardPodObjects([input.path]);
    await releasePendingUpload(input.path);
    return orderActionError(message, code, status);
  }

  // The rows are the source of truth, so superseded objects go best-effort
  // after the commit — a Storage failure here leaves an orphan, not a bug.
  await discardPodObjects(outcome.discard);

  const rows = await prisma.order.findUniqueOrThrow({
    where: { id: context.orderId },
    select: ORDER_PROOF_SELECT,
  });

  return hubApiOk<PodRegisterResponse>(await toOrderProof(rows));
}
