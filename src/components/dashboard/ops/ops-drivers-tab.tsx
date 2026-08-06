import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

/**
 * Placeholder — task-11 fills in the roster table with contact info and per-driver
 * performance. Shares its `drivers` prop with the Fleet tab, which renders the
 * same roster as a live status board.
 */
export function OpsDriversTab({
  drivers,
}: {
  drivers: CompanyDashboardData["drivers"];
}) {
  return (
    <div className="text-sm text-ops-text-muted">
      Drivers — coming soon ({drivers.length} drivers).
    </div>
  );
}
