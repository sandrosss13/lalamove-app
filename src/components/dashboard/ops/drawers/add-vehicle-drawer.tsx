"use client";

import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

/**
 * Placeholder — task-15 fills in the vehicle registration form.
 *
 * Takes no props: it is opened via `openDrawer({ type: "add-vehicle" })` with no
 * associated row id, from the Vehicles tab's "register vehicle" button.
 */
export function AddVehicleDrawer() {
  return (
    <OpsDrawerShell title="Register vehicle">
      <div className="text-sm text-ops-text-muted">
        Register vehicle — coming soon.
      </div>
    </OpsDrawerShell>
  );
}
