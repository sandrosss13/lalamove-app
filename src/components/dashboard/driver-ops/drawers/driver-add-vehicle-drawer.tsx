"use client";

import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";
import { VehicleForm } from "@/components/vehicle-form";

/**
 * Slide-over that registers a driver's own vehicle.
 *
 * Deliberately thin: `VehicleForm` already owns the whole flow (multipart photo
 * upload, vehicle-type picker, validation and inline error/success states, plus
 * the `router.refresh()` that puts the new vehicle in the Vehicle tab), so this
 * drawer only hosts it and reacts to a successful add. The form's own inline
 * messages are left untouched — the toast reports the outcome after the drawer
 * is gone, the inline text while it is still on screen.
 *
 * Takes no props: it is opened via `openDrawer({ type: "add-vehicle" })` with no
 * associated row id, from the Vehicle tab's "+ Register vehicle" button.
 */
export function DriverAddVehicleDrawer() {
  const { closeDrawer, showToast } = useOpsDashboard();

  return (
    // Narrower than the default shell width: this is a single column of short
    // fields, not a detail view with side-by-side data.
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
