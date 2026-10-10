import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type {
  VehicleDocumentErrorResponse,
  VehicleDocumentUploadUrlResponse,
} from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { prisma } from "@/lib/prisma";
import {
  releasePendingUpload,
  reservePendingUpload,
} from "@/lib/uploads/pending-uploads";
import { MAX_PENDING_VEHICLE_DOCUMENT_UPLOADS } from "@/lib/uploads/rules";
import {
  createVehicleDocumentUploadUrl,
  discardVehicleDocumentObjects,
} from "@/lib/vehicle-document-storage";
import {
  isAllowedVehicleDocumentContentType,
  isVehicleDocumentType,
  vehicleDocumentObjectPath,
} from "@/lib/vehicle-documents/rules";
import {
  asRecord,
  nonEmptyString,
  readVehicleDocumentJsonBody,
  resolveVehicleDocumentContext,
  vehicleDocumentError,
} from "../guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/driver-profile/vehicles/[id]/documents/upload-url — issue a signed
 * upload URL for one registration or insurance file, first upload or renewal.
 *
 * The app uploads the bytes straight to Supabase Storage with the returned
 * `path`/`token`, then calls `POST …/documents` to record the result. The file
 * never passes through a route handler.
 *
 * The content type is checked here so an unsupported file gets a readable 400
 * before any bytes move, but that check is advisory — a signed upload URL
 * cannot pin what is later PUT to it. The register route re-checks the type
 * and the size against what Storage actually recorded.
 *
 * ## The bound on outstanding uploads
 *
 * Issuing a URL records a `PendingUpload` row for its path, under the
 * vehicle's row lock, and is refused — 429 `TOO_MANY_PENDING_UPLOADS`, with a
 * `Retry-After` — once `MAX_PENDING_VEHICLE_DOCUMENT_UPLOADS` are outstanding
 * for the vehicle. Registering removes the row; an abandoned upload stops
 * counting when its URL expires, and this call then deletes its object. The
 * reasoning, and what the bucket itself must enforce, is on the
 * proof-of-delivery twin of this route and in `src/lib/uploads/rules.ts`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<
  NextResponse<VehicleDocumentUploadUrlResponse | VehicleDocumentErrorResponse>
> {
  const t = await getRequestTranslations();
  const { id } = await params;

  const guard = await resolveVehicleDocumentContext(request, id, t);
  if ("response" in guard) {
    return guard.response;
  }

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

  const fileName = nonEmptyString(fields.fileName);
  if (fileName === null) {
    return vehicleDocumentError(
      t("common.shared.filenameIsRequiredAndMustBe"),
      "INVALID_REQUEST",
      400,
    );
  }

  const contentType = nonEmptyString(fields.contentType);
  if (contentType === null) {
    return vehicleDocumentError(
      t("common.shared.contenttypeIsRequiredAndMustBe"),
      "INVALID_REQUEST",
      400,
    );
  }

  if (!isAllowedVehicleDocumentContentType(contentType)) {
    return vehicleDocumentError(
      t("errors.vehicleDocuments.mustBeJpgOrPng"),
      "UNSUPPORTED_CONTENT_TYPE",
      400,
    );
  }

  const { context } = guard;
  const path = vehicleDocumentObjectPath(
    context.vehicleId,
    type,
    crypto.randomUUID(),
    fileName,
  );
  const now = new Date();

  // The vehicle's row lock — the one the register route and the reviewer take —
  // so two issues are counted in turn. Ownership is re-read under it, as
  // `writeSubmission` re-reads it: the vehicle may have been removed since the
  // guard ran.
  const reservation = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Vehicle" WHERE "id" = ${context.vehicleId} FOR UPDATE`;

    const vehicle = await tx.vehicle.findUnique({
      where: { id: context.vehicleId },
      select: { driverProfileId: true },
    });

    if (vehicle?.driverProfileId !== context.driverProfileId) {
      return null;
    }

    return reservePendingUpload(
      tx,
      { vehicleId: context.vehicleId },
      path,
      MAX_PENDING_VEHICLE_DOCUMENT_UPLOADS,
      now,
    );
  });

  if (reservation === null) {
    return vehicleDocumentError(
      t("common.shared.vehicleNotFound"),
      "NOT_FOUND",
      404,
    );
  }

  // Uploads whose URL expired unregistered: their rows are gone as of the
  // commit above, so their objects go now. Best-effort.
  await discardVehicleDocumentObjects(reservation.expiredPaths);

  if (!reservation.reserved) {
    const response = vehicleDocumentError(
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
    const { signedUrl, token } = await createVehicleDocumentUploadUrl(path);

    return hubApiOk<VehicleDocumentUploadUrlResponse>({
      path,
      signedUrl,
      token,
    });
  } catch (error) {
    // A missing bucket, absent Supabase env vars, or a Storage outage — none is
    // the driver's fault and none should be an unhandled 500.
    console.error("Failed to create a vehicle-document upload URL:", error);

    // No URL was issued, so nothing can be uploaded to this path: give the
    // slot back rather than let a Storage outage use up the vehicle's budget.
    await releasePendingUpload(path);

    return vehicleDocumentError(
      t("common.shared.couldNotPrepareTheUploadPlease"),
      "STORAGE_UNAVAILABLE",
      502,
    );
  }
}
