# Task 11: Drivers tab

## Status

complete

## Wave

3

## Description

Fills in the Drivers tab: a searchable roster table (contact info, assigned vehicle, region, status) — the table view of the same `drivers` array the Fleet tab (task-10) renders as a card grid. Both are intentional (see the README's "Original mockup's tab distinction" note). Clicking a row opens the driver-detail drawer (real content lands in task-14).

## Dependencies

**Depends on:** task-01-dashboard-data-module.md, task-06-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `OpsDriver` (fields: `userId, name, email, phone, city, isOnline, assignedVehicle: {id,plateNumber,make,model} | null, deliveriesTodayCount, hasActiveDelivery`). task-06 created `src/components/dashboard/ops/ops-drivers-tab.tsx` as a placeholder wired into the shell with prop `{ drivers: CompanyDashboardData["drivers"] }` — keep that exact prop shape. task-06's `useOpsDashboard()` exposes `openDrawer({ type: "driver", id })`.

## Files to Modify

- `src/components/dashboard/ops/ops-drivers-tab.tsx` — replace placeholder body with real content.

## Technical Details

### Current placeholder (being replaced)

```tsx
import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

export function OpsDriversTab({ drivers }: { drivers: CompanyDashboardData["drivers"] }) {
  return <div className="text-sm text-ops-text-muted">Drivers — coming soon.</div>;
}
```

Reuse the exact same `driverStatus`/`STATUS_DOT`/`STATUS_LABEL` derivation logic described in task-10 (an "on delivery" driver takes priority over online/offline) — this task doesn't share a file with task-10 (both run in the same wave, in parallel, and must not touch each other's files), so **re-declare that small helper locally in this file** rather than importing from `ops-fleet-tab.tsx`. Keep it consistent: `hasActiveDelivery` → "on_delivery", else `isOnline` → "online"/"offline".

### New content

```tsx
"use client";

import { useMemo, useState } from "react";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";

function driverStatus(driver: CompanyDashboardData["drivers"][number]): "online" | "offline" | "on_delivery" {
  if (driver.hasActiveDelivery) return "on_delivery";
  return driver.isOnline ? "online" : "offline";
}

const STATUS_DOT: Record<ReturnType<typeof driverStatus>, string> = {
  online: "bg-emerald-400",
  offline: "bg-ops-text-muted",
  on_delivery: "bg-sky-400",
};

const STATUS_LABEL: Record<ReturnType<typeof driverStatus>, string> = {
  online: "Online",
  offline: "Offline",
  on_delivery: "On delivery",
};

export function OpsDriversTab({ drivers }: { drivers: CompanyDashboardData["drivers"] }) {
  const { openDrawer } = useOpsDashboard();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return drivers;
    return drivers.filter((d) => d.name.toLowerCase().includes(q));
  }, [drivers, search]);

  return (
    <div className="flex flex-col gap-4.5">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search driver name…"
        className="w-60 rounded-lg border border-ops-border bg-ops-surface px-3 py-2.5 text-sm outline-none placeholder:text-ops-text-muted"
      />

      <div className="overflow-hidden rounded-xl border border-ops-border">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_130px] gap-3 border-b border-ops-border px-4.5 py-3 text-[11px] uppercase tracking-wide text-ops-text-muted">
          <div>Driver</div>
          <div>Contact</div>
          <div>Vehicle</div>
          <div>Region</div>
          <div>Status</div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-ops-text-muted">No drivers match your filters.</div>
        ) : (
          filtered.map((driver) => {
            const status = driverStatus(driver);
            return (
              <button
                key={driver.userId}
                type="button"
                onClick={() => openDrawer({ type: "driver", id: driver.userId })}
                className="grid w-full grid-cols-[1.4fr_1fr_1fr_1fr_130px] items-center gap-3 border-b border-ops-border/60 px-4.5 py-3 text-left text-sm last:border-none hover:bg-ops-surface-raised"
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ops-surface-raised text-[11px] font-semibold">
                    {driver.name.slice(0, 2).toUpperCase()}
                  </span>
                  {driver.name}
                </span>
                <span className="truncate font-[family-name:var(--font-ibm-plex)] text-xs text-ops-text-muted">
                  {driver.phone}
                </span>
                <span className="truncate text-ops-text-muted">
                  {driver.assignedVehicle ? driver.assignedVehicle.plateNumber : "Unassigned"}
                </span>
                <span className="text-ops-text-muted">{driver.city}</span>
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[status]}`} />
                  {STATUS_LABEL[status]}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
```

## Acceptance Criteria

- [ ] Drivers tab renders a table of every driver with search by name.
- [ ] Columns: driver (name + initials), contact (phone), vehicle (assigned plate or "Unassigned"), region (city), status (dot + label, same 3-state derivation as task-10).
- [ ] Clicking a row calls `openDrawer({ type: "driver", id: driver.userId })`.
- [ ] Empty state when search produces no matches.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
