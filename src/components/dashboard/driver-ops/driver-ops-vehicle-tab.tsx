import type { DriverDashboardData } from "@/lib/driver-dashboard-data";

/**
 * Placeholder for the Vehicle tab — real content lands in a later wave. Only
 * independent drivers ever reach it; a rostered driver's fleet is company-owned,
 * so the shell never renders this tab for them.
 */
export function DriverOpsVehicleTab({
  vehicles,
}: {
  vehicles: DriverDashboardData["vehicles"];
}) {
  // Declared but not read until the real content lands — the prop shape is
  // fixed now because the shell already passes it.
  void vehicles;

  return (
    <div className="text-sm text-ops-text-muted">Vehicle — coming soon.</div>
  );
}
