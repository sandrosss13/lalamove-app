import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/orders/[id]/cancel — the client withdraws an order they booked but
 * have not paid for (`INITIATED` → `CANCELLED`).
 *
 * **Only an unpaid order, and that is a product decision rather than a
 * technical one.** An `INITIATED` order is off the market by construction — both
 * open-market queries filter `status: PENDING` by equality — so no driver has
 * seen it, no carrier has claimed it, no `Payment` row has been written and no
 * money is owed in either direction. Withdrawing it touches nobody but the
 * client. From `PENDING` on, at least one of those is no longer true: the job is
 * on boards, may be claimed or under way, and the client has chosen how to pay.
 * Unwinding that is a refund-and-reassignment conversation with support, not a
 * button, so every later status gets the same 409 telling the client exactly
 * that.
 *
 * Ownership: the order is looked up scoped to the caller's own `clientId`, so
 * somebody else's order and a nonexistent one produce the identical 404 — the
 * same reasoning `POST /api/orders/[id]/pay` records. A 403 on a real id would
 * confirm the id exists and let order ids be probed. No role check is needed on
 * top of it: `clientId` is the user who booked the order, so a driver or a
 * company can never match a row here.
 *
 * No body. There is nothing to choose — no reason field, because `Order` has no
 * cancellation columns (`cancelledAt`, `cancelledBy`, a reason) to keep one in;
 * the company cancel route (`POST /api/logistics-company/orders/[id]/cancel`)
 * likewise only flips `status`. `updatedAt` records when it happened.
 *
 * Cargo photos are left where they are. A cancelled order is still the client's
 * record of what they nearly booked, and nothing reads its photos to act on.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  const { id } = await params;
  const clientId = session.user.id;

  // Scoped to the caller, which is what collapses "not yours" into "not found".
  // This read exists only to tell "no such order" (404) apart from "no longer
  // cancellable" (409) — the conditional update below cannot distinguish the
  // two on its own, the same split the company cancel route draws.
  const order = await prisma.order.findFirst({
    where: { id, clientId },
    select: { id: true, status: true },
  });

  if (!order) {
    return NextResponse.json(
      { error: t("common.shared.orderNotFound") },
      { status: 404 },
    );
  }

  // The readable answer, not the guard: a client acting from a stale tab after
  // paying in another reads why, rather than a silent no-op. Covers
  // `CANCELLED` too — cancelling twice is not an error worth a different
  // message, and "only unpaid orders" is still true of a cancelled one.
  if (order.status !== OrderStatus.INITIATED) {
    return NextResponse.json(
      { error: t("errors.ordersCancel.onlyUnpaidOrdersCanBeCancelled") },
      { status: 409 },
    );
  }

  // The guard. Conditional on the order *still* being `INITIATED` and still
  // being this client's, so a cancel racing a concurrent `pay` resolves to
  // exactly one winner: `pay`'s own transition is the same shape of
  // `updateMany` keyed on `INITIATED`, and the database applies at most one of
  // the two. If `pay` got there first, `count` is 0 and the client is told the
  // order is no longer cancellable — never a cancelled order with a `Payment`
  // row beside it.
  const { count } = await prisma.order.updateMany({
    where: { id, clientId, status: OrderStatus.INITIATED },
    data: { status: OrderStatus.CANCELLED },
  });

  if (count === 0) {
    return NextResponse.json(
      { error: t("errors.ordersCancel.onlyUnpaidOrdersCanBeCancelled") },
      { status: 409 },
    );
  }

  // Only what the caller needs to update its view. The orders pages re-read the
  // row from the database rather than trusting this body.
  return NextResponse.json(
    { orderId: order.id, status: OrderStatus.CANCELLED },
    { status: 200 },
  );
}
