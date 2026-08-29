"use client";

import { ClaimOrderButton } from "@/components/dashboard/claim-order-button";
import { CompanyDispatchForm } from "@/components/dashboard/company-dispatch-form";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsCancelOrderButton } from "@/components/dashboard/ops/ops-cancel-order-button";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";
import { OpsOrderStatusTimeline } from "@/components/dashboard/ops/ops-order-status-timeline";
import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";
import type {
  CompanyDashboardData,
  OpsOrder,
} from "@/lib/company-dashboard-data";

/** Whole currency units, grouped — cents are noise at this scale. */
function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * Formatted in UTC for the same reason `ops-order-row.tsx` formats its dates
 * that way: every boundary on this dashboard ("today", "this month", the revenue
 * trend buckets) is UTC-based, so rendering this one in the viewer's local zone
 * would let the drawer and the Orders table disagree about which day a
 * late-evening order was placed on.
 */
function formatDateTime(iso: string): string {
  const placedAt = new Date(iso);
  const date = placedAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const time = placedAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${date} · ${time}`;
}

/**
 * Everything the company can see and do about a single order.
 *
 * It takes the whole roster and fleet, not just the one order, because the
 * dispatch step composes `CompanyDispatchForm`, which builds its driver and
 * vehicle pickers from those lists.
 *
 * `order` is nullable because the shell looks the row up by id out of data that
 * may have been refreshed since the drawer was opened; a missing row renders
 * nothing rather than an empty drawer.
 *
 * Which action is offered follows the order's status, and the set is
 * deliberately short of the full lifecycle: a company claims, dispatches and
 * cancels, but never starts or completes a delivery — only the driver holding it
 * can do that, so `ACCEPTED`/`IN_TRANSIT` orders get read-only assignment
 * information and a note saying so rather than buttons that would 403.
 */
export function OrderDetailDrawer({
  order,
  drivers,
  fleet,
}: {
  order: OpsOrder | null;
  drivers: CompanyDashboardData["drivers"];
  fleet: CompanyDashboardData["fleet"];
}) {
  const { closeDrawer, showToast } = useOpsDashboard();

  if (!order) return null;

  // An open-market order is not the company's to call off — it has only been
  // matched to the fleet's vehicle types, not claimed — and a COMPLETED or
  // CANCELLED one is already terminal (the route would answer 409).
  const canCancel =
    order.status === "CLAIMED" ||
    order.status === "ACCEPTED" ||
    order.status === "IN_TRANSIT";

  const isWithDriver =
    order.status === "ACCEPTED" || order.status === "IN_TRANSIT";

  /**
   * Every mutation here ends the same way: the row the drawer is showing has
   * just changed status, so the drawer's reason to exist is gone. The child
   * component has already called `router.refresh()` by this point.
   */
  function handleActionSuccess(message: string) {
    showToast(message);
    closeDrawer();
  }

  return (
    <OpsDrawerShell title={order.id}>
      <OpsOrderStatusTimeline order={order} />

      <div className="flex flex-col gap-3.5 text-sm">
        <Row label="Customer" value={order.clientName} />
        <Row label="Cargo" value={CARGO_CATEGORY_LABELS[order.cargoCategory]} />
        {/* Optional free text from the client — omitted entirely when absent
            rather than shown as an empty row. */}
        {order.description ? (
          <Row label="Notes" value={order.description} />
        ) : null}
        <Row
          label="Route"
          value={`${order.pickupAddress} → ${order.dropoffAddress}`}
        />
        <Row label="Distance" value={`${order.distanceKm.toFixed(2)} km`} />
        <Row label="Placed" value={formatDateTime(order.createdAt)} />
        {/* What the client actually owes: the quote plus any waiting-time
            surcharge accrued at pickup. */}
        <Row
          label="Amount"
          value={formatCurrency(order.price + order.overtimeFee)}
        />
      </div>

      <div className="mt-5 border-t border-ops-border pt-4.5">
        <div className="mb-2 text-xs tracking-wide text-ops-text-muted uppercase">
          Driver
        </div>
        {order.driverName ? (
          <div className="text-sm">
            {order.driverName}
            {order.vehiclePlate ? (
              <span className="text-ops-text-muted">
                {" "}
                · {order.vehiclePlate}
              </span>
            ) : null}
          </div>
        ) : isWithDriver ? (
          // Assigned but the join came back empty — a deleted user, say. The
          // status is still the truth, so say so rather than claim it is
          // unassigned.
          <div className="text-sm text-ops-text-muted">
            Assigned — details unavailable.
          </div>
        ) : (
          <div className="text-sm text-ops-text-muted">Not yet assigned.</div>
        )}

        {isWithDriver ? (
          <p className="mt-2 text-xs text-ops-text-muted">
            Only the assigned driver can start or complete this delivery —
            status updates automatically as they do.
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {/* Still on the open market: the only thing to do is take it. */}
        {order.isOpenMarket ? (
          <ClaimOrderButton
            orderId={order.id}
            onSuccess={() => handleActionSuccess(`${order.id} claimed.`)}
          />
        ) : null}

        {/* Ours, but nobody is carrying it yet. The vehicle picker is narrowed
            to the type this delivery requires — the form itself never re-checks
            that match, by design — and to vehicles the dispatch endpoint will
            actually accept, so the console never offers a button that can only
            fail. A fleet whose only matching vehicle is still under review
            degrades to `CompanyDispatchForm`'s existing empty state. */}
        {!order.isOpenMarket && order.status === "CLAIMED" ? (
          <CompanyDispatchForm
            orderId={order.id}
            drivers={drivers.map((driver) => ({
              userId: driver.userId,
              name: driver.name,
            }))}
            vehicles={fleet
              .filter(
                (vehicle) =>
                  vehicle.dispatchable &&
                  vehicle.vehicleTypeSpecId === order.vehicleTypeSpecId,
              )
              .map((vehicle) => ({
                id: vehicle.id,
                label: `${vehicle.plateNumber} — ${vehicle.make} ${vehicle.model}`,
              }))}
            onSuccess={() => handleActionSuccess(`${order.id} dispatched.`)}
          />
        ) : null}

        {canCancel ? (
          <OpsCancelOrderButton
            orderId={order.id}
            onSuccess={() => handleActionSuccess(`${order.id} cancelled.`)}
          />
        ) : null}
      </div>
    </OpsDrawerShell>
  );
}

/** One label/value line of the detail list, value right-aligned against it. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ops-text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
