"use client";

import { memo, useCallback, useMemo, useState } from "react";
import type { OrderStatus } from "@prisma/client";

import type {
  DriverDashboardData,
  DriverOpsOrder,
} from "@/lib/driver-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { orderStatusBadgeClasses } from "@/components/dashboard/ops/ops-order-row";

/**
 * Filter chips for "My deliveries", in lifecycle order after the catch-all.
 *
 * `satisfies` ties the literals to the Prisma enum, so a renamed status is a
 * compile error rather than a chip that silently matches nothing.
 *
 * `PENDING` and `CLAIMED` are deliberately absent. Every row in this section has
 * a `driverId` — the driver's own — and an order only gains one at accept or
 * dispatch, both of which move it to `ACCEPTED`. Neither status can ever reach
 * here, so a chip for either would always come back empty.
 */
const STATUS_FILTERS = [
  "all",
  "ACCEPTED",
  "IN_TRANSIT",
  "COMPLETED",
  "CANCELLED",
] as const satisfies readonly ("all" | OrderStatus)[];

type StatusFilter = (typeof STATUS_FILTERS)[number];

/**
 * Column tracks and cell padding for both delivery tables, kept as one verbatim
 * literal because Tailwind only emits classes it can see spelled out in the
 * source — building this string by interpolation would produce no CSS.
 */
const DELIVERY_ROW_GRID_CLASS =
  "grid grid-cols-[1.4fr_1fr_120px_100px_130px] items-center gap-3 px-4.5 py-3";

/** Whole currency units, grouped — cents are noise at table scale. */
function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * Formatted in UTC on purpose, matching the company console's order table: every
 * boundary the driver dashboard reports against ("today", "this month", the
 * earnings trend buckets) is UTC-based, so a local-time date here would put a
 * late-evening delivery on a different day than the KPIs that counted it. It
 * also keeps the server render and the client render identical regardless of
 * where either one runs.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function DriverOrderRowImpl({
  order,
  onSelect,
}: {
  order: DriverOpsOrder;
  /** Receives the id rather than the order so the callback stays referentially
   *  stable across renders, which is what makes the memo below worth having. */
  onSelect: (orderId: string) => void;
}) {
  const route = `${order.pickupAddress} → ${order.dropoffAddress}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(order.id)}
      className={`${DELIVERY_ROW_GRID_CLASS} w-full border-b border-ops-border/60 text-left text-sm last:border-none hover:bg-ops-surface-raised`}
    >
      <span className="truncate" title={order.clientName}>
        {order.clientName}
      </span>
      <span className="truncate text-xs text-ops-text-muted" title={route}>
        {route}
      </span>
      <span>
        <span className={orderStatusBadgeClasses(order.status)}>
          {order.status}
        </span>
      </span>
      {/* What the driver is paid for the run: the quoted price plus whatever
          waiting-time surcharge was settled on completion. */}
      <span className="font-ops tabular-nums">
        {formatCurrency(order.price + order.overtimeFee)}
      </span>
      <span className="text-xs text-ops-text-muted">
        {formatDate(order.createdAt)}
      </span>
    </button>
  );
}

/**
 * One row of either delivery table.
 *
 * Memoised because the tables are deliberately unpaginated and the tab
 * re-renders on every keystroke in the search box. Orders come straight out of
 * the server payload, so their identities are stable between those renders and
 * rows that survive the filter can skip re-rendering entirely.
 */
const DriverOrderRow = memo(DriverOrderRowImpl);

/** A bordered table of delivery rows, or nothing when there is nothing to show. */
function DeliveryTable({
  orders,
  onSelect,
}: {
  orders: DriverOpsOrder[];
  onSelect: (orderId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-ops-border">
      {orders.map((order) => (
        <DriverOrderRow key={order.id} order={order} onSelect={onSelect} />
      ))}
    </div>
  );
}

/**
 * The Deliveries tab, in the two shapes the platform supports.
 *
 * An independent driver works the open market, so their list arrives with
 * unclaimed deliveries matching a vehicle type they have registered mixed in
 * among their own — split back apart here into "Available" and "My deliveries".
 * A rostered driver never sees an open market (their company claims and
 * dispatches work to them), so they get the second section only.
 *
 * Nothing here paginates or re-queries: the whole list arrives with the page,
 * which is what lets the search and status chips filter instantly. Rows are
 * read-only — every action on a delivery lives in the drawer a click opens.
 */
export function DriverOpsDeliveriesTab({
  orders,
  isIndependent,
}: {
  orders: DriverDashboardData["orders"];
  isIndependent: boolean;
}) {
  const { openDrawer } = useOpsDashboard();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Stable identity so the memoised rows actually skip re-rendering while the
  // user types; `openDrawer` itself is stable, from the shell's `useCallback`.
  const handleSelectOrder = useCallback(
    (orderId: string) => openDrawer({ type: "order", id: orderId }),
    [openDrawer],
  );

  // `isOpenMarket` is only ever true for an independent driver, so the guard on
  // the section below is what keeps a rostered driver from rendering an empty
  // "Available" heading rather than any filtering done here.
  const openOrders = useMemo(
    () => orders.filter((order) => order.isOpenMarket),
    [orders],
  );
  const myDeliveries = useMemo(
    () => orders.filter((order) => !order.isOpenMarket),
    [orders],
  );

  const filteredMyDeliveries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return myDeliveries.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (query === "") return true;
      // Customer name only: a driver identifies a past run by who it was for,
      // not by the cuid the company console searches on.
      return order.clientName.toLowerCase().includes(query);
    });
  }, [myDeliveries, search, statusFilter]);

  return (
    <div className="flex flex-col gap-6">
      {isIndependent ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">
            Available{" "}
            <span className="text-ops-text-muted">({openOrders.length})</span>
          </h3>

          {openOrders.length === 0 ? (
            <p className="text-sm text-ops-text-muted">
              No deliveries available right now.
            </p>
          ) : (
            <DeliveryTable orders={openOrders} onSelect={handleSelectOrder} />
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">
            My deliveries{" "}
            <span className="text-ops-text-muted">({myDeliveries.length})</span>
          </h3>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer…"
              aria-label="Search your deliveries by customer"
              className="w-48 rounded-lg border border-ops-border bg-ops-surface px-3 py-2.5 text-sm outline-none placeholder:text-ops-text-muted focus-visible:border-ops-accent"
            />
            <div
              role="group"
              aria-label="Filter your deliveries by status"
              className="flex flex-wrap gap-1.5"
            >
              {STATUS_FILTERS.map((filter) => {
                const active = filter === statusFilter;
                return (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStatusFilter(filter)}
                    className={`rounded-full border px-3.5 py-2 text-xs font-medium whitespace-nowrap ${
                      active
                        ? "border-ops-accent bg-ops-accent/20 text-ops-accent"
                        : "border-ops-border text-ops-text-muted hover:bg-ops-surface-raised"
                    }`}
                  >
                    {filter === "all" ? "All" : filter}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* A driver who has never run a delivery is in a different situation
            from one whose filters happen to exclude everything, and telling them
            apart saves the user hunting for a filter they never set. The first
            case also differs by driver type: an independent driver takes work
            themselves, a rostered one waits to be dispatched it. */}
        {myDeliveries.length === 0 ? (
          <p className="text-sm text-ops-text-muted">
            {isIndependent
              ? "You haven't taken a delivery yet."
              : "Nothing dispatched to you yet — your company assigns deliveries to you."}
          </p>
        ) : filteredMyDeliveries.length === 0 ? (
          <p className="text-sm text-ops-text-muted">
            No deliveries match your filters.
          </p>
        ) : (
          <DeliveryTable
            orders={filteredMyDeliveries}
            onSelect={handleSelectOrder}
          />
        )}
      </section>
    </div>
  );
}
