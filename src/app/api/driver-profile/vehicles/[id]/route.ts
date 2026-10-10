import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteVehiclePhotos } from "@/lib/supabase-storage";
import { discardVehicleDocumentObjects } from "@/lib/vehicle-document-storage";
import {
  findVehicleTypeSpecIdByCode,
  isDuplicatePlateError,
  nonEmptyString,
  parseYear,
  UNKNOWN_VEHICLE_TYPE_ERROR_KEY,
} from "../validation";

/** Validated shape of a vehicle-edit request; photos are not editable here. */
type UpdateVehicleInput = {
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  vehicleTypeCode: string;
};

/**
 * Validates an edit payload, reusing the same helpers `POST` uses so the rules
 * cannot drift between creating and editing a vehicle. Returns the typed input
 * or a message describing the first problem encountered.
 *
 * Unlike `POST` this endpoint reads plain JSON — no file is involved — but the
 * caller still resends the full field set rather than a partial patch, matching
 * the convention of the profile routes.
 */
async function parseUpdateVehicleBody(
  body: unknown,
): Promise<{ data: UpdateVehicleInput } | { error: string }> {
  const tShared = await getRequestTranslations("common.shared");

  // A JSON body of `null`, `[]` or a scalar has no fields to read.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: tShared("requestBodyMustBeAJson") };
  }

  const fields = body as Record<string, unknown>;

  const plateNumber = nonEmptyString(fields.plateNumber);
  if (plateNumber === null) {
    return { error: tShared("platenumberIsRequired") };
  }

  const make = nonEmptyString(fields.make);
  if (make === null) {
    return { error: tShared("makeIsRequired") };
  }

  const model = nonEmptyString(fields.model);
  if (model === null) {
    return { error: tShared("modelIsRequired") };
  }

  // `parseYear` normalises via `nonEmptyString`, so a JSON number is
  // stringified first to go through the same checks the form-encoded create
  // path applies.
  const year = await parseYear(
    typeof fields.year === "number" ? String(fields.year) : fields.year,
  );
  if ("error" in year) {
    return { error: year.error };
  }

  const vehicleTypeCode = nonEmptyString(fields.vehicleTypeCode);
  if (vehicleTypeCode === null) {
    return { error: tShared("vehicletypecodeIsRequired") };
  }

  return {
    data: {
      // Normalised for the same reason `POST` normalises it: the unique
      // constraint would otherwise treat "ab123cd" and "AB123CD" as two
      // different vehicles.
      plateNumber: plateNumber.toUpperCase(),
      make,
      model,
      year: year.value,
      vehicleTypeCode,
    },
  };
}

/**
 * DELETE /api/driver-profile/vehicles/[id] — remove one of the signed-in
 * driver's vehicles.
 *
 * Ownership is part of the lookup, and a vehicle belonging to someone else is
 * reported as 404 rather than 403: a 403 would confirm that the id exists,
 * letting a caller enumerate other drivers' vehicles.
 *
 * ## What goes with it, and in what order
 *
 * A vehicle owns files in two buckets: its photos (public `vehicle-photos`)
 * and its registration/insurance uploads (private `driver-documents`, under
 * `vehicles/<id>/…`) — every `VehicleDocument` row's object, superseded ones
 * included, plus any upload that was issued a URL and never registered
 * (`PendingUpload`). The rows cascade with the vehicle; the objects do not,
 * and used to be left behind for good because the only record of their paths
 * was the rows just deleted.
 *
 * **The database goes first, the files after, and a Storage failure does not
 * fail the request.** Deliberately:
 *
 * - The paths are read and the vehicle deleted in **one transaction**, under
 *   the vehicle's row lock — the lock the document routes take — so no upload
 *   can be registered or issued between "these are its files" and "it is
 *   gone". The database is therefore never half-deleted: either the vehicle
 *   and all its rows are gone, or nothing is.
 * - Only after that commit are the objects removed, best-effort. The other
 *   order is the dangerous one: files deleted and then a failed (or rolled
 *   back) database delete would leave a live vehicle whose approved insurance
 *   points at nothing. An object without a row is clutter; a row without its
 *   object is a broken record.
 * - If Storage fails, the request still answers 200 — the vehicle *is* removed,
 *   and telling the driver otherwise would invite a retry that can only 404 —
 *   and the paths are logged, which is what makes the leftovers findable now
 *   that no row names them.
 *
 * ## What does not block a deletion
 *
 * Documents under review and past jobs do not, as before. A review is of a
 * vehicle the driver has withdrawn, so its queue entry rightly disappears with
 * it; and `Order.vehicleId` is `SetNull` precisely so that retiring a vehicle
 * never erases the deliveries it made.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: t("errors.driverProfileVehicles.onlyDriversCanRemoveVehicles") },
      { status: 403 },
    );
  }

  const { id } = await params;

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json(
      { error: t("common.shared.vehicleNotFound") },
      { status: 404 },
    );
  }

  // Scoped by owner, so this returns nothing for another driver's vehicle.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, driverProfileId: driverProfile.id },
    select: { id: true, photoUrls: true },
  });

  if (!vehicle) {
    return NextResponse.json(
      { error: t("common.shared.vehicleNotFound") },
      { status: 404 },
    );
  }

  const removed = await prisma.$transaction(async (tx) => {
    // The lock the document routes take (`writeSubmission`, the upload-URL
    // route), so the set of files read below cannot grow before the delete.
    await tx.$queryRaw`SELECT "id" FROM "Vehicle" WHERE "id" = ${vehicle.id} FOR UPDATE`;

    // Re-read under the lock: the pre-check above was for a readable 404, and
    // a second DELETE (a double tap) may have won since.
    const locked = await tx.vehicle.findFirst({
      where: { id: vehicle.id, driverProfileId: driverProfile.id },
      select: {
        photoUrls: true,
        // Every row, not only the live ones: a superseded *approved* document
        // keeps its object, and deleting a path that is already gone is a
        // no-op.
        documents: { select: { storagePath: true } },
        pendingUploads: { select: { storagePath: true } },
      },
    });

    if (locked === null) {
      return null;
    }

    await tx.vehicle.delete({ where: { id: vehicle.id } });

    return {
      photoUrls: locked.photoUrls,
      documentPaths: [
        ...locked.documents.map((document) => document.storagePath),
        ...locked.pendingUploads.map((upload) => upload.storagePath),
      ],
    };
  });

  if (removed === null) {
    return NextResponse.json(
      { error: t("common.shared.vehicleNotFound") },
      { status: 404 },
    );
  }

  // Committed. From here on a failure can only leave a file behind, never a
  // half-deleted vehicle — see the route's doc comment for why this order.
  await deleteVehiclePhotos(removed.photoUrls).catch((error: unknown) => {
    console.error(
      `Failed to delete the photos of removed vehicle ${vehicle.id} from Storage; orphaned objects:`,
      removed.photoUrls,
      error,
    );
  });

  await discardVehicleDocumentObjects(
    removed.documentPaths,
    `removed vehicle ${vehicle.id}`,
  );

  return NextResponse.json({ id: vehicle.id }, { status: 200 });
}

/**
 * PATCH /api/driver-profile/vehicles/[id] — correct the details of one of the
 * signed-in driver's vehicles. Only the scalar fields are editable; photos are
 * left as they are, so fixing a typo no longer costs the driver their uploads.
 *
 * Ownership is enforced the same way `DELETE` enforces it — scoped into the
 * lookup, and someone else's vehicle reported as 404 rather than 403 so the id
 * space cannot be enumerated.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: t("errors.driverProfileVehicles.onlyDriversCanEditVehicles") },
      { status: 403 },
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = await parseUpdateVehicleBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { plateNumber, make, model, year, vehicleTypeCode } = parsed.data;

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json(
      { error: t("common.shared.vehicleNotFound") },
      { status: 404 },
    );
  }

  // Scoped by owner, so this returns nothing for another driver's vehicle.
  const existing = await prisma.vehicle.findFirst({
    where: { id, driverProfileId: driverProfile.id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: t("common.shared.vehicleNotFound") },
      { status: 404 },
    );
  }

  const vehicleTypeSpecId = await findVehicleTypeSpecIdByCode(vehicleTypeCode);
  if (vehicleTypeSpecId === null) {
    return NextResponse.json(
      { error: t(UNKNOWN_VEHICLE_TYPE_ERROR_KEY) },
      { status: 400 },
    );
  }

  let vehicle;
  try {
    vehicle = await prisma.vehicle.update({
      where: { id: existing.id },
      data: { plateNumber, make, model, year, vehicleTypeSpecId },
      include: { vehicleTypeSpec: true },
    });
  } catch (error) {
    // `Vehicle.plateNumber` is unique — editing onto a plate someone else has
    // already registered is a conflict, not a server fault. Anything else is
    // unexpected and rethrown rather than swallowed.
    if (isDuplicatePlateError(error)) {
      return NextResponse.json(
        { error: t("common.shared.thisPlateNumberIsAlreadyRegistered") },
        { status: 409 },
      );
    }

    throw error;
  }

  return NextResponse.json(vehicle, { status: 200 });
}
