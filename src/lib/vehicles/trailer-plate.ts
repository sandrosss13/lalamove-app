/**
 * Trailer-plate validation, shared by the fleet and driver-profile vehicle
 * routes, the fleet PATCH route and their tests.
 *
 * `Vehicle.trailerPlateNumber` is optional: a vehicle that pulls a trailer
 * records its registration so the order-details document (waybill) can print
 * it. The rule is deliberately looser than `plateNumber`'s Georgian civilian
 * pattern because trailers carry foreign and legacy plates.
 *
 * Pure: no server-only imports, so Playwright specs can load it directly.
 */

import { normalizePlate } from "./plate";

/** Shortest and longest accepted trailer plate, after normalising. */
export const TRAILER_PLATE_MIN_LENGTH = 2;
export const TRAILER_PLATE_MAX_LENGTH = 15;

const TRAILER_PLATE_PATTERN = /^[A-Z0-9]+$/;

/**
 * Normalises a raw trailer-plate value.
 *
 * - `undefined`, `null`, or a blank/whitespace-only string → `{ value: null }`
 *   (no trailer; this is also how PATCH clears one).
 * - A string that, after `normalizePlate` drops hyphens and spaces, is 2–15
 *   characters from `[A-Z0-9]` → `{ value: <normalised> }`, the same
 *   normalisation `plateNumber` gets.
 * - Anything else (wrong type, too short/long, other characters) →
 *   `{ error: true }`; the caller phrases the message.
 */
export function parseTrailerPlate(
  raw: unknown,
): { value: string | null } | { error: true } {
  if (raw === undefined || raw === null) {
    return { value: null };
  }

  if (typeof raw !== "string") {
    return { error: true };
  }

  const plate = normalizePlate(raw);
  if (plate === "") {
    return { value: null };
  }

  if (
    plate.length < TRAILER_PLATE_MIN_LENGTH ||
    plate.length > TRAILER_PLATE_MAX_LENGTH ||
    !TRAILER_PLATE_PATTERN.test(plate)
  ) {
    return { error: true };
  }

  return { value: plate };
}
