# Task 10: Fleet tab

## Status

complete

## Wave

3

## Description

Fills in the Fleet tab: a searchable driver card grid with status chips (online / offline / on delivery). This is the "card view" of the same roster the Drivers tab (task-11) renders as a table — both are intentional, separate views of the same `drivers` array (see the README's "Original mockup's tab distinction" note), not a duplicate to collapse. Clicking a card opens the driver-detail drawer (real content lands in task-14).

## Dependencies

**Depends on:** task-01-dashboard-data-module.md, task-06-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `OpsDriver` (fields: `userId, name, email, phone, city, isOnline, assignedVehicle: {id,plateNumber,make,model} | null, deliveriesTodayCount, hasActiveDelivery` — full definitions in that task's file). task-06 created `src/components/dashboard/ops/ops-fleet-tab.tsx` as a placeholder wired into the shell with prop `{ drivers: CompanyDashboardData["drivers"] }` — keep that exact prop shape. task-06's `useOpsDashboard()` exposes `openDrawer({ type: "driver", id })`.

## Files to Modify

- `src/components/dashboard/ops/ops-fleet-tab.tsx` — replace placeholder body with real content.

## Technical Details

### Current placeholder (being replaced)

```tsx
import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

export function OpsFleetTab({ drivers }: { drivers: CompanyDashboardData["drivers"] }) {
  return <div className="text-sm text-ops-text-muted">Fleet — coming soon.</div>;
}
```

### Status derivation

Each driver's status chip is derived, not stored directly — three states:

- **On delivery** — `driver.hasActiveDelivery` is `true` (has an order in `ACCEPTED`/`IN_TRANSIT` right now). Check this first; it takes priority over `isOnline`.
- **Online** — `driver.isOnline` is `true` and not on delivery.
- **Offline** — `driver.isOnline` is `false`.

### New content

```tsx
"use client";

import { useMemo, useState } from "react";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";

type StatusFilter = "all" | "online" | "offline" | "on_delivery";

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

export function OpsFleetTab({ drivers }: { drivers: CompanyDashboardData["drivers"] }) {
  const { openDrawer } = useOpsDashboard();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const counts = useMemo(() => {
    const statuses = drivers.map(driverStatus);
    return {
      all: drivers.length,
      online: statuses.filter((s) => s === "online").length,
      offline: statuses.filter((s) => s === "offline").length,
      on_delivery: statuses.filter((s) => s === "on_delivery").length,
    };
  }, [drivers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter((d) => {
      if (statusFilter !== "all" && driverStatus(d) !== statusFilter) return false;
      if (q === "") return true;
      return d.name.toLowerCase().includes(q);
    });
  }, [drivers, search, statusFilter]);

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search driver name…"
          className="w-60 rounded-lg border border-ops-border bg-ops-surface px-3 py-2.5 text-sm outline-none placeholder:text-ops-text-muted"
        />
        <div className="flex flex-wrap gap-1.5">
          {(["all", "online", "offline", "on_delivery"] as const).map((status) => (
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
              {status === "all" ? "All" : STATUS_LABEL[status]} · {counts[status]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-sm text-ops-text-muted">No drivers match your filters.</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
          {filtered.map((driver) => {
            const status = driverStatus(driver);
            return (
              <button
                key={driver.userId}
                type="button"
                onClick={() => openDrawer({ type: "driver", id: driver.userId })}
                className="rounded-xl border border-ops-border bg-ops-surface p-4.5 text-left"
              >
                <div className="mb-3 flex items-center gap-2.5">
                  <div className="relative flex h-9.5 w-9.5 flex-shrink-0 items-center justify-center rounded-full bg-ops-surface-raised text-[13px] font-semibold">
                    {driver.name.slice(0, 2).toUpperCase()}
                    <div
                      className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-ops-surface ${STATUS_DOT[status]}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{driver.name}</div>
                    <div className="text-xs text-ops-text-muted">
                      {driver.assignedVehicle ? driver.assignedVehicle.plateNumber : "No vehicle"} · {driver.city}
                    </div>
                  </div>
                </div>
                <div className="flex justify-between border-t border-ops-border pt-2.5 text-xs text-ops-text-muted">
                  <span>{STATUS_LABEL[status]}</span>
                  <span className="font-[family-name:var(--font-ibm-plex)]">
                    {driver.deliveriesTodayCount} today
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

Note: no star rating anywhere in this card — the mockup showed `★ {{ d.rating }}`, which is intentionally omitted (no such data exists, per the locked product decision).

## Acceptance Criteria

- [ ] Fleet tab renders a card grid of every driver, with search (name) and status chips (All/Online/Offline/On delivery, with live counts).
- [ ] Status derivation correctly prioritizes "on delivery" over "online"/"offline".
- [ ] Each card shows the driver's assigned vehicle plate (or "No vehicle") and city — no rating anywhere.
- [ ] Clicking a card calls `openDrawer({ type: "driver", id: driver.userId })`.
- [ ] Empty state when filters produce no matches.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
