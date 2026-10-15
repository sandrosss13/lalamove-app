import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { parseBookingBody } from "@/lib/orders/order-input";
import { CLIENT_ORDER_RESPONSE_SELECT } from "@/lib/order-response-select";
import { prepareOrderWrite } from "@/lib/orders/order-write";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/orders/[id] — the client edits an order they booked but have not
 * paid for yet.
 *
 * **An edit is a re-booking.** The body is exactly the JSON the booking form
 * POSTs to `/api/orders`, parsed by the same `parseCreateOrderBody` and checked
 * and priced by the same `prepareOrderWrite` — vehicle body type, cargo fit,
 * class serviceability, the quote, the tier adjustment, the commission and the
 * driver payout — so an edited order satisfies precisely the rules a fresh
 * booking of the same job would, and is priced at what that booking would cost
 * today. Every status code and message a booking can fail with, an edit fails
 * with identically. See `src/lib/orders/order-input.ts` for why the two routes
 * share one rulebook rather than keeping two.
 *
 * Being a re-booking, it is a **full replacement** of the booked details, not a
 * merge: a field the body omits is written as the booking would have written
 * it (an omitted contact becomes an empty one, an omitted description `null`).
 * A partial update would need a second, merge-aware parser, and the only client
 * of this endpoint is the booking form, which always sends the whole booking.
 *
 * **Only while unpaid (`INITIATED`)** — the same product decision as
 * `POST /api/orders/[id]/cancel`, for the same reason. Before checkout nobody
 * else has seen the order, so its details are still the client's alone to
 * change. From `PENDING` on it is on drivers' boards, offers have been sent
 * against its route and its price has been agreed at checkout; changing the job
 * under them is a support conversation, not a form. Every later status gets one
 * 409 saying so.
 *
 * Ownership: scoped to the caller's own `clientId`, so somebody else's order and
 * a nonexistent one are the identical 404 — the reasoning
 * `POST /api/orders/[id]/pay` records.
 *
 * Not touched, deliberately:
 *
 * - **`status`, `reference`, `clientId`** — an edit changes the job, not which
 *   order it is or whose.
 * - **The payment columns** (`paymentMethodType`, `savedCardId`,
 *   `purchaseOrderRef`). They are still *validated* — the body is held to the
 *   booking rules in full, payment fields included — but checkout owns them, and
 *   an `INITIATED` order is by definition one checkout has not finished. The
 *   booking form sends none.
 * - **Cargo photos** — they are a separate resource
 *   (`/api/orders/[id]/photos`) with their own upload path; the form manages
 *   them there.
 *
 * **Goods-first booking (`OrderItem` rows).** The body may list `items`, as a
 * booking does, and is then re-derived from them by the same
 * `prepareOrderWrite`. Being a full replacement, the edit *replaces* the
 * order's `OrderItem` rows in the same transaction as the update: the old rows
 * are deleted and the new snapshots written, so the rows, `cargoVolumeM3` and
 * the derived weight/envelope/category/body always describe the same goods.
 * A body with no `items` (a stale pre-goods-first bundle) re-books the order
 * on the legacy path, and so deletes any `OrderItem` rows and clears
 * `cargoVolumeM3` — leaving them would describe goods the order's figures no
 * longer come from.
 */
export async function PATCH(
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  // Parsed before the ownership read, in the order `pay` uses: a malformed body
  // is answered without touching the database at all.
  const parsed = parseBookingBody(rawBody, t);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { id } = await params;
  const clientId = session.user.id;

  // Scoped to the caller, which is what collapses "not yours" into "not found".
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

  // Checked here, ahead of `prepareOrderWrite`, so an edit of a paid order is
  // refused before any geocoding lookup is spent re-quoting a job that cannot
  // change. The readable answer, not the guard — the conditional write below is
  // what actually holds against a concurrent `pay`.
  if (order.status !== OrderStatus.INITIATED) {
    return NextResponse.json(
      { error: t("errors.ordersEdit.onlyUnpaidOrdersCanBeEdited") },
      { status: 409 },
    );
  }

  const prepared = await prepareOrderWrite(
    parsed.data.data,
    clientId,
    t,
    parsed.data.rawItems,
  );
  if (!prepared.ok) {
    return NextResponse.json(
      // `reason` (when set) lets the booking form tell a tariff change or a
      // manual-quote route apart from an ordinary refusal.
      { error: prepared.error, reason: prepared.reason },
      { status: prepared.status },
    );
  }

  const { details, items } = prepared.write;

  // Conditional on the order *still* being `INITIATED` and still this client's.
  // The quote above takes long enough (geocoding, routing) that a `pay` or a
  // `cancel` from another tab can land in the middle of it; whichever writes
  // first wins, and the loser gets `count === 0`. A client who paid in one tab
  // can therefore never have the job re-priced from under the payment by an
  // edit still in flight in another.
  //
  // One transaction with the item replacement, so a refused update (`count`
  // 0) leaves the order's `OrderItem` rows untouched, and a successful one can
  // never be observed with the old rows beside the new figures.
  const count = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id, clientId, status: OrderStatus.INITIATED },
      data: {
        ...details,
        // The parser yields `undefined` for a blank description, which a
        // create leaves as the column's `null`. To an update `undefined` means
        // "leave the column alone", so a client clearing their description
        // would otherwise never see it cleared.
        description: details.description ?? null,
      },
    });

    if (updated.count === 0) {
      return 0;
    }

    await tx.orderItem.deleteMany({ where: { orderId: id } });
    if (items !== null) {
      await tx.orderItem.createMany({
        data: items.map((item) => ({ ...item, orderId: id })),
      });
    }

    return updated.count;
  });

  if (count === 0) {
    return NextResponse.json(
      { error: t("errors.ordersEdit.onlyUnpaidOrdersCanBeEdited") },
      { status: 409 },
    );
  }

  // The same shape `POST /api/orders` answers with (`CLIENT_ORDER_RESPONSE_SELECT`),
  // read back after the write, so the booking form handles a booking and an
  // edit with one response type. The client's own quote — never the carrier's
  // payout or the platform's commission rate.
  const updated = await prisma.order.findUniqueOrThrow({
    where: { id },
    select: CLIENT_ORDER_RESPONSE_SELECT,
  });

  return NextResponse.json(updated, { status: 200 });
}
