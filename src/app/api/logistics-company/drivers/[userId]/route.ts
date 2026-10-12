import { NextResponse } from "next/server";
import { DriverApplicationStatus } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { parseDriverPersonalId } from "@/lib/logistics-company/register-driver-input";
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
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      {
        error: t(
          "errors.logisticsCompanyDrivers.onlyLogisticsCompaniesCanRemoveDrivers",
        ),
      },
      { status: 403 },
    );
  }

  const { userId } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json(
      { error: t("common.shared.driverNotFound") },
      { status: 404 },
    );
  }

  // Scoped by roster membership, so this returns nothing for a driver who is
  // independent or belongs to another company.
  const driverProfile = await prisma.driverProfile.findFirst({
    where: { userId, companyId: company.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json(
      { error: t("common.shared.driverNotFound") },
      { status: 404 },
    );
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

/**
 * PATCH /api/logistics-company/drivers/[userId] — set the personal ID number of
 * a driver on the signed-in company's roster. Body: `{ idNumber: string }`.
 * Answers `{ userId, idNumber }`.
 *
 * Exists for drivers registered before `drivers/register` required the number
 * (and for correcting a typo in one that did): a client's order-details PDF
 * prints the carrying driver's personal number, so a company needs a way to
 * fill it in without re-registering anyone. The number is validated exactly
 * as registration validates it — trimmed, exactly 11 digits
 * (`parseDriverPersonalId`) — and written to `DriverProfile.idNumber`, the
 * same column the self-serve onboarding wizard writes.
 *
 * ## Refusals
 *
 * - 401 without a session; 403 for anyone but a COMPANY user.
 * - 404 `common.shared.driverNotFound` for a driver who is not on **this**
 *   company's roster — independent, on another fleet, or no such user — for
 *   the same membership-oracle reason `DELETE` gives above.
 * - 400 for a missing or malformed number. Blank is not a way to clear it:
 *   the field is required at registration, so there is no "remove" path.
 * - 409 `personalIdLockedVerified` once the driver has an `APPROVED`
 *   `DriverApplication`. That application is operations' verdict on the
 *   number the driver submitted with their own documents; letting the company
 *   overwrite it would quietly unpick a review nobody re-runs. The roster's
 *   `HubDriver.canEditIdNumber` mirrors this rule so the panel never offers an
 *   edit that ends here.
 *
 * Not gated on `mustChangePassword`, matching `DELETE` and `drivers/register`
 * beside it: no `logistics-company` mutation route checks that flag, and the
 * dashboard pages that host the panel already redirect such a session away.
 *
 * The check-then-write is not wrapped in a transaction: the only competing
 * write is an admin approving an application, which never touches `idNumber`,
 * so the worst a race can produce is a company edit landing a moment before
 * an approval — exactly the order the two would have taken had they been a
 * second apart.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      {
        error: t(
          "errors.logisticsCompanyDrivers.onlyLogisticsCompaniesCanEditDrivers",
        ),
      },
      { status: 403 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeAJson") },
      { status: 400 },
    );
  }

  // One message for both "required" and "invalid": there is no clearing path,
  // so a blank submission is just another number that is not 11 digits.
  const parsed = parseDriverPersonalId(
    (rawBody as Record<string, unknown>).idNumber,
  );
  if ("error" in parsed) {
    return NextResponse.json(
      { error: t("errors.logisticsCompanyDrivers.personalIdInvalid") },
      { status: 400 },
    );
  }

  const { userId } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json(
      { error: t("common.shared.driverNotFound") },
      { status: 404 },
    );
  }

  // Scoped by roster membership, exactly as in `DELETE`.
  const driverProfile = await prisma.driverProfile.findFirst({
    where: { userId, companyId: company.id },
    select: { id: true, application: { select: { status: true } } },
  });

  if (!driverProfile) {
    return NextResponse.json(
      { error: t("common.shared.driverNotFound") },
      { status: 404 },
    );
  }

  if (driverProfile.application?.status === DriverApplicationStatus.APPROVED) {
    return NextResponse.json(
      { error: t("errors.logisticsCompanyDrivers.personalIdLockedVerified") },
      { status: 409 },
    );
  }

  const updated = await prisma.driverProfile.update({
    where: { id: driverProfile.id },
    data: { idNumber: parsed.idNumber },
    select: { idNumber: true },
  });

  return NextResponse.json(
    { userId, idNumber: updated.idNumber },
    { status: 200 },
  );
}
