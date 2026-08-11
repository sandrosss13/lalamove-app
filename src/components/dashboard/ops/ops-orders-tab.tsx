"use client";

import { useCallback, useMemo, useState } from "react";
import type { OrderStatus } from "@prisma/client";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import {
  OpsOrderRow,
  ORDER_ROW_GRID_CLASS,
} from "@/components/dashboard/ops/ops-order-row";

/**
 * The filter chips, in lifecycle order after the catch-all.
 *
 * `satisfies` ties the literals to the Prisma enum, so a typo or a renamed
 * status is a compile error rather than a chip that silently matches nothing.
 * Listing every status is load-bearing too: `counts` below indexes a
 * `Record<StatusFilter, number>` by `OrderStatus`, which only type-checks while
 * this covers the whole enum.
 */
const STATUS_FILTERS = [
  "all",
  "PENDING",
  "CLAIMED",
  "ACCEPTED",
  "IN_TRANSIT",
  "COMPLETED",
  "CANCELLED",
] as const satisfies readonly ("all" | OrderStatus)[];

type StatusFilter = (typeof STATUS_FILTERS)[number];

/**
 * The company's order book: every order it owns plus the open-market ones it
 * could still claim, newest first, with search and status filtering applied
 * client-side.
 *
 * Nothing here paginates or re-queries. The whole list arrives with the page,
 * which is what lets filtering feel instant and keeps the counts on the chips
 * honest — they always describe the same data the table is drawn from.
 */
export function OpsOrdersTab({
  orders,
}: {
  orders: CompanyDashboardData["orders"];
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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (query === "") return true;
      // Matching the id as a substring rather than a strict prefix means the
      // eight characters shown in the table work as a search term, and so does
      // a full id pasted in from elsewhere.
      return (
        order.id.toLowerCase().includes(query) ||
        order.clientName.toLowerCase().includes(query)
      );
    });
  }, [orders, search, statusFilter]);

  const counts = useMemo(() => {
    // Seeded at zero so a status with no orders still shows "· 0" instead of a
    // gap, then tallied in a single pass rather than one scan per chip.
    const tally = Object.fromEntries(
      STATUS_FILTERS.map((filter) => [filter, 0]),
    ) as Record<StatusFilter, number>;
    tally.all = orders.length;
    for (const order of orders) {
      tally[order.status] += 1;
    }
    return tally;
  }, [orders]);

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search order ID or customer…"
          aria-label="Search orders by ID or customer"
          className="w-[260px] rounded-lg border border-ops-border bg-ops-surface px-3 py-2.5 text-sm outline-none placeholder:text-ops-text-muted"
        />
        <div
          role="group"
          aria-label="Filter orders by status"
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
                {filter === "all" ? "All" : filter} · {counts[filter]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-ops-border">
        <div
          className={`${ORDER_ROW_GRID_CLASS} border-b border-ops-border text-[11px] tracking-wide text-ops-text-muted uppercase`}
        >
          <div>Order</div>
          <div>Customer</div>
          <div>Route</div>
          <div>Driver</div>
          <div>Status</div>
          <div>Amount</div>
          <div>Date</div>
        </div>

        {filtered.length === 0 ? (
          // A company with no orders at all is a different situation from one
          // whose filters happen to exclude everything, and telling them apart
          // saves the user hunting for a filter they never set.
          <div className="p-12 text-center text-sm text-ops-text-muted">
            {orders.length === 0
              ? "No orders yet."
              : "No orders match your filters."}
          </div>
        ) : (
          filtered.map((order) => (
            <OpsOrderRow
              key={order.id}
              order={order}
              onSelect={handleSelectOrder}
            />
          ))
        )}
      </div>
    </div>
  );
}
