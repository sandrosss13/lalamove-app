# Task 06: Earnings tab

## Status

pending

## Wave

3

## Description

Fills in the Earnings tab: a period selector (7/30/90 days) and a hand-rolled daily earnings trend chart, scoped to this one driver. Intentionally simpler than the company Revenue tab (no by-service/by-region breakdown, no payouts table) — a single driver has one data slice, not a fleet to break down.

## Dependencies

**Depends on:** task-01-driver-dashboard-data-module.md, task-03-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `DriverDashboardData["earnings"]`: `{ dailyTrend: {date: string; total: number}[] }` (exactly 90 entries, oldest first, one per calendar day, zero-filled). task-03 created `src/components/dashboard/driver-ops/driver-ops-earnings-tab.tsx` as a placeholder wired into the shell with prop `{ earnings: DriverDashboardData["earnings"] }` — keep that exact prop shape.

## Files to Modify

- `src/components/dashboard/driver-ops/driver-ops-earnings-tab.tsx` — replace placeholder body with real content.

## Technical Details

### Current placeholder (being replaced)

```tsx
import type { DriverDashboardData } from "@/lib/driver-dashboard-data";

export function DriverOpsEarningsTab({ earnings }: { earnings: DriverDashboardData["earnings"] }) {
  return <div className="text-sm text-ops-text-muted">Earnings — coming soon.</div>;
}
```

### New content

Same hand-rolled CSS-bar chart technique as the company spec's Revenue tab (`specs/company-ops-dashboard/tasks/task-09-revenue-tab.md`) — no chart library.

```tsx
"use client";

import { useMemo, useState } from "react";

import type { DriverDashboardData } from "@/lib/driver-dashboard-data";

const PERIODS = [7, 30, 90] as const;

function formatCurrency(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function DriverOpsEarningsTab({ earnings }: { earnings: DriverDashboardData["earnings"] }) {
  const [periodDays, setPeriodDays] = useState<(typeof PERIODS)[number]>(30);

  const slice = useMemo(() => earnings.dailyTrend.slice(-periodDays), [earnings.dailyTrend, periodDays]);
  const maxDaily = Math.max(1, ...slice.map((d) => d.total));
  const periodTotal = slice.reduce((sum, d) => sum + d.total, 0);
  const periodAverage = slice.length > 0 ? periodTotal / slice.length : 0;

  return (
    <div className="flex flex-col gap-5">
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

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-ops-border bg-ops-surface p-4">
          <div className="text-xs uppercase tracking-wide text-ops-text-muted">Earned in period</div>
          <div className="mt-2 font-[family-name:var(--font-ibm-plex)] text-xl font-semibold">
            {formatCurrency(periodTotal)}
          </div>
        </div>
        <div className="rounded-xl border border-ops-border bg-ops-surface p-4">
          <div className="text-xs uppercase tracking-wide text-ops-text-muted">Daily average</div>
          <div className="mt-2 font-[family-name:var(--font-ibm-plex)] text-xl font-semibold">
            {formatCurrency(periodAverage)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-ops-border bg-ops-surface p-5.5">
        <div className="mb-4.5 text-sm font-semibold">Earnings trend</div>
        <div className="flex h-[170px] items-end gap-1">
          {slice.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${formatCurrency(d.total)}`}
              style={{ height: `${(d.total / maxDaily) * 100}%` }}
              className="min-h-[3px] flex-1 rounded-t bg-ops-accent"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

## Acceptance Criteria

- [ ] Period selector (7/30/90 days) re-slices the trend chart and the two KPI tiles (period total, daily average).
- [ ] Trend chart bars scale relative to the max value in the selected slice.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
