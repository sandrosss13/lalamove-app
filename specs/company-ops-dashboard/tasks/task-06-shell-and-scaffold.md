# Task 06: Dashboard shell, chrome, entry point, and tab/drawer scaffold

## Status

complete

## Wave

2

## Description

This is the load-bearing task for the whole feature's UI: it builds the client-side shell that owns tab-switching, drawer, and toast state; the reusable chrome (sidebar, toast, generic drawer shell); rewrites `company-dashboard.tsx` to fetch real data and mount the shell; and creates **placeholder** versions of every one of the 6 tab panels and 3 drawers at their final file paths. Waves 3 and 4 then only ever *modify* those placeholder files to fill in real content — they never create new files or touch the shell — which is what lets 6 tab tasks and 3 drawer tasks run fully in parallel with zero file-overlap risk.

Keep every placeholder trivially small (a heading + "Coming soon" or similar) — their only job is to make the whole click-through skeleton compile and render end-to-end (sidebar → tab switch → row click → drawer open → close) before real content exists.

## Dependencies

**Depends on:** task-01-dashboard-data-module.md, task-04-dark-theme-foundation.md
**Blocks:** task-07 through task-15 (every remaining task)

**Context from dependencies:** task-01 created `src/lib/company-dashboard-data.ts`, exporting `getCompanyDashboardData(userId): Promise<CompanyDashboardData | null>` and the types `CompanyDashboardData`, `OpsOrder`, `OpsVehicle`, `OpsDriver` (full field lists in that task's file — import them from `@/lib/company-dashboard-data`, do not redeclare). task-04 added `--ops-*` CSS variables/`@theme` mappings (`bg-ops-bg`, `text-ops-text`, `border-ops-border`, etc. as Tailwind utility classes), two keyframe-driven animation utilities (`animate-ops-drawer-in`, `animate-ops-toast-in`), and an `IBM_Plex_Mono` font variable (`--font-ibm-plex`) — all scoped under a `data-ops-dashboard` wrapper attribute you create in this task.

## Files to Create

- `src/components/dashboard/ops/ops-dashboard-context.tsx` — React context + `useOpsDashboard()` hook.
- `src/components/dashboard/ops/ops-dashboard-shell.tsx` — top-level client shell owning all UI state.
- `src/components/dashboard/ops/ops-sidebar.tsx` — nav sidebar.
- `src/components/dashboard/ops/ops-toast.tsx` — toast renderer.
- `src/components/dashboard/ops/ops-drawer-shell.tsx` — generic slide-over chrome.
- `src/components/dashboard/ops/ops-overview-tab.tsx` — placeholder (real content: task-07).
- `src/components/dashboard/ops/ops-orders-tab.tsx` — placeholder (real content: task-08).
- `src/components/dashboard/ops/ops-revenue-tab.tsx` — placeholder (real content: task-09).
- `src/components/dashboard/ops/ops-fleet-tab.tsx` — placeholder (real content: task-10).
- `src/components/dashboard/ops/ops-drivers-tab.tsx` — placeholder (real content: task-11).
- `src/components/dashboard/ops/ops-vehicles-tab.tsx` — placeholder (real content: task-12).
- `src/components/dashboard/ops/drawers/order-detail-drawer.tsx` — placeholder (real content: task-13).
- `src/components/dashboard/ops/drawers/driver-detail-drawer.tsx` — placeholder (real content: task-14).
- `src/components/dashboard/ops/drawers/add-vehicle-drawer.tsx` — placeholder (real content: task-15).

## Files to Modify

- `src/components/dashboard/company-dashboard.tsx` — rewritten entry point (same file, same exported function name `CompanyDashboard`, same `{ userId }: { userId: string }` prop — `src/app/dashboard/page.tsx` needs no change at all).

## Technical Details

### Current `company-dashboard.tsx` (for reference — being replaced)

The current version does `prisma.logisticsCompany.findUnique(...)` directly and renders fleet/roster/bookings sections. The "profile not set up yet" fallback (shown when `company` is `null`) must be preserved verbatim — it's the only piece of the old file that survives:

```tsx
if (!company) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-sm opacity-60">Logistics company account</p>
      </header>
      <p className="text-sm opacity-70">
        Your company profile isn&apos;t set up yet. Finish signing up as a
        logistics company to manage your fleet and drivers.
      </p>
    </main>
  );
}
```

### New `company-dashboard.tsx`

```tsx
import { getCompanyDashboardData } from "@/lib/company-dashboard-data";
import { OpsDashboardShell } from "@/components/dashboard/ops/ops-dashboard-shell";

/**
 * The provider-side ops dashboard for a logistics company: a tabbed dark
 * console (Overview/Orders/Revenue/Fleet/Drivers/Vehicles) wired to real
 * Prisma data via `getCompanyDashboardData`. Replaces the previous plain
 * fleet/roster/bookings page entirely.
 */
export async function CompanyDashboard({ userId }: { userId: string }) {
  const data = await getCompanyDashboardData(userId);

  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-sm opacity-60">Logistics company account</p>
        </header>
        <p className="text-sm opacity-70">
          Your company profile isn&apos;t set up yet. Finish signing up as a
          logistics company to manage your fleet and drivers.
        </p>
      </main>
    );
  }

  return (
    <div
      data-ops-dashboard=""
      className="min-h-screen bg-ops-bg font-[family-name:var(--font-ibm-plex)] text-ops-text antialiased"
    >
      <OpsDashboardShell data={data} />
    </div>
  );
}
```

### `ops-dashboard-context.tsx`

Owns the cross-cutting UI actions every leaf component (tabs, drawers, mutation wrappers) needs without prop-drilling: opening/closing a drawer, and showing a toast.

```tsx
"use client";

import { createContext, useContext } from "react";

export type OpsDrawerState =
  | { type: "order"; id: string }
  | { type: "driver"; id: string }
  | { type: "add-vehicle" }
  | null;

export type OpsToastState = { message: string; tone: "success" | "error" } | null;

export type OpsDashboardContextValue = {
  openDrawer: (drawer: OpsDrawerState) => void;
  closeDrawer: () => void;
  activeDrawer: OpsDrawerState;
  showToast: (message: string, tone?: "success" | "error") => void;
};

export const OpsDashboardContext = createContext<OpsDashboardContextValue | null>(null);

/** Throws if used outside `OpsDashboardShell` — every consumer lives inside it. */
export function useOpsDashboard(): OpsDashboardContextValue {
  const ctx = useContext(OpsDashboardContext);
  if (!ctx) {
    throw new Error("useOpsDashboard must be used within OpsDashboardShell.");
  }
  return ctx;
}
```

### `ops-dashboard-shell.tsx`

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import {
  OpsDashboardContext,
  type OpsDrawerState,
  type OpsToastState,
} from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsSidebar } from "@/components/dashboard/ops/ops-sidebar";
import { OpsToast } from "@/components/dashboard/ops/ops-toast";
import { OpsOverviewTab } from "@/components/dashboard/ops/ops-overview-tab";
import { OpsOrdersTab } from "@/components/dashboard/ops/ops-orders-tab";
import { OpsRevenueTab } from "@/components/dashboard/ops/ops-revenue-tab";
import { OpsFleetTab } from "@/components/dashboard/ops/ops-fleet-tab";
import { OpsDriversTab } from "@/components/dashboard/ops/ops-drivers-tab";
import { OpsVehiclesTab } from "@/components/dashboard/ops/ops-vehicles-tab";
import { OrderDetailDrawer } from "@/components/dashboard/ops/drawers/order-detail-drawer";
import { DriverDetailDrawer } from "@/components/dashboard/ops/drawers/driver-detail-drawer";
import { AddVehicleDrawer } from "@/components/dashboard/ops/drawers/add-vehicle-drawer";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "revenue", label: "Revenue" },
  { id: "fleet", label: "Fleet" },
  { id: "drivers", label: "Drivers" },
  { id: "vehicles", label: "Vehicles" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_SUBTITLES: Record<TabId, string> = {
  overview: "Fleet-wide performance at a glance",
  orders: "Manage deliveries across your fleet",
  revenue: "Earnings, breakdowns and driver payouts",
  fleet: "Drivers and vehicle status",
  drivers: "Roster, contact info and account status",
  vehicles: "Register vehicles and assign them to drivers",
};

export function OpsDashboardShell({ data }: { data: CompanyDashboardData }) {
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

  return (
    <OpsDashboardContext.Provider value={{ openDrawer, closeDrawer, activeDrawer, showToast }}>
      <div className="flex h-screen w-full overflow-hidden">
        <OpsSidebar
          companyName={data.company.companyName}
          companyCity={data.company.city}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as TabId)}
          tabs={TABS}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-[66px] flex-shrink-0 items-center justify-between border-b border-ops-border px-8">
            <div>
              <div className="text-[19px] font-semibold">
                {TABS.find((t) => t.id === activeTab)?.label}
              </div>
              <div className="mt-0.5 text-[13px] text-ops-text-muted">
                {TAB_SUBTITLES[activeTab]}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 pb-16">
            {activeTab === "overview" ? <OpsOverviewTab overview={data.overview} /> : null}
            {activeTab === "orders" ? <OpsOrdersTab orders={data.orders} /> : null}
            {activeTab === "revenue" ? <OpsRevenueTab revenue={data.revenue} /> : null}
            {activeTab === "fleet" ? <OpsFleetTab drivers={data.drivers} /> : null}
            {activeTab === "drivers" ? <OpsDriversTab drivers={data.drivers} /> : null}
            {activeTab === "vehicles" ? (
              <OpsVehiclesTab fleet={data.fleet} drivers={data.drivers} />
            ) : null}
          </div>
        </div>
      </div>

      {activeDrawer?.type === "order" ? (
        <OrderDetailDrawer
          order={data.orders.find((o) => o.id === activeDrawer.id) ?? null}
          drivers={data.drivers}
          fleet={data.fleet}
        />
      ) : null}
      {activeDrawer?.type === "driver" ? (
        <DriverDetailDrawer driver={data.drivers.find((d) => d.userId === activeDrawer.id) ?? null} />
      ) : null}
      {activeDrawer?.type === "add-vehicle" ? <AddVehicleDrawer /> : null}

      <OpsToast toast={toast} />
    </OpsDashboardContext.Provider>
  );
}
```

Note: each tab component receives only the slice of `data` it needs (not the whole object) — keep this convention in waves 3/4 too. `OpsFleetTab` and `OpsDriversTab` both take the same `drivers` array (see the "Original mockup's tab distinction" note in the plan/README — they're two different views of the same roster, not a mistake).

### `ops-sidebar.tsx`

```tsx
"use client";

export function OpsSidebar({
  companyName,
  companyCity,
  activeTab,
  onTabChange,
  tabs,
}: {
  companyName: string;
  companyCity: string;
  activeTab: string;
  onTabChange: (id: string) => void;
  tabs: readonly { id: string; label: string }[];
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
          {companyName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{companyName}</div>
          <div className="truncate text-[11px] text-ops-text-muted">{companyCity}</div>
        </div>
      </div>
    </div>
  );
}
```

### `ops-toast.tsx`

```tsx
"use client";

import type { OpsToastState } from "@/components/dashboard/ops/ops-dashboard-context";

export function OpsToast({ toast }: { toast: OpsToastState }) {
  if (!toast) return null;

  return (
    <div
      className={`animate-ops-toast-in fixed bottom-6 right-6 z-50 rounded-xl border px-4.5 py-3 text-sm ${
        toast.tone === "error"
          ? "border-ops-danger/40 bg-ops-surface-raised text-ops-danger"
          : "border-ops-border bg-ops-surface-raised text-ops-text"
      }`}
    >
      {toast.message}
    </div>
  );
}
```

### `ops-drawer-shell.tsx`

Generic slide-over chrome used by all 3 real drawers (built in wave 4) — backdrop, close on `Escape`/backdrop click, slide-in animation.

```tsx
"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";

export function OpsDrawerShell({
  title,
  widthClassName = "w-[420px]",
  children,
}: {
  title: string;
  widthClassName?: string;
  children: ReactNode;
}) {
  const { closeDrawer } = useOpsDashboard();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDrawer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDrawer]);

  return (
    <>
      <div onClick={closeDrawer} className="fixed inset-0 z-40 bg-black/55" />
      <div
        className={`animate-ops-drawer-in fixed top-0 right-0 z-41 h-full ${widthClassName} overflow-y-auto border-l border-ops-border bg-ops-surface p-6.5`}
      >
        <div className="mb-4.5 flex items-start justify-between">
          <div className="text-base font-semibold">{title}</div>
          <button
            type="button"
            onClick={closeDrawer}
            className="p-1 text-xl leading-none text-ops-text-muted"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
```

### Placeholder tab files (6) — same trivial shape for each, swap the component/prop name

Example for `ops-overview-tab.tsx` (task-07 will replace the body, keeping the export signature):

```tsx
import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

export function OpsOverviewTab({ overview }: { overview: CompanyDashboardData["overview"] }) {
  return <div className="text-sm text-ops-text-muted">Overview — coming soon.</div>;
}
```

Create the other 5 the same way, matching exactly the props each already receives from `ops-dashboard-shell.tsx` above:

- `ops-orders-tab.tsx`: `export function OpsOrdersTab({ orders }: { orders: CompanyDashboardData["orders"] })`
- `ops-revenue-tab.tsx`: `export function OpsRevenueTab({ revenue }: { revenue: CompanyDashboardData["revenue"] })`
- `ops-fleet-tab.tsx`: `export function OpsFleetTab({ drivers }: { drivers: CompanyDashboardData["drivers"] })`
- `ops-drivers-tab.tsx`: `export function OpsDriversTab({ drivers }: { drivers: CompanyDashboardData["drivers"] })`
- `ops-vehicles-tab.tsx`: `export function OpsVehiclesTab({ fleet, drivers }: { fleet: CompanyDashboardData["fleet"]; drivers: CompanyDashboardData["drivers"] })`

Each just renders a one-line placeholder like the example above (swap the label). None need `"use client"` yet since they don't use hooks — waves 3 tasks will add it where needed (any tab with local search/filter/sort state needs `"use client"`).

### Placeholder drawer files (3)

`order-detail-drawer.tsx` — takes the full `drivers`/`fleet` arrays too (not just the one order), since the real content (task-13) composes `CompanyDispatchForm`, which needs the roster and fleet lists to build its driver/vehicle pickers:

```tsx
"use client";

import type { CompanyDashboardData, OpsOrder } from "@/lib/company-dashboard-data";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

export function OrderDetailDrawer({
  order,
  drivers,
  fleet,
}: {
  order: OpsOrder | null;
  drivers: CompanyDashboardData["drivers"];
  fleet: CompanyDashboardData["fleet"];
}) {
  if (!order) return null;
  return (
    <OpsDrawerShell title={order.id}>
      <div className="text-sm text-ops-text-muted">Order detail — coming soon.</div>
    </OpsDrawerShell>
  );
}
```

`driver-detail-drawer.tsx`:

```tsx
"use client";

import type { OpsDriver } from "@/lib/company-dashboard-data";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

export function DriverDetailDrawer({ driver }: { driver: OpsDriver | null }) {
  if (!driver) return null;
  return (
    <OpsDrawerShell title={driver.name}>
      <div className="text-sm text-ops-text-muted">Driver detail — coming soon.</div>
    </OpsDrawerShell>
  );
}
```

`add-vehicle-drawer.tsx`:

```tsx
"use client";

import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

export function AddVehicleDrawer() {
  return (
    <OpsDrawerShell title="Register vehicle">
      <div className="text-sm text-ops-text-muted">Register vehicle — coming soon.</div>
    </OpsDrawerShell>
  );
}
```

(This one takes no props since it's opened via `openDrawer({ type: "add-vehicle" })` with no associated id — task-12's Vehicles tab is what will render the "+ Register vehicle" button that calls this.)

## Acceptance Criteria

- [ ] Signing in as a `COMPANY` user with a completed company profile and visiting `/dashboard` renders the dark shell: sidebar with 6 tabs, header showing the active tab's title/subtitle, and each tab shows its placeholder text when clicked.
- [ ] The "profile not set up yet" fallback still renders unchanged for a `COMPANY` user with no `LogisticsCompany` row.
- [ ] `pnpm typecheck` and `pnpm lint` pass — every placeholder file's prop types must exactly match what `ops-dashboard-shell.tsx` passes in, since waves 3/4 depend on these signatures staying stable.
- [ ] Visiting `/dashboard` as a `DRIVER`, or `/account` as `CLIENT`, or the landing page, shows no dark-theme leakage (confirms task-04's CSS scoping works correctly once actually used).
- [ ] Manually verified end-to-end with browser devtools/React state: clicking a tab switches `activeTab`; there is no way to trigger a drawer yet in this task alone (no tab has row-click wiring until wave 3/4), which is expected — full click-to-drawer flow is verified after waves 3–4 land.

## Notes

- Keep every placeholder file exactly matching the prop signature shown above — a later wave's task modifies these files in place (adding real content) but must not need to change their exported function's name or prop shape, since `ops-dashboard-shell.tsx` (this task, not later tasks) is the only file that imports and calls them.
- `z-40`/`z-41` on drawer overlay/panel are arbitrary Tailwind values (Tailwind v4 accepts arbitrary integers directly) — keep them if using Tailwind v4, confirm they compile under `pnpm lint`.
