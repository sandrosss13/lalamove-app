"use client";

import type {
  CompanyDashboardData,
  OpsOrder,
} from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";

/**
 * How much of an order's cuid is shown in a dense list. Long enough to tell two
 * rows apart at a glance; the drawer shows the full id.
 */
const ORDER_ID_PREFIX_LENGTH = 8;

const ORDER_STATUS_LABELS: Record<OpsOrder["status"], string> = {
  PENDING: "Pending",
  CLAIMED: "Claimed",
  ACCEPTED: "Accepted",
  IN_TRANSIT: "In transit",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * Status dots, not the six-hue pill set the light-theme `OrderStatus` badges
 * use: the ops palette carries one accent, one success and one danger, so the
 * six statuses collapse onto "live work", "done" and "dead" instead of getting
 * colours that are not in the theme.
 */
const ORDER_STATUS_DOT_CLASSES: Record<OpsOrder["status"], string> = {
  PENDING: "bg-ops-text-muted",
  CLAIMED: "bg-ops-accent",
  ACCEPTED: "bg-ops-accent",
  IN_TRANSIT: "bg-ops-accent",
  COMPLETED: "bg-ops-success",
  CANCELLED: "bg-ops-danger",
};

/**
 * Shared by the header and every row so the two can never drift out of
 * alignment. `minmax(0, …)` on the flexible tracks is what lets the cells inside
 * them truncate instead of forcing the grid wider than the panel.
 */
const RECENT_ORDER_ROW_GRID =
  "grid grid-cols-[88px_minmax(0,1.4fr)_minmax(0,1fr)_116px_92px] items-center gap-3";

/**
 * Whole-dollar, grouped. The locale is pinned rather than left to the runtime:
 * this component server-renders and then hydrates, and a machine-dependent
 * grouping separator would be a hydration mismatch.
 */
function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/** One KPI in the header grid. `sub` carries a second, lower-priority figure. */
function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ops-border bg-ops-surface p-4.5">
      <div className="text-[11px] font-medium tracking-wide text-ops-text-muted uppercase">
        {label}
      </div>
      <div className="font-ops text-2xl leading-none font-semibold">
        {value}
      </div>
      {sub ? <div className="text-xs text-ops-text-muted">{sub}</div> : null}
    </div>
  );
}

/**
 * The dashboard's landing view: four fleet-wide KPIs over a preview of the
 * newest orders. Every figure comes straight from `overview` — nothing is
 * derived or estimated here — and each row is a shortcut into the order drawer,
 * which is where anything actionable actually happens.
 */
export function OpsOverviewTab({
  overview,
}: {
  overview: CompanyDashboardData["overview"];
}) {
  const { openDrawer } = useOpsDashboard();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active orders"
          value={String(overview.activeOrdersCount)}
        />
        <StatTile
          label="Completed today"
          value={String(overview.completedTodayCount)}
        />
        <StatTile
          label="Revenue today"
          value={formatCurrency(overview.revenueTodayTotal)}
          sub={`${formatCurrency(overview.revenueMonthTotal)} this month`}
        />
        <StatTile
          label="Online drivers"
          value={String(overview.onlineDriversCount)}
          sub={`${overview.fleetSize} ${overview.fleetSize === 1 ? "vehicle" : "vehicles"} in fleet`}
        />
      </div>

      <div className="rounded-xl border border-ops-border bg-ops-surface p-5.5">
        <div className="mb-3.5 text-sm font-semibold">Recent orders</div>

        {overview.recentOrders.length === 0 ? (
          <p className="text-sm text-ops-text-muted">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            {/* The list is a stack of buttons rather than a <table>: every row is
                a single control that opens the order drawer, and a table would
                bury that control a cell deep for keyboard and screen readers. */}
            <div className="min-w-[620px]">
              <div
                className={`${RECENT_ORDER_ROW_GRID} border-b border-ops-border pb-2 text-[11px] tracking-wide text-ops-text-muted uppercase`}
              >
                <span>Order</span>
                <span>Client</span>
                <span>Driver</span>
                <span>Status</span>
                <span className="text-right">Total</span>
              </div>

              <div className="flex flex-col">
                {overview.recentOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => openDrawer({ type: "order", id: order.id })}
                    className={`${RECENT_ORDER_ROW_GRID} -mx-2 rounded-lg border-b border-ops-border/60 px-2 py-2.5 text-left text-sm transition-colors last:border-none hover:bg-ops-surface-raised`}
                  >
                    <span className="font-ops text-xs text-ops-text-muted">
                      {order.id.slice(0, ORDER_ID_PREFIX_LENGTH)}
                    </span>
                    <span className="truncate">{order.clientName}</span>
                    <span className="truncate text-ops-text-muted">
                      {order.driverName ?? "Unassigned"}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-ops-text-muted">
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${ORDER_STATUS_DOT_CLASSES[order.status]}`}
                      />
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                    <span className="font-ops text-right">
                      {formatCurrency(order.price + order.overtimeFee)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
