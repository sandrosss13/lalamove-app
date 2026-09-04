/**
 * Shared freight-quote logic: the fields a price depends on, how they are
 * validated, and how they turn into a distance and an itemised price.
 *
 * Both the public estimate endpoint and authenticated order creation go through
 * here so a quote a visitor is shown matches the order they later book.
 *
 * Rates are not hardcoded: every component comes from the `PricingRule` seeded
 * alongside the booked `VehicleTypeSpec`, so retuning prices is a data change.
 *
 * Server-only — it reads pricing data through Prisma and pulls in the geocoding
 * module, which reads env vars.
 */

// `ServiceLevel` is imported as a value, not just a type: the exhaustive switch
// in `serviceLevelAdjustment` matches on its enum members.
import { ServiceLevel } from "@prisma/client";
import type { CargoCategory, VehicleCategory } from "@prisma/client";

import {
  CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES,
  CARGO_CATEGORY_LABELS,
} from "@/lib/cargo";
import {
  geocodeAddress,
  getRoute,
  haversineDistanceKm,
  type LatLng,
  type Route,
} from "@/lib/geo";
import { prisma } from "@/lib/prisma";

/** Valid `CargoCategory` values — the label table is keyed by every one of them. */
const CARGO_CATEGORIES = Object.keys(CARGO_CATEGORY_LABELS) as CargoCategory[];

/**
 * Assumed average door-to-door speed, in km/h, used *only* on the fallback path.
 *
 * Distance and duration normally come from LocationIQ's directions endpoint,
 * which reports a real driving time for the real road route. This flat rate is
 * what a fare's time component is derived from when routing is unavailable and
 * the quote falls back to straight-line distance — see `estimateDelivery`.
 */
const AVERAGE_SPEED_KMH = 30;

const MINUTES_PER_HOUR = 60;

/** The most extra helpers a single booking may request beyond the driver. */
const MAX_HELPER_COUNT = 3;

/** The fields every freight quote is computed from. */
export type QuoteInput = {
  pickupAddress: string;
  dropoffAddress: string;
  /** `VehicleTypeSpec.code`, e.g. "BOX_TRUCK". */
  vehicleTypeCode: string;
  cargoCategory: CargoCategory;
  /**
   * Extra helpers requested *beyond* the driver, 0-3. The booking form asks for
   * a total crew size of 1-4 people, where 1 is the driver working alone, so the
   * number the client picks is always this one plus one — the wire carries the
   * extras, because that is what the per-helper fee multiplies.
   */
  helperCount: number;
};

/**
 * The itemised quote. Kept itemised (rather than a single total) so an order can
 * store how its price was reached, and still show that after the underlying
 * `PricingRule` is retuned.
 */
export type PriceBreakdown = {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  helperFee: number;
  /** Sum of the components above, floored at the rule's `minimumFare`. */
  price: number;
};

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
   * unavailable and the quote fell back to straight-line distance — callers
   * draw a direct line between the endpoints in that case.
   */
  routePath: LatLng[] | null;
  /** Resolved from `vehicleTypeCode`, so order creation need not look it up again. */
  vehicleTypeSpecId: string;
  breakdown: PriceBreakdown;
};

/**
 * Either a resolved estimate, or why one could not be produced — so every caller
 * can render the same errors without repeating the checks. The mismatch case
 * carries both sides of the conflict so callers can name them in the message.
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
    };

/** Round a currency amount to whole cents. */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

// Service-level tiers.
//
// The design prototype used a flat +25 for Priority. A flat fee is wrong across this
// catalogue: +25 is a 200% uplift on an MPV (GEL 12 minimum fare) and 28% on a trailer
// truck (GEL 90). Percentages scale with the job, which is what the tier is actually
// pricing.
//
// These are the rate owner's rule, recorded 2026-09-04: Priority adds a quarter
// of the quoted fare, Pooling takes a tenth off it. Percentages rather than flat
// amounts for the reason above, and they are deliberately asymmetric — a premium
// has to be worth charging for, whereas the discount only has to be worth
// accepting a wider window for.
//
// Still open, and tracked in specs/client-dashboard-booking-and-payment/
// action-required.md: whether the adjustment reaches the driver, the platform,
// or is split. Nothing here depends on that answer — the client is charged the
// same either way — but src/lib/dashboard/hub/earnings.ts and the driver hub's
// "Paid to you" figure do, and they must move together when it lands.
export const PRIORITY_UPLIFT = 0.25; // +25% of the quoted fare
export const POOLING_DISCOUNT = 0.1; // −10% of the quoted fare

/**
 * The tier a fare is priced at. An alias of the generated `ServiceLevel` enum
 * rather than a hand-written union: a fourth tier added to the schema must fail
 * the exhaustiveness checks here rather than drift silently past them.
 */
export type ServiceLevelKey = ServiceLevel;

/**
 * The tier's effect on an already-quoted fare, as a signed amount in GEL.
 *
 * Applied to the final fare — i.e. after the minimum-fare floor — so a Pooling
 * discount can take a job below the vehicle's minimum. That is intended: the client
 * is being paid to accept a wider window, and the floor exists to protect against
 * short-route underpricing, not against a deliberate discount.
 */
export function serviceLevelAdjustment(
  level: ServiceLevelKey,
  quotedPrice: number,
): number {
  switch (level) {
    case ServiceLevel.PRIORITY:
      return roundCurrency(quotedPrice * PRIORITY_UPLIFT);
    case ServiceLevel.POOLING:
      return roundCurrency(-quotedPrice * POOLING_DISCOUNT);
    case ServiceLevel.REGULAR:
      // Regular is the tier the quote is already priced at, so it adjusts by
      // nothing. Spelled out as its own case rather than left to the default,
      // which exists to catch tiers that do not yet have a rate.
      return 0;
    default: {
      // The whole point of this branch: a fourth tier added to the schema fails
      // to assign to `never` and breaks the build here, so nobody can ship a
      // service level that silently prices at no adjustment at all.
      const exhaustive: never = level;
      throw new Error(`Unhandled service level: ${String(exhaustive)}`);
    }
  }
}

/** The fare a client pays at `level`, given the fare quoted for Regular. */
export function priceForServiceLevel(
  level: ServiceLevelKey,
  quotedPrice: number,
): number {
  return roundCurrency(
    quotedPrice + serviceLevelAdjustment(level, quotedPrice),
  );
}

/**
 * Hand-rolled validation of the quote fields (the project has no validation
 * library, and this stage does not warrant adding one). Returns the trimmed,
 * typed input or an error message describing the first problem encountered.
 * Shared so the public and authenticated endpoints reject bad input
 * identically.
 */
export function parseQuoteFields(
  record: Record<string, unknown>,
): { data: QuoteInput } | { error: string } {
  const {
    pickupAddress,
    dropoffAddress,
    vehicleTypeCode,
    cargoCategory,
    helperCount,
  } = record;

  if (typeof pickupAddress !== "string" || pickupAddress.trim().length === 0) {
    return { error: "pickupAddress is required." };
  }

  if (
    typeof dropoffAddress !== "string" ||
    dropoffAddress.trim().length === 0
  ) {
    return { error: "dropoffAddress is required." };
  }

  if (
    typeof vehicleTypeCode !== "string" ||
    vehicleTypeCode.trim().length === 0
  ) {
    return { error: "vehicleTypeCode is required." };
  }

  if (
    typeof cargoCategory !== "string" ||
    !CARGO_CATEGORIES.includes(cargoCategory as CargoCategory)
  ) {
    return {
      error: `cargoCategory must be one of: ${CARGO_CATEGORIES.join(", ")}.`,
    };
  }

  // Optional: an omitted helper count means "driver alone", but a present value
  // outside the bookable range is a client bug worth reporting rather than
  // clamping — a silently reduced crew would quote a price nobody asked for.
  if (
    helperCount !== undefined &&
    (typeof helperCount !== "number" ||
      !Number.isInteger(helperCount) ||
      helperCount < 0 ||
      helperCount > MAX_HELPER_COUNT)
  ) {
    return {
      error: `helperCount must be a whole number between 0 and ${MAX_HELPER_COUNT}.`,
    };
  }

  return {
    data: {
      pickupAddress: pickupAddress.trim(),
      dropoffAddress: dropoffAddress.trim(),
      vehicleTypeCode: vehicleTypeCode.trim(),
      cargoCategory: cargoCategory as CargoCategory,
      helperCount: helperCount ?? 0,
    },
  };
}

/**
 * Resolve the vehicle type and its rates, check the cargo may travel in it,
 * geocode both addresses, route between them, then derive the itemised price.
 *
 * The vehicle and cargo checks come first because they are a cheap local
 * query — no point spending LocationIQ lookups on a request that cannot be
 * quoted anyway. Both geocode lookups are then issued together; pickup is
 * reported first when neither resolves, matching the order the user filled the
 * form in. Routing can only follow them, since it needs both coordinates.
 *
 * Distance and duration come from the real driving route where possible: road
 * distance in Tbilisi runs meaningfully longer than the straight line, so
 * quoting on great-circle distance systematically underprices. When routing is
 * unavailable — no key, endpoint down, rate-limited, no route found — the quote
 * degrades to `haversineDistanceKm` at `AVERAGE_SPEED_KMH` rather than failing:
 * an approximate price the customer can act on beats no price at all, and unlike
 * an address that cannot be geocoded, nothing here is missing that a fare needs.
 */
export async function estimateDelivery({
  pickupAddress,
  dropoffAddress,
  vehicleTypeCode,
  cargoCategory,
  helperCount,
}: QuoteInput): Promise<DeliveryEstimateResult> {
  const spec = await prisma.vehicleTypeSpec.findUnique({
    where: { code: vehicleTypeCode },
    include: { pricingRule: true },
  });

  // A type with no pricing rule cannot be quoted at all. The seed always creates
  // one, so this only guards against hand-edited data.
  if (!spec?.pricingRule) {
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

  // Both branches produce the same three figures, so the pricing below is
  // written once against them and never has to know which basis it got.
  const distanceKm = route
    ? route.distanceKm
    : haversineDistanceKm(pickup, dropoff);
  const estimatedMinutes = route
    ? route.durationMinutes
    : (distanceKm / AVERAGE_SPEED_KMH) * MINUTES_PER_HOUR;
  const routePath = route?.path ?? null;

  const rule = spec.pricingRule;
  const baseFare = roundCurrency(rule.baseFare);
  const distanceFare = roundCurrency(distanceKm * rule.pricePerKm);
  const timeFare = roundCurrency(estimatedMinutes * rule.pricePerMinute);
  // `rule.helperFee` is a *per-helper* rate, not a one-off flat fee: a booking
  // that asks for three helpers pays it three times. A count of 0 (the driver
  // working alone) therefore costs nothing, with no branch needed.
  const helperFee = roundCurrency(rule.helperFee * helperCount);

  // The floor keeps very short trips worth driving; loading/unloading overtime
  // is settled separately when the order is completed.
  const rawTotal = baseFare + distanceFare + timeFare + helperFee;
  const price = roundCurrency(Math.max(rawTotal, rule.minimumFare));

  return {
    ok: true,
    estimate: {
      pickup,
      dropoff,
      distanceKm,
      durationMinutes: estimatedMinutes,
      routePath,
      vehicleTypeSpecId: spec.id,
      breakdown: { baseFare, distanceFare, timeFare, helperFee, price },
    },
  };
}

/**
 * The user-facing message for a failed quote. Shared so the public estimate
 * endpoint and authenticated order creation report the same problem in the same
 * words; the HTTP status differs per case and stays with each caller.
 */
export function quoteFailureMessage(
  failure: Extract<DeliveryEstimateResult, { ok: false }>,
): string {
  switch (failure.reason) {
    case "unresolved_address":
      return `Could not locate address: ${failure.unresolvedAddress}`;
    case "invalid_vehicle_type":
      return "vehicleTypeCode must be a known vehicle type.";
    case "cargo_vehicle_mismatch":
      return (
        `This cargo category cannot be booked with a ${failure.vehicleCategory} ` +
        `vehicle; it requires ${failure.allowedVehicleCategories.join(" or ")}.`
      );
  }
}
