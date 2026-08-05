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

import type { CargoCategory, VehicleCategory } from "@prisma/client";

import {
  CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES,
  CARGO_CATEGORY_LABELS,
} from "@/lib/cargo";
import { geocodeAddress, haversineDistanceKm, type LatLng } from "@/lib/geo";
import { prisma } from "@/lib/prisma";

/** Valid `CargoCategory` values — the label table is keyed by every one of them. */
const CARGO_CATEGORIES = Object.keys(CARGO_CATEGORY_LABELS) as CargoCategory[];

/**
 * Assumed average door-to-door speed, in km/h. The app has no traffic data, so
 * the time component of a fare is derived from distance at this flat rate.
 */
const AVERAGE_SPEED_KMH = 30;

const MINUTES_PER_HOUR = 60;

/** The fields every freight quote is computed from. */
export type QuoteInput = {
  pickupAddress: string;
  dropoffAddress: string;
  /** `VehicleTypeSpec.code`, e.g. "BOX_TRUCK". */
  vehicleTypeCode: string;
  cargoCategory: CargoCategory;
  requiresHelper: boolean;
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
  distanceKm: number;
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
    requiresHelper,
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

  // Optional: an omitted helper request means "no helper", but a present value
  // of the wrong type is a client bug worth reporting rather than coercing.
  if (requiresHelper !== undefined && typeof requiresHelper !== "boolean") {
    return { error: "requiresHelper must be a boolean." };
  }

  return {
    data: {
      pickupAddress: pickupAddress.trim(),
      dropoffAddress: dropoffAddress.trim(),
      vehicleTypeCode: vehicleTypeCode.trim(),
      cargoCategory: cargoCategory as CargoCategory,
      requiresHelper: requiresHelper ?? false,
    },
  };
}

/**
 * Resolve the vehicle type and its rates, check the cargo may travel in it,
 * geocode both addresses, then derive distance and the itemised price.
 *
 * The vehicle and cargo checks come first because they are a cheap local
 * query — no point spending two LocationIQ lookups on a request that cannot be
 * quoted anyway. Both geocode lookups are then issued together; pickup is
 * reported first when neither resolves, matching the order the user filled the
 * form in.
 */
export async function estimateDelivery({
  pickupAddress,
  dropoffAddress,
  vehicleTypeCode,
  cargoCategory,
  requiresHelper,
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

  const distanceKm = haversineDistanceKm(pickup, dropoff);
  const estimatedMinutes = (distanceKm / AVERAGE_SPEED_KMH) * MINUTES_PER_HOUR;

  const rule = spec.pricingRule;
  const baseFare = roundCurrency(rule.baseFare);
  const distanceFare = roundCurrency(distanceKm * rule.pricePerKm);
  const timeFare = roundCurrency(estimatedMinutes * rule.pricePerMinute);
  const helperFee = requiresHelper ? roundCurrency(rule.helperFee) : 0;

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
