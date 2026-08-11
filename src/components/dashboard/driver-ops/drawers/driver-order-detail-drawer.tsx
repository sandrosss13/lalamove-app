"use client";

import { AcceptOrderButton } from "@/components/accept-order-button";
import { DeliveryLifecycleActions } from "@/components/dashboard/delivery-lifecycle-actions";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";
import { OrderTrackingMap } from "@/components/order-tracking-map";
import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";
import type {
  DriverDashboardData,
  DriverOpsOrder,
} from "@/lib/driver-dashboard-data";

/** Whole currency units, grouped — cents are noise at this scale. */
function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * Formatted in UTC for the same reason the Deliveries tab formats its dates that
 * way: every boundary this dashboard reports against ("today", "this month", the
 * earnings trend buckets) is UTC-based, so rendering this one in the viewer's
 * local zone would let the drawer and the delivery table disagree about which day
 * a late-evening order was placed on.
 */
function formatDateTime(iso: string): string {
  const timestamp = new Date(iso);
  const date = timestamp.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const time = timestamp.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${date} · ${time}`;
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

/**
 * Everything the driver can see and do about a single delivery.
 *
 * It takes the driver's whole fleet, not just the one order, because the accept
 * step composes `AcceptOrderButton`, which builds its vehicle picker from that
 * list — narrowed here to the type this delivery requires.
 *
 * `order` is nullable because the shell looks the row up by id out of data that
 * may have been refreshed since the drawer was opened; a missing row renders
 * nothing rather than an empty drawer. That is a real case here, not just a
 * defensive one: an open-market order another driver claims first disappears
 * from this driver's list on the next refresh.
 *
 * Which action is offered follows the order's status, and unlike the company
 * console's order drawer this one gets the full lifecycle: the driver *is* the
 * caller the start/complete routes authorise, so `DeliveryLifecycleActions` is
 * mounted for real rather than replaced by a read-only note.
 */
export function DriverOrderDetailDrawer({
  order,
  vehicles,
  isIndependent,
}: {
  order: DriverOpsOrder | null;
  vehicles: DriverDashboardData["vehicles"];
  isIndependent: boolean;
}) {
  const { closeDrawer, showToast } = useOpsDashboard();

  if (!order) return null;

  // Geocoding returns null on failure (see `@/lib/geo`), and the map takes a
  // whole coordinate or nothing — a half-known point cannot be plotted. These
  // are rebuilt on every render rather than memoised; the map only re-frames its
  // camera when the *number* of markers changes, so a fresh object identity
  // costs a skipped effect, not a camera yank.
  const pickup =
    order.pickupLat !== null && order.pickupLng !== null
      ? { lat: order.pickupLat, lng: order.pickupLng }
      : null;
  const dropoff =
    order.dropoffLat !== null && order.dropoffLng !== null
      ? { lat: order.dropoffLat, lng: order.dropoffLng }
      : null;

  const isTerminal =
    order.status === "COMPLETED" || order.status === "CANCELLED";

  return (
    <OpsDrawerShell title={order.id}>
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
        {/* What the driver is paid for the run: the quote plus whatever
            waiting-time surcharge was settled on completion. */}
        <Row
          label="Amount"
          value={formatCurrency(order.price + order.overtimeFee)}
        />
        {/* Only set once the delivery has been accepted or dispatched. */}
        {order.vehiclePlate ? (
          <Row label="Vehicle" value={order.vehiclePlate} />
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        {/* Still unclaimed: the only thing to do is take it. The picker is
            narrowed to vehicles of the type this delivery requires — the button
            itself never re-checks that match, by design. The `isIndependent`
            guard is belt-and-braces, since a rostered driver's list never
            contains open-market rows in the first place. */}
        {order.isOpenMarket && isIndependent ? (
          <AcceptOrderButton
            orderId={order.id}
            eligibleVehicles={vehicles
              .filter(
                (vehicle) =>
                  vehicle.vehicleTypeSpecId === order.vehicleTypeSpecId,
              )
              .map((vehicle) => ({
                id: vehicle.id,
                label: `${vehicle.plateNumber} — ${vehicle.make} ${vehicle.model}`,
              }))}
            onSuccess={() => {
              // The row moves out of "Available" and into "My deliveries" on the
              // refresh the button has already triggered, so there is nothing
              // left to look at here.
              showToast(`${order.id} accepted.`);
              closeDrawer();
            }}
          />
        ) : null}

        {/* Theirs, not started yet. Left open on success: the refresh flips this
            branch to the IN_TRANSIT one below in place, so the driver goes
            straight from "Start delivery" to the tracking map without reopening
            the drawer.

            Each branch only ever mounts while the order sits in that one status,
            so each instance's single `onSuccess` can only fire for the
            transition *out of* it — this one for a start, the one below for a
            complete. No runtime disambiguation is needed. */}
        {order.status === "ACCEPTED" ? (
          <DeliveryLifecycleActions
            orderId={order.id}
            status="ACCEPTED"
            onSuccess={() => showToast("Delivery started.")}
          />
        ) : null}

        {/* On the road: the live map is what the driver actually watches, so it
            sits above the completion form. */}
        {order.status === "IN_TRANSIT" ? (
          <>
            <OrderTrackingMap
              orderId={order.id}
              pickup={pickup}
              dropoff={dropoff}
            />
            <DeliveryLifecycleActions
              orderId={order.id}
              status="IN_TRANSIT"
              onSuccess={() => {
                // Terminal state — nothing further can be done to this delivery,
                // so the drawer's reason to exist is gone.
                showToast("Delivery completed.");
                closeDrawer();
              }}
            />
          </>
        ) : null}

        {/* Terminal statuses have no action, only a closing line. `completedAt`
            is null on a cancelled order, so the timestamp is appended only when
            there is one. */}
        {isTerminal ? (
          <p className="text-sm text-ops-text-muted">
            This delivery is{" "}
            {order.status === "COMPLETED" ? "complete" : "cancelled"}.
            {order.completedAt
              ? ` Completed ${formatDateTime(order.completedAt)}.`
              : null}
          </p>
        ) : null}
      </div>
    </OpsDrawerShell>
  );
}
