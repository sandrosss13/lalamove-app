"use client";

import { CompanyVehicleForm } from "@/components/company-vehicle-form";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

/**
 * Slide-over that registers a fleet vehicle.
 *
 * Deliberately thin: `CompanyVehicleForm` already owns the whole flow (multipart
 * upload, vehicle-type picker, validation and inline error/success states), so
 * this drawer only hosts it and reacts to a successful add. Its own inline
 * messages are left untouched — the toast reports the outcome after the drawer
 * is gone, the inline text while it is still on screen.
 *
 * Takes no props: it is opened via `openDrawer({ type: "add-vehicle" })` with no
 * associated row id, from the Vehicles tab's "register vehicle" button.
 */
export function AddVehicleDrawer() {
  const { closeDrawer, showToast } = useOpsDashboard();

  return (
    // Narrower than the default shell width: this is a single column of short
    // fields, not a detail view with side-by-side data.
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
