import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

/**
 * Placeholder — task-12 fills in the vehicle list, the "register vehicle" entry
 * point, and driver assignment. It needs the roster as well as the fleet because
 * assignment pairs one with the other.
 */
export function OpsVehiclesTab({
  fleet,
  drivers,
}: {
  fleet: CompanyDashboardData["fleet"];
  drivers: CompanyDashboardData["drivers"];
}) {
  return (
    <div className="text-sm text-ops-text-muted">
      Vehicles — coming soon ({fleet.length} vehicles, {drivers.length}{" "}
      drivers).
    </div>
  );
}
