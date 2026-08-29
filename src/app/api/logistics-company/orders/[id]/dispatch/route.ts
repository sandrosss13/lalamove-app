import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Validated shape of a dispatch request body. */
type DispatchInput = {
  driverUserId: string;
  vehicleId: string;
};

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 */
function parseDispatchBody(
  body: unknown,
): { data: DispatchInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const { driverUserId, vehicleId } = body as Record<string, unknown>;

  if (typeof driverUserId !== "string" || driverUserId.trim() === "") {
    return { error: "driverUserId is required." };
  }

  if (typeof vehicleId !== "string" || vehicleId.trim() === "") {
    return { error: "vehicleId is required." };
  }

  return {
    data: { driverUserId: driverUserId.trim(), vehicleId: vehicleId.trim() },
  };
}

/**
 * POST /api/logistics-company/orders/[id]/dispatch — a company assigns one of
 * its claimed deliveries to a driver on its roster, in one of its own fleet
 * vehicles (CLAIMED → ACCEPTED). From here the delivery behaves exactly like one
 * an independent driver accepted: the assigned driver starts and completes it.
 *
 * Every lookup is scoped to the caller's own company, so an order, driver or
 * vehicle belonging to someone else is reported as 404 rather than 403 — the
 * same reasoning as the roster and fleet endpoints: a 403 would confirm the id
 * exists, letting a caller enumerate a competitor's fleet and staff.
 *
 * The write itself is a plain `update` rather than a conditional `updateMany`:
 * the CLAIMED-by-this-company lookup above already establishes exclusive
 * ownership, so there is no second claimant to race with.
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
      { error: "Only logistics companies can dispatch deliveries." },
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

  const parsed = parseDispatchBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { driverUserId, vehicleId } = parsed.data;
  const { id } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true, activatedAt: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // The activation gate. `LogisticsCompany.activatedAt` is set only by the admin
  // activate endpoint, which refuses unless the company's details are verified
  // and at least one vehicle is approved — so this one column is the whole
  // "is this fleet allowed on the road" question, and the "at least one approved
  // vehicle" half of the requirement is enforced there rather than re-derived
  // here. Checked server-side and not only in the dashboard, because hiding a
  // button does nothing about a direct POST.
  //
  // A 403 with a specific message, unlike the 404s around it: those conceal
  // whether another company's id exists, whereas this is a fact about the
  // caller's *own* company and there is nothing to hide.
  if (company.activatedAt === null) {
    return NextResponse.json(
      {
        error:
          "Your fleet is still under review. Operations must activate the company before you can dispatch deliveries.",
      },
      { status: 403 },
    );
  }

  // Scoped by ownership *and* status: an order this company hasn't claimed, or
  // has already dispatched, is not dispatchable and is reported as missing.
  const order = await prisma.order.findFirst({
    where: { id, companyId: company.id, status: OrderStatus.CLAIMED },
    select: { id: true, vehicleTypeSpecId: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Scoped by roster membership, so this returns nothing for an independent
  // driver or one on another company's roster.
  const driverProfile = await prisma.driverProfile.findFirst({
    where: { userId: driverUserId, companyId: company.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json({ error: "Driver not found." }, { status: 404 });
  }

  // Scoped by owner, so this returns nothing for another company's vehicle or
  // for one owned by an independent driver.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, companyId: company.id },
    select: {
      id: true,
      vehicleTypeSpecId: true,
      // The review row for this vehicle, or null for a vehicle that predates
      // business applications (admin-created, or added through the fleet form).
      // Singular, because `BusinessApplicationVehicle.vehicleId` is `@unique`.
      applicationVehicle: { select: { status: true } },
    },
  });

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  // A vehicle that went through a fleet application has to have been approved:
  // the fleet is cleared vehicle by vehicle, so an activated company can still
  // hold a flagged or unreviewed one.
  //
  // A vehicle with no review row at all is grandfathered — there is no column on
  // `Vehicle` to backfill a verdict onto, and manufacturing review rows for
  // vehicles no reviewer ever looked at would fabricate a compliance record. The
  // null case can never be produced by the new flow: the onboarding submit
  // creates a `BusinessApplicationVehicle` for every vehicle in the same
  // transaction that creates the vehicle itself.
  //
  // Placed before the vehicle-type check below so a vehicle that is both
  // unapproved and of the wrong type is reported as unapproved. 400 rather than
  // 403: this is a fact about the vehicle named in the request body, which is a
  // bad-request condition alongside that type mismatch.
  if (
    vehicle.applicationVehicle !== null &&
    vehicle.applicationVehicle.status !== "APPROVED"
  ) {
    return NextResponse.json(
      {
        error:
          "This vehicle hasn't been approved yet. Only approved vehicles can be dispatched.",
      },
      { status: 400 },
    );
  }

  if (vehicle.vehicleTypeSpecId !== order.vehicleTypeSpecId) {
    return NextResponse.json(
      {
        error: "This vehicle's type doesn't match what this delivery requires.",
      },
      { status: 400 },
    );
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      driverId: driverUserId,
      vehicleId: vehicle.id,
      status: OrderStatus.ACCEPTED,
    },
  });

  return NextResponse.json(updated, { status: 200 });
}
