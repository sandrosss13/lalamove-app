import { NextResponse } from "next/server";
import {
  ClientAccountType,
  OrderStatus,
  PaymentMethodType,
  PaymentStatus,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import { settleOrderPayment } from "@/lib/orders/payment-settlement";
import { prisma } from "@/lib/prisma";

/**
 * Longest accepted purchase-order reference, mirroring the cap
 * `POST /api/orders` applies to the same column. Held route-locally rather than
 * imported, by the same convention the rest of this API follows: each handler
 * owns its own hand-rolled register.
 */
const FREE_TEXT_MAX_LENGTH = 200;

/**
 * The methods checkout may record. Deliberately narrower than
 * `PaymentMethodType`: the checkout page offers exactly two rows — a saved card
 * and "Pay later", which *is* `CASH` under a friendlier label — so accepting
 * `BANK_TRANSFER` here would let a hand-made request stamp an order with a
 * method that has no UI, no instructions to the client and no flow behind it.
 * Admin's own `PaymentMethodConfig` switch is checked separately below and can
 * still refuse either of these two; this list only bounds what the register
 * will parse at all.
 */
const CHECKOUT_PAYMENT_METHODS: PaymentMethodType[] = [
  PaymentMethodType.CARD,
  PaymentMethodType.CASH,
];

/**
 * What goes in `Payment.provider` while no gateway exists.
 *
 * A literal rather than an empty string, so a row written today is
 * distinguishable from one written by a real integration later — nothing here
 * talks to a provider, and the column should say so rather than look
 * unpopulated.
 */
const NO_PAYMENT_PROVIDER = "none";

/** Validated shape of a pay request body. */
type PayOrderInput = {
  paymentMethodType: PaymentMethodType;
  /** Required for `CARD`, and refused for anything else. */
  savedCardId: string | null;
  /** Kept only for BUSINESS clients — see the account-type check in `POST`. */
  purchaseOrderRef: string | null;
};

/** Round a currency amount to whole cents, as `POST /api/orders/[id]/complete`
 *  does before storing one: `price` and `serviceLevelAdjustment` are two `Float`
 *  columns, and their sum carries binary-fraction dust that has no business
 *  being written into a payment record. */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Trim an optional free-text field to its stored form: `null` when absent or
 * blank, the trimmed string otherwise, or an error when it is the wrong type or
 * over length. A route-local copy of the helper in `POST /api/orders`, matching
 * that handler's messages so the same field is rejected the same way whichever
 * endpoint receives it.
 */
function parseOptionalText(
  value: unknown,
  fieldName: string,
): { value: string | null } | { error: string } {
  if (value === undefined || value === null) {
    return { value: null };
  }

  if (typeof value !== "string") {
    return { error: `${fieldName} must be a string when provided.` };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { value: null };
  }

  if (trimmed.length > FREE_TEXT_MAX_LENGTH) {
    return {
      error: `${fieldName} must be ${FREE_TEXT_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { value: trimmed };
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library). The card/method register mirrors
 * `parseCreateOrderBody` in `POST /api/orders`, with one difference: there, the
 * whole payment block is optional, because a client could book without settling.
 * Here the method *is* the request, so an absent one is an error rather than a
 * `null` to store.
 */
function parsePayOrderBody(
  body: unknown,
): { data: PayOrderInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  const { paymentMethodType } = record;
  if (
    typeof paymentMethodType !== "string" ||
    !CHECKOUT_PAYMENT_METHODS.includes(paymentMethodType as PaymentMethodType)
  ) {
    return {
      error: `paymentMethodType must be one of: ${CHECKOUT_PAYMENT_METHODS.join(", ")}.`,
    };
  }

  const method = paymentMethodType as PaymentMethodType;

  const { savedCardId } = record;
  if (
    savedCardId !== undefined &&
    (typeof savedCardId !== "string" || savedCardId.trim().length === 0)
  ) {
    return { error: "savedCardId must be a non-empty string when provided." };
  }

  const chosenCardId =
    typeof savedCardId === "string" ? savedCardId.trim() : null;

  // A card and the method it pays with have to agree — the same two messages
  // `POST /api/orders` gives, for the same reason: paying by card without
  // naming one is unpayable, and a card sent alongside Pay later means the
  // client changed method without clearing its card. Say which of the two to
  // change rather than quietly picking one.
  if (method === PaymentMethodType.CARD && chosenCardId === null) {
    return { error: "Choose a saved card to pay by card." };
  }

  if (method !== PaymentMethodType.CARD && chosenCardId !== null) {
    return { error: "Send savedCardId only when paymentMethodType is CARD." };
  }

  const purchaseOrderRef = parseOptionalText(
    record.purchaseOrderRef,
    "purchaseOrderRef",
  );
  if ("error" in purchaseOrderRef) {
    return purchaseOrderRef;
  }

  return {
    data: {
      paymentMethodType: method,
      savedCardId: chosenCardId,
      purchaseOrderRef: purchaseOrderRef.value,
    },
  };
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
 * Ownership: the order is looked up scoped to the caller's own `clientId`, so
 * somebody else's order and a nonexistent one produce the identical 404. That is
 * deliberate and must stay — a 403 on a real id would confirm the id exists and
 * let order ids be probed, which is the same reasoning
 * `src/app/orders/[id]/track/page.tsx` records for its own not-found branch.
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
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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

  const parsed = parsePayOrderBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { paymentMethodType, savedCardId, purchaseOrderRef } = parsed.data;
  const { id } = await params;
  const clientId = session.user.id;

  // Scoped to the caller, which is what collapses "not yours" into "not found".
  // No role check is needed on top of it: `clientId` is the user who booked the
  // order, so a driver or a company can never match a row here.
  const order = await prisma.order.findFirst({
    where: { id, clientId },
    select: {
      id: true,
      status: true,
      price: true,
      serviceLevelAdjustment: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Checked before the payment-method work below so a client who double-submits,
  // or who reopens a stale checkout tab, reads why rather than a validation
  // message about a method that is no longer the point. The conditional write
  // further down is what actually makes the transition safe against a race; this
  // is the readable answer, not the guard.
  if (order.status !== OrderStatus.INITIATED) {
    return NextResponse.json(
      {
        error:
          "This delivery has already been paid for and is with our drivers.",
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
      { error: "That payment method is not available." },
      { status: 400 },
    );
  }

  // A card belonging to somebody else is not a card this client may pay with;
  // scoping the lookup to the session makes "not yours" and "does not exist" the
  // same answer, which is the one worth giving either way.
  if (savedCardId !== null) {
    const savedCard = await prisma.savedCard.findFirst({
      where: { id: savedCardId, clientId },
      select: { id: true },
    });

    if (!savedCard) {
      return NextResponse.json(
        { error: "Choose a card saved to your own payment methods." },
        { status: 400 },
      );
    }
  }

  // The PO / cost-centre reference is a BUSINESS-only field: an individual
  // client's checkout never renders it, so a value arriving from one is a stale
  // client rather than an attack. Drop it instead of failing the payment.
  let businessPurchaseOrderRef: string | null = null;
  if (purchaseOrderRef !== null) {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: clientId },
      select: { accountType: true },
    });

    if (clientProfile?.accountType === ClientAccountType.BUSINESS) {
      businessPurchaseOrderRef = purchaseOrderRef;
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
  // still being this client's, which is what makes a double-submit safe: two
  // requests racing produce exactly one update, and the loser is told the order
  // is already paid rather than overwriting the winner's method. The upsert
  // covers the other half of the same problem — a first attempt that wrote the
  // row and then failed before settling leaves a `Payment` behind, and a retry
  // has to be able to finish rather than collide with the unique `orderId`.
  const claimed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id, clientId, status: OrderStatus.INITIATED },
      data: {
        paymentMethodType,
        savedCardId,
        purchaseOrderRef: businessPurchaseOrderRef,
      },
    });

    if (count === 0) {
      return false;
    }

    await tx.payment.upsert({
      where: { orderId: id },
      create: {
        orderId: id,
        provider: NO_PAYMENT_PROVIDER,
        amount,
        status: paymentStatus,
        paidAt,
      },
      update: {
        provider: NO_PAYMENT_PROVIDER,
        amount,
        status: paymentStatus,
        paidAt,
      },
    });

    return true;
  });

  if (!claimed) {
    return NextResponse.json(
      {
        error:
          "This delivery has already been paid for and is with our drivers.",
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
