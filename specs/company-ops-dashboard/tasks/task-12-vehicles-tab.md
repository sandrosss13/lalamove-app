# Task 12: Vehicles tab

## Status

pending

## Wave

3

## Description

Fills in the Vehicles tab: a management table of the fleet (plate, type, model, capacity, assigned-driver control, status), plus the "+ Register vehicle" button that opens the add-vehicle drawer (real content lands in task-15). This is the one tab with real new mutation logic in this wave — the per-row driver-assignment `<select>` calls the new assignment routes from task-03.

## Dependencies

**Depends on:** task-01-dashboard-data-module.md, task-03-vehicle-assignment-routes.md, task-06-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `OpsVehicle` (fields: `id, plateNumber, make, model, year, photoUrls, vehicleTypeCode, vehicleTypeLabel, maxPayloadKg, loadingAccessType, category, activeAssignment: {driverProfileId, driverUserId, driverName, isOnline} | null`) and `OpsDriver` (see task-01). task-03 created `POST /api/logistics-company/vehicles/[id]/assignment` (body `{ driverUserId }`, `201` with the created assignment, `400` if the vehicle already has one) and `DELETE /api/logistics-company/vehicles/[id]/assignment` (`200`, unassigns the active one, `404` if none). task-06 created `src/components/dashboard/ops/ops-vehicles-tab.tsx` as a placeholder wired into the shell with prop `{ fleet: CompanyDashboardData["fleet"]; drivers: CompanyDashboardData["drivers"] }` — keep that exact prop shape. task-06's `useOpsDashboard()` exposes `openDrawer({ type: "add-vehicle" })` and `showToast(message, tone?)`.

## Files to Modify

- `src/components/dashboard/ops/ops-vehicles-tab.tsx` — replace placeholder body with real content.

## Files to Create

- `src/components/dashboard/ops/ops-vehicle-assignment-select.tsx` — the per-row `<select>` control that calls the new assignment routes.

## Technical Details

### Current placeholder (being replaced)

```tsx
import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

export function OpsVehiclesTab({
  fleet,
  drivers,
}: {
  fleet: CompanyDashboardData["fleet"];
  drivers: CompanyDashboardData["drivers"];
}) {
  return <div className="text-sm text-ops-text-muted">Vehicles — coming soon.</div>;
}
```

### `ops-vehicle-assignment-select.tsx`

Follows the same hand-rolled mutation pattern as every other mutating client component in this app (`"use client"`, local `useState` for submitting/error, `fetch`, `router.refresh()` on success) — plus a toast via `useOpsDashboard()`, since this is a brand-new component (not one of the four from task-05, so it doesn't need an `onSuccess` prop — it can call `showToast` directly).

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";

const UNASSIGNED_VALUE = "";

export function OpsVehicleAssignmentSelect({
  vehicle,
  drivers,
}: {
  vehicle: CompanyDashboardData["fleet"][number];
  drivers: CompanyDashboardData["drivers"];
}) {
  const router = useRouter();
  const { showToast } = useOpsDashboard();
  const [submitting, setSubmitting] = useState(false);
  const currentValue = vehicle.activeAssignment?.driverUserId ?? UNASSIGNED_VALUE;

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextDriverUserId = event.target.value;
    setSubmitting(true);

    try {
      // Unassign first if there's an active assignment — the route rejects a
      // second POST while one exists, so reassignment is always DELETE-then-POST.
      if (vehicle.activeAssignment) {
        const del = await fetch(`/api/logistics-company/vehicles/${vehicle.id}/assignment`, {
          method: "DELETE",
        });
        if (!del.ok) {
          const payload = (await del.json().catch(() => null)) as { error?: string } | null;
          showToast(payload?.error ?? "Could not unassign this vehicle.", "error");
          return;
        }
      }

      if (nextDriverUserId !== UNASSIGNED_VALUE) {
        const post = await fetch(`/api/logistics-company/vehicles/${vehicle.id}/assignment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverUserId: nextDriverUserId }),
        });
        if (!post.ok) {
          const payload = (await post.json().catch(() => null)) as { error?: string } | null;
          showToast(payload?.error ?? "Could not assign this vehicle.", "error");
          return;
        }
      }

      const driverName = drivers.find((d) => d.userId === nextDriverUserId)?.name;
      showToast(
        nextDriverUserId === UNASSIGNED_VALUE
          ? `${vehicle.plateNumber} unassigned.`
          : `${driverName ?? "Driver"} assigned to ${vehicle.plateNumber}.`,
      );
      router.refresh();
    } catch {
      showToast("Network error. Please check your connection and try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <select
      value={currentValue}
      onChange={handleChange}
      disabled={submitting}
      className="w-full rounded-md border border-ops-border bg-ops-surface-raised px-2 py-1.5 text-xs text-ops-text disabled:opacity-50"
    >
      <option value={UNASSIGNED_VALUE}>— Unassigned —</option>
      {drivers.map((driver) => (
        <option key={driver.userId} value={driver.userId}>
          {driver.name}
        </option>
      ))}
    </select>
  );
}
```

### `ops-vehicles-tab.tsx`

```tsx
"use client";

import { useMemo, useState } from "react";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsVehicleAssignmentSelect } from "@/components/dashboard/ops/ops-vehicle-assignment-select";

export function OpsVehiclesTab({
  fleet,
  drivers,
}: {
  fleet: CompanyDashboardData["fleet"];
  drivers: CompanyDashboardData["drivers"];
}) {
  const { openDrawer } = useOpsDashboard();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return fleet;
    return fleet.filter(
      (v) => v.plateNumber.toLowerCase().includes(q) || v.model.toLowerCase().includes(q),
    );
  }, [fleet, search]);

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex items-center justify-between gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search plate or model…"
          className="w-60 rounded-lg border border-ops-border bg-ops-surface px-3 py-2.5 text-sm outline-none placeholder:text-ops-text-muted"
        />
        <button
          type="button"
          onClick={() => openDrawer({ type: "add-vehicle" })}
          className="rounded-lg bg-ops-accent px-4 py-2.5 text-sm font-medium text-ops-accent-fg"
        >
          + Register vehicle
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-ops-border">
        <div className="grid grid-cols-[1fr_1fr_1.2fr_100px_1.3fr_110px] gap-3 border-b border-ops-border px-4.5 py-3 text-[11px] uppercase tracking-wide text-ops-text-muted">
          <div>Plate</div>
          <div>Type</div>
          <div>Model</div>
          <div>Capacity</div>
          <div>Assigned driver</div>
          <div>Status</div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-ops-text-muted">
            {fleet.length === 0 ? "No vehicles yet — register your first one above." : "No vehicles match your search."}
          </div>
        ) : (
          filtered.map((vehicle) => (
            <div
              key={vehicle.id}
              className="grid grid-cols-[1fr_1fr_1.2fr_100px_1.3fr_110px] items-center gap-3 border-b border-ops-border/60 px-4.5 py-3 text-sm last:border-none"
            >
              <span className="font-[family-name:var(--font-ibm-plex)]">{vehicle.plateNumber}</span>
              <span className="text-ops-text-muted">{vehicle.vehicleTypeLabel}</span>
              <span>
                {vehicle.make} {vehicle.model}
              </span>
              <span className="font-[family-name:var(--font-ibm-plex)] text-ops-text-muted">
                {vehicle.maxPayloadKg} kg
              </span>
              <span>
                <OpsVehicleAssignmentSelect vehicle={vehicle} drivers={drivers} />
              </span>
              <span className="text-xs text-ops-text-muted">
                {vehicle.activeAssignment ? "Assigned" : "Unassigned"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

Note: "Status" here shows Assigned/Unassigned (derived from `activeAssignment`), not active/maintenance — no such vehicle-level field exists in the schema, per the locked product decision.

## Acceptance Criteria

- [ ] Vehicles tab lists every fleet vehicle with search (plate or model), correct capacity/type/model columns.
- [ ] Each row's assignment `<select>` reflects the vehicle's current `activeAssignment` (or "— Unassigned —"), and changing it calls the task-03 routes correctly (DELETE-then-POST for reassignment, POST only for a fresh assignment, DELETE only for choosing "Unassigned").
- [ ] A toast appears on success/failure of an assignment change, and `router.refresh()` updates the row afterward.
- [ ] "+ Register vehicle" button calls `openDrawer({ type: "add-vehicle" })`.
- [ ] Status column shows "Assigned"/"Unassigned", never "active"/"maintenance".
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Manually verified against the live task-03 routes: assign a driver to an unassigned vehicle, reassign it to a different driver, unassign it — each step reflected correctly after `router.refresh()`.
