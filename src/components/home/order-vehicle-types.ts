"use client";

import type { ChassisType } from "@prisma/client";
import { useEffect, useState } from "react";

/**
 * The fields of a vehicle type the booking page's vehicle picker uses.
 * `GET /api/vehicle-types` returns more per entry (the rest of the pricing
 * rule); anything not listed here is simply ignored.
 *
 * Richer than the landing page's projection because this picker shows what a
 * client has to choose between: the cargo box dimensions and how it is loaded,
 * not just a payload headline.
 */
export type OrderVehicleType = {
  code: string;
  label: string;
  category: "MEDIUM_DUTY" | "HEAVY_DUTY";
  maxPayloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
  loadingAccessType:
    "REAR_DOOR" | "SIDE_DOOR" | "RAMP" | "TAIL_LIFT" | "OPEN_FLATBED";
  // The load spaces this type serves, straight from `VehicleTypeSpec.bodyTypes`
  // — the only source of truth for the body filter. A list because several
  // types serve more than one body (a reefer can run its box dry).
  bodyTypes: ChassisType[];
  /**
   * Whether any activated carrier on the platform could actually take a load
   * booked against this type — resolved server-side by
   * `src/lib/orders/class-serviceability.ts` under the same
   * upgrade-substitution rule the load board and the claim routes apply.
   *
   * False for four of the eleven seeded classes today. A client who books one
   * gets an order that is created, priced and then invisible to every carrier,
   * which is why `POST /api/orders` refuses such a booking outright; this flag
   * is the picker's chance to say so before the client fills in a whole form,
   * exactly as the cargo-fit check is mirrored between the form and the route.
   *
   * **Advisory, and deliberately looser than the server's check**: it is
   * body-agnostic, because this list is fetched once before a client has chosen
   * anything. A type flagged serviceable can still be refused at booking if no
   * carrier serves it *with the chosen load space*. The route is the authority
   * and is never the looser of the two — see `GET /api/vehicle-types`.
   */
  serviceable: boolean;
  // The one field the picker needs from the pricing rule: highlighting the
  // best-fit (cheapest eligible) type is a `baseFare` comparison.
  pricingRule: { baseFare: number };
};

/**
 * Does this vehicle type offer the given load space?
 *
 * Lives here, beside the data, rather than in the booking form: the mapping is
 * the taxonomy's, so a new vehicle type becomes filterable the moment it is
 * seeded and no component holds a vehicle-name-to-body table.
 *
 * A type with an empty `bodyTypes` offers nothing and drops out of every body's
 * grid. That is correct, not a bug — the column defaults to empty, so a type
 * seeded before the column existed (or seeded without it) is hidden from the
 * filter until its bodies are recorded.
 */
export function vehicleOffersBody(
  vehicle: OrderVehicleType,
  body: ChassisType,
): boolean {
  return vehicle.bodyTypes.includes(body);
}

export const ORDER_VEHICLE_TYPES_ERROR_MESSAGE =
  "Could not load the vehicle types. Please refresh and try again.";

/**
 * The in-flight (then resolved) request, shared across every booking section.
 *
 * The taxonomy is fetched in the browser rather than read through Prisma
 * server-side because `/` renders the booking page from a client component (it
 * branches on the session), so the picker is part of a client tree. Several
 * sections of the form need the same list, hence one module-level request
 * instead of one per section. Cleared on failure so a later mount retries
 * rather than replaying the same rejection forever.
 *
 * Deliberately its own cache rather than the landing page's: the two projections
 * differ, and the two pages never render together, so sharing would only couple
 * them.
 *
 * Unkeyed and process-lifetime by design: it holds the whole response of the one
 * request this module makes, so widening the projection cannot serve a stale
 * shape — the promise is created afresh on every page load and every field the
 * route returns arrives with it.
 */
let vehicleTypesRequest: Promise<OrderVehicleType[]> | null = null;

function loadVehicleTypes(): Promise<OrderVehicleType[]> {
  vehicleTypesRequest ??= fetch("/api/vehicle-types")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Vehicle types request failed: ${response.status}`);
      }

      return response.json() as Promise<OrderVehicleType[]>;
    })
    .catch((cause: unknown) => {
      vehicleTypesRequest = null;
      throw cause;
    });

  return vehicleTypesRequest;
}

/**
 * The seeded vehicle taxonomy, for the booking page's vehicle picker.
 *
 * `loading` and `error` are there because the picker has to stay disabled until
 * it has real options: a client must not be able to submit an order against a
 * vehicle type that never arrived.
 */
export function useOrderVehicleTypes(): {
  vehicleTypes: OrderVehicleType[];
  loading: boolean;
  error: string | null;
} {
  const [vehicleTypes, setVehicleTypes] = useState<OrderVehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The request is shared, so it must not be aborted on unmount — the flag
    // drops the response instead, leaving the cache intact for other sections.
    let active = true;

    loadVehicleTypes()
      .then((types) => {
        if (active) {
          setVehicleTypes(types);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(ORDER_VEHICLE_TYPES_ERROR_MESSAGE);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { vehicleTypes, loading, error };
}

/** Payload as a headline figure: tonnes once a type is rated in them (matches `landing-vehicles.tsx`'s convention). */
export function formatVehiclePayload(maxPayloadKg: number): string {
  return maxPayloadKg >= 1000
    ? `${maxPayloadKg / 1000} t`
    : `${maxPayloadKg} kg`;
}

/** Dimensions as "L x W x H m", e.g. "2.3 x 1.2 x 1.2 m". */
export function formatVehicleDimensions(
  lengthM: number,
  widthM: number,
  heightM: number,
): string {
  return `${lengthM} x ${widthM} x ${heightM} m`;
}
