import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The persistent driver↔vehicle pairing (`DriverVehicleAssignment`), managed on
 * its own resource rather than as a field on the vehicle: the pairing has its
 * own lifetime — assigning creates a row, unassigning closes it — and closed
 * rows are kept as history, which a PATCH on the vehicle could not express.
 *
 * `drivers/register/route.ts` writes the same table when a company registers a
 * driver with a vehicle in one call; that flow stays where it is (its ownership
 * errors are 400s worded for a registration form), and the two only share the
 * "at most one active assignment per vehicle" rule, which has no database
 * constraint behind it and so is enforced by every writer independently.
 *
 * The same is true of the matching per-driver rule enforced below: with no
 * unique index to lean on, exclusivity is only as strong as the transaction the
 * checks and the insert share.
 */

/** Validated shape of an assign request body. */
type AssignInput = {
  /** The `User.id` of the driver, not their `DriverProfile.id`. */
  driverUserId: string;
};

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
  // insert. Under Postgres' default READ COMMITTED this narrows the window
  // rather than closing it; only a partial unique index on
  // (`vehicleId`)/(`driverProfileId`) where `unassignedAt IS NULL` would make
  // the rule airtight, and adding one is a schema change out of this route's
  // scope. The reads are cheap and indexed, so the transaction stays short.
  const result = await prisma.$transaction(async (tx) => {
    // Scoped by owner, so this returns nothing for another company's vehicle or
    // for one owned by an independent driver.
    const vehicle = await tx.vehicle.findFirst({
      where: { id, companyId: company.id },
      select: {
        id: true,
        assignments: { where: { unassignedAt: null }, select: { id: true } },
      },
    });

    if (!vehicle) {
      return { error: "Vehicle not found.", status: 404 } as const;
    }

    // "At most one active assignment per vehicle" has no database constraint
    // behind it (see `DriverVehicleAssignment` in the schema), so it is enforced
    // here, exactly as `drivers/register/route.ts` does.
    if (vehicle.assignments.length > 0) {
      return {
        error:
          "This vehicle already has an active assignment. Unassign it first.",
        status: 400,
      } as const;
    }

    // Scoped by roster membership, so this returns nothing for an independent
    // driver or one on another company's roster.
    const driverProfile = await tx.driverProfile.findFirst({
      where: { userId: driverUserId, companyId: company.id },
      select: { id: true },
    });

    if (!driverProfile) {
      return { error: "Driver not found.", status: 404 } as const;
    }

    // The mirror image of the rule above: a driver holds at most one active
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
        error:
          "This driver already has an active vehicle assignment. Unassign it first.",
        status: 400,
      } as const;
    }

    const assignment = await tx.driverVehicleAssignment.create({
      data: { driverProfileId: driverProfile.id, vehicleId: vehicle.id },
    });

    return { assignment } as const;
  });

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
        // Only one row should ever be active, but the ordering makes "the
        // current assignment" deterministic rather than dependent on whatever
        // order the database happens to return, should that rule ever be
        // breached.
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
