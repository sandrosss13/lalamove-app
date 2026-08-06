"use client";

import { memo } from "react";
import type { OrderStatus } from "@prisma/client";

import type { OpsOrder } from "@/lib/company-dashboard-data";

/**
 * Badge colours per order status, in the dark ops palette.
 *
 * These mirror the *semantics* of `STATUS_STYLES` in
 * `src/components/order-card.tsx` — pending reads as a warning tint, claimed as
 * its own "ours but not dispatched" state, completed green, cancelled red — but
 * deliberately not its classes: those are solid light-theme fills that turn
 * illegible against the console's near-black surfaces, so each becomes a
 * translucent tint under light text here.
 *
 * Typed by `OrderStatus` rather than `string` so adding a status to the Prisma
 * enum fails the build instead of silently rendering an unstyled badge.
 */
export const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  PENDING: "bg-amber-500/20 text-amber-300",
  CLAIMED: "bg-violet-500/20 text-violet-300",
  ACCEPTED: "bg-blue-500/20 text-blue-300",
  IN_TRANSIT: "bg-sky-500/20 text-sky-300",
  COMPLETED: "bg-emerald-500/20 text-emerald-300",
  CANCELLED: "bg-red-500/20 text-red-300",
};

/**
 * The complete class list for a default-size status badge, so any other surface
 * showing an order's status (the order-detail drawer, say) renders an identical
 * one without copying the colour table. Reach for `ORDER_STATUS_BADGE` directly
 * when a different size is wanted — overriding the sizing utilities baked in
 * here by appending more classes would depend on stylesheet order, not on the
 * order they appear in the string.
 */
export function orderStatusBadgeClasses(status: OrderStatus): string {
  return `inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${ORDER_STATUS_BADGE[status]}`;
}

/**
 * Column tracks and cell padding for the order table, shared by the header row
 * and every body row so the two can never drift out of alignment. Kept as one
 * verbatim literal because Tailwind only emits classes it can see spelled out
 * in the source — building this string by interpolation would produce no CSS.
 */
export const ORDER_ROW_GRID_CLASS =
  "grid grid-cols-[100px_1.3fr_1.4fr_1fr_120px_100px_130px] items-center gap-3 px-4.5 py-3";

/**
 * How much of an order id the table shows. Order ids are cuids — far too long
 * for a 100px column — and the leading characters are enough to tell rows apart
 * and to paste back into the search box.
 */
const ORDER_ID_PREFIX_LENGTH = 8;

/** Whole currency units, grouped — cents are noise at table scale. */
function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * Formatted in UTC on purpose: every other boundary on this dashboard ("today",
 * "this month", the revenue trend buckets) is UTC-based, so a local-time date
 * here would put a late-evening order on a different day than the KPIs that
 * counted it. It also keeps the server render and the client render identical
 * regardless of where either one runs.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function OpsOrderRowImpl({
  order,
  onSelect,
}: {
  order: OpsOrder;
  /** Receives the id rather than the order so the callback stays referentially
   *  stable across renders, which is what makes the memo below worth having. */
  onSelect: (orderId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(order.id)}
      className={`${ORDER_ROW_GRID_CLASS} w-full border-b border-ops-border/60 text-left text-sm last:border-none hover:bg-ops-surface-raised`}
    >
      <span className="truncate text-ops-text-muted">
        {order.id.slice(0, ORDER_ID_PREFIX_LENGTH)}
      </span>
      <span className="truncate" title={order.clientName}>
        {order.clientName}
      </span>
      <span
        className="truncate text-xs text-ops-text-muted"
        title={`${order.pickupAddress} → ${order.dropoffAddress}`}
      >
        {order.pickupAddress} → {order.dropoffAddress}
      </span>
      {/* Null until a driver is dispatched, which is most of an order's life. */}
      <span className="truncate text-ops-text-muted">
        {order.driverName ?? "Unassigned"}
      </span>
      <span>
        <span className={orderStatusBadgeClasses(order.status)}>
          {order.status}
        </span>
      </span>
      {/* What the client actually owes: the quoted price plus any waiting-time
          surcharge accrued at pickup. */}
      <span>{formatCurrency(order.price + order.overtimeFee)}</span>
      <span className="text-xs text-ops-text-muted">
        {formatDate(order.createdAt)}
      </span>
    </button>
  );
}

/**
 * One row of the Orders table.
 *
 * Memoised because the table is deliberately unpaginated — a busy company sees
 * every order it has ever touched — and the tab re-renders on every keystroke in
 * the search box. Orders come straight out of the server payload, so their
 * identities are stable between those renders and rows that survive the filter
 * can skip re-rendering entirely.
 */
export const OpsOrderRow = memo(OpsOrderRowImpl);
