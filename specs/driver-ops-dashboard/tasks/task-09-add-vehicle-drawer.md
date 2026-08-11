# Task 09: Add-vehicle drawer

## Status

complete

## Wave

4

## Description

Fills in the add-vehicle drawer: a thin wrapper around the existing `VehicleForm`, which already implements the entire "register a vehicle" flow (multipart upload, vehicle-type picker, validation, error/success states). No new mutation logic — almost entirely composition plus closing the drawer and toasting on success. Identical in structure to `specs/company-ops-dashboard/tasks/task-15-add-vehicle-drawer.md`.

## Dependencies

**Depends on:** task-02-mutation-onsuccess-props.md, task-03-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-02 added an optional `onSuccess?: () => void` prop to `VehicleForm` (called right after its existing `router.refresh()`). task-03 created `src/components/dashboard/driver-ops/drawers/driver-add-vehicle-drawer.tsx` as a placeholder wired into the shell, opened via `openDrawer({ type: "add-vehicle" })` (no id, no data prop — this drawer takes no props). task-03's `useOpsDashboard()` exposes `closeDrawer()` and `showToast(message, tone?)`.

## Files to Modify

- `src/components/dashboard/driver-ops/drawers/driver-add-vehicle-drawer.tsx` — replace placeholder body with real content.

## Technical Details

`VehicleForm` (`src/components/vehicle-form.tsx`) takes no required props (only the new optional `onSuccess` from task-02) and renders a full uncontrolled form: plate number, make, model, year, `VehicleTypeSelect` (fetches `/api/vehicle-types` on mount), and a required multi-file photo input, submitting as `multipart/form-data` to `POST /api/driver-profile/vehicles`.

```tsx
"use client";

import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";
import { VehicleForm } from "@/components/vehicle-form";

export function DriverAddVehicleDrawer() {
  const { closeDrawer, showToast } = useOpsDashboard();

  return (
    <OpsDrawerShell title="Register vehicle" widthClassName="w-[360px]">
      <VehicleForm
        onSuccess={() => {
          showToast("Vehicle registered.");
          closeDrawer();
        }}
      />
    </OpsDrawerShell>
  );
}
```

`VehicleForm` is rendered with its existing light-theme Tailwind classes unmodified — as with every other reused form in both specs, restyling it to match the dark palette via `[data-ops-dashboard]` CSS-attribute-selector overrides in `globals.css` is optional polish, not required for this task's acceptance.

## Acceptance Criteria

- [ ] Clicking "+ Register vehicle" on the Vehicle tab opens this drawer showing the full `VehicleForm`.
- [ ] Submitting a valid vehicle registration closes the drawer and shows a success toast; the new vehicle appears in the Vehicle tab after the automatic `router.refresh()`.
- [ ] Validation/upload errors from `VehicleForm` still render inline within the drawer exactly as they do today elsewhere in the app.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Manually verified: register a new vehicle end-to-end through this drawer, including at least one photo upload.
