import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { OrderStatus } from "@prisma/client";
import type { CargoCategory, ChassisType, ServiceLevel } from "@prisma/client";

import { auth } from "@/lib/auth";
import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";
import { loadBookingPaymentOptions } from "@/lib/home/booking-payment-options";
import { prisma } from "@/lib/prisma";
import { BreakdownRow } from "@/components/home/booking-form-primitives";
import { SERVICE_LEVEL_LABEL, formatGel } from "@/components/orders-format";
import { CheckoutPaymentPanel } from "../checkout-payment-panel";
import {
  BODY_TYPE_LABEL,
  crewSizeLabel,
  formatBookedDistanceKm,
  formatScheduledAt,
  transportationCost,
} from "../checkout-format";
import {
  CheckoutHeader,
  CheckoutOrderNotFoundNotice,
  CheckoutSignInNotice,
} from "../checkout-shell";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The `Order` columns this page reads, and the only ones it may read.
 *
 * A `select` and never an `include`, even though every row here is the reader's
 * own: an unselected query returns every scalar on `Order`, so each column added
 * to the model silently joins the RSC payload. `/orders` documents the one place
 * that convenience is taken and why it is not to be carried anywhere else — an
 * unselected query handed to a response or an RSC tree is how
 * `GET /api/orders` and `GET /api/logistics-company/orders` both leaked.
 *
 * `savedCardId` and `purchaseOrderRef` are deliberately absent. The payment
 * panel collects both afresh, and neither has any business being serialised to
 * the browser to be shown back.
 *
 * `clientId` is not selected either, because it is never compared here: the
 * query below is *scoped* by it, which is what makes somebody else's order
 * indistinguishable from a nonexistent one.
 */
const CHECKOUT_ORDER_SELECT = {
  id: true,
  status: true,
  pickupAddress: true,
  dropoffAddress: true,
  scheduledAt: true,
  cargoCategory: true,
  bodyType: true,
  helperCount: true,
  description: true,
  distanceKm: true,
  helperFee: true,
  price: true,
  serviceLevel: true,
  serviceLevelAdjustment: true,
  // A relation, so it is not returned unless it is asked for — and only the one
  // column the summary prints.
  vehicleTypeSpec: { select: { label: true } },
} as const;

/**
 * `/checkout/[id]` — review the delivery just booked, and pay for it.
 *
 * The order arrives here `INITIATED`: created, unpaid and deliberately *off* the
 * open market. `POST /api/orders/[id]/pay` is what settles it to `PENDING`, and
 * that transition is the moment drivers and companies can see the job at all
 * (both load boards filter `status: PENDING` by equality). So this page is not a
 * formality between booking and dispatch — nothing is dispatched until the
 * button on it is pressed.
 *
 * Every figure below is read from the *persisted* order row and never re-quoted.
 * The price the client agreed to is the price stored on the order; asking
 * `estimateDelivery` again here would let a retuned `PricingRule` change the
 * total between the booking form and this page, which is the one thing a
 * checkout may never do.
 */
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <CheckoutSignInNotice prompt="Sign in to review and pay for this delivery." />
    );
  }

  // Checkout is a client's own step. Drivers and logistics companies take and
  // dispatch deliveries on /dashboard instead — the same redirect `/orders` and
  // the wallet make.
  if (session.user.role !== "CLIENT") {
    redirect("/dashboard");
  }

  const { id } = await params;

  // Scoped to the caller, which is what collapses "not yours" into "not found".
  // The two must stay indistinguishable, or this page becomes a way to probe
  // which order ids exist — see `CheckoutOrderNotFoundNotice`.
  const order = await prisma.order.findFirst({
    where: { id, clientId: session.user.id },
    select: CHECKOUT_ORDER_SELECT,
  });

  if (!order) {
    return <CheckoutOrderNotFoundNotice />;
  }

  // Anything past `INITIATED` has already been paid for, so there is nothing to
  // check out: send the client to the confirmation rather than re-offering a
  // payment their order no longer needs. This is also what makes the back button
  // harmless after paying.
  if (order.status !== OrderStatus.INITIATED) {
    redirect(`/checkout/${order.id}/success`);
  }

  // What the client owes: the quoted fare plus whatever the tier did to it.
  // `overtimeFee` is deliberately excluded — it is settled after the delivery,
  // against minutes nobody has spent yet, and putting it here would present a
  // charge that does not exist as part of the total being paid.
  const total = order.price + order.serviceLevelAdjustment;

  // Which methods admin has switched on, the client's saved cards and their
  // account type — all three resolved server-side, because none is a decision
  // the browser is in a position to make. The pay endpoint re-checks all of
  // them anyway.
  const paymentOptions = await loadBookingPaymentOptions();

  return (
    // The background is painted on `main` rather than on the centred column so
    // it covers the full viewport: `body` still resolves `--background`, which is
    // near-black under a dark system preference, and a column-width background
    // would leave that showing down both gutters.
    <main className="min-h-screen bg-ink text-paper">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 pt-8 pb-16 sm:px-8">
        <CheckoutHeader
          eyebrow="Almost there"
          title="Review and pay"
          backHref="/"
          backLabel="← Back to booking"
        />

        {/* Two columns from `lg` up — the summary to read on one side, the
            decision to make on the other, which is the conventional shape for a
            checkout. It collapses to a single column below that, summary first,
            so a client on a phone reads what they are paying for before they are
            asked to pay for it. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
          <div className="flex flex-col gap-6">
            <OrderSummaryPanel order={order} />
            <PriceBreakdownPanel order={order} total={total} />
          </div>

          {/* Sticky only where there is room for it to be: on a tall column the
              Pay button should not scroll away while the summary is read. */}
          <div className="lg:sticky lg:top-8">
            <CheckoutPaymentPanel
              orderId={order.id}
              totalGel={total}
              enabledPaymentMethods={paymentOptions.enabledPaymentMethods}
              savedCards={paymentOptions.savedCards}
              accountType={paymentOptions.accountType}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

/** The shape both panels below read — the selected row, nothing wider. */
type CheckoutOrder = {
  pickupAddress: string;
  dropoffAddress: string;
  scheduledAt: Date | null;
  cargoCategory: CargoCategory;
  bodyType: ChassisType | null;
  helperCount: number;
  description: string | null;
  distanceKm: number;
  helperFee: number;
  price: number;
  serviceLevel: ServiceLevel;
  serviceLevelAdjustment: number;
  vehicleTypeSpec: { label: string };
};

/** What was booked: the route, then everything that describes the job. */
function OrderSummaryPanel({ order }: { order: CheckoutOrder }) {
  return (
    <section
      aria-labelledby="checkout-summary-heading"
      className="rounded-xl border border-line bg-surface p-5"
    >
      <h2
        id="checkout-summary-heading"
        className="font-display text-base font-semibold text-paper"
      >
        Your delivery
      </h2>

      <div className="mt-4 flex flex-col gap-2">
        <RouteEndpoint badge="P" name="Pickup" address={order.pickupAddress} />
        <RouteEndpoint
          badge="D"
          name="Dropoff"
          address={order.dropoffAddress}
        />
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-2">
        {/* Nullable on the column: every order placed before the date step
            existed has none, and there is nothing to invent one from. */}
        {order.scheduledAt ? (
          <DetailRow
            label="Scheduled"
            value={formatScheduledAt(order.scheduledAt)}
          />
        ) : null}
        <DetailRow label="Vehicle" value={order.vehicleTypeSpec.label} />
        <DetailRow
          label="Goods"
          value={CARGO_CATEGORY_LABELS[order.cargoCategory]}
        />
        <DetailRow label="Crew" value={crewSizeLabel(order.helperCount)} />
        {/* Also nullable, and for the same reason as the schedule. */}
        {order.bodyType ? (
          <DetailRow
            label="Load space"
            value={BODY_TYPE_LABEL[order.bodyType]}
          />
        ) : null}
        <DetailRow
          label="Service level"
          value={SERVICE_LEVEL_LABEL[order.serviceLevel]}
        />
        {/* Full width, because it is the one free-text field here and a note
            about the load has no business being squeezed into half a row. The
            span is passed to the row rather than wrapped around it: a `dl` whose
            groups are `div`s may not nest a second `div` between them. */}
        {order.description ? (
          <DetailRow
            label="Notes"
            value={order.description}
            className="sm:col-span-2"
          />
        ) : null}
      </dl>
    </section>
  );
}

/**
 * What it costs, itemised from the stored row.
 *
 * The lines reconcile exactly: transportation cost plus helper fee is the quoted
 * fare, and the tier's adjustment on top of that is the total. `overtimeFee` is
 * absent on purpose — it is charged after completion, and no figure that might
 * appear later belongs in a total being paid now.
 */
function PriceBreakdownPanel({
  order,
  total,
}: {
  order: CheckoutOrder;
  total: number;
}) {
  return (
    <section
      aria-labelledby="checkout-price-heading"
      className="rounded-xl border border-line bg-surface p-5"
    >
      <h2
        id="checkout-price-heading"
        className="font-display text-base font-semibold text-paper"
      >
        Price
      </h2>

      <dl className="mt-4 flex flex-col gap-1.5">
        <BreakdownRow
          label="Distance"
          value={formatBookedDistanceKm(order.distanceKm)}
        />
        <BreakdownRow
          label="Transportation cost"
          value={formatGel(transportationCost(order))}
        />
        {/* Only worth a line when at least one helper was actually requested. */}
        {order.helperFee > 0 ? (
          <BreakdownRow label="Helper Fee" value={formatGel(order.helperFee)} />
        ) : null}
        {/* Exactly one of these, or neither: Regular is the tier the quote is
            already priced at, so it books at a zero adjustment and there is
            nothing to itemise. */}
        {order.serviceLevelAdjustment !== 0 ? (
          <BreakdownRow
            label={
              order.serviceLevel === "PRIORITY"
                ? "Priority fee"
                : "Pooling discount"
            }
            value={
              order.serviceLevelAdjustment > 0
                ? `+${formatGel(order.serviceLevelAdjustment)}`
                : // A real minus sign, not a hyphen, so a Pooling discount sits
                  // where a Priority order's "+" of the same weight sits — the
                  // same character the booking form's breakdown uses.
                  `−${formatGel(Math.abs(order.serviceLevelAdjustment))}`
            }
          />
        ) : null}

        {/* Not a `BreakdownRow`: that primitive gives every line the same
            weight, and this is the figure the button beside it commits to. */}
        <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t border-line pt-3">
          <dt className="text-sm font-semibold text-paper">Total</dt>
          <dd className="font-price text-lg font-semibold text-paper tabular-nums">
            {formatGel(total)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-snug text-muted">
        Loading and unloading time beyond the free allowance is settled after
        the delivery and is not part of this total.
      </p>
    </section>
  );
}

/**
 * A pickup or dropoff row, matching the route summary on the order card. The
 * badge is a bare initial, so the stop it names is carried by the adjacent
 * `sr-only` word rather than left to a screen reader to guess.
 */
function RouteEndpoint({
  badge,
  name,
  address,
}: {
  badge: string;
  name: string;
  address: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent"
      >
        {badge}
      </span>
      <span className="sr-only">{name}</span>
      <span className="text-[14px] leading-snug text-paper">{address}</span>
    </div>
  );
}

/** One labelled fact about the job — a `dt`/`dd` pair and the `div` that groups
 *  them, which is what lets the summary lay its rows out on a grid. */
function DetailRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  /** Grid placement for the one row that wants the full width. */
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] font-medium text-paper">{value}</dd>
    </div>
  );
}
