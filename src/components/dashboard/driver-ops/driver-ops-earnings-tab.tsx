import type { DriverDashboardData } from "@/lib/driver-dashboard-data";

/** Placeholder for the Earnings tab — real content lands in a later wave. */
export function DriverOpsEarningsTab({
  earnings,
}: {
  earnings: DriverDashboardData["earnings"];
}) {
  // Declared but not read until the real content lands — the prop shape is
  // fixed now because the shell already passes it.
  void earnings;

  return (
    <div className="text-sm text-ops-text-muted">Earnings — coming soon.</div>
  );
}
