# Task 09: Revenue tab

## Status

complete

## Wave

3

## Description

Fills in the Revenue tab: a period selector, a hand-rolled daily revenue trend chart, a breakdown by vehicle type ("service") and by driver region, and a computed driver-payouts table (orders completed + total earned per driver — no paid/pending status, no ratings, per the locked product decision that neither exists in the schema).

## Dependencies

**Depends on:** task-01-dashboard-data-module.md, task-06-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `CompanyDashboardData["revenue"]`: `dailyTrend: {date: string; total: number}[]` (exactly 90 entries, oldest first, one per calendar day, zero-filled), `byServiceType: {vehicleTypeSpecId, label, total, orderCount}[]`, `byRegion: {city: GeorgianCity | "UNASSIGNED", total, orderCount}[]`, `driverPayouts: {userId, name, completedOrdersCount, totalEarned}[]` (last 90 days). task-06 created `src/components/dashboard/ops/ops-revenue-tab.tsx` as a placeholder wired into the shell with prop `{ revenue: CompanyDashboardData["revenue"] }` — keep that exact prop shape.

## Files to Modify

- `src/components/dashboard/ops/ops-revenue-tab.tsx` — replace placeholder body with real content.

## Technical Details

### Current placeholder (being replaced)

```tsx
import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

export function OpsRevenueTab({ revenue }: { revenue: CompanyDashboardData["revenue"] }) {
  return <div className="text-sm text-ops-text-muted">Revenue — coming soon.</div>;
}
```

### Period selector

`revenue.dailyTrend`/`revenue.driverPayouts` are always fetched as the full last-90-day window (per task-01) — the period selector here is a **client-side slice**, not a re-fetch, consistent with the app's zero-pagination/zero-server-refetch convention. 7/30/90-day chips slice the last N entries of `dailyTrend` and re-derive payouts... note: `driverPayouts` from task-01 is a single 90-day aggregate, not per-day, so it cannot be re-sliced to a shorter window client-side without the underlying per-order data. **Do not attempt to re-bucket `driverPayouts` by period** — treat the payouts table as a fixed "last 90 days" view regardless of which trend-chart period is selected, and label it explicitly ("Driver payouts — last 90 days") so this isn't misleading. The period selector only affects the trend chart and, if you choose, the service/region breakdown totals cannot be re-sliced either (same reason — they're pre-aggregated over all `COMPLETED` orders, not windowed) — label those "All time" or similar rather than implying they respect the period selector. This is a real limitation of the pre-aggregated data-module contract from task-01; do not silently mislabel it.

### Hand-rolled bar chart (no chart library)

```tsx
"use client";

import { useMemo, useState } from "react";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

const PERIODS = [7, 30, 90] as const;

function formatCurrency(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function OpsRevenueTab({ revenue }: { revenue: CompanyDashboardData["revenue"] }) {
  const [periodDays, setPeriodDays] = useState<(typeof PERIODS)[number]>(30);

  const trendSlice = useMemo(
    () => revenue.dailyTrend.slice(-periodDays),
    [revenue.dailyTrend, periodDays],
  );
  const maxDaily = Math.max(1, ...trendSlice.map((d) => d.total));
  const periodTotal = trendSlice.reduce((sum, d) => sum + d.total, 0);
  const periodOrders = /* not tracked per-day in task-01's contract; omit an order-count KPI here or approximate from byServiceType/byRegion order counts if you want one — optional */ null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {PERIODS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setPeriodDays(days)}
              className={`rounded-full border px-3.5 py-2 text-xs font-medium ${
                periodDays === days
                  ? "border-ops-accent bg-ops-accent/20 text-ops-accent"
                  : "border-ops-border text-ops-text-muted"
              }`}
            >
              Last {days} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-ops-border bg-ops-surface p-4">
          <div className="text-xs uppercase tracking-wide text-ops-text-muted">Revenue in period</div>
          <div className="mt-2 font-[family-name:var(--font-ibm-plex)] text-xl font-semibold">
            {formatCurrency(periodTotal)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-ops-border bg-ops-surface p-5.5">
        <div className="mb-4.5 text-sm font-semibold">Revenue trend</div>
        <div className="flex h-[170px] items-end gap-1">
          {trendSlice.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${formatCurrency(d.total)}`}
              style={{ height: `${(d.total / maxDaily) * 100}%` }}
              className="min-h-[3px] flex-1 rounded-t bg-ops-accent"
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-ops-border bg-ops-surface p-5">
          <div className="mb-2.5 text-sm font-semibold">Revenue by service (all time)</div>
          {revenue.byServiceType.map((s) => (
            <div key={s.vehicleTypeSpecId} className="flex items-center gap-3 py-2">
              <div className="w-[100px] flex-shrink-0 truncate text-[13px] text-ops-text-muted">{s.label}</div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ops-surface-raised">
                <div
                  style={{
                    width: `${(s.total / Math.max(1, ...revenue.byServiceType.map((x) => x.total))) * 100}%`,
                  }}
                  className="h-full rounded-full bg-ops-accent"
                />
              </div>
              <div className="w-20 flex-shrink-0 text-right font-[family-name:var(--font-ibm-plex)] text-xs">
                {formatCurrency(s.total)}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-ops-border bg-ops-surface p-5">
          <div className="mb-2.5 text-sm font-semibold">Revenue by region (by driver, all time)</div>
          {revenue.byRegion.map((r) => (
            <div key={r.city} className="flex items-center gap-3 py-2">
              <div className="w-[100px] flex-shrink-0 truncate text-[13px] text-ops-text-muted">
                {r.city === "UNASSIGNED" ? "Unassigned" : r.city}
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ops-surface-raised">
                <div
                  style={{
                    width: `${(r.total / Math.max(1, ...revenue.byRegion.map((x) => x.total))) * 100}%`,
                  }}
                  className="h-full rounded-full bg-sky-400"
                />
              </div>
              <div className="w-20 flex-shrink-0 text-right font-[family-name:var(--font-ibm-plex)] text-xs">
                {formatCurrency(r.total)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-ops-border">
        <div className="px-5.5 pt-4.5 pb-3 text-sm font-semibold">Driver payouts — last 90 days</div>
        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 border-b border-ops-border px-5.5 py-2.5 text-[11px] uppercase tracking-wide text-ops-text-muted">
          <div>Driver</div>
          <div>Orders completed</div>
          <div>Earned</div>
        </div>
        {revenue.driverPayouts.length === 0 ? (
          <div className="p-8 text-center text-sm text-ops-text-muted">No completed deliveries in this window.</div>
        ) : (
          revenue.driverPayouts.map((p) => (
            <div
              key={p.userId}
              className="grid grid-cols-[1.4fr_1fr_1fr] items-center gap-3 border-b border-ops-border/60 px-5.5 py-3 text-sm last:border-none"
            >
              <div>{p.name}</div>
              <div className="font-[family-name:var(--font-ibm-plex)]">{p.completedOrdersCount}</div>
              <div className="font-[family-name:var(--font-ibm-plex)]">{formatCurrency(p.totalEarned)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

Remove the unused `periodOrders` placeholder line above (it's a note, not real code) — it was left in the sketch to flag that no per-day order count exists in task-01's contract; don't add one unless you also extend task-01 (out of scope for this task — if you want it, note it as a follow-up rather than blocking this task on a data-module change).

## Acceptance Criteria

- [ ] Revenue tab renders a period selector (7/30/90 days) that re-slices the trend chart only (not the pre-aggregated service/region/payouts sections, which are explicitly labeled as all-time/fixed-window).
- [ ] Trend chart bars scale relative to the max value in the selected slice.
- [ ] Service-type and region breakdowns render as horizontal bars with real totals.
- [ ] Driver payouts table shows real computed `completedOrdersCount`/`totalEarned` per driver — no rating stars, no paid/pending badge anywhere on this tab.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
