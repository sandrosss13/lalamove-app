"use client";

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
  // The one field the picker needs from the pricing rule: highlighting the
  // best-fit (cheapest eligible) type is a `baseFare` comparison.
  pricingRule: { baseFare: number };
};

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
