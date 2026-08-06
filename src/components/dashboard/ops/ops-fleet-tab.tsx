import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

/**
 * Placeholder — task-10 fills in the live driver/vehicle status board. It shares
 * the roster with the Drivers tab on purpose: the two are different views of the
 * same list, not a duplication.
 */
export function OpsFleetTab({
  drivers,
}: {
  drivers: CompanyDashboardData["drivers"];
}) {
  return (
    <div className="text-sm text-ops-text-muted">
      Fleet — coming soon ({drivers.length} drivers).
    </div>
  );
}
