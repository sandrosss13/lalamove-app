"use client";

import type {
  DriverDashboardData,
  DriverOpsOrder,
} from "@/lib/driver-dashboard-data";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

/**
 * Placeholder for the order detail slide-over — real content lands in a later
 * wave.
 *
 * The order is resolved by id at render time by the shell, so it can be `null`
 * if the row disappeared from the refreshed data (e.g. another driver claimed
 * the open-market order); rendering nothing is the right answer then.
 */
export function DriverOrderDetailDrawer({
  order,
  vehicles,
  isIndependent,
}: {
  order: DriverOpsOrder | null;
  vehicles: DriverDashboardData["vehicles"];
  isIndependent: boolean;
}) {
  // Declared but not read until the real content lands — the prop shape is
  // fixed now because the shell already passes it.
  void vehicles;
  void isIndependent;

  if (!order) return null;

  return (
    <OpsDrawerShell title={order.id}>
      <div className="text-sm text-ops-text-muted">
        Order detail — coming soon.
      </div>
    </OpsDrawerShell>
  );
}
