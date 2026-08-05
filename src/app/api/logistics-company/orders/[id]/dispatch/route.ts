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
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
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
    select: { id: true, vehicleTypeSpecId: true },
  });

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
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
