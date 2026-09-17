import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/logistics-company/drivers/[userId] — remove a driver from the
 * signed-in company's roster.
 *
 * The driver keeps their account, profile and their own vehicles, and simply
 * becomes independent again (which is why the relation is `SetNull` rather than
 * `Cascade`). It no longer *only* clears the link, though: every live
 * `DriverVehicleAssignment` pairing them to a vehicle **this company owns** is
 * closed in the same transaction, so the fleet van comes back to the fleet
 * rather than staying out on loan to somebody who no longer works here. A
 * pairing to a vehicle the driver owns outright survives untouched — that
 * carve-out is spelled out at the transaction below, because getting it
 * backwards would take an independent driver's own truck off them.
 *
 * Those rows are closed by stamping `unassignedAt`, never deleted, matching
 * `DELETE /api/logistics-company/vehicles/[id]/assignment`: the pairing is a
 * join table rather than a column precisely so a vehicle keeps a record of who
 * drove it and when.
 *
 * Membership is part of the lookup, and a driver on someone else's roster is
 * reported as 404 rather than 403 — a 403 would confirm the account exists,
 * turning this into a membership oracle.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can remove drivers." },
      { status: 403 },
    );
  }

  const { userId } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Driver not found." }, { status: 404 });
  }

  // Scoped by roster membership, so this returns nothing for a driver who is
  // independent or belongs to another company.
  const driverProfile = await prisma.driverProfile.findFirst({
    where: { userId, companyId: company.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json({ error: "Driver not found." }, { status: 404 });
  }

  // One transaction, because the whole defect being fixed here is these two
  // facts disagreeing. Off the roster with a live pairing is the state the
  // dispatch dialog and the Vehicles screen had to start defending against;
  // released from the van while still employed is the same divergence pointing
  // the other way. Neither is a state any reader of a pairing can make sense
  // of, so they are made unreachable rather than defended against again.
  //
  // The array form rather than an interactive `$transaction(async (tx) => …)`:
  // nothing is read inside it — both statements are already scoped by ids read
  // above — so the array form does the job in one round trip without holding a
  // connection open across application logic.
  //
  // One timestamp, captured once: the closing instant *is* the departure, and
  // calling `new Date()` per statement would let the row claim a marginally
  // different moment from the event that caused it.
  const removedAt = new Date();

  await prisma.$transaction([
    // Scoped to vehicles **this company owns**, and that scope is the whole
    // point. `vehicle_single_owner_check`
    // (prisma/migrations/20260803182055_freight_platform_pivot/migration.sql)
    // makes every `Vehicle` carry exactly one of `driverProfileId` /
    // `companyId`, so "the company's" and "the driver's own" are disjoint and
    // exhaustive — this is an exact partition, not a heuristic. A driver paired
    // to a truck they own keeps that pairing: they are becoming independent,
    // not being parted from their vehicle, and closing it would be data loss in
    // the opposite direction. A pairing to some *third* company's vehicle is
    // likewise left alone; it is not this company's to end.
    //
    // Every current writer of this table already pairs a company vehicle
    // (`vehicles/[id]/assignment` POST finds the vehicle by
    // `{ id, companyId: company.id }`; `drivers/register` rejects a `vehicleId`
    // whose `companyId` is not the caller's; `onboarding/submit` creates the
    // row with `companyId` set and `driverProfileId: null`), so today this
    // filter narrows nothing. It is written anyway — it states the rule the
    // carve-out rests on at the one place where getting it wrong is silent, and
    // it still holds the day a fourth writer pairs a driver-owned vehicle.
    //
    // `unassignedAt: null` keeps this to live rows, so a pairing closed months
    // ago is not restamped with today's date and its history stays true.
    //
    // `updateMany` rather than `update`: `driver_vehicle_assignment_live_driver_unique`
    // means at most one row can match, but *zero* is the ordinary case for a
    // driver holding no fleet vehicle, and `update` would answer that with
    // P2025. Closing rows can only ever relax both partial unique indexes —
    // each is `WHERE "unassignedAt" IS NULL`, and this write is precisely what
    // takes a row out of that predicate — so it cannot trip either one.
    prisma.driverVehicleAssignment.updateMany({
      where: {
        driverProfileId: driverProfile.id,
        unassignedAt: null,
        vehicle: { companyId: company.id },
      },
      data: { unassignedAt: removedAt },
    }),
    // Second for readability only. The filter above keys on the *vehicle's*
    // owner rather than the driver's, so clearing `companyId` here neither
    // widens nor narrows it: the two statements commute, and the ordering
    // carries no correctness weight that the transaction is not already
    // carrying.
    prisma.driverProfile.update({
      where: { id: driverProfile.id },
      data: { companyId: null },
    }),
  ]);

  return NextResponse.json({ userId }, { status: 200 });
}
