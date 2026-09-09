import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  deleteVehiclePhotos,
  uploadVehiclePhoto,
} from "@/lib/supabase-storage";
import {
  findVehicleTypeSpecIdByCode,
  isDuplicatePlateError,
  nonEmptyString,
  parseYear,
  UNKNOWN_VEHICLE_TYPE_ERROR,
} from "./validation";

/** Form field carrying the (one or more) photo files. */
const PHOTO_FIELD = "photos";

/** Per-photo size ceiling, matching Supabase Storage's standard-upload limit. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Validated shape of a vehicle-creation request. */
type CreateVehicleInput = {
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  vehicleTypeCode: string;
  photos: File[];
};

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
 * GET /api/driver-profile/vehicles — list the signed-in driver's vehicles,
 * newest first. Only DRIVER users may call this. A driver who hasn't created
 * their profile yet simply has no vehicles, which is an empty list rather than
 * an error.
 *
 * The vehicle type is included because payload and cargo dimensions live on the
 * spec now, not on the vehicle row, so a bare vehicle says nothing about what
 * it can carry.
 *
 * Deliberately **not** closed to roster drivers, unlike the `POST` below. A
 * driver employed by a company listing the vehicles they own is reading their
 * own rows, and for a roster driver that list is simply empty — an honest
 * answer, not an error. The hub's Vehicles screen does not call this endpoint
 * at all (it renders server-side from `getHubVehicles()`), so refusing here
 * would change nothing the hub shows and would break any other consumer for no
 * gain.
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
    include: { vehicleTypeSpec: true },
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
 * Ownership is never taken from the request: the row is always written with the
 * caller's own profile and a null `companyId`, so an independent driver's
 * vehicle cannot be attributed to a company. Fleet vehicles go through
 * POST /api/logistics-company/vehicles instead.
 *
 * A driver who belongs to a company is refused outright with a `403`. Because
 * this route's owner column is always the driver, letting an employed driver
 * through would write them a personal vehicle their employer's fleet screens
 * cannot see and no dispatch path would ever assign — the vehicle would exist,
 * be theirs, and be useless. They get one from their fleet manager instead,
 * through a `DriverVehicleAssignment`. The check reads
 * `DriverProfile.companyId` off the lookup below and runs before anything is
 * uploaded; see the comment on it for why that column alone suffices here.
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

  const { plateNumber, make, model, year, vehicleTypeCode, photos } =
    parsed.data;

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    // `companyId` joins `id` for the roster check below. It rides on the query
    // the handler was making anyway, which is why this endpoint reads the
    // column directly instead of resolving the hub account: that path goes
    // through `requireDashboardSession()`, whose `redirect()` would throw
    // NEXT_REDIRECT out of a route handler answering a fetch.
    select: { id: true, companyId: true },
  });

  if (!driverProfile) {
    return NextResponse.json(
      { error: "Complete your driver profile before adding a vehicle." },
      { status: 400 },
    );
  }

  // A driver employed on a company's roster does not register their own
  // vehicle: they drive one the fleet owns, reached through an open
  // `DriverVehicleAssignment` that a fleet manager creates. Without this
  // refusal the create below would happily write them a `Vehicle` with
  // `companyId: null` — a personal row their employer's fleet screens cannot
  // see, that no dispatch path will assign work to, and that the fleet's own
  // vehicle-review pipeline never touched. It would exist, it would be theirs,
  // and it would be inert.
  //
  // `companyId` alone is the whole test *here* only because the role check
  // above has already refused every non-DRIVER session, and `resolveHubAccount`
  // assigns `kind: "BUSINESS"` for a COMPANY session alone. Anything reaching
  // this line is therefore an INDIVIDUAL-shaped account, so a non-null
  // `companyId` names an *employer* and can never name the caller's own
  // company. Elsewhere — `GET /api/loads`, `hubNavForAccount()` — the same rule
  // has to be spelled `kind === "INDIVIDUAL" && companyId !== null`, because
  // those surfaces serve both shapes from one code path. Fleet vehicles are
  // added through POST /api/logistics-company/vehicles instead.
  //
  // Refused here, before the type-spec lookup and before the photo upload
  // below: the cleanup path further down only runs when `vehicle.create`
  // throws, so a refusal returned after the uploads would strand objects in
  // the Storage bucket on every rejected attempt. Refuse before spending
  // anything.
  if (driverProfile.companyId !== null) {
    return NextResponse.json(
      {
        error:
          "Drivers who belong to a company drive their employer's vehicles. Ask your fleet manager to add this vehicle and assign it to you.",
      },
      { status: 403 },
    );
  }

  const vehicleTypeSpecId = await findVehicleTypeSpecIdByCode(vehicleTypeCode);
  if (vehicleTypeSpecId === null) {
    return NextResponse.json(
      { error: UNKNOWN_VEHICLE_TYPE_ERROR },
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
        // Exactly one owner column may be set (`vehicle_single_owner_check`);
        // spelling out the null makes that explicit rather than implied.
        companyId: null,
        vehicleTypeSpecId,
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
