"use client";

import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

/**
 * Placeholder for the vehicle registration slide-over — real content lands in a
 * later wave. Only independent drivers can open it: a rostered driver's vehicles
 * are registered by their company.
 */
export function DriverAddVehicleDrawer() {
  return (
    <OpsDrawerShell title="Register vehicle">
      <div className="text-sm text-ops-text-muted">
        Register vehicle — coming soon.
      </div>
    </OpsDrawerShell>
  );
}
