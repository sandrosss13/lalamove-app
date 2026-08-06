# Task 14: Driver detail drawer

## Status

complete

## Wave

4

## Description

Fills in the driver-detail drawer: contact info, a stat grid (today/all-time completed/earned this month — no star rating, per the locked product decision), read-only online status, assigned vehicle, and a "remove from roster" action. The online/offline status is deliberately **read-only** here — `isOnline` is self-service only, tied to the driver's own geolocation-beacon interval (`DriverStatusToggle`), and a company-side force-toggle would desync that state from a beacon that isn't actually running.

## Dependencies

**Depends on:** task-01-dashboard-data-module.md, task-06-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `OpsDriver` with fields `userId, name, email, phone, city, isOnline, assignedVehicle, deliveriesTodayCount, completedTotalCount, earnedThisMonthTotal, hasActiveDelivery` (full definitions in that task's file). task-06 created `src/components/dashboard/ops/drawers/driver-detail-drawer.tsx` as a placeholder wired into the shell with prop `{ driver: OpsDriver | null }` — keep that exact prop shape. task-06's `useOpsDashboard()` exposes `closeDrawer()` and `showToast(message, tone?)`.

## Files to Modify

- `src/components/dashboard/ops/drawers/driver-detail-drawer.tsx` — replace placeholder body with real content.

## Technical Details

### Remove-from-roster: reuse the fetch call, not the component

`CompanyDriverRoster` (`src/components/company-driver-roster.tsx`) already implements "remove a driver from the roster" via `DELETE /api/logistics-company/drivers/{userId}`, but it's bundled together with the add-by-email form and a list-rendering loop that doesn't fit this drawer's layout. Per the plan, don't force a shared abstraction here — duplicate just the small `fetch` call inline in this drawer (the same reasoning `CompanyRemoveVehicleButton`'s own doc comment gives for not sharing with `RemoveVehicleButton`):

```ts
// from CompanyDriverRoster's handleRemove, for reference — reproduce this
// fetch call inline in this drawer, not by importing that component:
const response = await fetch(`/api/logistics-company/drivers/${userId}`, { method: "DELETE" });
if (!response.ok) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  // surface payload?.error ?? "Could not remove this driver."
  return;
}
// on success: router.refresh()
```

### `driver-detail-drawer.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { OpsDriver } from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

function formatCurrency(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ops-surface-raised p-3.5">
      <div className="text-[11px] tracking-wide text-ops-text-muted uppercase">{label}</div>
      <div className="mt-1 font-[family-name:var(--font-ibm-plex)] text-xl font-semibold">{value}</div>
    </div>
  );
}

export function DriverDetailDrawer({ driver }: { driver: OpsDriver | null }) {
  const router = useRouter();
  const { closeDrawer, showToast } = useOpsDashboard();
  const [removing, setRemoving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!driver) return null;

  async function handleRemove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setRemoving(true);
    try {
      const response = await fetch(`/api/logistics-company/drivers/${driver.userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        showToast(payload?.error ?? "Could not remove this driver.", "error");
        setConfirming(false);
        return;
      }

      showToast(`${driver.name} removed from your roster.`);
      router.refresh();
      closeDrawer();
    } catch {
      showToast("Network error. Please check your connection and try again.", "error");
      setConfirming(false);
    } finally {
      setRemoving(false);
    }
  }

  const statusLabel = driver.hasActiveDelivery ? "On delivery" : driver.isOnline ? "Online" : "Offline";

  return (
    <OpsDrawerShell title={driver.name} widthClassName="w-[380px]">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-ops-surface-raised text-[15px] font-semibold">
          {driver.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-sm text-ops-text-muted">
            {driver.assignedVehicle ? driver.assignedVehicle.plateNumber : "No vehicle"} · {driver.city}
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-lg bg-ops-surface-raised py-2.5 text-center text-sm font-medium">
        {statusLabel}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatTile label="Today" value={String(driver.deliveriesTodayCount)} />
        <StatTile label="Completed" value={String(driver.completedTotalCount)} />
        <StatTile label="Earned this month" value={formatCurrency(driver.earnedThisMonthTotal)} />
        <StatTile label="Vehicle" value={driver.assignedVehicle?.plateNumber ?? "—"} />
      </div>

      <div className="mb-5 text-sm text-ops-text-muted">
        Contact: {driver.phone} · {driver.email}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className="rounded-lg border border-ops-border px-3 py-2 text-sm font-medium text-ops-danger disabled:opacity-50"
        >
          {removing ? "Removing…" : confirming ? "Confirm remove" : "Remove from roster"}
        </button>
        {confirming && !removing ? (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-sm text-ops-text-muted"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </OpsDrawerShell>
  );
}
```

Note: online/offline status is rendered as static text only — no button, no click handler. No star rating anywhere.

## Acceptance Criteria

- [ ] Drawer shows driver name, assigned vehicle/city, read-only status (Online/Offline/On delivery — no toggle control), a 4-tile stat grid (today/completed/earned this month/vehicle — no rating anywhere), and contact info.
- [ ] "Remove from roster" uses the same two-click confirm pattern as `CompanyRemoveVehicleButton`, calls `DELETE /api/logistics-company/drivers/{userId}` directly (not by importing `CompanyDriverRoster`), and on success shows a toast, refreshes, and closes the drawer.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Manually verified: opening a driver's drawer from either the Fleet or Drivers tab shows correct data; removing a driver updates the roster and closes the drawer.
