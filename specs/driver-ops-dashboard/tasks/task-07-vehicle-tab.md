# Task 07: Vehicle tab

## Status

pending

## Wave

3

## Description

Fills in the Vehicle tab (only ever shown to independent drivers — the shell already gates its nav entry and its render on `driver.isIndependent`, so this tab can assume it only renders for drivers who own vehicles): a card grid of the driver's own vehicle(s), reusing `VehicleCard`/`EditVehicleForm`/`RemoveVehicleButton` unmodified, plus a "+ Register vehicle" button that opens the add-vehicle drawer (real content lands in task-09).

## Dependencies

**Depends on:** task-01-driver-dashboard-data-module.md, task-03-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `DriverOpsVehicle` (fields: `id, plateNumber, make, model, year, photoUrls, vehicleTypeSpecId, vehicleTypeCode, vehicleTypeLabel, maxPayloadKg, loadingAccessType, category`). task-03 created `src/components/dashboard/driver-ops/driver-ops-vehicle-tab.tsx` as a placeholder wired into the shell with prop `{ vehicles: DriverDashboardData["vehicles"] }` — keep that exact prop shape. task-03's `useOpsDashboard()` exposes `openDrawer({ type: "add-vehicle" })`.

## Files to Modify

- `src/components/dashboard/driver-ops/driver-ops-vehicle-tab.tsx` — replace placeholder body with real content.

## Technical Details

### Current placeholder (being replaced)

```tsx
import type { DriverDashboardData } from "@/lib/driver-dashboard-data";

export function DriverOpsVehicleTab({ vehicles }: { vehicles: DriverDashboardData["vehicles"] }) {
  return <div className="text-sm text-ops-text-muted">Vehicle — coming soon.</div>;
}
```

### Reused components (imported unmodified)

- `VehicleCard` from `@/components/vehicle-card` — props `{ vehicle: {plateNumber, make, model, year, photoUrls, vehicleTypeSpec: {label, maxPayloadKg}}, children? }`. Note it expects a `vehicleTypeSpec` sub-object with `label`/`maxPayloadKg`, not the flattened `vehicleTypeLabel`/`maxPayloadKg` fields `DriverOpsVehicle` has — construct that sub-object inline when passing the vehicle in (shown below).
- `EditVehicleForm` from `@/components/edit-vehicle-form` — props `{ vehicle: {id, plateNumber, make, model, year, vehicleTypeCode} }` (exported type `EditableVehicle`). `DriverOpsVehicle` already has all five fields directly.
- `RemoveVehicleButton` from `@/components/remove-vehicle-button` — props `{ vehicleId, plateNumber }`.

### New content

```tsx
"use client";

import type { DriverDashboardData } from "@/lib/driver-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { VehicleCard } from "@/components/vehicle-card";
import { EditVehicleForm } from "@/components/edit-vehicle-form";
import { RemoveVehicleButton } from "@/components/remove-vehicle-button";

export function DriverOpsVehicleTab({ vehicles }: { vehicles: DriverDashboardData["vehicles"] }) {
  const { openDrawer } = useOpsDashboard();

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => openDrawer({ type: "add-vehicle" })}
          className="rounded-lg bg-ops-accent px-4 py-2.5 text-sm font-medium text-ops-accent-fg"
        >
          + Register vehicle
        </button>
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-xl border border-ops-border bg-ops-surface p-12 text-center text-sm text-ops-text-muted">
          No vehicles yet — register your first one above.
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={{
                plateNumber: vehicle.plateNumber,
                make: vehicle.make,
                model: vehicle.model,
                year: vehicle.year,
                photoUrls: vehicle.photoUrls,
                vehicleTypeSpec: { label: vehicle.vehicleTypeLabel, maxPayloadKg: vehicle.maxPayloadKg },
              }}
            >
              <EditVehicleForm
                vehicle={{
                  id: vehicle.id,
                  plateNumber: vehicle.plateNumber,
                  make: vehicle.make,
                  model: vehicle.model,
                  year: vehicle.year,
                  vehicleTypeCode: vehicle.vehicleTypeCode,
                }}
              />
              <RemoveVehicleButton vehicleId={vehicle.id} plateNumber={vehicle.plateNumber} />
            </VehicleCard>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`VehicleCard`, `EditVehicleForm`, and `RemoveVehicleButton` all render with their existing light-theme Tailwind classes (`rounded border`, etc.) unmodified inside this dark tab — as with the reused forms elsewhere in both specs, restyling via `[data-ops-dashboard]` CSS-attribute-selector overrides in `globals.css` is optional polish, not required for this task's acceptance.

## Acceptance Criteria

- [ ] Vehicle tab shows a card per registered vehicle (photo, plate, type, make/model/year/payload), each with working Edit and Remove controls (unmodified logic from the existing components).
- [ ] "+ Register vehicle" button calls `openDrawer({ type: "add-vehicle" })`.
- [ ] Empty state when the driver has no vehicles yet.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Manually verified: editing a vehicle's details and removing a vehicle both still work exactly as before.
