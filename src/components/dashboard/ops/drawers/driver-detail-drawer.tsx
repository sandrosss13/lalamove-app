"use client";

import type { OpsDriver } from "@/lib/company-dashboard-data";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

/**
 * Placeholder — task-14 fills in the driver's contact details, assigned vehicle
 * and performance figures.
 *
 * `driver` is nullable for the same reason as the order drawer's `order`: the
 * shell resolves it by id out of possibly-refreshed data.
 */
export function DriverDetailDrawer({ driver }: { driver: OpsDriver | null }) {
  if (!driver) return null;

  return (
    <OpsDrawerShell title={driver.name}>
      <div className="text-sm text-ops-text-muted">
        Driver detail — coming soon.
      </div>
    </OpsDrawerShell>
  );
}
