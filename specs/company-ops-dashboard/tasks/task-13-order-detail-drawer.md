# Task 13: Order detail drawer

## Status

complete

## Wave

4

## Description

Fills in the order-detail drawer: full order fields, a status timeline, and the composed lifecycle actions — claim (if open-market), dispatch (if claimed by this company but not yet assigned), read-only status (if assigned and being driven — a company can't start/complete another user's delivery), and cancel (for any non-terminal, company-owned order). This is the most composed piece of the feature: it reuses two existing mutation components as-is and adds one brand-new one for the cancel action this app never had before.

## Dependencies

**Depends on:** task-01-dashboard-data-module.md, task-02-cancel-order-route.md, task-05-mutation-onsuccess-props.md, task-06-shell-and-scaffold.md
**Blocks:** None

**Context from dependencies:** task-01 defined `OpsOrder` (see its file for the full field list) and `CompanyDashboardData["drivers"]`/`["fleet"]` (`OpsDriver[]`/`OpsVehicle[]`, including `OpsVehicle.vehicleTypeSpecId` used to narrow the dispatch form's vehicle picker to the order's required type). task-02 created `POST /api/logistics-company/orders/[id]/cancel` (no body, `200` with updated order, `409` if already terminal). task-05 added an optional `onSuccess?: () => void` prop to `ClaimOrderButton` and `CompanyDispatchForm` (both reused here unmodified otherwise). task-06 created `src/components/dashboard/ops/drawers/order-detail-drawer.tsx` as a placeholder wired into the shell with props `{ order: OpsOrder | null; drivers: CompanyDashboardData["drivers"]; fleet: CompanyDashboardData["fleet"] }` — keep that exact prop shape. task-06's `useOpsDashboard()` exposes `closeDrawer()` and `showToast(message, tone?)`.

## Files to Modify

- `src/components/dashboard/ops/drawers/order-detail-drawer.tsx` — replace placeholder body with real content.

## Files to Create

- `src/components/dashboard/ops/ops-order-status-timeline.tsx` — presentational 5-step status timeline.
- `src/components/dashboard/ops/ops-cancel-order-button.tsx` — new mutation component for the cancel action (mirrors `ClaimOrderButton`'s exact pattern).

## Technical Details

### Reused components (imported unmodified — do not edit these files)

- `ClaimOrderButton` from `@/components/dashboard/claim-order-button` — props `{ orderId: string; onSuccess?: () => void }` (task-05 added `onSuccess`). Renders a bare "Claim delivery" button, posts to `/api/logistics-company/orders/{orderId}/claim`.
- `CompanyDispatchForm` from `@/components/dashboard/company-dispatch-form` — props `{ orderId: string; drivers: DispatchDriverOption[]; vehicles: DispatchVehicleOption[]; onSuccess?: () => void }` where `DispatchDriverOption = { userId: string; name: string }` and `DispatchVehicleOption = { id: string; label: string }` (both exported from that file). Renders driver + vehicle `<select>`s and a "Dispatch delivery" button, posts to `/api/logistics-company/orders/{orderId}/dispatch`.

Both are styled with plain Tailwind (`rounded border`, etc.) from the light theme — inside the dark drawer they will render with those same light-theme classes verbatim (per the plan's dark-theme-scoping approach, restyling these via `[data-ops-dashboard] button`/`input`/`select` CSS-attribute-selector overrides in `globals.css` is a nice-to-have polish pass, not required for this task's acceptance — functional correctness matters more than pixel-perfect dark styling on these two reused forms for this task).

### `ops-cancel-order-button.tsx` (new — mirrors `ClaimOrderButton` exactly)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OpsCancelOrderButton({
  orderId,
  onSuccess,
}: {
  orderId: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/logistics-company/orders/${orderId}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not cancel this delivery.");
        return;
      }

      router.refresh();
      onSuccess?.();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleCancel}
        disabled={submitting}
        className="flex-1 rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2.5 text-center text-sm font-medium text-ops-danger disabled:opacity-50"
      >
        {submitting ? "Cancelling…" : "Cancel order"}
      </button>
      {error ? <p className="text-xs text-ops-danger">{error}</p> : null}
    </div>
  );
}
```

### `ops-order-status-timeline.tsx`

5 steps: Pending → Claimed → Assigned → In Transit → Delivered. `CLAIMED` only lights up for company-claimed orders (independent-driver orders — which a company can never see except as still-open market listings — skip it); `CANCELLED` replaces the whole track with a single terminal label instead of a step position.

```tsx
import type { OpsOrder } from "@/lib/company-dashboard-data";

const STEPS: { key: OpsOrder["status"]; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "CLAIMED", label: "Claimed" },
  { key: "ACCEPTED", label: "Assigned" },
  { key: "IN_TRANSIT", label: "In transit" },
  { key: "COMPLETED", label: "Delivered" },
];

const STEP_ORDER = STEPS.map((s) => s.key);

export function OpsOrderStatusTimeline({ order }: { order: OpsOrder }) {
  if (order.status === "CANCELLED") {
    return (
      <div className="rounded-lg border border-ops-danger/40 bg-ops-danger/10 py-3 text-center text-sm font-medium text-ops-danger">
        Cancelled
      </div>
    );
  }

  const currentIndex = STEP_ORDER.indexOf(order.status);

  return (
    <div className="relative my-6 flex">
      <div className="absolute top-[5px] right-6 left-6 z-0 h-0.5 bg-ops-border" />
      {STEPS.map((step, index) => {
        const reached = index <= currentIndex;
        return (
          <div key={step.key} className="relative z-10 flex flex-1 flex-col items-center">
            <div
              className={`h-2.5 w-2.5 rounded-full ${reached ? "bg-ops-accent" : "bg-ops-border"}`}
            />
            <div
              className={`mt-1.5 text-center text-[11px] ${reached ? "text-ops-text" : "text-ops-text-muted"}`}
            >
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### `order-detail-drawer.tsx`

```tsx
"use client";

import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";
import type { CompanyDashboardData, OpsOrder } from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";
import { OpsOrderStatusTimeline } from "@/components/dashboard/ops/ops-order-status-timeline";
import { OpsCancelOrderButton } from "@/components/dashboard/ops/ops-cancel-order-button";
import { ClaimOrderButton } from "@/components/dashboard/claim-order-button";
import { CompanyDispatchForm } from "@/components/dashboard/company-dispatch-form";

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

  const canCancel = order.status === "CLAIMED" || order.status === "ACCEPTED" || order.status === "IN_TRANSIT";

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
        {order.description ? <Row label="Notes" value={order.description} /> : null}
        <Row label="Route" value={`${order.pickupAddress} → ${order.dropoffAddress}`} />
        <Row label="Distance" value={`${order.distanceKm.toFixed(2)} km`} />
        <Row label="Placed" value={formatDateTime(order.createdAt)} />
        <Row label="Amount" value={formatCurrency(order.price + order.overtimeFee)} />
      </div>

      <div className="mt-5 border-t border-ops-border pt-4.5">
        <div className="mb-2 text-xs tracking-wide text-ops-text-muted uppercase">Driver</div>
        {order.driverName ? (
          <div className="text-sm">
            {order.driverName}
            {order.vehiclePlate ? (
              <span className="text-ops-text-muted"> · {order.vehiclePlate}</span>
            ) : null}
          </div>
        ) : order.status === "ACCEPTED" || order.status === "IN_TRANSIT" ? (
          <div className="text-sm text-ops-text-muted">Assigned — details unavailable.</div>
        ) : (
          <div className="text-sm text-ops-text-muted">Not yet assigned.</div>
        )}

        {(order.status === "ACCEPTED" || order.status === "IN_TRANSIT") ? (
          <p className="mt-2 text-xs text-ops-text-muted">
            Only the assigned driver can start or complete this delivery — status updates automatically as they do.
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {order.isOpenMarket ? (
          <ClaimOrderButton orderId={order.id} onSuccess={() => handleActionSuccess(`${order.id} claimed.`)} />
        ) : null}

        {!order.isOpenMarket && order.status === "CLAIMED" ? (
          <CompanyDispatchForm
            orderId={order.id}
            drivers={drivers.map((d) => ({ userId: d.userId, name: d.name }))}
            vehicles={fleet
              .filter((v) => v.vehicleTypeSpecId === order.vehicleTypeSpecId)
              .map((v) => ({ id: v.id, label: `${v.plateNumber} — ${v.make} ${v.model}` }))}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ops-text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
```

Note `order.isOpenMarket` orders (still `PENDING`, `companyId: null`) intentionally get **no** cancel button — the company doesn't own that order yet, only `ClaimOrderButton` applies. Once claimed (`CLAIMED`/`ACCEPTED`/`IN_TRANSIT`), cancel becomes available alongside whatever other action applies to that status.

## Acceptance Criteria

- [ ] Drawer shows the full order detail: customer, cargo label + description, route, distance, placed date, amount, driver/vehicle if assigned.
- [ ] Status timeline renders correctly for every `OrderStatus`, with `CANCELLED` shown as a distinct terminal state rather than a track position.
- [ ] Open-market `PENDING` orders show only a Claim button; claimed-but-undispatched orders show the dispatch form (driver/vehicle pickers correctly narrowed to the order's vehicle type via `vehicleTypeSpecId`); `ACCEPTED`/`IN_TRANSIT` orders show read-only assignment info and an explanatory note, no fake start/complete buttons.
- [ ] Cancel button appears for `CLAIMED`/`ACCEPTED`/`IN_TRANSIT` orders only, calls the task-02 route, and on success shows a toast + closes the drawer + refreshes the underlying data.
- [ ] Claim/dispatch success also shows a toast + closes the drawer (via the new `onSuccess` prop from task-05).
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Manually verified end-to-end: claim an open order → drawer closes with a toast → reopen it from the Orders tab, now shows the dispatch form → dispatch it → drawer closes with a toast → reopen, now shows read-only assigned-driver info → cancel it → drawer closes with a toast, status shows Cancelled.
