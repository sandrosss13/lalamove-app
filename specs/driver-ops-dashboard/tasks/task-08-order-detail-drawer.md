# Task 08: Order detail drawer

## Status

complete

## Wave

4

## Description

Fills in the order-detail drawer: full order fields, and the composed actions that carry a driver through the actual delivery lifecycle — accept (if open-market and independent), start (if `ACCEPTED`), an embedded live tracking map plus complete (if `IN_TRANSIT`), or a read-only summary (if `COMPLETED`/`CANCELLED`). Unlike the company spec's order drawer (which could only show *read-only* lifecycle status, since a company can't call `start`/`complete`), this drawer reuses `DeliveryLifecycleActions` for real — the driver is the authorized caller.

## Dependencies

**Depends on:** task-01-driver-dashboard-data-module.md, task-02-mutation-onsuccess-props.md, task-03-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `DriverOpsOrder` (full field list in that task's file, including `pickupLat/pickupLng/dropoffLat/dropoffLng` for the map) and `DriverDashboardData["vehicles"]` (`DriverOpsVehicle[]`, used to narrow the accept picker to vehicles matching the order's `vehicleTypeSpecId`). task-02 added an optional `onSuccess?: () => void` to `AcceptOrderButton` and `DeliveryLifecycleActions` (both reused here unmodified otherwise). task-03 created `src/components/dashboard/driver-ops/drawers/driver-order-detail-drawer.tsx` as a placeholder wired into the shell with props `{ order: DriverOpsOrder | null; vehicles: DriverDashboardData["vehicles"]; isIndependent: boolean }` — keep that exact prop shape. task-03's `useOpsDashboard()` exposes `closeDrawer()` and `showToast(message, tone?)`.

## Files to Modify

- `src/components/dashboard/driver-ops/drawers/driver-order-detail-drawer.tsx` — replace placeholder body with real content.

## Technical Details

### Reused components (imported unmodified — do not edit these files)

- `AcceptOrderButton` from `@/components/accept-order-button` — props `{ orderId: string; eligibleVehicles: {id,label}[]; onSuccess?: () => void }` (task-02 added `onSuccess`). Renders a vehicle picker (only if more than one eligible vehicle) + "Accept delivery" button, posts to `/api/orders/{orderId}/accept`.
- `DeliveryLifecycleActions` from `@/components/dashboard/delivery-lifecycle-actions` — props `{ orderId: string; status: "ACCEPTED"|"IN_TRANSIT"; onSuccess?: () => void }` (task-02 added `onSuccess`). Renders "Start delivery" for `ACCEPTED`, or a waiting-minutes form + "Complete delivery" for `IN_TRANSIT`, posting to `/api/orders/{id}/start` or `/complete`. **One `onSuccess` fires for both transitions** — this task's drawer must not assume which one just happened from inside the callback (see below for how it's handled: the callback here always just shows a toast, and closing only happens for the `IN_TRANSIT`→complete case via a separate check, not via distinguishing inside `onSuccess` itself).
- `OrderTrackingMap` from `@/components/order-tracking-map` — props `{ orderId: string; pickup: {lat,lng}|null; dropoff: {lat,lng}|null }`. Polls `/api/orders/{orderId}/location` every 5s. Renders `null`-safe: pass `null` for pickup/dropoff when either lat/lng is missing.

### `driver-order-detail-drawer.tsx`

```tsx
"use client";

import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";
import type { DriverDashboardData, DriverOpsOrder } from "@/lib/driver-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";
import { AcceptOrderButton } from "@/components/accept-order-button";
import { DeliveryLifecycleActions } from "@/components/dashboard/delivery-lifecycle-actions";
import { OrderTrackingMap } from "@/components/order-tracking-map";

function formatCurrency(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ops-text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

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

  const pickup = order.pickupLat !== null && order.pickupLng !== null
    ? { lat: order.pickupLat, lng: order.pickupLng }
    : null;
  const dropoff = order.dropoffLat !== null && order.dropoffLng !== null
    ? { lat: order.dropoffLat, lng: order.dropoffLng }
    : null;

  return (
    <OpsDrawerShell title={order.id}>
      <div className="flex flex-col gap-3.5 text-sm">
        <Row label="Customer" value={order.clientName} />
        <Row label="Cargo" value={CARGO_CATEGORY_LABELS[order.cargoCategory]} />
        {order.description ? <Row label="Notes" value={order.description} /> : null}
        <Row label="Route" value={`${order.pickupAddress} → ${order.dropoffAddress}`} />
        <Row label="Distance" value={`${order.distanceKm.toFixed(2)} km`} />
        <Row label="Placed" value={formatDateTime(order.createdAt)} />
        <Row label="Amount" value={formatCurrency(order.price + order.overtimeFee)} />
        {order.vehiclePlate ? <Row label="Vehicle" value={order.vehiclePlate} /> : null}
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        {order.isOpenMarket && isIndependent ? (
          <AcceptOrderButton
            orderId={order.id}
            eligibleVehicles={vehicles
              .filter((v) => v.vehicleTypeSpecId === order.vehicleTypeSpecId)
              .map((v) => ({ id: v.id, label: `${v.plateNumber} — ${v.make} ${v.model}` }))}
            onSuccess={() => {
              showToast(`${order.id} accepted.`);
              closeDrawer();
            }}
          />
        ) : null}

        {order.status === "ACCEPTED" ? (
          <DeliveryLifecycleActions
            orderId={order.id}
            status="ACCEPTED"
            onSuccess={() => showToast("Delivery started.")}
          />
        ) : null}

        {order.status === "IN_TRANSIT" ? (
          <>
            <OrderTrackingMap orderId={order.id} pickup={pickup} dropoff={dropoff} />
            <DeliveryLifecycleActions
              orderId={order.id}
              status="IN_TRANSIT"
              onSuccess={() => {
                showToast("Delivery completed.");
                closeDrawer();
              }}
            />
          </>
        ) : null}

        {order.status === "COMPLETED" || order.status === "CANCELLED" ? (
          <p className="text-sm text-ops-text-muted">
            This delivery is {order.status === "COMPLETED" ? "complete" : "cancelled"}.
            {order.completedAt ? ` Completed ${formatDateTime(order.completedAt)}.` : null}
          </p>
        ) : null}
      </div>
    </OpsDrawerShell>
  );
}
```

Note the `ACCEPTED` and `IN_TRANSIT` branches render **two separate** `DeliveryLifecycleActions` instances with different `onSuccess` closures (start → toast only, stay open; complete → toast + close) — this is what resolves the "one `onSuccess` fires for both transitions" ambiguity flagged above: each branch only ever mounts while the order is in that specific status, so each mounted instance's `onSuccess` closure only ever fires for the transition *out of* that status (`ACCEPTED`'s instance only ever sees a successful "start" call, since completing isn't offered from that status; `IN_TRANSIT`'s instance only ever sees a successful "complete" call). No runtime disambiguation is actually needed.

## Acceptance Criteria

- [ ] Drawer shows full order detail: customer, cargo label + description, route, distance, placed date, amount, vehicle if assigned.
- [ ] Open-market orders (independent drivers only) show `AcceptOrderButton` with vehicle picker correctly narrowed by `vehicleTypeSpecId`; accepting closes the drawer with a toast.
- [ ] `ACCEPTED` orders show "Start delivery"; starting shows a toast and the drawer's content updates in place (via the shell's refreshed data) to the `IN_TRANSIT` view, without needing to reopen the drawer.
- [ ] `IN_TRANSIT` orders show the live tracking map above "Complete delivery"; completing shows a toast and closes the drawer.
- [ ] `COMPLETED`/`CANCELLED` orders show a read-only summary line.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Manually verified end-to-end as an independent driver: accept an open order → drawer closes with a toast → reopen from Deliveries tab (now in "My deliveries") → Start → drawer stays open, now shows the tracking map + Complete form → Complete → drawer closes with a toast, order now shows COMPLETED.
