# Task 04: Overview tab

## Status

complete

## Wave

3

## Description

Fills in the Overview tab: the online/offline availability toggle (reusing `DriverStatusToggle` unmodified), an active-delivery card if the driver currently has one in progress, and stat tiles (completed today, earnings today/this month, completed all-time). This is the driver's landing view — a quick status check.

## Dependencies

**Depends on:** task-01-driver-dashboard-data-module.md, task-03-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `DriverDashboardData["driver"]` (`userId, name, city, isOnline, isIndependent, companyName`) and `["overview"]` (`completedTodayCount, earningsTodayTotal, earningsMonthTotal, completedTotalCount, activeOrderId: string | null`). task-03 created `src/components/dashboard/driver-ops/driver-ops-overview-tab.tsx` as a placeholder wired into the shell with the exact props `{ driver: DriverDashboardData["driver"]; overview: DriverDashboardData["overview"] }` — do not change that prop shape. task-03's `useOpsDashboard()` (from `@/components/dashboard/ops/ops-dashboard-context`) exposes `openDrawer({ type: "order", id })`.

## Files to Modify

- `src/components/dashboard/driver-ops/driver-ops-overview-tab.tsx` — replace placeholder body with real content.

## Technical Details

### Current placeholder (being replaced)

```tsx
import type { DriverDashboardData } from "@/lib/driver-dashboard-data";

export function DriverOpsOverviewTab({
  driver,
  overview,
}: {
  driver: DriverDashboardData["driver"];
  overview: DriverDashboardData["overview"];
}) {
  return <div className="text-sm text-ops-text-muted">Overview — coming soon.</div>;
}
```

### `DriverStatusToggle` (existing, reused unmodified)

`src/components/driver-status-toggle.tsx` — props `{ initialIsOnline: boolean }`. Fully self-contained: owns its own online/offline `useState` and the 15-second geolocation-beacon `useEffect`, does not rely on `router.refresh()` or this dashboard's toast/context at all. Render it as-is with `initialIsOnline={driver.isOnline}` — no wrapper, no new props needed on it.

### New content

```tsx
"use client";

import type { DriverDashboardData } from "@/lib/driver-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { DriverStatusToggle } from "@/components/driver-status-toggle";

function formatCurrency(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ops-border bg-ops-surface p-4.5">
      <div className="text-xs uppercase tracking-wide text-ops-text-muted">{label}</div>
      <div className="font-[family-name:var(--font-ibm-plex)] text-2xl font-semibold">{value}</div>
    </div>
  );
}

export function DriverOpsOverviewTab({
  driver,
  overview,
}: {
  driver: DriverDashboardData["driver"];
  overview: DriverDashboardData["overview"];
}) {
  const { openDrawer } = useOpsDashboard();

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-ops-border bg-ops-surface p-4.5">
        <DriverStatusToggle initialIsOnline={driver.isOnline} />
      </div>

      {overview.activeOrderId ? (
        <button
          type="button"
          onClick={() => openDrawer({ type: "order", id: overview.activeOrderId as string })}
          className="rounded-xl border border-ops-accent/40 bg-ops-accent/10 p-4.5 text-left"
        >
          <div className="text-xs uppercase tracking-wide text-ops-accent">Active delivery</div>
          <div className="mt-1 text-sm text-ops-text">
            You have a delivery in progress — tap to view details, track it, or mark it complete.
          </div>
        </button>
      ) : null}

      <div className="grid grid-cols-4 gap-4">
        <StatTile label="Completed today" value={String(overview.completedTodayCount)} />
        <StatTile label="Earned today" value={formatCurrency(overview.earningsTodayTotal)} />
        <StatTile label="Earned this month" value={formatCurrency(overview.earningsMonthTotal)} />
        <StatTile label="Completed all-time" value={String(overview.completedTotalCount)} />
      </div>
    </div>
  );
}
```

`DriverStatusToggle`'s own internal text/buttons use plain (unscoped) Tailwind classes (`rounded border`, etc.) — inside the dark surface wrapper above they'll still render with their default light-theme classes verbatim. Restyling it via `[data-ops-dashboard] button`/`span` CSS-attribute-selector overrides in `globals.css` (the same optional-polish approach used in the company spec for its reused forms) is a nice-to-have, not required for this task's acceptance.

## Acceptance Criteria

- [ ] `DriverStatusToggle` renders and functions exactly as it does today (online/offline toggle, geolocation beacon) — no behavior change, just placed inside the new tab.
- [ ] Active-delivery card appears only when `overview.activeOrderId` is set, and clicking it opens the order drawer for that id.
- [ ] 4 stat tiles render real numbers from `overview`.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Manually verified: toggling online/offline still works exactly as before (including the browser geolocation permission prompt on first "Go online").
