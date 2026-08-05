"use client";

import { useEffect, useState } from "react";

/**
 * The fields of a vehicle type the marketing page uses. `GET /api/vehicle-types`
 * returns more per entry (cargo dimensions, loading access, pricing rule);
 * anything not listed here is simply ignored.
 */
export type LandingVehicleType = {
  code: string;
  label: string;
  category: "MEDIUM_DUTY" | "HEAVY_DUTY";
  maxPayloadKg: number;
  // Only field the calculator needs from the pricing rule: picking the
  // cheapest eligible type for a cargo category is a `baseFare` comparison.
  pricingRule: { baseFare: number };
};

export const LOAD_FAILED_MESSAGE =
  "Could not load the vehicle types. Please refresh and try again.";

/**
 * The in-flight (then resolved) request, shared across every landing section.
 *
 * The taxonomy is fetched in the browser rather than read through Prisma
 * server-side because `/` renders the landing page from a client component
 * (it branches on the session), so these sections are part of a client tree.
 * Four of them need the same list, hence one module-level request instead of
 * four identical ones. Cleared on failure so a later mount retries rather than
 * replaying the same rejection forever.
 */
let vehicleTypesRequest: Promise<LandingVehicleType[]> | null = null;

function loadVehicleTypes(): Promise<LandingVehicleType[]> {
  vehicleTypesRequest ??= fetch("/api/vehicle-types")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Vehicle types request failed: ${response.status}`);
      }

      return response.json() as Promise<LandingVehicleType[]>;
    })
    .catch((cause: unknown) => {
      vehicleTypesRequest = null;
      throw cause;
    });

  return vehicleTypesRequest;
}

/**
 * The seeded vehicle taxonomy, for the landing sections built from it.
 *
 * `loading` and `error` are there for the quote calculator, which has to keep
 * its picker disabled until it has real options; the purely decorative sections
 * ignore both and render nothing until the list arrives.
 */
export function useLandingVehicleTypes(): {
  vehicleTypes: LandingVehicleType[];
  loading: boolean;
  error: string | null;
} {
  const [vehicleTypes, setVehicleTypes] = useState<LandingVehicleType[]>([]);
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
          setError(LOAD_FAILED_MESSAGE);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { vehicleTypes, loading, error };
}
