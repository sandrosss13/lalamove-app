import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { ORDER_PARTY_SELECT } from "@/lib/order-response-select";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/orders/[id]/start — the assigned driver marks their delivery as
 * under way (ACCEPTED → IN_TRANSIT), stamping `inTransitAt`.
 *
 * Only the driver the order is assigned to may call this, whether they took the
 * job themselves or their company dispatched it to them: after dispatch the two
 * paths are identical, so there is one lifecycle endpoint rather than one per
 * supply side.
 *
 * Unlike accepting, this needs no conditional `updateMany`: exactly one driver
 * is assigned to an order, so there is no second caller to race with, and the
 * status check below is not subject to a lost update.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, driverId: true, status: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.driverId !== session.user.id) {
    return NextResponse.json(
      { error: "You are not assigned to this delivery." },
      { status: 403 },
    );
  }

  if (order.status !== OrderStatus.ACCEPTED) {
    return NextResponse.json(
      { error: "This delivery cannot be started right now." },
      { status: 409 },
    );
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: OrderStatus.IN_TRANSIT, inTransitAt: new Date() },
    select: ORDER_PARTY_SELECT,
  });

  return NextResponse.json(updated, { status: 200 });
}
