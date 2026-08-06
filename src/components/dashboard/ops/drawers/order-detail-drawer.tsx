"use client";

import type {
  CompanyDashboardData,
  OpsOrder,
} from "@/lib/company-dashboard-data";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

/**
 * Placeholder — task-13 fills in the full order detail and the claim → dispatch →
 * start → complete → cancel action stack.
 *
 * It takes the whole roster and fleet, not just the one order, because the real
 * content composes `CompanyDispatchForm`, which builds its driver and vehicle
 * pickers from those lists.
 *
 * `order` is nullable because the shell looks the row up by id out of data that
 * may have been refreshed since the drawer was opened; a missing row renders
 * nothing rather than an empty drawer.
 */
export function OrderDetailDrawer({
  order,
  drivers,
  fleet,
}: {
  order: OpsOrder | null;
  drivers: CompanyDashboardData["drivers"];
  fleet: CompanyDashboardData["fleet"];
}) {
  if (!order) return null;

  return (
    <OpsDrawerShell title={order.id}>
      <div className="text-sm text-ops-text-muted">
        Order detail — coming soon ({drivers.length} drivers, {fleet.length}{" "}
        vehicles available to dispatch).
      </div>
    </OpsDrawerShell>
  );
}
