import type { ReactNode } from "react";
import type { CargoCategory, OrderStatus, ServiceLevel } from "@prisma/client";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cargoCategoryLabel } from "@/lib/cargo";
import {
  ORDER_STATUS_PILL,
  ORDER_STATUS_PILL_BASE,
  formatGel,
  orderStatusLabel,
  serviceLevelLabel,
} from "@/components/orders-format";

/** The subset of `Order` fields an order card needs to render. */
type OrderCardOrder = {
  /** Where the card links to — `/orders/<id>`. */
  id: string;
  /** `GE-48210`: the card's visible name, and the text of its link. */
  reference: string;
  status: OrderStatus;
  /**
   * The quoted fare *before* the tier moved it — not what the client owes. The
   * two columns are stored apart so the itemised breakdown still reconciles
   * against the minimum-fare floor, which means every client-facing total has
   * to add them back together. See `serviceLevelAdjustment`.
   */
  price: number;
  /**
   * What the tier did to `price`: positive for Priority, negative for Pooling,
   * zero for Regular. Held separately on `Order` rather than folded into
   * `price`, so this card sums the two rather than printing `price` — which is
   * a figure the client was never quoted and never agreed to.
   */
  serviceLevelAdjustment: number;
  /** The tier the client booked, which is what explains the adjustment. */
  serviceLevel: ServiceLevel;
  pickupAddress: string;
  dropoffAddress: string;
  cargoCategory: CargoCategory;
  distanceKm: number;
  // Only set once a driver has accepted the order with one of their vehicles,
  // and nulled again if that vehicle is later removed — so the cell is rendered
  // conditionally rather than assumed present.
  vehicle?: { plateNumber: string; make: string; model: string } | null;
};

/**
 * One order in the client's order list: a status pill and price, the pickup and
 * dropoff endpoints, and a meta row of cargo, distance and (once assigned)
 * vehicle.
 *
 * The whole card opens the order's page, `/orders/<id>`, through a *stretched
 * link* rather than by wrapping the card in an `<a>`: the link is the order's
 * reference at the top of the card, and its `::after` box is stretched over the
 * entire `<li>`, so a click anywhere on the card lands on it. Wrapping the card
 * instead would nest the page's own links (Track, Complete payment) inside
 * another link — invalid HTML, and a screen reader would announce the whole
 * card's text as one link name. This way the card is exactly one link whose
 * name is "View order GE-48210", reachable with one Tab, and `children` are
 * lifted above the stretched box (`relative z-10`) so they stay separately
 * clickable and focusable.
 *
 * Used by exactly one consumer, `src/app/[locale]/orders/page.tsx`. `children`
 * renders after the meta row — the tracking and payment links, whose
 * visibility conditions belong to the page rather than to the card.
 *
 * A cancelled order is drawn quieter — muted ground, struck-through total —
 * so it reads as history rather than as something owed, while still opening
 * its page like any other.
 */
export function OrderCard({
  order,
  children,
}: {
  order: OrderCardOrder;
  children?: ReactNode;
}) {
  const t = useTranslations();
  const cancelled = order.status === "CANCELLED";

  return (
    // `relative` anchors the stretched link's `::after`. Hover is drawn on the
    // card, since the pointer is over the card wherever it is; the focus ring
    // is drawn by the link's own stretched box, so it outlines the whole card
    // exactly when the link — the card's one Tab stop — has focus.
    <li
      className={`relative rounded-[14px] border border-line p-[22px] transition-colors hover:border-accent/40 ${
        cancelled ? "bg-surface" : "bg-ink"
      }`}
    >
      <Link
        href={`/orders/${order.id}`}
        aria-label={t("orders.orders.viewOrder", {
          reference: order.reference,
        })}
        className="font-price text-[12px] font-semibold tracking-[0.06em] text-muted tabular-nums outline-none after:absolute after:inset-0 after:rounded-[14px] after:content-[''] focus-visible:after:ring-3 focus-visible:after:ring-accent/40"
      >
        {order.reference}
      </Link>

      {/* `items-start` rather than centred: the price side is two lines, and
          centring would float the status pill between them. */}
      <div className="mt-2.5 flex items-start justify-between gap-4">
        <span
          className={`${ORDER_STATUS_PILL_BASE} ${ORDER_STATUS_PILL[order.status]}`}
        >
          {orderStatusLabel(order.status, t)}
        </span>
        <div className="flex flex-col items-end gap-0.5">
          {/* The sum, not `price`: this is the client's own order list, and the
              figure here has to be the one the booking form's confirmation
              showed them. `formatGel` rounds to the cent, which also absorbs
              the binary-fraction dust of adding two `Float` columns. */}
          <span
            className={`font-price text-[20px] font-semibold tracking-[-0.01em] tabular-nums ${
              cancelled ? "text-muted line-through" : "text-paper"
            }`}
          >
            {formatGel(order.price + order.serviceLevelAdjustment)}
          </span>
          <OrderServiceLevel order={order} />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <OrderEndpoint
          badge="P"
          name={t("common.shared.pickup")}
          address={order.pickupAddress}
        />
        <OrderEndpoint
          badge="D"
          name={t("common.shared.dropoff")}
          address={order.dropoffAddress}
        />
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3.5">
        <OrderMeta
          label={t("common.shared.cargo")}
          value={cargoCategoryLabel(order.cargoCategory, t)}
        />
        <OrderMeta
          label={t("common.shared.distance")}
          value={t("common.shared.distanceKm", {
            km: order.distanceKm.toFixed(2),
          })}
          numeric
        />
        {order.vehicle ? (
          <OrderMeta
            label={t("common.shared.vehicle")}
            value={`${order.vehicle.plateNumber} — ${order.vehicle.make} ${order.vehicle.model}`}
          />
        ) : null}
      </dl>

      {/* Above the stretched link, so these stay their own click targets. */}
      {children ? <div className="relative z-10">{children}</div> : null}
    </li>
  );
}

/**
 * A pickup or dropoff row, matching the route summary on the booking page's map
 * panel. The badge is a bare initial, so the stop it names is carried by the
 * adjacent `sr-only` word rather than left to a screen reader to guess.
 */
function OrderEndpoint({
  badge,
  name,
  address,
}: {
  badge: string;
  name: string;
  address: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent"
      >
        {badge}
      </span>
      <span className="sr-only">{name}</span>
      <span className="truncate text-[14px] leading-snug text-paper">
        {address}
      </span>
    </div>
  );
}

/**
 * The tier caption under the price, naming what the client booked and what it
 * did to the fare.
 *
 * It sits against the figure rather than down in the meta row because it is
 * there to *explain* the figure: a Priority order reads ₾23.00 where the same
 * job at Regular reads ₾18.40, and without the caption the difference is
 * unaccountable. The tier is printed on every card, Regular included — the
 * column defaults to `REGULAR` and every order placed before the picker existed
 * was in fact served at it, so showing it only sometimes would make its absence
 * ambiguous rather than informative.
 *
 * The signed amount is omitted for Regular because there is none: Regular is
 * the tier the quote is already priced at, so it books at a zero adjustment,
 * and a `+₾0.00` line would invent a charge.
 */
function OrderServiceLevel({ order }: { order: OrderCardOrder }) {
  const t = useTranslations();

  return (
    <span className="text-[13px] text-muted">
      {serviceLevelLabel(order.serviceLevel, t)}
      {order.serviceLevelAdjustment === 0 ? null : (
        <>
          {" · "}
          <span className="font-price tabular-nums">
            {order.serviceLevelAdjustment > 0
              ? `+${formatGel(order.serviceLevelAdjustment)}`
              : // A real minus sign, not a hyphen, so a Pooling discount sits
                // where a Priority order's "+" of the same weight sits — the
                // same character the booking form's breakdown uses.
                `−${formatGel(Math.abs(order.serviceLevelAdjustment))}`}
          </span>
        </>
      )}
    </span>
  );
}

/** One labelled cell of the card's meta row. */
function OrderMeta({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  /** Renders the value in the tabular price face — used for the distance. */
  numeric?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1 text-[13px] font-medium text-paper ${
          numeric ? "font-price tabular-nums" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
