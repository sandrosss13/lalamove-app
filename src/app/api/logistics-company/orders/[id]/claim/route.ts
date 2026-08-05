import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/logistics-company/orders/[id]/claim — a logistics company takes an
 * open delivery off the market (PENDING → CLAIMED) without yet naming a driver
 * or a vehicle; that happens at dispatch.
 *
 * The claim mirrors the driver-accept path: a single conditional `updateMany`
 * (status PENDING and no company in the `where`) rather than a read-then-write,
 * so two companies racing for the same order can't both succeed — the database
 * applies at most one update and `count` tells us whether this request won.
 *
 * No body: which vehicle fulfils the order is a dispatch decision, and pinning
 * one at claim time would only go stale while the order waits.
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
      { error: "Only logistics companies can claim deliveries." },
      { status: 403 },
    );
  }

  const { id } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json(
      { error: "Complete your company profile before claiming deliveries." },
      { status: 400 },
    );
  }

  // Distinguish "no such order" (404) from "already taken / not pending" (409):
  // the conditional update alone can't tell them apart, so check existence first.
  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, vehicleTypeSpecId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Claiming a job the fleet cannot physically take would strand it in CLAIMED
  // with no dispatchable vehicle, so the type match is checked up front — the
  // same rule the dispatch endpoint then re-checks against the chosen vehicle.
  const matchingVehicle = await prisma.vehicle.findFirst({
    where: {
      companyId: company.id,
      vehicleTypeSpecId: existing.vehicleTypeSpecId,
    },
    select: { id: true },
  });

  if (!matchingVehicle) {
    return NextResponse.json(
      {
        error: "Your fleet has no vehicle of the type this delivery requires.",
      },
      { status: 400 },
    );
  }

  // Atomic claim: only rows that are still PENDING and unclaimed are updated.
  const { count } = await prisma.order.updateMany({
    where: { id, status: OrderStatus.PENDING, companyId: null },
    data: { companyId: company.id, status: OrderStatus.CLAIMED },
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
