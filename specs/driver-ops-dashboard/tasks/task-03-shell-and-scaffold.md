# Task 03: Dashboard shell, sidebar, entry point, and tab/drawer scaffold

## Status

pending

## Wave

2

## Description

This is the load-bearing task for this feature's UI, mirroring `specs/company-ops-dashboard/tasks/task-06-shell-and-scaffold.md`'s approach exactly but for the driver side: it builds the client-side shell that owns tab-switching, drawer, and toast state (reusing the **shared** `OpsDashboardContext`/`OpsToast`/`OpsDrawerShell` from the company spec rather than recreating them); a driver-specific sidebar; rewrites `driver-dashboard.tsx` to fetch real data and mount the shell; and creates **placeholder** versions of every one of the 4 tab panels and 2 drawers at their final file paths. Wave 3 (tabs) and Wave 4 (drawers) then only ever *modify* those placeholder files — never create new files or touch the shell — which is what lets those tasks run fully in parallel with zero file-overlap risk.

## ⚠️ Hard prerequisite

Before starting this task, confirm these three files already exist in the codebase (created by `specs/company-ops-dashboard/tasks/task-06-shell-and-scaffold.md`):
- `src/components/dashboard/ops/ops-dashboard-context.tsx`
- `src/components/dashboard/ops/ops-toast.tsx`
- `src/components/dashboard/ops/ops-drawer-shell.tsx`

And that `specs/company-ops-dashboard/tasks/task-04-dark-theme-foundation.md` has landed (`--ops-*` CSS tokens/keyframes/font in `globals.css`/`layout.tsx`, the `data-ops-dashboard` scoping attribute). If any of these are missing, stop — this task cannot proceed until they exist. Do not recreate them under a driver-specific name; import them from those exact paths.

## Dependencies

**Depends on:** task-01-driver-dashboard-data-module.md (plus the external prerequisite above)
**Blocks:** task-04 through task-09 (every remaining task)

**Context from dependencies:** task-01 created `src/lib/driver-dashboard-data.ts`, exporting `getDriverDashboardData(userId): Promise<DriverDashboardData | null>` and the types `DriverDashboardData`, `DriverOpsOrder`, `DriverOpsVehicle` (full field lists in that task's file — import them from `@/lib/driver-dashboard-data`, do not redeclare).

## Files to Create

- `src/components/dashboard/driver-ops/driver-ops-dashboard-shell.tsx` — top-level client shell.
- `src/components/dashboard/driver-ops/driver-ops-sidebar.tsx` — nav sidebar (tabs conditional on `driver.isIndependent`).
- `src/components/dashboard/driver-ops/driver-ops-overview-tab.tsx` — placeholder (real content: task-04).
- `src/components/dashboard/driver-ops/driver-ops-deliveries-tab.tsx` — placeholder (real content: task-05).
- `src/components/dashboard/driver-ops/driver-ops-earnings-tab.tsx` — placeholder (real content: task-06).
- `src/components/dashboard/driver-ops/driver-ops-vehicle-tab.tsx` — placeholder (real content: task-07).
- `src/components/dashboard/driver-ops/drawers/driver-order-detail-drawer.tsx` — placeholder (real content: task-08).
- `src/components/dashboard/driver-ops/drawers/driver-add-vehicle-drawer.tsx` — placeholder (real content: task-09).

## Files to Modify

- `src/components/dashboard/driver-dashboard.tsx` — rewritten entry point (same file, same exported function name `DriverDashboard`, same `{ userId, userName }: { userId: string; userName: string }` props — `src/app/dashboard/page.tsx` needs no change at all).

## Technical Details

### Current `driver-dashboard.tsx` fallback path (preserve the spirit of this, adjust wording for the new dark UI not applying to the fallback)

The current file has no explicit "profile not set up" branch (a `DriverProfile` row is normally created at sign-up, so this is rarer than the company case) — but `getDriverDashboardData` returns `null` in that case per task-01, so this task must add one, styled like the company spec's equivalent fallback (plain light theme, not the dark dashboard — there's nothing to show inside the dark shell without data).

### New `driver-dashboard.tsx`

```tsx
import { getDriverDashboardData } from "@/lib/driver-dashboard-data";
import { DriverOpsDashboardShell } from "@/components/dashboard/driver-ops/driver-ops-dashboard-shell";

/**
 * A driver's ops dashboard: a tabbed dark console (Overview/Deliveries/
 * Earnings/Vehicle) wired to real Prisma data via `getDriverDashboardData`.
 * Replaces the previous plain vehicles/bookings page entirely.
 */
export async function DriverDashboard({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const data = await getDriverDashboardData(userId);

  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">{userName}</h1>
          <p className="text-sm opacity-60">Driver account</p>
        </header>
        <p className="text-sm opacity-70">
          Your driver profile isn&apos;t set up yet. Finish signing up as a
          driver to see your dashboard.
        </p>
      </main>
    );
  }

  return (
    <div
      data-ops-dashboard=""
      className="min-h-screen bg-ops-bg font-[family-name:var(--font-ibm-plex)] text-ops-text antialiased"
    >
      <DriverOpsDashboardShell data={data} />
    </div>
  );
}
```

Note `data-ops-dashboard=""` is the exact same attribute the company dashboard uses — this is intentional and requires no new CSS: the scoping rules in `globals.css` (from the company spec's task-04) already apply to any element carrying this attribute, so the driver dashboard gets the dark theme, hidden global header, and scoped focus rings for free.

### `driver-ops-dashboard-shell.tsx`

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DriverDashboardData } from "@/lib/driver-dashboard-data";
import {
  OpsDashboardContext,
  type OpsDrawerState,
  type OpsToastState,
} from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsToast } from "@/components/dashboard/ops/ops-toast";
import { DriverOpsSidebar } from "@/components/dashboard/driver-ops/driver-ops-sidebar";
import { DriverOpsOverviewTab } from "@/components/dashboard/driver-ops/driver-ops-overview-tab";
import { DriverOpsDeliveriesTab } from "@/components/dashboard/driver-ops/driver-ops-deliveries-tab";
import { DriverOpsEarningsTab } from "@/components/dashboard/driver-ops/driver-ops-earnings-tab";
import { DriverOpsVehicleTab } from "@/components/dashboard/driver-ops/driver-ops-vehicle-tab";
import { DriverOrderDetailDrawer } from "@/components/dashboard/driver-ops/drawers/driver-order-detail-drawer";
import { DriverAddVehicleDrawer } from "@/components/dashboard/driver-ops/drawers/driver-add-vehicle-drawer";

type TabId = "overview" | "deliveries" | "earnings" | "vehicle";

export function DriverOpsDashboardShell({ data }: { data: DriverDashboardData }) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [activeDrawer, setActiveDrawer] = useState<OpsDrawerState>(null);
  const [toast, setToast] = useState<OpsToastState>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const openDrawer = useCallback((drawer: OpsDrawerState) => setActiveDrawer(drawer), []);
  const closeDrawer = useCallback(() => setActiveDrawer(null), []);

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "deliveries", label: "Deliveries" },
    { id: "earnings", label: "Earnings" },
    // Rostered drivers never see a Vehicle tab — their fleet is company-owned.
    ...(data.driver.isIndependent ? [{ id: "vehicle" as const, label: "Vehicle" }] : []),
  ];

  const subtitles: Record<TabId, string> = {
    overview: "Your status at a glance",
    deliveries: "Available and assigned deliveries",
    earnings: "Your earnings over time",
    vehicle: "Manage the vehicle(s) you drive",
  };

  return (
    <OpsDashboardContext.Provider value={{ openDrawer, closeDrawer, activeDrawer, showToast }}>
      <div className="flex h-screen w-full overflow-hidden">
        <DriverOpsSidebar
          driverName={data.driver.name}
          driverCity={data.driver.city}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as TabId)}
          tabs={tabs}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-[66px] flex-shrink-0 items-center justify-between border-b border-ops-border px-8">
            <div>
              <div className="text-[19px] font-semibold">
                {tabs.find((t) => t.id === activeTab)?.label}
              </div>
              <div className="mt-0.5 text-[13px] text-ops-text-muted">{subtitles[activeTab]}</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 pb-16">
            {activeTab === "overview" ? (
              <DriverOpsOverviewTab driver={data.driver} overview={data.overview} />
            ) : null}
            {activeTab === "deliveries" ? (
              <DriverOpsDeliveriesTab orders={data.orders} isIndependent={data.driver.isIndependent} />
            ) : null}
            {activeTab === "earnings" ? <DriverOpsEarningsTab earnings={data.earnings} /> : null}
            {activeTab === "vehicle" && data.driver.isIndependent ? (
              <DriverOpsVehicleTab vehicles={data.vehicles} />
            ) : null}
          </div>
        </div>
      </div>

      {activeDrawer?.type === "order" ? (
        <DriverOrderDetailDrawer
          order={data.orders.find((o) => o.id === activeDrawer.id) ?? null}
          vehicles={data.vehicles}
          isIndependent={data.driver.isIndependent}
        />
      ) : null}
      {activeDrawer?.type === "add-vehicle" ? <DriverAddVehicleDrawer /> : null}

      <OpsToast toast={toast} />
    </OpsDashboardContext.Provider>
  );
}
```

Note `OpsDrawerState` (imported from the company spec's `ops-dashboard-context.tsx`) is the union `{type:"order",id} | {type:"driver",id} | {type:"add-vehicle"} | null` — this dashboard only ever produces `"order"` and `"add-vehicle"` values; the `"driver"` variant is simply never constructed here. This is fine — it's a shared generic type, not a driver-dashboard-specific one, so it isn't narrowed.

### `driver-ops-sidebar.tsx`

```tsx
"use client";

export function DriverOpsSidebar({
  driverName,
  driverCity,
  activeTab,
  onTabChange,
  tabs,
}: {
  driverName: string;
  driverCity: string;
  activeTab: string;
  onTabChange: (id: string) => void;
  tabs: { id: string; label: string }[];
}) {
  return (
    <div className="flex w-[232px] flex-shrink-0 flex-col border-r border-ops-border bg-ops-surface p-3.5">
      <div className="flex items-center gap-2.5 px-2 pb-6">
        <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-ops-accent text-[15px] font-bold text-ops-accent-fg">
          W
        </div>
        <div className="text-[17px] font-semibold tracking-tight">Waypoint</div>
      </div>

      <div className="flex flex-col gap-0.5">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                active ? "bg-ops-accent/20 text-ops-accent" : "text-ops-text-muted hover:bg-ops-surface-raised"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${active ? "bg-ops-accent" : "bg-ops-text-muted"}`}
              />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2.5 border-t border-ops-border px-2 pt-3.5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-ops-surface-raised text-xs font-semibold">
          {driverName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{driverName}</div>
          <div className="truncate text-[11px] text-ops-text-muted">{driverCity}</div>
        </div>
      </div>
    </div>
  );
}
```

### Placeholder tab files (4) — same trivial shape, matching the exact props the shell above passes in

`driver-ops-overview-tab.tsx` — takes `driver` too (not just `overview`), since the real content (task-04) renders `DriverStatusToggle`, which needs `driver.isOnline`:

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

`driver-ops-deliveries-tab.tsx`:

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

`driver-ops-earnings-tab.tsx`:

```tsx
import type { DriverDashboardData } from "@/lib/driver-dashboard-data";

export function DriverOpsEarningsTab({ earnings }: { earnings: DriverDashboardData["earnings"] }) {
  return <div className="text-sm text-ops-text-muted">Earnings — coming soon.</div>;
}
```

`driver-ops-vehicle-tab.tsx`:

```tsx
import type { DriverDashboardData } from "@/lib/driver-dashboard-data";

export function DriverOpsVehicleTab({ vehicles }: { vehicles: DriverDashboardData["vehicles"] }) {
  return <div className="text-sm text-ops-text-muted">Vehicle — coming soon.</div>;
}
```

None need `"use client"` yet (no hooks) — wave 3 tasks add it where needed.

### Placeholder drawer files (2)

`drawers/driver-order-detail-drawer.tsx`:

```tsx
"use client";

import type { DriverDashboardData, DriverOpsOrder } from "@/lib/driver-dashboard-data";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

export function DriverOrderDetailDrawer({
  order,
  vehicles,
  isIndependent,
}: {
  order: DriverOpsOrder | null;
  vehicles: DriverDashboardData["vehicles"];
  isIndependent: boolean;
}) {
  if (!order) return null;
  return (
    <OpsDrawerShell title={order.id}>
      <div className="text-sm text-ops-text-muted">Order detail — coming soon.</div>
    </OpsDrawerShell>
  );
}
```

`drawers/driver-add-vehicle-drawer.tsx`:

```tsx
"use client";

import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

export function DriverAddVehicleDrawer() {
  return (
    <OpsDrawerShell title="Register vehicle">
      <div className="text-sm text-ops-text-muted">Register vehicle — coming soon.</div>
    </OpsDrawerShell>
  );
}
```

## Acceptance Criteria

- [ ] Signing in as a `DRIVER` user with a completed driver profile and visiting `/dashboard` renders the dark shell: sidebar with 3 or 4 tabs (4th, "Vehicle", only for independent drivers), header showing the active tab's title/subtitle, each tab showing its placeholder text when clicked.
- [ ] The "profile not set up yet" fallback still renders (plain light theme, not the dark shell) for a `DRIVER` user with no `DriverProfile` row.
- [ ] A rostered (company-affiliated) driver's sidebar shows only Overview/Deliveries/Earnings — no Vehicle tab.
- [ ] `pnpm typecheck` and `pnpm lint` pass — every placeholder file's prop types must exactly match what `driver-ops-dashboard-shell.tsx` passes in, since waves 3/4 depend on these signatures staying stable.
- [ ] Visiting `/dashboard` as a `COMPANY` user, `/account` as `CLIENT`, `/orders`, or the landing page shows no dark-theme leakage.

## Notes

- Keep every placeholder file's prop signature exactly as shown — later waves modify these files in place but must not need to change the exported function's name or prop shape, since this task (not later tasks) is the only one that imports and calls them from the shell.
