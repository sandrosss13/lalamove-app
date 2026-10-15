/**
 * Body validation for `POST /api/saved-addresses` and
 * `PATCH /api/saved-addresses/[id]`, plus the address normalisation duplicate
 * detection compares on.
 *
 * Hand-rolled like the saved-cards parser (the project has no validation
 * library). Every field is read by name — the body is never spread into a
 * write — so only the columns listed in `SavedAddressInput` can reach the
 * database.
 *
 * The rules, per the contract (`./contract.ts`):
 * - A wrong *type* is a 400. A string that is merely too long is trimmed and
 *   cut to its `STOP_CONTACT_MAX_LENGTHS` bound (the label to
 *   `SAVED_ADDRESS_LABEL_MAX_LENGTH`) rather than refused: the values come
 *   from a booking the server already accepted, so refusing to remember them
 *   would only lose the client's input.
 * - `address` is the exception: cutting an address would save a different
 *   place, so one over `SAVED_ADDRESS_MAX_LENGTH` is refused.
 * - `floor` is a finite number truncated to a whole one and clamped to
 *   0-`MAX_FLOOR`, the same range the booking parser holds a stop's floor to.
 * - Phone numbers are kept as typed (trimmed only), exactly as an order's stop
 *   contact phone is: the booking form refills from this row, so the two must
 *   agree.
 *
 * **Pure, deliberately** — a function of its input and a translator, exercised
 * by `tests/saved-addresses-input.spec.ts` with no server and no database. The
 * one transitive Prisma import (`MAX_FLOOR` from `src/lib/pricing.ts`) is a
 * client instance that is never queried here. Not for client components: use
 * `./contract.ts` there.
 */

import type { RequestTranslator } from "@/i18n/request-locale";
import { STOP_CONTACT_MAX_LENGTHS } from "@/lib/orders/stop-contact-limits";
import { MAX_FLOOR } from "@/lib/pricing";

import {
  SAVED_ADDRESS_LABEL_MAX_LENGTH,
  type SavedAddressInput,
} from "./contract";

/**
 * Longest accepted address string. Orders bound no address length of their
 * own; this is a sanity bound against a runaway body, well above any real
 * geocoded address.
 */
export const SAVED_ADDRESS_MAX_LENGTH = 500;

/** The string fields cut to a stop-contact bound, with that bound. */
const CONTACT_TEXT_FIELDS = {
  contactName: STOP_CONTACT_MAX_LENGTHS.name,
  contactPhone: STOP_CONTACT_MAX_LENGTHS.phone,
  buildingName: STOP_CONTACT_MAX_LENGTHS.buildingName,
  entrance: STOP_CONTACT_MAX_LENGTHS.entrance,
  comment: STOP_CONTACT_MAX_LENGTHS.comment,
} as const satisfies Partial<Record<keyof SavedAddressInput, number>>;

const BOOLEAN_FIELDS = ["passengerElevator", "cargoElevator"] as const;

type ParseResult<T> = { data: T } | { error: string };

/**
 * The key duplicates are compared on: trimmed, runs of whitespace collapsed to
 * one space, lower-cased. "  Rustaveli Ave 12 " and "rustaveli  ave 12" are
 * the same saved address.
 */
export function normaliseAddressKey(address: string): string {
  return address.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The label a row is stored with: the client's own, or — when they left it
 * blank — the address, cut to the label bound so every stored label honours
 * `SAVED_ADDRESS_LABEL_MAX_LENGTH`.
 */
export function resolveLabel(label: string, address: string): string {
  const own = label.trim();
  return (own.length > 0 ? own : address.trim()).slice(
    0,
    SAVED_ADDRESS_LABEL_MAX_LENGTH,
  );
}

/** Optional text: absent/null → "", otherwise trimmed and cut to `max`. */
function parseText(
  value: unknown,
  field: string,
  max: number,
  t: RequestTranslator,
): { value: string } | { error: string } {
  if (value === undefined || value === null) {
    return { value: "" };
  }
  if (typeof value !== "string") {
    return { error: t("errors.savedAddresses.fieldMustBeString", { field }) };
  }
  return { value: value.trim().slice(0, max) };
}

function parseAddress(
  value: unknown,
  t: RequestTranslator,
): { value: string } | { error: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { error: t("errors.savedAddresses.addressIsRequired") };
  }
  const trimmed = value.trim();
  if (trimmed.length > SAVED_ADDRESS_MAX_LENGTH) {
    return {
      error: t("errors.savedAddresses.addressTooLong", {
        max: SAVED_ADDRESS_MAX_LENGTH,
      }),
    };
  }
  return { value: trimmed };
}

function parseCoordinate(
  value: unknown,
  limit: number,
  t: RequestTranslator,
): { value: number | null } | { error: string } {
  if (value === undefined || value === null) {
    return { value: null };
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > limit
  ) {
    return { error: t("errors.savedAddresses.coordinatesInvalid") };
  }
  return { value };
}

function parseFloor(
  value: unknown,
  t: RequestTranslator,
): { value: number } | { error: string } {
  if (value === undefined || value === null) {
    return { value: 0 };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { error: t("errors.savedAddresses.floorMustBeANumber") };
  }
  return { value: Math.min(MAX_FLOOR, Math.max(0, Math.trunc(value))) };
}

/**
 * Validate a body. With `partial: false` (POST) every field resolves to a
 * value — an omitted optional one to its default — and `address` is required.
 * With `partial: true` (PATCH) only the fields the body carries are returned,
 * so an omitted field leaves the stored value alone.
 *
 * `label` is returned as submitted (trimmed, cut, possibly ""); the caller
 * resolves a blank one with `resolveLabel` once it knows the final address.
 * Latitude and longitude travel as a pair: if either ends up null, both do.
 */
export function parseSavedAddressBody(
  body: unknown,
  t: RequestTranslator,
  options: { partial: true },
): ParseResult<Partial<SavedAddressInput>>;
export function parseSavedAddressBody(
  body: unknown,
  t: RequestTranslator,
  options?: { partial?: false },
): ParseResult<SavedAddressInput>;
export function parseSavedAddressBody(
  body: unknown,
  t: RequestTranslator,
  options: { partial?: boolean } = {},
): ParseResult<Partial<SavedAddressInput>> {
  const partial = options.partial === true;

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: t("errors.savedAddresses.bodyMustBeAnObject") };
  }
  const record = body as Record<string, unknown>;
  const has = (key: string) => !partial || record[key] !== undefined;
  const data: Partial<SavedAddressInput> = {};

  if (has("address")) {
    const address = parseAddress(record.address, t);
    if ("error" in address) return address;
    data.address = address.value;
  }

  if (has("label")) {
    const label = parseText(
      record.label,
      "label",
      SAVED_ADDRESS_LABEL_MAX_LENGTH,
      t,
    );
    if ("error" in label) return label;
    data.label = label.value;
  }

  if (has("lat") || has("lng")) {
    const lat = parseCoordinate(record.lat, 90, t);
    if ("error" in lat) return lat;
    const lng = parseCoordinate(record.lng, 180, t);
    if ("error" in lng) return lng;
    const paired = lat.value !== null && lng.value !== null;
    data.lat = paired ? lat.value : null;
    data.lng = paired ? lng.value : null;
  }

  for (const [field, max] of Object.entries(CONTACT_TEXT_FIELDS) as [
    keyof typeof CONTACT_TEXT_FIELDS,
    number,
  ][]) {
    if (!has(field)) continue;
    const text = parseText(record[field], field, max, t);
    if ("error" in text) return text;
    data[field] = text.value;
  }

  if (has("floor")) {
    const floor = parseFloor(record.floor, t);
    if ("error" in floor) return floor;
    data.floor = floor.value;
  }

  for (const field of BOOLEAN_FIELDS) {
    if (!has(field)) continue;
    const value = record[field];
    if (value === undefined || value === null) {
      data[field] = false;
    } else if (typeof value === "boolean") {
      data[field] = value;
    } else {
      return {
        error: t("errors.savedAddresses.fieldMustBeTrueOrFalse", { field }),
      };
    }
  }

  return { data };
}
