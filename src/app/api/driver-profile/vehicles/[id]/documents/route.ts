import type { NextResponse } from "next/server";
import { VehicleDocumentStatus } from "@prisma/client";

import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import type {
  VehicleDocumentErrorCode,
  VehicleDocumentErrorResponse,
  VehicleDocumentsResponse,
} from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { toVehicleDocumentsResponse } from "@/lib/mobile-api/serializers";
import { prisma } from "@/lib/prisma";
import {
  claimPendingUpload,
  releasePendingUpload,
} from "@/lib/uploads/pending-uploads";
import {
  discardVehicleDocumentObjects,
  getVehicleDocumentObjectInfo,
  type VehicleDocumentObjectInfo,
} from "@/lib/vehicle-document-storage";
import { getVehicleDocuments } from "@/lib/vehicle-documents/driver-documents";
import {
  MAX_VEHICLE_DOCUMENT_BYTES,
  MAX_VEHICLE_DOCUMENT_MB,
  isAllowedVehicleDocumentContentType,
  isVehicleDocumentObjectPath,
  isVehicleDocumentType,
  type VehicleDocumentType,
} from "@/lib/vehicle-documents/rules";
import {
  asRecord,
  nonEmptyString,
  readVehicleDocumentJsonBody,
  resolveVehicleDocumentContext,
  vehicleDocumentError,
  type VehicleDocumentContext,
} from "./guard";

export const dynamic = "force-dynamic";

/** A refusal decided before or inside the write, not yet a response. */
type Refusal = {
  message: string;
  code: VehicleDocumentErrorCode;
  status: number;
};

/** The body of both handlers' 200: the vehicle's documents as they now stand. */
async function documentsResponse(
  context: VehicleDocumentContext,
  t: RequestTranslator,
): Promise<NextResponse<VehicleDocumentsResponse>> {
  const { documents, history } = await getVehicleDocuments(
    context.vehicleId,
    t,
  );

  return hubApiOk<VehicleDocumentsResponse>(
    toVehicleDocumentsResponse(context, documents, history),
  );
}

/**
 * GET /api/driver-profile/vehicles/[id]/documents — the registration and
 * insurance of one vehicle the driver owns, with status, expiry and flag
 * reason, plus every upload ever registered for it.
 *
 * "Missing" is an ordinary answer here, not an error: onboarding collects
 * neither document, so every existing vehicle starts with both slots empty.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<
  NextResponse<VehicleDocumentsResponse | VehicleDocumentErrorResponse>
> {
  const t = await getRequestTranslations();
  const { id } = await params;

  const guard = await resolveVehicleDocumentContext(request, id, t);
  if ("response" in guard) {
    return guard.response;
  }

  return documentsResponse(guard.context, t);
}

/**
 * Judges an uploaded object by what Storage recorded for it, or returns `null`
 * when it may be registered. A size Storage did not report is treated as over
 * the limit — unverifiable fails closed.
 */
function refusalForObject(
  info: VehicleDocumentObjectInfo,
  t: RequestTranslator,
): Refusal | null {
  if (
    info.contentType === null ||
    !isAllowedVehicleDocumentContentType(info.contentType)
  ) {
    return {
      message: t("errors.vehicleDocuments.mustBeJpgOrPng"),
      code: "UNSUPPORTED_CONTENT_TYPE",
      status: 400,
    };
  }

  if (info.sizeBytes === null || info.sizeBytes > MAX_VEHICLE_DOCUMENT_BYTES) {
    return {
      message: t("errors.vehicleDocuments.fileTooLarge", {
        max: MAX_VEHICLE_DOCUMENT_MB,
      }),
      code: "FILE_TOO_LARGE",
      status: 400,
    };
  }

  return null;
}

/** What the write transaction decided. */
type WriteOutcome =
  | { notFound: true }
  /**
   * The path has no live `PendingUpload`: this server did not issue it for
   * this vehicle, or its URL has expired.
   */
  | { notPending: true }
  /** Objects no live row points at any more, to delete once committed. */
  | { discard: string[] };

/**
 * Records the upload as the type's submission, under the vehicle's row lock.
 *
 * - **Idempotent on the path**: registering a path that is already a row
 *   changes nothing and succeeds — a phone that lost the response retries.
 * - **Supersedes the previous submission**, never the document on file. A
 *   pending or flagged upload the driver is replacing is retired; the approved
 *   row stays live until a reviewer approves this one, so a renewal under
 *   review never leaves the vehicle without its valid document.
 *
 * `SELECT … FOR UPDATE` on the vehicle serialises two registrations for the
 * same slot, which would otherwise both find no submission and both insert —
 * the second tripping `vehicle_document_live_submission_unique`. It also
 * re-reads ownership, so a vehicle transferred or removed between the guard and
 * this write is refused rather than written to.
 */
async function writeSubmission(
  context: VehicleDocumentContext,
  type: VehicleDocumentType,
  path: string,
): Promise<WriteOutcome> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Vehicle" WHERE "id" = ${context.vehicleId} FOR UPDATE`;

    const vehicle = await tx.vehicle.findUnique({
      where: { id: context.vehicleId },
      select: { driverProfileId: true },
    });

    if (vehicle?.driverProfileId !== context.driverProfileId) {
      return { notFound: true };
    }

    const existing = await tx.vehicleDocument.findUnique({
      where: { storagePath: path },
      select: { id: true },
    });

    if (existing !== null) {
      return { discard: [] };
    }

    // After the idempotency check — a path already registered has, correctly,
    // no pending row left. Registering consumes the row, which is what frees
    // the vehicle's upload budget and makes a path registrable exactly once,
    // and only while its URL is still valid.
    const claimed = await claimPendingUpload(
      tx,
      { vehicleId: context.vehicleId },
      path,
      new Date(),
    );

    if (!claimed) {
      return { notPending: true };
    }

    const previous = await tx.vehicleDocument.findMany({
      where: {
        vehicleId: context.vehicleId,
        type,
        supersededAt: null,
        status: { not: VehicleDocumentStatus.APPROVED },
      },
      select: { id: true, storagePath: true },
    });

    if (previous.length > 0) {
      await tx.vehicleDocument.updateMany({
        where: { id: { in: previous.map((row) => row.id) } },
        data: { supersededAt: new Date() },
      });
    }

    await tx.vehicleDocument.create({
      data: { vehicleId: context.vehicleId, type, storagePath: path },
    });

    // An upload that was never accepted is not a record worth keeping the
    // image of; its row stays, so the history still shows it and its reason.
    return { discard: previous.map((row) => row.storagePath) };
  });
}

/**
 * POST /api/driver-profile/vehicles/[id]/documents — record a registration or
 * insurance file the app has just uploaded to Storage.
 *
 * Body: `{ type, path }`, where `path` came from `POST …/documents/upload-url`.
 * The bytes never pass through here, and no expiry date is accepted: the
 * reviewer records it at approval.
 *
 * Answers with the vehicle's documents after the write, so the app redraws the
 * row ("Under review") from one response.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<
  NextResponse<VehicleDocumentsResponse | VehicleDocumentErrorResponse>
> {
  const t = await getRequestTranslations();
  const { id } = await params;

  const guard = await resolveVehicleDocumentContext(request, id, t);
  if ("response" in guard) {
    return guard.response;
  }

  const { context } = guard;

  const parsedBody = await readVehicleDocumentJsonBody(request, t);
  if ("response" in parsedBody) {
    return parsedBody.response;
  }

  const fields = asRecord(parsedBody.body);
  if (fields === null) {
    return vehicleDocumentError(
      t("common.shared.requestBodyMustBeAJson"),
      "INVALID_REQUEST",
      400,
    );
  }

  const { type } = fields;
  if (!isVehicleDocumentType(type)) {
    return vehicleDocumentError(
      t("errors.vehicleDocuments.typeMustBeRegistrationOrInsurance"),
      "INVALID_REQUEST",
      400,
    );
  }

  const path = nonEmptyString(fields.path);
  if (path === null) {
    return vehicleDocumentError(
      t("errors.ordersPod.pathIsRequired"),
      "INVALID_REQUEST",
      400,
    );
  }

  // Before any Storage round trip — see `isVehicleDocumentObjectPath` for what
  // a path from another vehicle would otherwise be registered as.
  if (!isVehicleDocumentObjectPath(path, context.vehicleId, type)) {
    return vehicleDocumentError(
      t("errors.vehicleDocuments.thatUploadDoesNotBelongTo"),
      "INVALID_REQUEST",
      400,
    );
  }

  // What the app *claimed* when the URL was issued binds nothing. What Storage
  // recorded is what a signed read URL will serve, and how much the bucket is
  // holding — verify both before a row points at the object.
  let info: VehicleDocumentObjectInfo;
  try {
    info = await getVehicleDocumentObjectInfo(path);
  } catch (error) {
    console.error("Failed to verify a vehicle-document upload:", error);
    return vehicleDocumentError(
      t("errors.ordersPod.couldNotVerifyUpload"),
      "UPLOAD_NOT_FOUND",
      400,
    );
  }

  const objectRefusal = refusalForObject(info, t);
  if (objectRefusal) {
    // The path is spent, and the bucket should not keep a file no row will
    // ever reference.
    await discardVehicleDocumentObjects([path]);
    await releasePendingUpload(path);
    return vehicleDocumentError(
      objectRefusal.message,
      objectRefusal.code,
      objectRefusal.status,
    );
  }

  const outcome = await writeSubmission(context, type, path);

  if ("notFound" in outcome) {
    await discardVehicleDocumentObjects([path]);
    await releasePendingUpload(path);
    return vehicleDocumentError(
      t("common.shared.vehicleNotFound"),
      "NOT_FOUND",
      404,
    );
  }

  if ("notPending" in outcome) {
    // One answer with "the upload never arrived": to the app both mean "start
    // this upload again". No row points at the object, so it is removed.
    await discardVehicleDocumentObjects([path]);
    await releasePendingUpload(path);
    return vehicleDocumentError(
      t("errors.ordersPod.couldNotVerifyUpload"),
      "UPLOAD_NOT_FOUND",
      400,
    );
  }

  // The rows are the source of truth, so superseded objects go best-effort
  // after the commit — a Storage failure here leaves an orphan, not a bug.
  await discardVehicleDocumentObjects(outcome.discard);

  return documentsResponse(context, t);
}
