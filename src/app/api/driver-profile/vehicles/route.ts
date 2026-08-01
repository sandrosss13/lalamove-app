import { NextResponse } from "next/server";
import { Prisma, VehicleType } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  deleteVehiclePhotos,
  uploadVehiclePhoto,
} from "@/lib/supabase-storage";

/** Valid `VehicleType` values, derived from the generated Prisma enum. */
const VEHICLE_TYPES = Object.values(VehicleType);

/** Form field carrying the (one or more) photo files. */
const PHOTO_FIELD = "photos";

/** Oldest manufacturing year accepted — anything older is almost certainly a typo. */
const MIN_VEHICLE_YEAR = 1980;

/** Per-photo size ceiling, matching Supabase Storage's standard-upload limit. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Validated shape of a vehicle-creation request. */
type CreateVehicleInput = {
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  vehicleType: VehicleType;
  capacityKg: number | null;
  photos: File[];
};

/** Trims a value and returns it only if it is a non-empty string, else null. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Parses the manufacturing year. Bounded on both ends: next year is allowed
 * because dealers register model years ahead of the calendar.
 */
function parseYear(value: unknown): { value: number } | { error: string } {
  const raw = nonEmptyString(value);
  if (raw === null) {
    return { error: "year is required." };
  }

  const year = Number(raw);
  const maxYear = new Date().getFullYear() + 1;

  if (!Number.isInteger(year) || year < MIN_VEHICLE_YEAR || year > maxYear) {
    return {
      error: `year must be a whole number between ${MIN_VEHICLE_YEAR} and ${maxYear}.`,
    };
  }

  return { value: year };
}

/**
 * Parses the optional load capacity. Returns `{ value: null }` when omitted,
 * and rejects zero/negative values — a capacity of 0 kg carries no information
 * and is better stored as "unknown".
 */
function parseOptionalCapacityKg(
  value: unknown,
): { value: number | null } | { error: string } {
  const raw = nonEmptyString(value);
  if (raw === null) {
    return { value: null };
  }

  const capacityKg = Number(raw);
  if (!Number.isFinite(capacityKg) || capacityKg <= 0) {
    return { error: "capacityKg must be a positive number when provided." };
  }

  return { value: capacityKg };
}

/**
 * Collects the uploaded photo files. Browsers submit an empty `<input
 * type="file">` as a zero-byte entry with a blank name, so those are dropped
 * before the "at least one photo" check rather than being uploaded as junk.
 */
function parsePhotos(
  formData: FormData,
): { value: File[] } | { error: string } {
  const photos = formData
    .getAll(PHOTO_FIELD)
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (photos.length === 0) {
    return { error: "At least one photo is required." };
  }

  for (const photo of photos) {
    if (!photo.type.startsWith("image/")) {
      return { error: `${photo.name} is not an image file.` };
    }

    if (photo.size > MAX_PHOTO_BYTES) {
      return {
        error: `${photo.name} is larger than ${MAX_PHOTO_BYTES / (1024 * 1024)} MB.`,
      };
    }
  }

  return { value: photos };
}

/**
 * Hand-rolled validation (the project has no validation library, and this stage
 * does not warrant adding one). Returns the typed input or an error message
 * describing the first problem encountered.
 *
 * This endpoint reads `multipart/form-data` rather than JSON because it carries
 * photo files alongside the text fields, so every scalar arrives as a string
 * and has to be coerced explicitly.
 */
function parseCreateVehicleForm(
  formData: FormData,
): { data: CreateVehicleInput } | { error: string } {
  const plateNumber = nonEmptyString(formData.get("plateNumber"));
  if (plateNumber === null) {
    return { error: "plateNumber is required." };
  }

  const make = nonEmptyString(formData.get("make"));
  if (make === null) {
    return { error: "make is required." };
  }

  const model = nonEmptyString(formData.get("model"));
  if (model === null) {
    return { error: "model is required." };
  }

  const year = parseYear(formData.get("year"));
  if ("error" in year) {
    return { error: year.error };
  }

  const vehicleType = formData.get("vehicleType");
  if (
    typeof vehicleType !== "string" ||
    !VEHICLE_TYPES.includes(vehicleType as VehicleType)
  ) {
    return {
      error: `vehicleType must be one of: ${VEHICLE_TYPES.join(", ")}.`,
    };
  }

  const capacityKg = parseOptionalCapacityKg(formData.get("capacityKg"));
  if ("error" in capacityKg) {
    return { error: capacityKg.error };
  }

  const photos = parsePhotos(formData);
  if ("error" in photos) {
    return { error: photos.error };
  }

  return {
    data: {
      // Plates are conventionally written in upper case; normalising here is
      // what makes the unique constraint meaningful, since Postgres would
      // otherwise treat "ab123cd" and "AB123CD" as two different vehicles.
      plateNumber: plateNumber.toUpperCase(),
      make,
      model,
      year: year.value,
      vehicleType: vehicleType as VehicleType,
      capacityKg: capacityKg.value,
      photos: photos.value,
    },
  };
}

/**
 * True when `error` is a unique-constraint violation (P2002) on `plateNumber` —
 * i.e. the caller tried to register a vehicle someone already registered.
 * `meta.target` is checked so an unrelated P2002 is not mislabelled. Postgres
 * reports either the column list or the index name ("Vehicle_plateNumber_key"),
 * so both shapes are handled.
 */
function isDuplicatePlateError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("plateNumber");
  }

  return typeof target === "string" && target.includes("plateNumber");
}

/**
 * GET /api/driver-profile/vehicles — list the signed-in driver's vehicles,
 * newest first. Only DRIVER users may call this. A driver who hasn't created
 * their profile yet simply has no vehicles, which is an empty list rather than
 * an error.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers have vehicles." },
      { status: 403 },
    );
  }

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json([], { status: 200 });
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { driverProfileId: driverProfile.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(vehicles, { status: 200 });
}

/**
 * POST /api/driver-profile/vehicles — register a vehicle for the signed-in
 * driver. Only DRIVER users may call this, and only once their profile exists
 * (the vehicle hangs off `DriverProfile`, so there is nothing to attach it to
 * before then).
 *
 * Photos are uploaded to Storage before the row is written, because the row
 * stores their URLs. If the write then fails the uploads are removed again, so
 * a rejected request doesn't leave orphaned objects behind.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers can add vehicles." },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request body must be multipart/form-data." },
      { status: 400 },
    );
  }

  const parsed = parseCreateVehicleForm(formData);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { plateNumber, make, model, year, vehicleType, capacityKg, photos } =
    parsed.data;

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json(
      { error: "Complete your driver profile before adding a vehicle." },
      { status: 400 },
    );
  }

  let photoUrls: string[];
  try {
    photoUrls = await Promise.all(
      photos.map((photo) => uploadVehiclePhoto(driverProfile.id, photo)),
    );
  } catch (error) {
    // A misconfigured bucket or a Storage outage — neither is the caller's
    // fault, and neither should surface as an unhandled crash.
    console.error("Vehicle photo upload failed:", error);
    return NextResponse.json(
      { error: "Could not upload the vehicle photos. Please try again." },
      { status: 502 },
    );
  }

  let vehicle;
  try {
    vehicle = await prisma.vehicle.create({
      data: {
        driverProfileId: driverProfile.id,
        plateNumber,
        make,
        model,
        year,
        vehicleType,
        capacityKg,
        photoUrls,
      },
    });
  } catch (error) {
    // The photos are already in Storage but nothing references them now; clean
    // up best-effort, and never let that cleanup mask the original failure.
    await deleteVehiclePhotos(photoUrls).catch((cleanupError: unknown) => {
      console.error(
        "Failed to clean up photos after a rejected vehicle create:",
        cleanupError,
      );
    });

    // `Vehicle.plateNumber` is unique — one registration per real vehicle.
    // Anything else is unexpected and rethrown rather than swallowed.
    if (isDuplicatePlateError(error)) {
      return NextResponse.json(
        { error: "This plate number is already registered." },
        { status: 409 },
      );
    }

    throw error;
  }

  return NextResponse.json(vehicle, { status: 201 });
}
