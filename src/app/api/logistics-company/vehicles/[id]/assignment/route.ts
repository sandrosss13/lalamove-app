import { NextResponse } from "next/server";
import {
  Prisma,
  type LicenceCategory,
  type VehicleClass,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import { findVehicleClass } from "@/lib/driver-onboarding/vehicle-classes";
import { prisma } from "@/lib/prisma";

/**
 * The persistent driver↔vehicle pairing (`DriverVehicleAssignment`), managed on
 * its own resource rather than as a field on the vehicle: the pairing has its
 * own lifetime — assigning creates a row, unassigning closes it — and closed
 * rows are kept as history, which a PATCH on the vehicle could not express.
 *
 * `drivers/register/route.ts` writes the same table when a company registers a
 * driver with a vehicle in one call; that flow stays where it is (its ownership
 * errors are 400s worded for a registration form), and the two share both
 * exclusivity rules and the licence-category gate below, wording each of them
 * identically.
 *
 * Both exclusivity rules — at most one live assignment per vehicle, and at most
 * one per driver — are backed by partial unique indexes on
 * `DriverVehicleAssignment`:
 *
 *     CREATE UNIQUE INDEX "driver_vehicle_assignment_live_vehicle_unique"
 *       ON "DriverVehicleAssignment"("vehicleId")        WHERE "unassignedAt" IS NULL;
 *     CREATE UNIQUE INDEX "driver_vehicle_assignment_live_driver_unique"
 *       ON "DriverVehicleAssignment"("driverProfileId")  WHERE "unassignedAt" IS NULL;
 *
 * The database, not this route, is what actually makes them hold. The
 * application-level pre-checks are kept regardless, because a raised unique
 * constraint is not a sentence a company can act on — they are what turns it
 * into "unassign it first". The insert is wrapped so the losing side of a real
 * race gets the same answer as the pre-check rather than a 500.
 */

/** Validated shape of an assign request body. */
type AssignInput = {
  /** The `User.id` of the driver, not their `DriverProfile.id`. */
  driverUserId: string;
};

/**
 * The licence category a vehicle's class requires, or `null` when the class is
 * unknown. `Vehicle.vehicleClass` is nullable because rows written before this
 * feature have none — for those, the gate does not apply and the assignment is
 * allowed through. Refusing them instead would make every pre-existing fleet
 * vehicle permanently unassignable, which is a worse failure than the gate not
 * covering rows that predate the column.
 *
 * The mapping itself is never restated here: it lives in
 * `src/lib/driver-onboarding/vehicle-classes.ts`, shared with the individual
 * driver wizard, so a class that changes category changes it for both flows at
 * once. The Prisma `VehicleClass` enum and the taxonomy's `VehicleClassId`
 * literal union hold identical members, so the column value passes straight in.
 *
 * Duplicated in `drivers/register/route.ts` rather than lifted into a `lib`
 * module, matching how `findVehicleClassNameBySpecCode` is already duplicated
 * across the admin/onboarding routes.
 */
function requiredCategoryForVehicle(vehicle: {
  vehicleClass: VehicleClass | null;
}): LicenceCategory | null {
  return vehicle.vehicleClass
    ? findVehicleClass(vehicle.vehicleClass).requiredLicenceCategory
    : null;
}

/**
 * Which of the two partial unique indexes a `P2002` came from, or `null` if the
 * error is something else entirely.
 *
 * Postgres reports either the offending column list (an array) or the index
 * name (a string) depending on how the constraint was created, so both shapes
 * are matched — the same technique `isDuplicatePhoneError` uses in
 * `api/logistics-company/route.ts`. `DriverVehicleAssignment` has no other
 * unique constraint, so within this route's single `create` the column names
 * are unambiguous.
 */
function liveAssignmentConflict(error: unknown): "VEHICLE" | "DRIVER" | null {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return null;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    if (target.includes("vehicleId")) return "VEHICLE";
    if (target.includes("driverProfileId")) return "DRIVER";
    return null;
  }

  if (typeof target === "string") {
    if (target.includes("driver_vehicle_assignment_live_vehicle_unique")) {
      return "VEHICLE";
    }
    if (target.includes("driver_vehicle_assignment_live_driver_unique")) {
      return "DRIVER";
    }
  }

  return null;
}

/**
 * The two exclusivity messages, in one place so the pre-checks and the P2002
 * fallback cannot drift apart: from the company's point of view the outcome is
 * the same ("someone already has it"), and giving one condition two different
 * messages depending on which microsecond it happened in would be a worse API.
 */
const LIVE_ASSIGNMENT_CONFLICT_ERROR = {
  VEHICLE: "This vehicle already has an active assignment. Unassign it first.",
  DRIVER:
    "This driver already has an active vehicle assignment. Unassign it first.",
} as const;

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * Roster membership needs a database read and so is checked in the handler.
 */
function parseAssignBody(
  body: unknown,
): { data: AssignInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const { driverUserId } = body as Record<string, unknown>;

  if (typeof driverUserId !== "string" || driverUserId.trim() === "") {
    return { error: "driverUserId is required." };
  }

  return { data: { driverUserId: driverUserId.trim() } };
}

/**
 * POST /api/logistics-company/vehicles/[id]/assignment — pair one of the
 * signed-in company's fleet vehicles with a driver on its own roster.
 *
 * Every lookup is scoped to the caller's own company, so a vehicle or driver
 * belonging to someone else is reported as 404 rather than 403 — the same
 * reasoning as the fleet and dispatch endpoints: a 403 would confirm the id
 * exists, letting a caller enumerate a competitor's fleet and staff.
 *
 * Reassigning a vehicle that already has an active assignment is rejected rather
 * than silently closing the existing one: unassigning is a decision about a
 * named driver, so it stays an explicit second call. The same holds for a driver
 * who already has a vehicle — the pairing is exclusive on both sides.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can assign vehicles." },
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

  const parsed = parseAssignBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { driverUserId } = parsed.data;
  const { id } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  // Both exclusivity checks and the write they guard run in one transaction —
  // the same grouping `drivers/register/route.ts` uses — so two concurrent
  // assign requests cannot interleave a read against the other's committed
  // insert. Under Postgres' default READ COMMITTED that narrows the window
  // rather than closing it, which is why the two partial unique indexes
  // described at the top of this file exist: the database rejects the second
  // live row outright. These pre-checks are what produce the actionable
  // messages for the ordinary (non-racing) case; the constraint violation a
  // real race raises is caught below and answered with the very same ones. The
  // reads are cheap and indexed, so the transaction stays short.
  //
  // Named rather than inlined so the `P2002` from the final insert can be
  // handled outside the transaction (see below) while `result` still infers its
  // "either an error to render or the created row" union from this callback.
  const assign = async (tx: Prisma.TransactionClient) => {
    // Scoped by owner, so this returns nothing for another company's vehicle or
    // for one owned by an independent driver.
    const vehicle = await tx.vehicle.findFirst({
      where: { id, companyId: company.id },
      select: {
        id: true,
        vehicleClass: true,
        assignments: { where: { unassignedAt: null }, select: { id: true } },
      },
    });

    if (!vehicle) {
      return { error: "Vehicle not found.", status: 404 } as const;
    }

    if (vehicle.assignments.length > 0) {
      return {
        error: LIVE_ASSIGNMENT_CONFLICT_ERROR.VEHICLE,
        status: 400,
      } as const;
    }

    // Scoped by roster membership, so this returns nothing for an independent
    // driver or one on another company's roster.
    const driverProfile = await tx.driverProfile.findFirst({
      where: { userId: driverUserId, companyId: company.id },
      select: { id: true, licence: { select: { categories: true } } },
    });

    if (!driverProfile) {
      return { error: "Driver not found.", status: 404 } as const;
    }

    // The licence-category gate, worded exactly as `drivers/register` words it
    // so a company sees one message for one rule regardless of which door it
    // came through. A driver with no licence row at all holds no categories and
    // so fails this for every classed vehicle — which is the correct answer to
    // "does this licence cover Category C?" when no licence is on file, and the
    // reason licence capture at registration had to come first.
    const required = requiredCategoryForVehicle(vehicle);
    if (required !== null) {
      const held = driverProfile.licence?.categories ?? [];
      if (!held.includes(required)) {
        return {
          error: `This vehicle needs category ${required}. Assign a different driver or vehicle.`,
          status: 400,
        } as const;
      }
    }

    // The mirror image of the vehicle rule: a driver holds at most one active
    // assignment too, otherwise one person would be "currently driving" several
    // vehicles at once and dispatch could not tell which. Checked across the
    // whole table rather than this company's fleet, because a driver's roster
    // membership is what scopes them and it is already verified above.
    const driverAssignment = await tx.driverVehicleAssignment.findFirst({
      where: { driverProfileId: driverProfile.id, unassignedAt: null },
      select: { id: true },
    });

    if (driverAssignment) {
      return {
        error: LIVE_ASSIGNMENT_CONFLICT_ERROR.DRIVER,
        status: 400,
      } as const;
    }

    // Everything above was true a moment ago; a concurrent request can still
    // have claimed either side in between. The partial unique indexes turn that
    // into a `P2002` rather than a second live row; it is caught outside the
    // transaction, since a failed statement aborts the Postgres transaction
    // block and nothing more can be done inside it.
    const assignment = await tx.driverVehicleAssignment.create({
      data: { driverProfileId: driverProfile.id, vehicleId: vehicle.id },
    });

    return { assignment } as const;
  };

  let result: Awaited<ReturnType<typeof assign>>;
  try {
    result = await prisma.$transaction(assign);
  } catch (error) {
    // The losing side of the race above. Mapped back onto the identical message
    // and status the corresponding pre-check would have given: from the
    // company's point of view the outcome is the same ("someone already has
    // it"), and giving one condition two different messages depending on which
    // microsecond it happened in would be a worse API. Anything that is not one
    // of the two live-assignment indexes is a genuine fault and is rethrown.
    //
    // Logged first, so the race stays observable and does not depend on anyone
    // noticing a status code change.
    const conflict = liveAssignmentConflict(error);
    if (conflict === null) {
      throw error;
    }

    console.error(
      `Vehicle assignment lost the race for a live ${conflict.toLowerCase()} slot:`,
      error,
    );

    return NextResponse.json(
      { error: LIVE_ASSIGNMENT_CONFLICT_ERROR[conflict] },
      { status: 400 },
    );
  }

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(result.assignment, { status: 201 });
}

/**
 * DELETE /api/logistics-company/vehicles/[id]/assignment — end the active
 * pairing on one of the signed-in company's fleet vehicles.
 *
 * The row is closed by stamping `unassignedAt` rather than deleted, so the
 * vehicle keeps a record of who drove it and when — the reason the pairing is a
 * join table instead of a bare column on `DriverProfile`.
 *
 * The driver is identified by the vehicle's own active assignment rather than
 * taken from the request: there is only ever one, so a body would add a way to
 * get it wrong and nothing else.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can unassign vehicles." },
      { status: 403 },
    );
  }

  const { id } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  // Scoped by owner, so this returns nothing for another company's vehicle or
  // for one owned by an independent driver.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, companyId: company.id },
    select: {
      id: true,
      assignments: {
        where: { unassignedAt: null },
        select: { id: true },
        // `driver_vehicle_assignment_live_vehicle_unique` now guarantees the
        // single-row invariant this ordering was hedging against, so it can
        // only ever match one row. Kept anyway: it costs nothing, and it makes
        // "the current assignment" deterministic rather than dependent on
        // whatever order the database happens to return, should the index ever
        // be dropped.
        orderBy: { assignedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  const active = vehicle.assignments[0];

  if (!active) {
    return NextResponse.json(
      { error: "This vehicle has no active assignment." },
      { status: 404 },
    );
  }

  const updated = await prisma.driverVehicleAssignment.update({
    where: { id: active.id },
    data: { unassignedAt: new Date() },
  });

  return NextResponse.json(updated, { status: 200 });
}
