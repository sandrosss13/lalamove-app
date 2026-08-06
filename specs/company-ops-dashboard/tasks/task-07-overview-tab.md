# Task 07: Overview tab

## Status

pending

## Wave

3

## Description

Fills in the Overview tab: stat tiles (active orders, completed today, revenue today/this month, online drivers, fleet size) and a "recent orders" list. This is the dashboard's landing view — it should give a company admin a fleet-wide status check at a glance, with recent orders clickable through to the order-detail drawer.

## Dependencies

**Depends on:** task-01-dashboard-data-module.md, task-06-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `CompanyDashboardData["overview"]` with fields `activeOrdersCount`, `completedTodayCount`, `revenueTodayTotal`, `revenueMonthTotal`, `onlineDriversCount`, `fleetSize`, `recentOrders: OpsOrder[]` (latest 8, already sorted newest-first). task-06 created `src/components/dashboard/ops/ops-overview-tab.tsx` as a placeholder already wired into `ops-dashboard-shell.tsx` with the exact prop `{ overview: CompanyDashboardData["overview"] }` — do not change that prop shape, `ops-dashboard-shell.tsx` is not part of this task's scope. task-06 also created `OpsDashboardContext`/`useOpsDashboard()` in `src/components/dashboard/ops/ops-dashboard-context.tsx`, exposing `openDrawer({ type: "order", id })` to open the order-detail drawer (its real content lands in task-13 — wiring the click here works regardless of that task's completion order).

## Files to Modify

- `src/components/dashboard/ops/ops-overview-tab.tsx` — replace placeholder body with real content.

## Technical Details

### Current placeholder (being replaced)

```tsx
import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

export function OpsOverviewTab({ overview }: { overview: CompanyDashboardData["overview"] }) {
  return <div className="text-sm text-ops-text-muted">Overview — coming soon.</div>;
}
```

### New content

Add `"use client"` (needed for `useOpsDashboard()`). Render:

1. A 4-column stat-tile grid: Active orders, Completed today, Revenue today, Online drivers (pick 4 of the 6 available fields — fleet size and revenue-this-month can appear as secondary text within a tile, e.g. under "Revenue today" show "· $X this month" in muted text).
2. A "Recent orders" panel below listing `overview.recentOrders`, each row clickable to open the order drawer.

```tsx
"use client";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";

function formatCurrency(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ops-border bg-ops-surface p-4.5">
      <div className="text-xs uppercase tracking-wide text-ops-text-muted">{label}</div>
      <div className="font-[family-name:var(--font-ibm-plex)] text-2xl font-semibold">{value}</div>
      {sub ? <div className="text-xs text-ops-text-muted">{sub}</div> : null}
    </div>
  );
}

export function OpsOverviewTab({ overview }: { overview: CompanyDashboardData["overview"] }) {
  const { openDrawer } = useOpsDashboard();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-4 gap-4">
        <StatTile label="Active orders" value={String(overview.activeOrdersCount)} />
        <StatTile label="Completed today" value={String(overview.completedTodayCount)} />
        <StatTile
          label="Revenue today"
          value={formatCurrency(overview.revenueTodayTotal)}
          sub={`${formatCurrency(overview.revenueMonthTotal)} this month`}
        />
        <StatTile
          label="Online drivers"
          value={String(overview.onlineDriversCount)}
          sub={`${overview.fleetSize} vehicles in fleet`}
        />
      </div>

      <div className="rounded-xl border border-ops-border bg-ops-surface p-5.5">
        <div className="mb-3.5 text-sm font-semibold">Recent orders</div>
        {overview.recentOrders.length === 0 ? (
          <p className="text-sm text-ops-text-muted">No orders yet.</p>
        ) : (
          <div className="flex flex-col">
            {overview.recentOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => openDrawer({ type: "order", id: order.id })}
                className="grid grid-cols-[100px_1.4fr_1fr_110px_90px] items-center gap-3 border-b border-ops-border/60 py-2.5 text-left text-sm last:border-none hover:bg-ops-surface-raised"
              >
                <span className="font-[family-name:var(--font-ibm-plex)] text-ops-text-muted">
                  {order.id.slice(0, 8)}
                </span>
                <span>{order.clientName}</span>
                <span className="text-ops-text-muted">{order.driverName ?? "Unassigned"}</span>
                <span className="text-xs text-ops-text-muted">{order.status}</span>
                <span className="text-right font-[family-name:var(--font-ibm-plex)]">
                  {formatCurrency(order.price + order.overtimeFee)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

`CARGO_CATEGORY_LABELS` is imported but unused in the snippet above — remove that import if you don't end up using it (it's only relevant if you choose to show cargo type in the recent-orders row; not required).

## Acceptance Criteria

- [ ] Overview tab shows 4 stat tiles with real numbers from `overview`.
- [ ] Recent orders list renders `overview.recentOrders`, each row clickable, calling `openDrawer({ type: "order", id: order.id })`.
- [ ] Empty state ("No orders yet.") when `recentOrders` is empty.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Manually verified: Overview tab renders correctly for a company with at least one order.
