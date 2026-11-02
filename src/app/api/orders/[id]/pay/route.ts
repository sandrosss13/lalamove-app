import { NextResponse } from "next/server";
import {
  ClientAccountType,
  OrderStatus,
  PaymentMethodType,
  PaymentStatus,
} from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { ownedOrderWhere } from "@/lib/orders/load-accessible-order";
import { parsePayOrderBody, type PayerKind } from "@/lib/orders/pay-input";
import { settleOrderPayment } from "@/lib/orders/payment-settlement";
import { prisma } from "@/lib/prisma";

/**
 * What goes in `Payment.provider` while no gateway exists.
 *
 * A literal rather than an empty string, so a row written today is
 * distinguishable from one written by a real integration later — nothing here
 * talks to a provider, and the column should say so rather than look
 * unpopulated.
 */
const NO_PAYMENT_PROVIDER = "none";

/** Round a currency amount to whole cents, as `POST /api/orders/[id]/complete`
 *  does before storing one: `price` and `serviceLevelAdjustment` are two `Float`
 *  columns, and their sum carries binary-fraction dust that has no business
 *  being written into a payment record. */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * POST /api/orders/[id]/pay — the client settles an order they booked, which is
 * what puts it on the open market (`INITIATED` → `PENDING`).
 *
 * **No payment gateway is integrated and nothing is charged here.** A `CARD`
 * payment records an intention against a saved card's display details — there
 * is no provider behind it to authorise, and `SavedCard` holds no PAN — and
 * `CASH`, which the client sees as "Pay later", is collected off platform when
 * the job is done. The `Payment` row this writes is a record of *what the client
 * chose*, not of money received; `provider` says `none` outright so no later
 * reader mistakes it for a settled charge. When a provider is chosen, the charge
 * belongs in `settleOrderPayment` — the named seam this handler calls — and the
 * hop to `PENDING` becomes conditional on it succeeding.
 *
 * Ownership: the order is looked up scoped to the caller's own `clientId` —
 * or, for a **guest order**, to the guest cookie `POST /api/orders` set (see
 * `ownedOrderWhere`) — so somebody else's order and a nonexistent one produce
 * the identical 404. That is deliberate and must stay — a 403 on a real id
 * would confirm the id exists and let order ids be probed, which is the same
 * reasoning `src/app/orders/[id]/track/page.tsx` records for its own not-found
 * branch.
 *
 * Who pays decides the rules (`parsePayOrderBody`,
 * `src/lib/orders/pay-input.ts`): a BUSINESS client keeps "Pay later"; an
 * INDIVIDUAL client and a guest pay by card only. A guest also has to leave
 * their contact (`guestContact`, refused with per-field `fieldErrors`) and pays
 * with a one-off `card` whose brand and last four are recorded on the
 * `Payment` — both written in the same transaction that claims the order.
 *
 * Every field the browser sends is re-checked here rather than trusted, exactly
 * as order creation re-checks the same three: the method against admin's
 * `PaymentMethodConfig` switchboard, the card against the caller's own wallet,
 * and the purchase-order reference against the caller's account type.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  const { id } = await params;

  // The order's client, or the guest holding its cookie. Neither proof is an
  // unauthenticated request.
  const ownership = await ownedOrderWhere(id, session);
  if (!ownership) {
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

  // Scoped to the caller, which is what collapses "not yours" into "not found".
  // No role check is needed on top of it: `clientId` is the user who booked the
  // order, so a driver or a company can never match a row here, and a guest
  // clause pins `clientId: null` beside the token hash.
  const order = await prisma.order.findFirst({
    where: ownership,
    select: {
      id: true,
      clientId: true,
      status: true,
      price: true,
      serviceLevelAdjustment: true,
    },
  });

  if (!order) {
    return NextResponse.json(
      { error: t("common.shared.orderNotFound") },
      { status: 404 },
    );
  }

  // Who pays decides the rules. An account with no profile row reads as an
  // individual: an account type that cannot be read is not a business one,
  // so the narrower rules — no "pay later", no PO reference — apply.
  const { clientId } = order;
  let payer: PayerKind = "GUEST";
  if (clientId !== null) {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: clientId },
      select: { accountType: true },
    });

    payer =
      clientProfile?.accountType === ClientAccountType.BUSINESS
        ? "BUSINESS"
        : "INDIVIDUAL";
  }

  const parsed = parsePayOrderBody(rawBody, payer, t);
  if ("error" in parsed) {
    return NextResponse.json(
      parsed.fieldErrors
        ? { error: parsed.error, fieldErrors: parsed.fieldErrors }
        : { error: parsed.error },
      { status: 400 },
    );
  }

  const {
    paymentMethodType,
    savedCardId,
    purchaseOrderRef,
    guestContact,
    card,
  } = parsed.data;

  // Checked before the payment-method work below so a client who double-submits,
  // or who reopens a stale checkout tab, reads why rather than a validation
  // message about a method that is no longer the point. The conditional write
  // further down is what actually makes the transition safe against a race; this
  // is the readable answer, not the guard.
  if (order.status !== OrderStatus.INITIATED) {
    return NextResponse.json(
      {
        error: t("errors.ordersPay.thisDeliveryHasAlreadyBeenPaid"),
      },
      { status: 409 },
    );
  }

  // Admin owns which methods the platform accepts. A method with no config row
  // has never been switched on — the admin endpoints seed new rows disabled and
  // treat turning one on as a deliberate act — so a missing row is a disabled
  // one, and both are refused. Re-checked here and not left to the page that
  // rendered the options: that page's list was resolved when it was rendered,
  // and admin can switch a method off while a checkout tab sits open.
  const paymentMethodConfig = await prisma.paymentMethodConfig.findUnique({
    where: { type: paymentMethodType },
    select: { isEnabled: true },
  });

  if (!paymentMethodConfig?.isEnabled) {
    return NextResponse.json(
      { error: t("common.shared.thatPaymentMethodIsNotAvailable") },
      { status: 400 },
    );
  }

  // A card belonging to somebody else is not a card this client may pay with;
  // scoping the lookup to the order's client makes "not yours" and "does not
  // exist" the same answer, which is the one worth giving either way. (A guest
  // never reaches this: the parser refuses a `savedCardId` from one.)
  if (savedCardId !== null) {
    const savedCard =
      clientId === null
        ? null
        : await prisma.savedCard.findFirst({
            where: { id: savedCardId, clientId },
            select: { id: true },
          });

    if (!savedCard) {
      return NextResponse.json(
        { error: t("common.shared.chooseACardSavedToYour") },
        { status: 400 },
      );
    }
  }

  // What the client owes: the quoted fare plus whatever the service tier did to
  // it. `overtimeFee` is deliberately not in this sum — it is settled after the
  // delivery, against minutes nobody has spent yet.
  const amount = roundCurrency(order.price + order.serviceLevelAdjustment);

  // A card is treated as paid because there is nothing left to collect once a
  // gateway exists to have collected it; Pay later stays `PENDING` because the
  // money is genuinely still outstanding and is handed over off platform when
  // the job is done. Neither value is a claim that funds moved — see this
  // handler's doc comment.
  const paidNow = paymentMethodType === PaymentMethodType.CARD;
  const paymentStatus = paidNow ? PaymentStatus.PAID : PaymentStatus.PENDING;
  const paidAt = paidNow ? new Date() : null;

  // One transaction for the two writes that describe the client's choice, so an
  // order can never carry a payment method with no `Payment` row beside it.
  //
  // The `updateMany` is conditional on the order still being `INITIATED` and
  // still being this caller's, which is what makes a double-submit safe: two
  // requests racing produce exactly one update, and the loser is told the order
  // is already paid rather than overwriting the winner's method. The upsert
  // covers the other half of the same problem — a first attempt that wrote the
  // row and then failed before settling leaves a `Payment` behind, and a retry
  // has to be able to finish rather than collide with the unique `orderId`.
  const claimed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { AND: [ownership, { status: OrderStatus.INITIATED }] },
      data: {
        paymentMethodType,
        savedCardId,
        // Already reduced to BUSINESS-only by the parser.
        purchaseOrderRef,
        // A guest's contact lands with the payment or not at all, so a paid
        // guest order always says who to call. Account orders write nothing
        // here: their contact is the client's account.
        ...(guestContact
          ? {
              guestFirstName: guestContact.firstName,
              guestLastName: guestContact.lastName,
              guestPhone: guestContact.phone,
              guestEmail: guestContact.email,
            }
          : {}),
      },
    });

    if (count === 0) {
      return false;
    }

    await tx.payment.upsert({
      where: { orderId: id },
      // The one-off card's display metadata, or null — written on update
      // too, so a retry that changed method cannot leave a stale ending.
      create: {
        orderId: order.id,
        provider: NO_PAYMENT_PROVIDER,
        amount,
        status: paymentStatus,
        paidAt,
        cardBrand: card?.brand ?? null,
        cardLast4: card?.last4 ?? null,
      },
      update: {
        provider: NO_PAYMENT_PROVIDER,
        amount,
        status: paymentStatus,
        paidAt,
        cardBrand: card?.brand ?? null,
        cardLast4: card?.last4 ?? null,
      },
    });

    return true;
  });

  if (!claimed) {
    return NextResponse.json(
      {
        error: t("errors.ordersPay.thisDeliveryHasAlreadyBeenPaid"),
      },
      { status: 409 },
    );
  }

  // Outside the transaction on purpose. This is the seam a real gateway hooks
  // into, and a network call to a provider has no business holding a database
  // transaction open. It is also idempotent — a conditional update that treats
  // "already settled" as success — so a retry after a crash between the writes
  // above and this line completes the booking rather than wedging it.
  const settled = await settleOrderPayment(order.id);

  // Only what the success page's redirect needs, plus the figures a non-browser
  // caller would want to reconcile against. The page itself re-reads the order
  // from the database rather than trusting anything in this body, so nothing
  // here is load-bearing for what the client is shown.
  return NextResponse.json(
    {
      orderId: settled.id,
      status: settled.status,
      paymentMethodType: settled.paymentMethodType,
      amount,
      paymentStatus,
    },
    { status: 200 },
  );
}
