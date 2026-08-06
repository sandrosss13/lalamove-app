# Task 15: Add-vehicle drawer

## Status

complete

## Wave

4

## Description

Fills in the add-vehicle drawer: a thin wrapper around the existing `CompanyVehicleForm`, which already implements the entire "register a fleet vehicle" flow (multipart upload, vehicle-type picker, validation, error/success states). No new mutation logic — this task is almost entirely composition plus closing the drawer and toasting on success.

## Dependencies

**Depends on:** task-05-mutation-onsuccess-props.md, task-06-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-05 added an optional `onSuccess?: () => void` prop to `CompanyVehicleForm` (called right after its existing `router.refresh()`). task-06 created `src/components/dashboard/ops/drawers/add-vehicle-drawer.tsx` as a placeholder wired into the shell, opened via `openDrawer({ type: "add-vehicle" })` (no id, no associated data prop — this drawer takes no props). task-06's `useOpsDashboard()` exposes `closeDrawer()` and `showToast(message, tone?)`.

## Files to Modify

- `src/components/dashboard/ops/drawers/add-vehicle-drawer.tsx` — replace placeholder body with real content.

## Technical Details

`CompanyVehicleForm` (`src/components/company-vehicle-form.tsx`) takes no required props (only the new optional `onSuccess` from task-05) and renders a full uncontrolled form: plate number, make, model, year, `VehicleTypeSelect` (fetches `/api/vehicle-types` on mount), and a required multi-file photo input, submitting as `multipart/form-data` to `POST /api/logistics-company/vehicles`.

```tsx
"use client";

import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";
import { CompanyVehicleForm } from "@/components/company-vehicle-form";

export function AddVehicleDrawer() {
  const { closeDrawer, showToast } = useOpsDashboard();

  return (
    <OpsDrawerShell title="Register vehicle" widthClassName="w-[360px]">
      <CompanyVehicleForm
        onSuccess={() => {
          showToast("Vehicle registered.");
          closeDrawer();
        }}
      />
    </OpsDrawerShell>
  );
}
```

`CompanyVehicleForm` is rendered with its existing light-theme Tailwind classes (`rounded border`, etc.) unmodified — as with the order-detail drawer's reused forms, restyling it to match the dark palette via `[data-ops-dashboard]` CSS-attribute-selector overrides in `globals.css` is optional polish, not required for this task's acceptance.

## Acceptance Criteria

- [ ] Clicking "+ Register vehicle" on the Vehicles tab opens this drawer showing the full `CompanyVehicleForm`.
- [ ] Submitting a valid vehicle registration closes the drawer and shows a success toast; the new vehicle appears in the Vehicles tab after the automatic `router.refresh()`.
- [ ] Validation/upload errors from `CompanyVehicleForm` still render inline within the drawer exactly as they do today elsewhere in the app (no change to its own error handling).
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Manually verified: register a new fleet vehicle end-to-end through this drawer, including at least one photo upload.
