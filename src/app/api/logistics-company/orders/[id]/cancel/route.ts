import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { CARRIER_ORDER_PARTY_SELECT } from "@/lib/order-response-select";
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

  // Scoped by ownership only, not by status (unlike dispatch, which requires
  // CLAIMED): this lookup exists solely to tell "no such order" (404) apart from
  // "no longer cancellable / lost the race" (409) — the conditional update below
  // can't distinguish the two on its own, the same reason `claim` checks first.
  // Which statuses may still be cancelled is decided there, in one place.
  const order = await prisma.order.findFirst({
    where: { id, companyId: company.id },
    select: { id: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Atomic cancel: the state guard lives in the `where`, not in application
  // code, because unlike dispatch (CLAIMED orders have no driver yet) an
  // ACCEPTED/IN_TRANSIT order has an assigned driver who can move it to
  // IN_TRANSIT or COMPLETED via `start`/`complete` at any moment. A read-then-
  // write would let a cancel silently overwrite a just-completed order; here the
  // database applies at most one update and `count` tells us whether we won.
  //
  // An allow-list of the three states a company may cancel from, not a `notIn`
  // of the terminal ones. A negation admits every value the enum has not got
  // yet: `INITIATED` was added to `OrderStatus` and joined this filter's accepted
  // set on the spot, silently, because nothing here names the states it means.
  // That one is harmless — an `INITIATED` order has no `companyId`, so the
  // ownership clause above already excludes it — but that is a property of other
  // files rather than of this line, and the next value added may not be so kind.
  // An allow-list makes a new state unreachable here until someone adds it on
  // purpose.
  const { count } = await prisma.order.updateMany({
    where: {
      id,
      companyId: company.id,
      status: {
        in: [OrderStatus.CLAIMED, OrderStatus.ACCEPTED, OrderStatus.IN_TRANSIT],
      },
    },
    data: { status: OrderStatus.CANCELLED },
  });

  if (count === 0) {
    return NextResponse.json(
      { error: "This delivery can no longer be cancelled." },
      { status: 409 },
    );
  }

  // Carrier-only response — see `CARRIER_ORDER_PARTY_SELECT`'s doc comment;
  // never `ORDER_PARTY_SELECT` here. The company is the carrier on its own
  // order, entitled to its own payout and not to what the client paid; a cancel
  // response is no more a reason to hand over the client's fare than a claim is.
  const updated = await prisma.order.findUnique({
    where: { id },
    select: CARRIER_ORDER_PARTY_SELECT,
  });
  return NextResponse.json(updated, { status: 200 });
}
