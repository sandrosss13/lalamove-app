# Task 05: Deliveries tab

## Status

complete

## Wave

3

## Description

Fills in the Deliveries tab: for an independent driver, two sections — "Available" (open-market orders matching a registered vehicle type) and "My deliveries" (everything assigned to them); for a company-rostered driver, only "My deliveries". This mirrors `driver-bookings.tsx`'s existing two-section layout. Status filter + search narrow "My deliveries"; clicking any row opens the order-detail drawer (real content lands in task-08).

## Dependencies

**Depends on:** task-01-driver-dashboard-data-module.md, task-03-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `DriverOpsOrder` (fields: `id, status, cargoCategory, description, pickupAddress, pickupLat, pickupLng, dropoffAddress, dropoffLat, dropoffLng, distanceKm, price, overtimeFee, vehicleTypeSpecId, vehicleTypeLabel, clientName, vehicleId, vehiclePlate, createdAt, inTransitAt, completedAt, waitingMinutes, isOpenMarket` — `isOpenMarket` is `true` only for still-`PENDING`, unclaimed orders, which only ever appear in an independent driver's `orders` array). task-03 created `src/components/dashboard/driver-ops/driver-ops-deliveries-tab.tsx` as a placeholder wired into the shell with props `{ orders: DriverDashboardData["orders"]; isIndependent: boolean }` — keep that exact prop shape. task-03's `useOpsDashboard()` exposes `openDrawer({ type: "order", id })`.

## Files to Modify

- `src/components/dashboard/driver-ops/driver-ops-deliveries-tab.tsx` — replace placeholder body with real content.

## Technical Details

### Current placeholder (being replaced)

```tsx
import type { DriverDashboardData } from "@/lib/driver-dashboard-data";

export function DriverOpsDeliveriesTab({
  orders,
  isIndependent,
}: {
  orders: DriverDashboardData["orders"];
  isIndependent: boolean;
}) {
  return <div className="text-sm text-ops-text-muted">Deliveries — coming soon.</div>;
}
```

### Status badge colors — reuse the same palette as the company Orders tab

```tsx
const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-300",
  ACCEPTED: "bg-blue-500/20 text-blue-300",
  IN_TRANSIT: "bg-sky-500/20 text-sky-300",
  COMPLETED: "bg-emerald-500/20 text-emerald-300",
  CANCELLED: "bg-red-500/20 text-red-300",
};
```

(No `CLAIMED` entry needed here — that status only ever arises on company-claimed orders, never on an order a driver's own dashboard shows.)

### New content

```tsx
"use client";

import { useMemo, useState } from "react";

import type { DriverDashboardData } from "@/lib/driver-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-300",
  ACCEPTED: "bg-blue-500/20 text-blue-300",
  IN_TRANSIT: "bg-sky-500/20 text-sky-300",
  COMPLETED: "bg-emerald-500/20 text-emerald-300",
  CANCELLED: "bg-red-500/20 text-red-300",
};

function formatCurrency(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function OrderRow({
  order,
  onClick,
}: {
  order: DriverDashboardData["orders"][number];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full grid-cols-[1.4fr_1fr_120px_100px_130px] items-center gap-3 border-b border-ops-border/60 px-4.5 py-3 text-left text-sm last:border-none hover:bg-ops-surface-raised"
    >
      <span className="truncate">{order.clientName}</span>
      <span className="truncate text-xs text-ops-text-muted">
        {order.pickupAddress} → {order.dropoffAddress}
      </span>
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
  );
}

export function DriverOpsDeliveriesTab({
  orders,
  isIndependent,
}: {
  orders: DriverDashboardData["orders"];
  isIndependent: boolean;
}) {
  const { openDrawer } = useOpsDashboard();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | string>("all");

  const openOrders = useMemo(() => orders.filter((o) => o.isOpenMarket), [orders]);
  const myDeliveries = useMemo(() => orders.filter((o) => !o.isOpenMarket), [orders]);

  const filteredMyDeliveries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return myDeliveries.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (q === "") return true;
      return o.clientName.toLowerCase().includes(q);
    });
  }, [myDeliveries, search, statusFilter]);

  const statuses = ["all", "ACCEPTED", "IN_TRANSIT", "COMPLETED", "CANCELLED"];

  return (
    <div className="flex flex-col gap-6">
      {isIndependent ? (
        <section>
          <div className="mb-3 text-sm font-semibold">
            Available <span className="text-ops-text-muted">({openOrders.length})</span>
          </div>
          {openOrders.length === 0 ? (
            <p className="text-sm text-ops-text-muted">No deliveries available right now.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-ops-border">
              {openOrders.map((order) => (
                <OrderRow key={order.id} order={order} onClick={() => openDrawer({ type: "order", id: order.id })} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">
            My deliveries <span className="text-ops-text-muted">({myDeliveries.length})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer…"
              className="w-48 rounded-lg border border-ops-border bg-ops-surface px-3 py-2 text-sm outline-none placeholder:text-ops-text-muted"
            />
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    statusFilter === status
                      ? "border-ops-accent bg-ops-accent/20 text-ops-accent"
                      : "border-ops-border text-ops-text-muted"
                  }`}
                >
                  {status === "all" ? "All" : status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {myDeliveries.length === 0 ? (
          <p className="text-sm text-ops-text-muted">
            {isIndependent ? "You haven't taken a delivery yet." : "Nothing dispatched to you yet."}
          </p>
        ) : filteredMyDeliveries.length === 0 ? (
          <p className="text-sm text-ops-text-muted">No deliveries match your filters.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-ops-border">
            {filteredMyDeliveries.map((order) => (
              <OrderRow key={order.id} order={order} onClick={() => openDrawer({ type: "order", id: order.id })} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

## Acceptance Criteria

- [ ] Independent drivers see both "Available" and "My deliveries" sections; rostered drivers see only "My deliveries".
- [ ] "My deliveries" supports search (customer name) and status filter chips.
- [ ] Empty states match the wording of the original `driver-bookings.tsx` ("You haven't taken a delivery yet." / "Nothing dispatched to you yet — your company assigns deliveries to you." — condense as needed but keep the independent/rostered distinction).
- [ ] Clicking any row calls `openDrawer({ type: "order", id: order.id })`.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
