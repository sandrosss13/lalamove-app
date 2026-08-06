import type { DriverDashboardData } from "@/lib/driver-dashboard-data";

/**
 * Placeholder for the Deliveries tab — real content lands in a later wave.
 *
 * `isIndependent` is passed in because only an independent driver's list mixes
 * claimable open-market orders in with their own deliveries.
 */
export function DriverOpsDeliveriesTab({
  orders,
  isIndependent,
}: {
  orders: DriverDashboardData["orders"];
  isIndependent: boolean;
}) {
  // Declared but not read until the real content lands — the prop shape is
  // fixed now because the shell already passes it.
  void orders;
  void isIndependent;

  return (
    <div className="text-sm text-ops-text-muted">Deliveries — coming soon.</div>
  );
}
