/**
 * Shared delivery-quote logic: the three inputs a price depends on, how they
 * are validated, and how they turn into a distance and a price.
 *
 * Both the public estimate endpoint and authenticated order creation go through
 * here so a quote a visitor is shown matches the order they later book.
 *
 * Server-only — it pulls in the geocoding module, which reads env vars.
 */

import { PackageType } from "@prisma/client";

import {
  calculatePrice,
  geocodeAddress,
  haversineDistanceKm,
  type LatLng,
} from "@/lib/geo";

/** Valid `PackageType` values, derived from the generated Prisma enum. */
const PACKAGE_TYPES = Object.values(PackageType);

/** The fields every delivery quote is computed from. */
export type QuoteInput = {
  pickupAddress: string;
  dropoffAddress: string;
  packageType: PackageType;
};

/** A resolved quote: both endpoints located, plus the derived numbers. */
export type DeliveryEstimate = {
  pickup: LatLng;
  dropoff: LatLng;
  distanceKm: number;
  price: number;
};

/**
 * Either a resolved estimate, or the address that could not be geocoded — so
 * every caller can render the same "could not locate" error without repeating
 * the null-checking.
 */
export type DeliveryEstimateResult =
  | { ok: true; estimate: DeliveryEstimate }
  | { ok: false; unresolvedAddress: string };

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
  const { pickupAddress, dropoffAddress, packageType } = record;

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
    typeof packageType !== "string" ||
    !PACKAGE_TYPES.includes(packageType as PackageType)
  ) {
    return {
      error: `packageType must be one of: ${PACKAGE_TYPES.join(", ")}.`,
    };
  }

  return {
    data: {
      pickupAddress: pickupAddress.trim(),
      dropoffAddress: dropoffAddress.trim(),
      packageType: packageType as PackageType,
    },
  };
}

/**
 * Geocode both addresses, then derive distance and price. Both lookups are
 * issued together so a failure short-circuits before any further work; pickup
 * is reported first when both are unresolvable, matching the order the user
 * filled the form in.
 */
export async function estimateDelivery({
  pickupAddress,
  dropoffAddress,
  packageType,
}: QuoteInput): Promise<DeliveryEstimateResult> {
  const [pickup, dropoff] = await Promise.all([
    geocodeAddress(pickupAddress),
    geocodeAddress(dropoffAddress),
  ]);

  if (!pickup) {
    return { ok: false, unresolvedAddress: pickupAddress };
  }

  if (!dropoff) {
    return { ok: false, unresolvedAddress: dropoffAddress };
  }

  const distanceKm = haversineDistanceKm(pickup, dropoff);

  return {
    ok: true,
    estimate: {
      pickup,
      dropoff,
      distanceKm,
      price: calculatePrice(distanceKm, packageType),
    },
  };
}
