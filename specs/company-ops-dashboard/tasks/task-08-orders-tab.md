# Task 08: Orders tab

## Status

pending

## Wave

3

## Description

Fills in the Orders tab: a searchable, status-filterable, sortable table of every order the company can see (open-market matches it could claim, plus everything it already owns). This is the primary order-management surface — clicking a row opens the order-detail drawer (real content lands in task-13).

## Dependencies

**Depends on:** task-01-dashboard-data-module.md, task-06-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `OpsOrder` (fields: `id, status, cargoCategory, description, pickupAddress, dropoffAddress, distanceKm, price, overtimeFee, vehicleTypeSpecId, vehicleTypeLabel, clientName, driverUserId, driverName, vehicleId, vehiclePlate, createdAt, inTransitAt, completedAt, waitingMinutes, isOpenMarket` — full definitions in that task's file) and `CompanyDashboardData["orders"]: OpsOrder[]` (full unbounded list, newest first). task-06 created `src/components/dashboard/ops/ops-orders-tab.tsx` as a placeholder wired into the shell with prop `{ orders: CompanyDashboardData["orders"] }` — keep that exact prop shape. task-06's `useOpsDashboard()` exposes `openDrawer({ type: "order", id })`.

## Files to Modify

- `src/components/dashboard/ops/ops-orders-tab.tsx` — replace placeholder body with real content.

## Files to Create

- `src/components/dashboard/ops/ops-order-row.tsx` — one table row, extracted for readability (small enough to inline, but kept separate since the order-detail drawer in task-13 will want the same status-badge styling helper — export a shared `orderStatusBadgeClasses` helper from this file for task-13 to reuse if convenient, though task-13 can also just re-derive it independently since these are two different waves and must not have a hard coupling).

## Technical Details

### Current placeholder (being replaced)

```tsx
import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

export function OpsOrdersTab({ orders }: { orders: CompanyDashboardData["orders"] }) {
  return <div className="text-sm text-ops-text-muted">Orders — coming soon.</div>;
}
```

### Status badge colors

Reuse the same semantics as the existing `src/components/order-card.tsx`'s `STATUS_STYLES` (Tailwind light-theme classes there — translate to the dark ops palette, don't reuse those classes directly since they assume a light background):

```tsx
const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-300",
  CLAIMED: "bg-violet-500/20 text-violet-300",
  ACCEPTED: "bg-blue-500/20 text-blue-300",
  IN_TRANSIT: "bg-sky-500/20 text-sky-300",
  COMPLETED: "bg-emerald-500/20 text-emerald-300",
  CANCELLED: "bg-red-500/20 text-red-300",
};
```

### New content

`"use client"`, local state for `search` (string), `statusFilter` (`"all" | OrderStatus`), `sortKey`/`sortDir`. Filter/sort with `useMemo`.

```tsx
"use client";

import { useMemo, useState } from "react";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-300",
  CLAIMED: "bg-violet-500/20 text-violet-300",
  ACCEPTED: "bg-blue-500/20 text-blue-300",
  IN_TRANSIT: "bg-sky-500/20 text-sky-300",
  COMPLETED: "bg-emerald-500/20 text-emerald-300",
  CANCELLED: "bg-red-500/20 text-red-300",
};

const STATUS_FILTERS = ["all", "PENDING", "CLAIMED", "ACCEPTED", "IN_TRANSIT", "COMPLETED", "CANCELLED"] as const;

function formatCurrency(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function OpsOrdersTab({ orders }: { orders: CompanyDashboardData["orders"] }) {
  const { openDrawer } = useOpsDashboard();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (q === "") return true;
      return o.id.toLowerCase().includes(q) || o.clientName.toLowerCase().includes(q);
    });
  }, [orders, search, statusFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length };
    for (const status of STATUS_FILTERS.slice(1)) {
      map[status] = orders.filter((o) => o.status === status).length;
    }
    return map;
  }, [orders]);

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order ID or customer…"
          className="w-[260px] rounded-lg border border-ops-border bg-ops-surface px-3 py-2.5 text-sm outline-none placeholder:text-ops-text-muted"
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full border px-3.5 py-2 text-xs font-medium whitespace-nowrap ${
                statusFilter === status
                  ? "border-ops-accent bg-ops-accent/20 text-ops-accent"
                  : "border-ops-border text-ops-text-muted"
              }`}
            >
              {status === "all" ? "All" : status} · {counts[status]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-ops-border">
        <div className="grid grid-cols-[100px_1.3fr_1.4fr_1fr_120px_100px_130px] gap-3 border-b border-ops-border px-4.5 py-3 text-[11px] uppercase tracking-wide text-ops-text-muted">
          <div>Order</div>
          <div>Customer</div>
          <div>Route</div>
          <div>Driver</div>
          <div>Status</div>
          <div>Amount</div>
          <div>Date</div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-ops-text-muted">No orders match your filters.</div>
        ) : (
          filtered.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => openDrawer({ type: "order", id: order.id })}
              className="grid w-full grid-cols-[100px_1.3fr_1.4fr_1fr_120px_100px_130px] items-center gap-3 border-b border-ops-border/60 px-4.5 py-3 text-left text-sm last:border-none hover:bg-ops-surface-raised"
            >
              <span className="truncate font-[family-name:var(--font-ibm-plex)] text-ops-text-muted">
                {order.id.slice(0, 8)}
              </span>
              <span className="truncate">{order.clientName}</span>
              <span className="truncate text-xs text-ops-text-muted">
                {order.pickupAddress} → {order.dropoffAddress}
              </span>
              <span className="truncate text-ops-text-muted">{order.driverName ?? "Unassigned"}</span>
              <span>
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE[order.status]}`}>
                  {order.status}
                </span>
              </span>
              <span className="font-[family-name:var(--font-ibm-plex)]">
                {formatCurrency(order.price + order.overtimeFee)}
              </span>
              <span className="text-xs text-ops-text-muted">{formatDate(order.createdAt)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

Sorting is intentionally left as a stretch goal in this snippet (the search + status-filter chips cover the mockup's primary interaction) — if you add column-sort, keep it client-side `useMemo` over `filtered`, consistent with the rest of the app's zero-pagination convention; it's not required for acceptance.

The separate `ops-order-row.tsx` file mentioned above is optional if inlining the row (as done here) stays under a reasonable file size — only extract it if the file grows unwieldy. If you do extract it, export `STATUS_BADGE` from there instead of duplicating it, and import it back into `ops-orders-tab.tsx`.

## Acceptance Criteria

- [ ] Orders tab lists every order in `orders`, with search (order id prefix or customer name) and status-filter chips (with live counts) both working.
- [ ] Empty state ("No orders match your filters.") when the filtered list is empty.
- [ ] Clicking a row calls `openDrawer({ type: "order", id: order.id })`.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Manually verified: search and status filters narrow the list correctly; clicking a row opens the (placeholder, until task-13 lands) order drawer.
