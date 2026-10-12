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

/** Shortest and longest accepted trailer plate, after trimming. */
export const TRAILER_PLATE_MIN_LENGTH = 2;
export const TRAILER_PLATE_MAX_LENGTH = 15;

const TRAILER_PLATE_PATTERN = /^[A-Za-z0-9\- ]+$/;

/**
 * Normalises a raw trailer-plate value.
 *
 * - `undefined`, `null`, or a blank/whitespace-only string → `{ value: null }`
 *   (no trailer; this is also how PATCH clears one).
 * - A trimmed string of 2–15 characters from `[A-Za-z0-9- ]` →
 *   `{ value: <upper-cased> }`, the same normalisation `plateNumber` gets.
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

  const trimmed = raw.trim();
  if (trimmed === "") {
    return { value: null };
  }

  if (
    trimmed.length < TRAILER_PLATE_MIN_LENGTH ||
    trimmed.length > TRAILER_PLATE_MAX_LENGTH ||
    !TRAILER_PLATE_PATTERN.test(trimmed)
  ) {
    return { error: true };
  }

  return { value: trimmed.toUpperCase() };
}
