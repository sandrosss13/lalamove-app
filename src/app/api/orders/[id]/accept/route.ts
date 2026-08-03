import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 */
function parseAcceptOrderBody(
  body: unknown,
): { data: { vehicleId: string } } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const { vehicleId } = body as Record<string, unknown>;

  if (typeof vehicleId !== "string" || vehicleId.trim() === "") {
    return { error: "vehicleId is required." };
  }

  return { data: { vehicleId: vehicleId.trim() } };
}

/**
 * POST /api/orders/[id]/accept — a driver claims a pending, unassigned order
 * with one of their registered vehicles, recorded on the order.
 *
 * The claim is done with a single conditional `updateMany` (status PENDING and
 * driverId null in the `where`) rather than a read-then-write, so two drivers
 * racing for the same order can't both succeed: the database applies at most one
 * update and `count` tells us whether this request won.
 *
 * The vehicle is looked up scoped to the caller's own profile, and a vehicle
 * belonging to someone else is reported as 404 rather than 403 — the same
 * reasoning as DELETE /api/driver-profile/vehicles/[id]: a 403 would confirm
 * that the id exists, letting a caller enumerate other drivers' vehicles.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers can accept deliveries." },
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

  const parsed = parseAcceptOrderBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { vehicleId } = parsed.data;
  const { id } = await params;

  // Distinguish "no such order" (404) from "already taken / not pending" (409):
  // the conditional update alone can't tell them apart, so check existence first.
  // The order's own `vehicleType` is what the chosen vehicle has to match.
  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, vehicleType: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  // Scoped by owner, so this returns nothing for another driver's vehicle.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, driverProfileId: driverProfile.id },
    select: { id: true, vehicleType: true },
  });

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  if (vehicle.vehicleType !== existing.vehicleType) {
    return NextResponse.json(
      {
        error: "This vehicle's type doesn't match what this delivery requires.",
      },
      { status: 400 },
    );
  }

  // Atomic claim: only rows that are still PENDING and unassigned are updated.
  const { count } = await prisma.order.updateMany({
    where: { id, status: OrderStatus.PENDING, driverId: null },
    data: {
      driverId: session.user.id,
      vehicleId: vehicle.id,
      status: OrderStatus.ACCEPTED,
    },
  });

  if (count === 0) {
    return NextResponse.json(
      { error: "This delivery is no longer available." },
      { status: 409 },
    );
  }

  const order = await prisma.order.findUnique({ where: { id } });
  return NextResponse.json(order, { status: 200 });
}
