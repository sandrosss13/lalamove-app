import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

/**
 * Placeholder — task-09 fills in the revenue trend, breakdowns and payouts.
 * The prop is read here so the data path from `getCompanyDashboardData` through
 * the shell is provably live before the real content exists.
 */
export function OpsRevenueTab({
  revenue,
}: {
  revenue: CompanyDashboardData["revenue"];
}) {
  return (
    <div className="text-sm text-ops-text-muted">
      Revenue — coming soon ({revenue.dailyTrend.length} days of trend data).
    </div>
  );
}
