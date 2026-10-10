"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { orderForHomepage } from "@/lib/vehicle-homepage-display";
import { vehicleTypeSpecLabel } from "@/lib/vehicle-type-spec-labels";

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
  /**
   * The vehicle-class photo a content manager set, or `null` when none has
   * been uploaded yet. Sections that show it fall back to a drawn glyph.
   */
  imageUrl: string | null;
  // The two fields the marketing page needs from the pricing rule: picking the
  // cheapest eligible type for a cargo category is a `baseFare` comparison,
  // and `pricePerKm` lets the category tiles show a nominal "from" price.
  pricingRule: { baseFare: number; pricePerKm: number };
  /**
   * Homepage display settings from Admin → Content → Vehicle photos. Optional
   * because a response from a deployment that predates them omits both; that
   * reads as "shown, unordered" (see `orderForHomepage`). Consumed — and
   * hidden types dropped — inside `useLandingVehicleTypes`, so no landing
   * section needs to look at them.
   */
  showOnHomepage?: boolean;
  homepageSortOrder?: number;
};

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
 * Already in homepage form: types an admin hid from the homepage are removed,
 * and the rest are ordered by the admin's per-category homepage order (see
 * `orderForHomepage`). Every consumer groups by `category` with a `filter`, so
 * that order is the order each Medium / Heavy group renders in. This is
 * marketing-only — the signed-in booking form reads `/api/vehicle-types`
 * through its own hook and is unaffected.
 *
 * Admin changes show on the next page load: `GET /api/vehicle-types` is
 * dynamic and uncached, and the request below is shared only for the lifetime
 * of one loaded page.
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
  const t = useTranslations("landing.landingVehicleTypes");
  // Root-namespace translator for `vehicleTypeSpecLabel`'s `common.*` keys.
  const tRoot = useTranslations();
  const [vehicleTypes, setVehicleTypes] = useState<LandingVehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  // A flag rather than the message itself, so the message is rendered in the
  // reader's current language instead of the one the failure happened in.
  const [failed, setFailed] = useState(false);

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
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // The API returns the English seed label; every landing section reads
  // `label`, so it is localized once here by `code` rather than per call site.
  // Ordering runs first, on the English label, so the label tie-break matches
  // the order the migration backfilled regardless of the reader's language.
  const localizedVehicleTypes = useMemo(
    () =>
      orderForHomepage(vehicleTypes).map((vehicleType) => ({
        ...vehicleType,
        label: vehicleTypeSpecLabel(vehicleType.code, vehicleType.label, tRoot),
      })),
    [vehicleTypes, tRoot],
  );

  return {
    vehicleTypes: localizedVehicleTypes,
    loading,
    error: failed ? t("couldNotLoadTheVehicleTypes") : null,
  };
}
