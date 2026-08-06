"use client";

import type { DriverDashboardData } from "@/lib/driver-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { DriverStatusToggle } from "@/components/driver-status-toggle";

/**
 * Whole-dollar, grouped. The locale is pinned rather than left to the runtime:
 * this tree hydrates from server-rendered markup, and a machine-dependent
 * grouping separator would be a hydration mismatch. Mirrors the company
 * console's `formatCurrency` so the two dashboards read identically.
 */
function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/** One KPI in the tile grid. Styled to match the company console's tiles. */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ops-border bg-ops-surface p-4.5">
      <div className="text-[11px] font-medium tracking-wide text-ops-text-muted uppercase">
        {label}
      </div>
      <div className="font-ops text-2xl leading-none font-semibold">
        {value}
      </div>
    </div>
  );
}

/**
 * The driver's landing view: availability toggle on top, then a shortcut into
 * whatever delivery is in flight, then four KPIs.
 *
 * The ordering is deliberate — going online is the one thing a driver must be
 * able to do without hunting, and the active-delivery card is the only route
 * back to a job already in progress from this tab.
 *
 * Every figure comes straight from `overview`; nothing is derived here, so the
 * tiles can never disagree with the Deliveries or Earnings tabs.
 */
export function DriverOpsOverviewTab({
  driver,
  overview,
}: {
  driver: DriverDashboardData["driver"];
  overview: DriverDashboardData["overview"];
}) {
  const { openDrawer } = useOpsDashboard();

  // Bound to a local so the `null` check below narrows it for the click handler;
  // reading `overview.activeOrderId` inside the closure would widen back to
  // `string | null` and force a cast.
  const activeOrderId = overview.activeOrderId;

  return (
    <div className="flex flex-col gap-6">
      {/* `DriverStatusToggle` is reused verbatim from the light-theme dashboard:
          it owns its own status state and the location beacon, and needs no
          wiring into this dashboard's context or refresh cycle. */}
      <div className="rounded-xl border border-ops-border bg-ops-surface p-4.5">
        <DriverStatusToggle initialIsOnline={driver.isOnline} />
      </div>

      {activeOrderId ? (
        <button
          type="button"
          onClick={() => openDrawer({ type: "order", id: activeOrderId })}
          className="rounded-xl border border-ops-accent/40 bg-ops-accent/10 p-4.5 text-left transition-colors hover:border-ops-accent/70 hover:bg-ops-accent/15"
        >
          <div className="text-[11px] font-medium tracking-wide text-ops-accent uppercase">
            Active delivery
          </div>
          <div className="mt-1.5 text-sm text-ops-text">
            You have a delivery in progress — open it to view the details, track
            it, or mark it complete.
          </div>
        </button>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Completed today"
          value={String(overview.completedTodayCount)}
        />
        <StatTile
          label="Earned today"
          value={formatCurrency(overview.earningsTodayTotal)}
        />
        <StatTile
          label="Earned this month"
          value={formatCurrency(overview.earningsMonthTotal)}
        />
        <StatTile
          label="Completed all-time"
          value={String(overview.completedTotalCount)}
        />
      </div>
    </div>
  );
}
