import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  deleteVehiclePhotos,
  uploadVehiclePhoto,
} from "@/lib/supabase-storage";

/**
 * Fleet vehicles: the company-owned half of `Vehicle`. This deliberately
 * mirrors `src/app/api/driver-profile/vehicles/route.ts` rather than sharing an
 * abstraction with it — the two differ in owner column, role check and error
 * wording, and the project's route handlers stay small and direct (the
 * `client-profile`/`driver-profile` routes duplicate their validation helpers
 * the same way).
 */

/** Form field carrying the (one or more) photo files. */
const PHOTO_FIELD = "photos";

/** Per-photo size ceiling, matching Supabase Storage's standard-upload limit. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Oldest manufacturing year accepted — anything older is almost certainly a typo. */
const MIN_VEHICLE_YEAR = 1980;

/** Validated shape of a fleet-vehicle-creation request. */
type CreateVehicleInput = {
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  vehicleTypeCode: string;
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
 *
 * `vehicleTypeCode` is only checked for presence here; matching it to a real
 * `VehicleTypeSpec` needs a database read and so happens in the handler.
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

  const vehicleTypeCode = nonEmptyString(formData.get("vehicleTypeCode"));
  if (vehicleTypeCode === null) {
    return { error: "vehicleTypeCode is required." };
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
      vehicleTypeCode,
      photos: photos.value,
    },
  };
}

/**
 * GET /api/logistics-company/vehicles — list the signed-in company's fleet,
 * newest first. Only COMPANY users may call this. A company that hasn't created
 * its profile yet simply owns no vehicles, which is an empty list rather than
 * an error.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies have a fleet." },
      { status: 403 },
    );
  }

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json([], { status: 200 });
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { companyId: company.id },
    include: {
      vehicleTypeSpec: true,
      // The active `DriverVehicleAssignment`, if any, so the fleet list can show
      // who drives each vehicle without a second round-trip. At most one row per
      // vehicle is active at a time (enforced by the assignment routes, not the
      // database), so `take: 1` is the shape the caller can rely on.
      assignments: {
        where: { unassignedAt: null },
        select: {
          id: true,
          assignedAt: true,
          // Narrowed to what the fleet list renders: a driver's `phone` and
          // last known coordinates are not needed to label a row, and a list
          // endpoint should not hand them out by default.
          driverProfile: {
            select: {
              id: true,
              isOnline: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
        // Only one row should ever be active, but the ordering makes "the
        // current assignment" deterministic rather than dependent on whatever
        // order the database happens to return, should that rule ever be
        // breached.
        orderBy: { assignedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(vehicles, { status: 200 });
}

/**
 * POST /api/logistics-company/vehicles — register a vehicle owned by the
 * signed-in company. Only COMPANY users may call this, and only once their
 * company profile exists (the vehicle hangs off `LogisticsCompany`, so there is
 * nothing to attach it to before then).
 *
 * Ownership is never taken from the request: the row is always written with the
 * caller's own company and a null `driverProfileId`, which is what keeps the
 * `vehicle_single_owner_check` constraint satisfied by construction rather than
 * surfacing as a raw database error.
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

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can add fleet vehicles." },
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

  const { plateNumber, make, model, year, vehicleTypeCode, photos } =
    parsed.data;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json(
      { error: "Complete your company profile before adding a vehicle." },
      { status: 400 },
    );
  }

  // The taxonomy is seeded data rather than an enum, so the only way to know a
  // code is real is to look it up.
  const vehicleTypeSpec = await prisma.vehicleTypeSpec.findUnique({
    where: { code: vehicleTypeCode },
    select: { id: true },
  });

  if (!vehicleTypeSpec) {
    return NextResponse.json(
      { error: "vehicleTypeCode does not match a known vehicle type." },
      { status: 400 },
    );
  }

  let photoUrls: string[];
  try {
    // The first argument is only the Storage path prefix the objects are
    // grouped under, so a company id namespaces its fleet's photos the same way
    // a driver profile id namespaces a driver's.
    photoUrls = await Promise.all(
      photos.map((photo) => uploadVehiclePhoto(company.id, photo)),
    );
  } catch (error) {
    // A misconfigured bucket or a Storage outage — neither is the caller's
    // fault, and neither should surface as an unhandled crash.
    console.error("Fleet vehicle photo upload failed:", error);
    return NextResponse.json(
      { error: "Could not upload the vehicle photos. Please try again." },
      { status: 502 },
    );
  }

  let vehicle;
  try {
    vehicle = await prisma.vehicle.create({
      data: {
        companyId: company.id,
        // Exactly one owner column may be set (`vehicle_single_owner_check`);
        // spelling out the null makes that explicit rather than implied.
        driverProfileId: null,
        vehicleTypeSpecId: vehicleTypeSpec.id,
        plateNumber,
        make,
        model,
        year,
        photoUrls,
      },
      include: { vehicleTypeSpec: true },
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

    // `Vehicle.plateNumber` is unique across drivers and companies alike — one
    // registration per real vehicle. Anything else is unexpected and rethrown
    // rather than swallowed.
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
