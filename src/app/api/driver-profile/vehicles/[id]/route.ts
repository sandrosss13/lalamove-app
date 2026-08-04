import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteVehiclePhotos } from "@/lib/supabase-storage";
import {
  findVehicleTypeSpecIdByCode,
  isDuplicatePlateError,
  nonEmptyString,
  parseYear,
  UNKNOWN_VEHICLE_TYPE_ERROR,
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
function parseUpdateVehicleBody(
  body: unknown,
): { data: UpdateVehicleInput } | { error: string } {
  // A JSON body of `null`, `[]` or a scalar has no fields to read.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const fields = body as Record<string, unknown>;

  const plateNumber = nonEmptyString(fields.plateNumber);
  if (plateNumber === null) {
    return { error: "plateNumber is required." };
  }

  const make = nonEmptyString(fields.make);
  if (make === null) {
    return { error: "make is required." };
  }

  const model = nonEmptyString(fields.model);
  if (model === null) {
    return { error: "model is required." };
  }

  // `parseYear` normalises via `nonEmptyString`, so a JSON number is
  // stringified first to go through the same checks the form-encoded create
  // path applies.
  const year = parseYear(
    typeof fields.year === "number" ? String(fields.year) : fields.year,
  );
  if ("error" in year) {
    return { error: year.error };
  }

  const vehicleTypeCode = nonEmptyString(fields.vehicleTypeCode);
  if (vehicleTypeCode === null) {
    return { error: "vehicleTypeCode is required." };
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
 * The database row is the source of truth, so the Storage objects are deleted
 * best-effort afterwards — a failure there is logged and the request still
 * succeeds, leaving at worst an orphaned file.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers can remove vehicles." },
      { status: 403 },
    );
  }

  const { id } = await params;

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  // Scoped by owner, so this returns nothing for another driver's vehicle.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, driverProfileId: driverProfile.id },
    select: { id: true, photoUrls: true },
  });

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  await prisma.vehicle.delete({ where: { id: vehicle.id } });

  await deleteVehiclePhotos(vehicle.photoUrls).catch((error: unknown) => {
    console.error("Failed to delete vehicle photos from Storage:", error);
  });

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
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers can edit vehicles." },
      { status: 403 },
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseUpdateVehicleBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { plateNumber, make, model, year, vehicleTypeCode } = parsed.data;

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  // Scoped by owner, so this returns nothing for another driver's vehicle.
  const existing = await prisma.vehicle.findFirst({
    where: { id, driverProfileId: driverProfile.id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  const vehicleTypeSpecId = await findVehicleTypeSpecIdByCode(vehicleTypeCode);
  if (vehicleTypeSpecId === null) {
    return NextResponse.json(
      { error: UNKNOWN_VEHICLE_TYPE_ERROR },
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
        { error: "This plate number is already registered." },
        { status: 409 },
      );
    }

    throw error;
  }

  return NextResponse.json(vehicle, { status: 200 });
}
