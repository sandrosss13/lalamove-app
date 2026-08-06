import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/logistics-company/orders/[id]/cancel — a logistics company cancels
 * one of its own orders (CLAIMED/ACCEPTED/IN_TRANSIT → CANCELLED). Mirrors
 * `claim`/`dispatch`'s auth/ownership/404-not-403 conventions exactly: an order
 * belonging to another company is reported as missing rather than forbidden, so
 * a caller can't use this endpoint to enumerate a competitor's deliveries.
 *
 * No `cancelledAt` column exists on `Order` — this only flips `status`.
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
      { error: "Only logistics companies can cancel deliveries." },
      { status: 403 },
    );
  }

  const { id } = await params;

  // A company with no profile owns no orders, which is indistinguishable from
  // "not found" to the caller — so it gets the same 404, not a 400.
  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Scoped by ownership only, not by a specific prior status (unlike dispatch,
  // which requires CLAIMED): a company may cancel its own order at any point in
  // the lifecycle. This lookup exists solely to tell "no such order" (404) apart
  // from "already terminal / lost the race" (409) — the conditional update below
  // can't distinguish the two on its own, the same reason `claim` checks first.
  const order = await prisma.order.findFirst({
    where: { id, companyId: company.id },
    select: { id: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Atomic cancel: the terminal-state guard lives in the `where`, not in
  // application code, because unlike dispatch (CLAIMED orders have no driver
  // yet) an ACCEPTED/IN_TRANSIT order has an assigned driver who can move it to
  // IN_TRANSIT or COMPLETED via `start`/`complete` at any moment. A read-then-
  // write would let a cancel silently overwrite a just-completed order; here the
  // database applies at most one update and `count` tells us whether we won.
  const { count } = await prisma.order.updateMany({
    where: {
      id,
      companyId: company.id,
      status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
    },
    data: { status: OrderStatus.CANCELLED },
  });

  if (count === 0) {
    return NextResponse.json(
      { error: "This delivery can no longer be cancelled." },
      { status: 409 },
    );
  }

  const updated = await prisma.order.findUnique({ where: { id } });
  return NextResponse.json(updated, { status: 200 });
}
