import type { ReactNode } from "react";
import { OrderStatus, type CargoCategory } from "@prisma/client";

import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";

/** Tailwind classes per order status for a small colour-coded badge. */
export const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  // Amber rather than PENDING's yellow: a claimed order is off the open market
  // but not yet dispatched to a driver, so it has to read as its own state.
  CLAIMED: "bg-amber-200 text-amber-900",
  ACCEPTED: "bg-blue-100 text-blue-800",
  IN_TRANSIT: "bg-purple-100 text-purple-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

/** The subset of `Order` fields an order card needs to render. */
type OrderCardOrder = {
  status: OrderStatus;
  price: number;
  pickupAddress: string;
  dropoffAddress: string;
  cargoCategory: CargoCategory;
  distanceKm: number;
  // Only set once a driver has accepted the order with one of their vehicles,
  // and nulled again if that vehicle is later removed — so the row is rendered
  // conditionally rather than assumed present.
  vehicle?: { plateNumber: string; make: string; model: string } | null;
};

/**
 * Shared presentation for a single order: a status badge, price, and the
 * address/cargo/distance grid. Used by the client account dashboard, the client
 * order list and the provider dashboards. `children` renders after the grid
 * (e.g. a driver's accept button) so callers can extend the card without
 * duplicating its layout.
 */
export function OrderCard({
  order,
  children,
}: {
  order: OrderCardOrder;
  children?: ReactNode;
}) {
  return (
    <li className="rounded border p-4">
      <div className="flex items-center justify-between">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[order.status]}`}
        >
          {order.status}
        </span>
        <span className="text-sm font-semibold">${order.price.toFixed(2)}</span>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="opacity-60">From</dt>
        <dd>{order.pickupAddress}</dd>
        <dt className="opacity-60">To</dt>
        <dd>{order.dropoffAddress}</dd>
        <dt className="opacity-60">Cargo</dt>
        <dd>{CARGO_CATEGORY_LABELS[order.cargoCategory]}</dd>
        <dt className="opacity-60">Distance</dt>
        <dd>{order.distanceKm.toFixed(2)} km</dd>
        {order.vehicle ? (
          <>
            <dt className="opacity-60">Vehicle</dt>
            <dd>
              {order.vehicle.plateNumber} — {order.vehicle.make}{" "}
              {order.vehicle.model}
            </dd>
          </>
        ) : null}
      </dl>

      {children}
    </li>
  );
}
