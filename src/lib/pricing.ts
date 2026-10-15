/**
 * Shared freight-quote logic: the fields a price depends on, how they are
 * validated, and how they turn into a distance and an itemised price.
 *
 * Both the public estimate endpoint and order creation go through here so a
 * quote a visitor is shown matches the order they later book.
 *
 * Pricing model v1: the formulas are pure functions in
 * `src/lib/pricing-engine.ts` (re-exported below where callers already
 * imported them from here). This module is the Prisma-reading half: it loads
 * the vehicle's `PricingRule`, the `PricingConfig` singleton, the
 * `HelperFloorBand` rows and the `RouteAllowance` for the trip's city pair,
 * geocodes and routes, then hands everything to `computeQuote`.
 *
 * Server-only in practice — it reads pricing data through Prisma and pulls in
 * the geocoding module, which reads env vars. (Importing it without querying,
 * as the pure specs do for `parseQuoteFields`, touches no database.)
 */

import type { CargoCategory, VehicleCategory } from "@prisma/client";
import type { GeorgianCity, TripType } from "@prisma/client";

import type { RequestTranslator } from "@/i18n/request-locale";
import {
  CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES,
  CARGO_CATEGORY_LABELS,
} from "@/lib/cargo";
import {
  AVERAGE_SPEED_KMH,
  geocodeAddress,
  getRoute,
  haversineDistanceKm,
  type LatLng,
  type Route,
} from "@/lib/geo";
import { resolveGeorgianCity } from "@/lib/orders/resolve-city";
import {
  commissionRateFor,
  computeQuote,
  crewHelperCount,
  DEFAULT_HELPER_FLOOR_BANDS,
  DEFAULT_PRICING_CONFIG,
  hasUsableRates,
  isManualQuoteRequired,
  normaliseCityPair,
  NO_HELP,
  quoteExpiresAt,
  roundCurrency,
  serviceLevelAdjustment,
  type HelperFloorBandValues,
  type LocationHelp,
  type PriceBreakdown,
  type PricingConfigValues,
  type RouteAllowanceValues,
} from "@/lib/pricing-engine";
import { prisma } from "@/lib/prisma";

export {
  clientTotalForServiceLevel,
  POOLING_DISCOUNT,
  PRIORITY_UPLIFT,
  serviceLevelAdjustment,
  type LocationHelp,
  type PriceBreakdown,
} from "@/lib/pricing-engine";

/** Valid `CargoCategory` values — the label table is keyed by every one of them. */
const CARGO_CATEGORIES = Object.keys(CARGO_CATEGORY_LABELS) as CargoCategory[];

const MINUTES_PER_HOUR = 60;

/**
 * The most helpers bookable at ONE location that the parser accepts. The
 * admin-editable `PricingConfig.maxHelpers` may be lower and is enforced by
 * `estimateDelivery` (`helpers_out_of_range`); this is the hard bound.
 */
const MAX_HELPER_COUNT = 4;

/** A sanity bound on a location's floor (0 = ground floor). */
export const MAX_FLOOR = 100;

/** The fields every freight quote is computed from. */
export type QuoteInput = {
  pickupAddress: string;
  dropoffAddress: string;
  /** `VehicleTypeSpec.code`, e.g. "BOX_TRUCK". */
  vehicleTypeCode: string;
  cargoCategory: CargoCategory;
  /** Helpers, floor and cargo elevator at the pickup. */
  pickupHelp: LocationHelp;
  /** Helpers, floor and cargo elevator at the dropoff. */
  dropoffHelp: LocationHelp;
  /**
   * `max(pickupHelp.helpers, dropoffHelp.helpers)` — derived, kept so
   * `Order.helperCount` (dispatch, work preferences) stays populated. A legacy
   * client that sends only `helperCount` gets that many helpers at BOTH ends,
   * ground floor, no elevator.
   */
  helperCount: number;
  /**
   * The `tariffVersion` the client was shown with its quote, when it sent one.
   * Order creation refuses a stale one (`tariff_changed`); the estimate
   * endpoint ignores it.
   */
  tariffVersion: number | null;
};

/** Re-exported tier type: an alias of the generated `ServiceLevel` enum. */
export type ServiceLevelKey = import("@prisma/client").ServiceLevel;

/**
 * `amount` plus its tier adjustment. Under pricing model v1 the tier applies to
 * the TRANSPORT charge only, so pass `transportFare` and add helpers yourself —
 * or use `clientTotalForServiceLevel`, which does both.
 */
export function priceForServiceLevel(
  level: ServiceLevelKey,
  amount: number,
): number {
  return roundCurrency(amount + serviceLevelAdjustment(level, amount));
}

/** A resolved quote: both endpoints located, plus the derived numbers. */
export type DeliveryEstimate = {
  pickup: LatLng;
  dropoff: LatLng;
  /** Road distance when the route resolved, straight-line distance otherwise. */
  distanceKm: number;
  /** Expected driving time for `distanceKm`, on whichever of those two bases. */
  durationMinutes: number;
  /**
   * The road geometry to draw for this route, or `null` when routing was
   * unavailable and the quote fell back to straight-line distance.
   */
  routePath: LatLng[] | null;
  /** Resolved from `vehicleTypeCode`, so order creation need not look it up again. */
  vehicleTypeSpecId: string;
  /** The cities the two addresses resolved to (null when none matched). */
  pickupCity: GeorgianCity | null;
  dropoffCity: GeorgianCity | null;
  /** Client-facing itemised quote — carries no commission figure. */
  breakdown: PriceBreakdown;
  /**
   * The platform's rate for this vehicle and trip type. INTERNAL: never put it
   * in a client or driver response; order creation stamps it on the order.
   */
  commissionRate: number;
  /** `PricingConfig.tariffVersion` the quote was computed at. */
  tariffVersion: number;
  quotedAt: Date;
  /** `quotedAt + quoteValidityMinutes`. */
  quoteExpiresAt: Date;
  /**
   * The live helper-time rules (`PricingConfig`), so the booking form's
   * "extra helper time" note quotes what completion will actually bill.
   * Client-facing: they are published rates, not internal figures.
   */
  helperRules: HelperTimeRules;
};

/** The helper overtime rules a client is told about, from `PricingConfig`. */
export type HelperTimeRules = {
  /** Helper minutes per location included in the quoted helper fee. */
  includedMinutes: number;
  /** Overtime is charged per started increment of this many minutes... */
  overtimeIncrementMinutes: number;
  /** ...at this many GEL per helper per increment. */
  overtimeFeePerIncrement: number;
};

/** `HelperTimeRules` off a config row (or the engine defaults). */
export function helperTimeRulesOf(
  config: PricingConfigValues,
): HelperTimeRules {
  return {
    includedMinutes: config.helperIncludedMinutes,
    overtimeIncrementMinutes: config.helperOvertimeIncrementMinutes,
    overtimeFeePerIncrement: config.helperOvertimeFeePerIncrement,
  };
}

/**
 * Either a resolved estimate, or why one could not be produced — so every caller
 * can render the same errors without repeating the checks.
 */
export type DeliveryEstimateResult =
  | { ok: true; estimate: DeliveryEstimate }
  | { ok: false; reason: "unresolved_address"; unresolvedAddress: string }
  | { ok: false; reason: "invalid_vehicle_type" }
  | {
      ok: false;
      reason: "cargo_vehicle_mismatch";
      vehicleCategory: VehicleCategory;
      allowedVehicleCategories: VehicleCategory[];
    }
  | { ok: false; reason: "helpers_out_of_range"; maxHelpers: number }
  | {
      ok: false;
      reason: "manual_quote_required";
      distanceKm: number;
      thresholdKm: number;
    };

/** The HTTP status for a failed quote — shared by the estimate and order routes. */
export function quoteFailureStatus(
  failure: Extract<DeliveryEstimateResult, { ok: false }>,
): 400 | 422 {
  // An address the geocoder cannot place, or a route too long to price
  // automatically, is well-formed input the server could not act on (422);
  // everything else is bad input (400).
  return failure.reason === "unresolved_address" ||
    failure.reason === "manual_quote_required"
    ? 422
    : 400;
}

/* ------------------------------------------------------------------------- */
/* Tariff data                                                               */
/* ------------------------------------------------------------------------- */

/** The platform-wide tariff: config singleton plus helper floor bands. */
export type PricingTariff = {
  config: PricingConfigValues;
  bands: HelperFloorBandValues[];
};

/**
 * Read the `PricingConfig` singleton, falling back to `DEFAULT_PRICING_CONFIG`
 * when the row is missing (so an unseeded database still quotes).
 */
export async function loadPricingConfig(): Promise<PricingConfigValues> {
  const row = await prisma.pricingConfig.findUnique({ where: { id: 1 } });
  if (!row) {
    return { ...DEFAULT_PRICING_CONFIG };
  }
  return {
    intercityThresholdKm: row.intercityThresholdKm,
    manualQuoteThresholdKm: row.manualQuoteThresholdKm,
    defaultReturnAllowance: row.defaultReturnAllowance,
    quoteValidityMinutes: row.quoteValidityMinutes,
    tariffVersion: row.tariffVersion,
    maxHelpers: row.maxHelpers,
    helperIncludedMinutes: row.helperIncludedMinutes,
    helperOvertimeIncrementMinutes: row.helperOvertimeIncrementMinutes,
    helperOvertimeFeePerIncrement: row.helperOvertimeFeePerIncrement,
    elevatorDiscount: row.elevatorDiscount,
  };
}

/** Config plus floor bands (defaults when the band table is empty). */
export async function loadPricingTariff(): Promise<PricingTariff> {
  const [config, bandRows] = await Promise.all([
    loadPricingConfig(),
    prisma.helperFloorBand.findMany({
      select: { minFloor: true, ratePerHelper: true },
      orderBy: { minFloor: "asc" },
    }),
  ]);
  return {
    config,
    bands: bandRows.length > 0 ? bandRows : [...DEFAULT_HELPER_FLOOR_BANDS],
  };
}

/** The `RouteAllowance` rows that could apply to a pair (0 or 1 of them). */
async function loadRouteAllowances(
  pickupCity: GeorgianCity | null,
  dropoffCity: GeorgianCity | null,
): Promise<RouteAllowanceValues[]> {
  if (
    pickupCity === null ||
    dropoffCity === null ||
    pickupCity === dropoffCity
  ) {
    return [];
  }
  const [cityA, cityB] = normaliseCityPair(pickupCity, dropoffCity);
  const row = await prisma.routeAllowance.findUnique({
    where: { cityA_cityB: { cityA, cityB } },
    select: { cityA: true, cityB: true, allowance: true },
  });
  return row ? [row] : [];
}

/* ------------------------------------------------------------------------- */
/* Parsing                                                                   */
/* ------------------------------------------------------------------------- */

const LOCATION_FIELDS = [
  "pickupHelpers",
  "pickupFloor",
  "pickupCargoElevator",
  "dropoffHelpers",
  "dropoffFloor",
  "dropoffCargoElevator",
] as const;

/**
 * Hand-rolled validation of the quote fields (the project has no validation
 * library). Returns the trimmed, typed input or an error message describing the
 * first problem encountered. Shared so the public and authenticated endpoints
 * reject bad input identically.
 *
 * Helper fields (pricing model v1), all optional:
 * `pickupHelpers`/`dropoffHelpers` (whole 0-4), `pickupFloor`/`dropoffFloor`
 * (whole 0-`MAX_FLOOR`), `pickupCargoElevator`/`dropoffCargoElevator`
 * (boolean). When NONE of the six is sent, the legacy `helperCount` (0-4) is
 * mapped to that many helpers at both ends, ground floor, no elevator, so old
 * clients keep working. When any is sent, `helperCount` is still validated but
 * ignored, and an omitted field is 0 / false.
 *
 * `tariffVersion` (optional positive integer) is the version the client was
 * quoted at; see `QuoteInput.tariffVersion`.
 *
 * `t` localises the messages into the caller's request locale; without it the
 * English original is returned.
 */
export function parseQuoteFields(
  record: Record<string, unknown>,
  t?: RequestTranslator,
): { data: QuoteInput } | { error: string } {
  const message = (
    key: string,
    english: string,
    values?: Record<string, string | number>,
  ) => (t ? t(key, values) : english);

  const {
    pickupAddress,
    dropoffAddress,
    vehicleTypeCode,
    cargoCategory,
    helperCount,
    tariffVersion,
  } = record;

  if (typeof pickupAddress !== "string" || pickupAddress.trim().length === 0) {
    return {
      error: message(
        "common.pricing.pickupaddressIsRequired",
        "pickupAddress is required.",
      ),
    };
  }

  if (
    typeof dropoffAddress !== "string" ||
    dropoffAddress.trim().length === 0
  ) {
    return {
      error: message(
        "common.pricing.dropoffaddressIsRequired",
        "dropoffAddress is required.",
      ),
    };
  }

  if (
    typeof vehicleTypeCode !== "string" ||
    vehicleTypeCode.trim().length === 0
  ) {
    return {
      error: message(
        "common.shared.vehicletypecodeIsRequired",
        "vehicleTypeCode is required.",
      ),
    };
  }

  if (
    typeof cargoCategory !== "string" ||
    !CARGO_CATEGORIES.includes(cargoCategory as CargoCategory)
  ) {
    return {
      error: message(
        "common.pricing.cargoCategoryMustBeOneOf",
        `cargoCategory must be one of: ${CARGO_CATEGORIES.join(", ")}.`,
        { allowed: CARGO_CATEGORIES.join(", ") },
      ),
    };
  }

  // A present value outside the bookable range is a client bug worth
  // reporting rather than clamping — a silently reduced count would quote a
  // price nobody asked for.
  const isWholeInRange = (value: unknown, max: number): value is number =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max;

  if (
    helperCount !== undefined &&
    !isWholeInRange(helperCount, MAX_HELPER_COUNT)
  ) {
    return {
      error: message(
        "common.pricing.helperCountOutOfRange",
        `helperCount must be a whole number between 0 and ${MAX_HELPER_COUNT}.`,
        { max: MAX_HELPER_COUNT },
      ),
    };
  }

  const usesLocationFields = LOCATION_FIELDS.some(
    (field) => record[field] !== undefined,
  );

  let pickupHelp: LocationHelp;
  let dropoffHelp: LocationHelp;

  if (usesLocationFields) {
    const parsed: Partial<Record<"pickup" | "dropoff", LocationHelp>> = {};
    for (const end of ["pickup", "dropoff"] as const) {
      const helpers = record[`${end}Helpers`];
      const floor = record[`${end}Floor`];
      const elevator = record[`${end}CargoElevator`];

      if (helpers !== undefined && !isWholeInRange(helpers, MAX_HELPER_COUNT)) {
        return {
          error: message(
            "common.pricing.locationHelpersOutOfRange",
            `${end}Helpers must be a whole number between 0 and ${MAX_HELPER_COUNT}.`,
            { field: `${end}Helpers`, max: MAX_HELPER_COUNT },
          ),
        };
      }
      if (floor !== undefined && !isWholeInRange(floor, MAX_FLOOR)) {
        return {
          error: message(
            "common.pricing.floorOutOfRange",
            `${end}Floor must be a whole number between 0 and ${MAX_FLOOR}.`,
            { field: `${end}Floor`, max: MAX_FLOOR },
          ),
        };
      }
      if (elevator !== undefined && typeof elevator !== "boolean") {
        return {
          error: message(
            "common.pricing.cargoElevatorMustBeBoolean",
            `${end}CargoElevator must be true or false.`,
            { field: `${end}CargoElevator` },
          ),
        };
      }

      parsed[end] = {
        helpers: helpers ?? 0,
        floor: floor ?? 0,
        cargoElevator: elevator ?? false,
      };
    }
    pickupHelp = parsed.pickup ?? NO_HELP;
    dropoffHelp = parsed.dropoff ?? NO_HELP;
  } else {
    // LEGACY: one crew size, applied at both ends, ground floor, no elevator.
    const legacy = helperCount ?? 0;
    pickupHelp = { ...NO_HELP, helpers: legacy };
    dropoffHelp = { ...NO_HELP, helpers: legacy };
  }

  if (
    tariffVersion !== undefined &&
    tariffVersion !== null &&
    !(
      typeof tariffVersion === "number" &&
      Number.isInteger(tariffVersion) &&
      tariffVersion > 0
    )
  ) {
    return {
      error: message(
        "common.pricing.tariffVersionInvalid",
        "tariffVersion must be a positive whole number.",
      ),
    };
  }

  return {
    data: {
      pickupAddress: pickupAddress.trim(),
      dropoffAddress: dropoffAddress.trim(),
      vehicleTypeCode: vehicleTypeCode.trim(),
      cargoCategory: cargoCategory as CargoCategory,
      pickupHelp,
      dropoffHelp,
      helperCount: crewHelperCount(pickupHelp, dropoffHelp),
      tariffVersion: typeof tariffVersion === "number" ? tariffVersion : null,
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Estimate                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Resolve the vehicle type and its rates, check the cargo may travel in it,
 * check the helper counts against the config, geocode both addresses, route
 * between them, then derive the itemised price with `computeQuote`.
 *
 * Cheap local checks come first so no LocationIQ lookup is spent on a request
 * that cannot be quoted. Distance and duration come from the real driving
 * route where possible, degrading to `haversineDistanceKm` at
 * `AVERAGE_SPEED_KMH` when routing is unavailable.
 *
 * A route longer than `PricingConfig.manualQuoteThresholdKm` (600 km) is not
 * priced: it fails with `manual_quote_required`.
 *
 * The trip's cities are resolved from the address strings with
 * `resolveGeorgianCity` — the same resolution order creation writes into
 * `Order.pickupCity`/`dropoffCity`.
 *
 * `now` is injectable for tests; it stamps `quotedAt`.
 */
export async function estimateDelivery(
  {
    pickupAddress,
    dropoffAddress,
    vehicleTypeCode,
    cargoCategory,
    pickupHelp,
    dropoffHelp,
  }: QuoteInput,
  now: Date = new Date(),
): Promise<DeliveryEstimateResult> {
  const [spec, tariff] = await Promise.all([
    prisma.vehicleTypeSpec.findUnique({
      where: { code: vehicleTypeCode },
      include: { pricingRule: true },
    }),
    loadPricingTariff(),
  ]);

  // A type with no pricing rule cannot be quoted at all. The seed always creates
  // one, so this only guards against hand-edited data. Nor can one whose v1
  // rate columns were never filled (they default to 0): an intercity per-km or
  // a city minimum of 0 would quote a haul at next to nothing — see
  // `hasUsableRates`.
  if (!spec?.pricingRule || !hasUsableRates(spec.pricingRule)) {
    return { ok: false, reason: "invalid_vehicle_type" };
  }

  const allowedVehicleCategories =
    CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[cargoCategory];
  if (!allowedVehicleCategories.includes(spec.category)) {
    return {
      ok: false,
      reason: "cargo_vehicle_mismatch",
      vehicleCategory: spec.category,
      allowedVehicleCategories,
    };
  }

  const { config, bands } = tariff;
  if (
    pickupHelp.helpers > config.maxHelpers ||
    dropoffHelp.helpers > config.maxHelpers
  ) {
    return {
      ok: false,
      reason: "helpers_out_of_range",
      maxHelpers: config.maxHelpers,
    };
  }

  const [pickup, dropoff] = await Promise.all([
    geocodeAddress(pickupAddress),
    geocodeAddress(dropoffAddress),
  ]);

  if (!pickup) {
    return {
      ok: false,
      reason: "unresolved_address",
      unresolvedAddress: pickupAddress,
    };
  }

  if (!dropoff) {
    return {
      ok: false,
      reason: "unresolved_address",
      unresolvedAddress: dropoffAddress,
    };
  }

  const route: Route | null = await getRoute(pickup, dropoff);

  const distanceKm = route
    ? route.distanceKm
    : haversineDistanceKm(pickup, dropoff);
  const durationMinutes = route
    ? route.durationMinutes
    : (distanceKm / AVERAGE_SPEED_KMH) * MINUTES_PER_HOUR;
  const routePath = route?.path ?? null;

  // On the straight-line fallback (no road route) the distance understates the
  // drive, so the manual-quote check scales it by `ROAD_DETOUR_FACTOR`: a
  // routing outage must not auto-quote a haul over the threshold.
  if (
    isManualQuoteRequired(distanceKm, config.manualQuoteThresholdKm, {
      straightLine: route === null,
    })
  ) {
    return {
      ok: false,
      reason: "manual_quote_required",
      distanceKm,
      thresholdKm: config.manualQuoteThresholdKm,
    };
  }

  const pickupCity = resolveGeorgianCity(pickupAddress);
  const dropoffCity = resolveGeorgianCity(dropoffAddress);
  const routes = await loadRouteAllowances(pickupCity, dropoffCity);

  const rule = spec.pricingRule;
  const breakdown = computeQuote(
    {
      distanceKm,
      durationMinutes,
      pickupCity,
      dropoffCity,
      pickupHelp,
      dropoffHelp,
    },
    { rates: rule, config, bands, routes },
  );
  const tripType: TripType = breakdown.tripType;

  return {
    ok: true,
    estimate: {
      pickup,
      dropoff,
      distanceKm,
      durationMinutes,
      routePath,
      vehicleTypeSpecId: spec.id,
      pickupCity,
      dropoffCity,
      breakdown,
      commissionRate: commissionRateFor(rule, tripType),
      tariffVersion: config.tariffVersion,
      quotedAt: now,
      quoteExpiresAt: quoteExpiresAt(now, config.quoteValidityMinutes),
      helperRules: helperTimeRulesOf(config),
    },
  };
}

/**
 * The user-facing message for a failed quote. Shared so the public estimate
 * endpoint and order creation report the same problem in the same words; the
 * HTTP status is `quoteFailureStatus`.
 *
 * `t` localises it into the request locale; without one the English original
 * is returned.
 */
export function quoteFailureMessage(
  failure: Extract<DeliveryEstimateResult, { ok: false }>,
  t?: RequestTranslator,
): string {
  switch (failure.reason) {
    case "unresolved_address":
      return t
        ? t("common.pricing.couldNotLocateAddress", {
            address: failure.unresolvedAddress,
          })
        : `Could not locate address: ${failure.unresolvedAddress}`;
    case "invalid_vehicle_type":
      return t
        ? t("common.pricing.vehicleTypeCodeMustBeKnown")
        : "vehicleTypeCode must be a known vehicle type.";
    case "cargo_vehicle_mismatch":
      return t
        ? t("common.pricing.cargoVehicleMismatch", {
            vehicleCategory: failure.vehicleCategory,
            allowedCategories: failure.allowedVehicleCategories.join(" or "),
          })
        : `This cargo category cannot be booked with a ${failure.vehicleCategory} ` +
            `vehicle; it requires ${failure.allowedVehicleCategories.join(" or ")}.`;
    case "helpers_out_of_range":
      return t
        ? t("common.pricing.locationHelpersOutOfRange", {
            field: "helpers",
            max: failure.maxHelpers,
          })
        : `helpers must be a whole number between 0 and ${failure.maxHelpers}.`;
    case "manual_quote_required":
      return t
        ? t("common.pricing.manualQuoteRequired", {
            km: failure.thresholdKm,
          })
        : `This route is longer than ${failure.thresholdKm} km, so it cannot be ` +
            "priced automatically. Please contact support for a quote.";
  }
}
