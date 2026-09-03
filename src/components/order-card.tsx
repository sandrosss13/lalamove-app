import type { ReactNode } from "react";
import type { CargoCategory, OrderStatus } from "@prisma/client";

import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_PILL,
  ORDER_STATUS_PILL_BASE,
  formatGel,
} from "@/components/orders-format";

/** The subset of `Order` fields an order card needs to render. */
type OrderCardOrder = {
  status: OrderStatus;
  price: number;
  pickupAddress: string;
  dropoffAddress: string;
  cargoCategory: CargoCategory;
  distanceKm: number;
  // Only set once a driver has accepted the order with one of their vehicles,
  // and nulled again if that vehicle is later removed — so the cell is rendered
  // conditionally rather than assumed present.
  vehicle?: { plateNumber: string; make: string; model: string } | null;
};

/**
 * One order in the client's order list: a status pill and price, the pickup and
 * dropoff endpoints, and a meta row of cargo, distance and (once assigned)
 * vehicle.
 *
 * Used by exactly one consumer, `src/app/orders/page.tsx`. `children` renders
 * after the meta row — today that is the tracking link, whose visibility
 * condition belongs to the page rather than to the card, since it depends on
 * fields the card never asks for.
 */
export function OrderCard({
  order,
  children,
}: {
  order: OrderCardOrder;
  children?: ReactNode;
}) {
  return (
    <li className="rounded-[14px] border border-line bg-ink p-[22px]">
      <div className="flex items-center justify-between gap-4">
        <span
          className={`${ORDER_STATUS_PILL_BASE} ${ORDER_STATUS_PILL[order.status]}`}
        >
          {ORDER_STATUS_LABEL[order.status]}
        </span>
        <span className="font-price text-[20px] font-semibold tracking-[-0.01em] text-paper tabular-nums">
          {formatGel(order.price)}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <OrderEndpoint badge="P" name="Pickup" address={order.pickupAddress} />
        <OrderEndpoint
          badge="D"
          name="Dropoff"
          address={order.dropoffAddress}
        />
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3.5">
        <OrderMeta
          label="Cargo"
          value={CARGO_CATEGORY_LABELS[order.cargoCategory]}
        />
        <OrderMeta
          label="Distance"
          value={`${order.distanceKm.toFixed(2)} km`}
          numeric
        />
        {order.vehicle ? (
          <OrderMeta
            label="Vehicle"
            value={`${order.vehicle.plateNumber} — ${order.vehicle.make} ${order.vehicle.model}`}
          />
        ) : null}
      </dl>

      {children}
    </li>
  );
}

/**
 * A pickup or dropoff row, matching the route summary on the booking page's map
 * panel. The badge is a bare initial, so the stop it names is carried by the
 * adjacent `sr-only` word rather than left to a screen reader to guess.
 */
function OrderEndpoint({
  badge,
  name,
  address,
}: {
  badge: string;
  name: string;
  address: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent"
      >
        {badge}
      </span>
      <span className="sr-only">{name}</span>
      <span className="truncate text-[14px] leading-snug text-paper">
        {address}
      </span>
    </div>
  );
}

/** One labelled cell of the card's meta row. */
function OrderMeta({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  /** Renders the value in the tabular price face — used for the distance. */
  numeric?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1 text-[13px] font-medium text-paper ${
          numeric ? "font-price tabular-nums" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
