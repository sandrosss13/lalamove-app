import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

/**
 * Placeholder — task-07 fills in the KPI grid and recent-orders preview.
 * The prop is read here so the data path from `getCompanyDashboardData` through
 * the shell is provably live before the real content exists.
 */
export function OpsOverviewTab({
  overview,
}: {
  overview: CompanyDashboardData["overview"];
}) {
  return (
    <div className="text-sm text-ops-text-muted">
      Overview — coming soon ({overview.activeOrdersCount} active orders).
    </div>
  );
}
