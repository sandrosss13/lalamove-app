import type { CompanyDashboardData } from "@/lib/company-dashboard-data";

/**
 * Placeholder — task-08 fills in the searchable/filterable/sortable order table.
 * The prop is read here so the data path from `getCompanyDashboardData` through
 * the shell is provably live before the real content exists.
 */
export function OpsOrdersTab({
  orders,
}: {
  orders: CompanyDashboardData["orders"];
}) {
  return (
    <div className="text-sm text-ops-text-muted">
      Orders — coming soon ({orders.length} orders).
    </div>
  );
}
