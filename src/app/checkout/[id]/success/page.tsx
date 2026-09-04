import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderStatus, PaymentStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { maskedCardNumber } from "@/components/home/payment-methods";
import { formatGel } from "@/components/orders-format";
import { PAYMENT_METHOD_LABEL, formatScheduledAt } from "../../checkout-format";
import {
  CheckoutHeader,
  CheckoutOrderNotFoundNotice,
  CheckoutSignInNotice,
} from "../../checkout-shell";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The `Order` columns this page reads, and the only ones it may read. A `select`
 * and never an `include`, for the reason `/checkout/[id]` records at length: an
 * unselected query returns every scalar on `Order`, so a column added later
 * silently joins the RSC payload.
 *
 * `purchaseOrderRef` is deliberately absent — the client's own finance
 * reference, which they typed and do not need read back — and `clientId` is
 * absent because it is never compared here: the query is *scoped* by it.
 *
 * `savedCard` is narrowed to the two display columns a confirmation needs.
 * `providerToken` is never selected anywhere: it is the gateway's own handle for
 * a card and nothing on the client needs it.
 */
const SUCCESS_ORDER_SELECT = {
  id: true,
  status: true,
  scheduledAt: true,
  pickupAddress: true,
  dropoffAddress: true,
  price: true,
  serviceLevelAdjustment: true,
  paymentMethodType: true,
  savedCard: { select: { brand: true, last4: true } },
  payment: { select: { status: true, paidAt: true } },
} as const;

/**
 * `/checkout/[id]/success` — the booking is settled and on the open market.
 *
 * Only reachable for an order that has actually been paid for. A still-
 * `INITIATED` order is sent back to the checkout page rather than shown a
 * confirmation it has not earned: `INITIATED` means unpaid and invisible to
 * every driver, so telling the client their delivery is being matched would be
 * false.
 *
 * Auth, ownership and the not-found wording are identical to the checkout page's
 * by construction — the notices are one shared component precisely so somebody
 * else's order and a nonexistent one cannot start reading differently on one of
 * the two pages.
 */
export default async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <CheckoutSignInNotice prompt="Sign in to see the confirmation for this delivery." />
    );
  }

  if (session.user.role !== "CLIENT") {
    redirect("/dashboard");
  }

  const { id } = await params;

  // Scoped to the caller, which is what collapses "not yours" into "not found".
  const order = await prisma.order.findFirst({
    where: { id, clientId: session.user.id },
    select: SUCCESS_ORDER_SELECT,
  });

  if (!order) {
    return <CheckoutOrderNotFoundNotice />;
  }

  // Unpaid, so there is nothing to confirm. Back to the page that can fix that.
  if (order.status === OrderStatus.INITIATED) {
    redirect(`/checkout/${order.id}`);
  }

  const total = order.price + order.serviceLevelAdjustment;

  // How they settled, named the way the client chose it. `paymentMethodType` is
  // nullable on the column — orders placed before the payment step existed have
  // none — so the absent case says so rather than printing a blank.
  const methodLabel =
    order.paymentMethodType === null
      ? "Not recorded"
      : order.savedCard && order.paymentMethodType === "CARD"
        ? `${order.savedCard.brand} ${maskedCardNumber(order.savedCard.last4)}`
        : PAYMENT_METHOD_LABEL[order.paymentMethodType];

  // Honest about what has and has not happened. A `PAID` payment row still means
  // only that nothing is left to collect up front — no gateway is integrated, so
  // no money has moved — and a `PENDING` one is Pay later, genuinely outstanding
  // until the driver is done. Anything else (a row that is missing on a legacy
  // order, or a status this flow does not write) gets no claim made about it.
  const paymentNote =
    order.payment?.status === PaymentStatus.PAID
      ? "Settled at checkout. No payment provider is connected yet, so nothing has been charged to your card."
      : order.payment?.status === PaymentStatus.PENDING
        ? "Due after the delivery, collected off the platform when the job is done."
        : null;

  return (
    // The background is painted on `main` rather than on the centred column so
    // it covers the full viewport — same shell as the checkout page before it.
    <main className="min-h-screen bg-ink text-paper">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pt-8 pb-16 sm:px-8">
        <CheckoutHeader
          eyebrow="Booking confirmed"
          // A literal typographic apostrophe rather than `&rsquo;`: this is a
          // string prop, not JSX text, so an entity would render as itself.
          title="You’re all set"
          backHref="/orders"
          backLabel="← Your orders"
        />

        <section
          aria-labelledby="checkout-confirmation-heading"
          className="rounded-xl border border-line bg-surface p-6"
        >
          <h2
            id="checkout-confirmation-heading"
            className="font-display text-lg font-semibold text-paper"
          >
            Your delivery is booked
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            We&rsquo;re matching it with a driver now. You&rsquo;ll be able to
            follow the job from your orders as soon as one accepts it.
          </p>

          <dl className="mt-5 flex flex-col gap-3 border-t border-line pt-5">
            <ConfirmationRow
              label="Total"
              value={formatGel(total)}
              emphasised
            />
            <ConfirmationRow label="Payment method" value={methodLabel} />
            {order.scheduledAt ? (
              <ConfirmationRow
                label="Scheduled"
                value={formatScheduledAt(order.scheduledAt)}
              />
            ) : null}
            <ConfirmationRow label="Pickup" value={order.pickupAddress} />
            <ConfirmationRow label="Dropoff" value={order.dropoffAddress} />
          </dl>

          {paymentNote ? (
            <p className="mt-4 rounded-lg border border-line bg-ink p-3 text-xs leading-relaxed text-muted">
              {paymentNote}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/orders"
              className="rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-on-accent transition-colors hover:bg-accent-hover"
            >
              View your orders
            </Link>
            {/* Reachable straight away: the tracking page renders the route and
                the current status, and fills in the driver's position once one
                is assigned. */}
            <Link
              href={`/orders/${order.id}/track`}
              className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent"
            >
              Track this delivery
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

/** One `dt`/`dd` pair of the confirmation. */
function ConfirmationRow({
  label,
  value,
  emphasised = false,
}: {
  label: string;
  value: string;
  /** The total, which is the one figure this page is really reporting. */
  emphasised?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd
        className={
          emphasised
            ? "font-price text-lg font-semibold text-paper tabular-nums"
            : "min-w-0 text-right text-[13px] font-medium text-paper"
        }
      >
        {value}
      </dd>
    </div>
  );
}
