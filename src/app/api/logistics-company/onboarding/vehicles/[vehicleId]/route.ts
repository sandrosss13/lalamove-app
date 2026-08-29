import { NextResponse } from "next/server";
import type {
  ChassisType,
  LicenceCategory,
  VehicleClass,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDuplicatePlateError } from "@/app/api/driver-profile/vehicles/validation";
import { resolveVehicleTypeSpecCode } from "@/lib/driver-onboarding/vehicle-classes";
import { validateVehicleInput } from "@/lib/fleet-onboarding/vehicle-validation";

/**
 * PATCH /api/logistics-company/onboarding/vehicles/[vehicleId] — correct one
 * flagged vehicle during an action-required round trip.
 *
 * The status screen's per-vehicle "Fix" editor writes through here. It lives
 * beside the submit endpoint rather than with the status screen because it
 * shares that endpoint's validator: a value the first submit rejected must stay
 * rejected when the same company sends it back, and two copies of the rule set
 * is exactly how those two would drift apart.
 *
 * Keyed on `Vehicle.id`, not on the review row's id, because that is what the
 * status screen holds per row (`FleetVehicleVerdict.vehicleId`) and what
 * identifies the thing actually being edited.
 *
 * Two rows change, in one transaction: the `Vehicle` itself, and its
 * `BusinessApplicationVehicle` verdict, which is cleared back to `PENDING`.
 * Clearing the flag *here*, at the moment of saving, rather than at resubmit is
 * what lets the status screen's Resubmit button enable itself as the last flag
 * goes away.
 */

/** The only keys read off the body. Anything else — a `vehicleTypeSpecId`, an
 *  `id`, a `driverProfileId` — is ignored rather than trusted. */
const CORRECTABLE_KEYS = [
  "classId",
  "chassisType",
  "make",
  "model",
  "year",
  "plateNumber",
  "colour",
  "payloadKg",
  "cargoLengthM",
  "cargoWidthM",
  "cargoHeightM",
] as const;

/**
 * One `FleetVehicleVerdict`, field for field — the same shape the wizard's draft
 * context and `GET /api/logistics-company/onboarding` use, so the status screen
 * can fold this straight into its `vehicleVerdicts` list without a refetch and
 * without an adapter. Note `driver.name`, not `fullName`, and the split between
 * `id` (the review row, which the admin decides on) and `vehicleId` (the
 * vehicle, which this `PATCH` is keyed on).
 */
type CorrectedVehicle = {
  id: string;
  vehicleId: string;
  position: number;
  status: "PENDING";
  flagReason: null;
  chassisType: ChassisType;
  vehicleClass: VehicleClass;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  colour: string;
  payloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
  driver: {
    driverProfileId: string;
    name: string;
    phone: string;
    categories: LicenceCategory[];
  } | null;
};

/** True for a plain JSON object — an array is not a vehicle. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows the request body to the correctable keys, hand-rolled and consistent
 * with the rest of this API (the project deliberately uses no validation
 * library).
 *
 * Structural only: this decides *which* values are read, and
 * `validateVehicleInput` decides whether they are acceptable. Splitting it that
 * way is what keeps one rule set behind both this endpoint and the submit
 * endpoint.
 */
function parseVehicleCorrectionBody(
  body: unknown,
): { data: Record<string, unknown> } | { error: string } {
  if (!isJsonObject(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const data: Record<string, unknown> = {};
  for (const key of CORRECTABLE_KEYS) {
    data[key] = body[key];
  }

  return { data };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies have a fleet application." },
      { status: 403 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseVehicleCorrectionBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { vehicleId } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  // A caller with no company owns no vehicle, so this is the same 404 as an
  // unknown id — never a distinct message that would confirm the id exists.
  if (!company) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  // `vehicleId` is `@unique` on the review row, so this addresses exactly one.
  const row = await prisma.businessApplicationVehicle.findUnique({
    where: { vehicleId },
    select: {
      id: true,
      status: true,
      businessApplication: {
        select: { id: true, companyId: true, status: true },
      },
      vehicle: {
        select: {
          plateNumber: true,
          assignments: {
            where: { unassignedAt: null },
            // Exact rather than defensive: the partial unique index
            // `driver_vehicle_assignment_live_vehicle_unique` guarantees at most
            // one live row per vehicle at the database level.
            take: 1,
            select: {
              driverProfile: {
                select: {
                  id: true,
                  phone: true,
                  user: { select: { name: true } },
                  licence: { select: { categories: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // Not found and owned-by-another-company share one message, so ownership is
  // not probeable by comparing responses.
  if (
    !row ||
    !row.vehicle ||
    row.businessApplication.companyId !== company.id
  ) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  if (row.businessApplication.status !== "ACTION_REQUIRED") {
    return NextResponse.json(
      { error: "This application isn't open for corrections." },
      { status: 400 },
    );
  }

  if (row.status !== "FLAGGED") {
    return NextResponse.json(
      { error: "This vehicle wasn't flagged for correction." },
      { status: 400 },
    );
  }

  const now = new Date();
  const problems: string[] = [];
  // Labelled with the plate rather than a position: on this path the company is
  // editing one specific row it opened by its plate, not a numbered list.
  const validated = validateVehicleInput(
    parsed.data,
    row.vehicle.plateNumber,
    now,
    problems,
  );

  if (problems.length > 0 || validated === null) {
    return NextResponse.json(
      {
        error:
          problems[0] ??
          "Something in this vehicle is incomplete. Check each field and try again.",
      },
      { status: 400 },
    );
  }

  // Re-resolved from the (class, body) map server-side, exactly as the submit
  // endpoint does, so a `vehicleTypeSpecId` in the request body is not merely
  // ignored — it is unreachable. A locked cell was already rejected above, so a
  // null here would be a bug in `ValidatedVehicle`, not a bad request.
  const specCode = resolveVehicleTypeSpecCode(
    validated.classId,
    validated.chassisType,
  );
  const spec =
    specCode === null
      ? null
      : await prisma.vehicleTypeSpec.findUnique({
          where: { code: specCode },
          select: { id: true },
        });

  if (!spec) {
    // A missing row means the seeded catalogue and the class map have drifted
    // apart — a server fault, not a bad correction.
    console.error(
      `Vehicle type spec "${specCode}" is missing; cannot correct vehicle ${vehicleId}.`,
    );
    return NextResponse.json(
      { error: "We couldn't save this vehicle. Please try again." },
      { status: 500 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Nothing inside this callback catches: a failed statement leaves the
      // Postgres transaction block aborted, so swallowing an error here would
      // let the commit silently degrade into a rollback and report success.
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          // `companyId` and `driverProfileId` are deliberately absent: ownership
          // never changes here, and re-asserting `driverProfileId: null` would
          // only restate what `vehicle_single_owner_check` already holds.
          vehicleTypeSpecId: spec.id,
          vehicleClass: validated.classId,
          chassisType: validated.chassisType,
          plateNumber: validated.plateNumber,
          make: validated.make,
          model: validated.model,
          year: validated.year,
          colour: validated.colour,
          payloadKg: validated.payloadKg,
          cargoLengthM: validated.cargoLengthM,
          cargoWidthM: validated.cargoWidthM,
          cargoHeightM: validated.cargoHeightM,
        },
      });

      await tx.businessApplicationVehicle.update({
        where: { id: row.id },
        data: {
          // Saving a flagged vehicle clears its flag, in the same transaction as
          // the vehicle itself — that is what re-enables the status screen's
          // Resubmit button once the last flag is gone.
          status: "PENDING",
          flagReason: null,
          decidedAt: null,
          // The denormalised pair is re-stamped with what was just declared. A
          // correction may change the class (Medium Truck to Heavy Freight
          // Truck, say), and these columns are what the admin queue, the drawer
          // and the dispatch gate read when `vehicleId` is null — a stale copy
          // would have the reviewer approving a class the company no longer
          // claims.
          vehicleClass: validated.classId,
          chassisType: validated.chassisType,
        },
      });
    });
  } catch (error: unknown) {
    if (isDuplicatePlateError(error)) {
      return NextResponse.json(
        {
          error: "This plate number is already registered to another vehicle.",
        },
        { status: 409 },
      );
    }

    console.error("Failed to correct a business fleet vehicle:", error);
    return NextResponse.json(
      { error: "We couldn't save this vehicle. Please try again." },
      { status: 500 },
    );
  }

  // The 1-based row number, derived from `createdAt` ascending — there is no
  // `position` column, and the status screen numbers its rows this way.
  const siblings = await prisma.businessApplicationVehicle.findMany({
    where: { businessApplicationId: row.businessApplication.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const position = siblings.findIndex((sibling) => sibling.id === row.id) + 1;

  const driverProfile = row.vehicle.assignments[0]?.driverProfile;

  const body: { vehicle: CorrectedVehicle } = {
    vehicle: {
      id: row.id,
      vehicleId,
      position,
      status: "PENDING",
      flagReason: null,
      chassisType: validated.chassisType,
      vehicleClass: validated.classId,
      plateNumber: validated.plateNumber,
      make: validated.make,
      model: validated.model,
      year: validated.year,
      colour: validated.colour,
      payloadKg: validated.payloadKg,
      cargoLengthM: validated.cargoLengthM,
      cargoWidthM: validated.cargoWidthM,
      cargoHeightM: validated.cargoHeightM,
      driver: driverProfile
        ? {
            driverProfileId: driverProfile.id,
            // `User.name`, matching the roster and the onboarding GET, so the
            // three surfaces cannot disagree about a driver's display name.
            name: driverProfile.user.name,
            phone: driverProfile.phone,
            // Empty for a driver with no licence on file.
            categories: driverProfile.licence?.categories ?? [],
          }
        : null,
    },
  };

  return NextResponse.json(body, { status: 200 });
}
