import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/orders/[id]/accept — a driver claims a pending, unassigned order.
 *
 * The claim is done with a single conditional `updateMany` (status PENDING and
 * driverId null in the `where`) rather than a read-then-write, so two drivers
 * racing for the same order can't both succeed: the database applies at most one
 * update and `count` tells us whether this request won.
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

  const { id } = await params;

  // Distinguish "no such order" (404) from "already taken / not pending" (409):
  // the conditional update alone can't tell them apart, so check existence first.
  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Atomic claim: only rows that are still PENDING and unassigned are updated.
  const { count } = await prisma.order.updateMany({
    where: { id, status: OrderStatus.PENDING, driverId: null },
    data: { driverId: session.user.id, status: OrderStatus.ACCEPTED },
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
