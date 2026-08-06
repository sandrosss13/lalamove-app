import type { DriverDashboardData } from "@/lib/driver-dashboard-data";

/**
 * Placeholder for the Overview tab — real content lands in a later wave.
 *
 * It takes `driver` alongside `overview` because the finished tab renders the
 * online/offline toggle, which reads `driver.isOnline`. Keep this prop shape
 * stable: `DriverOpsDashboardShell` is what calls it.
 */
export function DriverOpsOverviewTab({
  driver,
  overview,
}: {
  driver: DriverDashboardData["driver"];
  overview: DriverDashboardData["overview"];
}) {
  // Declared but not read until the real content lands — the prop shape is
  // fixed now because the shell already passes it.
  void driver;
  void overview;

  return (
    <div className="text-sm text-ops-text-muted">Overview — coming soon.</div>
  );
}
