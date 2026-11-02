/**
 * Validation for a card's **display metadata** — brand, last four digits,
 * expiry and holder name — and the tripwire that refuses anything that could be
 * a full card number or security code.
 *
 * Two routes accept card metadata and must agree on what is acceptable:
 *
 * - `POST /api/saved-cards`, which stores it on a `SavedCard`; and
 * - `POST /api/orders/[id]/pay`, where a guest pays with a **one-off** card
 *   whose brand and last four are recorded on the `Payment` and nowhere else.
 *
 * Both used to be one route's inline code; this is that code moved, message for
 * message, so a card the wallet refuses is a card checkout refuses too.
 *
 * **No payment gateway exists.** The card number and security code are typed in
 * the browser, used there to derive the brand and last four, and discarded.
 * Nothing here can charge a card, and nothing here may ever receive the number
 * that would let somebody else charge it — hence `containsCardDetails`.
 *
 * Pure: no Prisma, no `server-only`, no request state, so it is unit-testable
 * with a fake translator.
 */

import type { RequestTranslator } from "@/i18n/request-locale";

/** Longest accepted card brand — "Mastercard" and friends are far shorter. */
export const MAX_CARD_BRAND_LENGTH = 32;

/** Longest accepted cardholder name, matching what an embossed card holds. */
export const MAX_CARD_HOLDER_NAME_LENGTH = 120;

/**
 * Body keys that would carry a full card number or a security code, normalised
 * to lower case with separators stripped so `card_number`, `card-number` and
 * `cardNumber` all collapse onto the same entry.
 */
const FORBIDDEN_CARD_KEYS = new Set([
  "number",
  "cardnumber",
  "pan",
  "cvc",
  "cvv",
  "securitycode",
]);

/**
 * A run of digits long enough to be a card number, in any script. The shortest
 * PAN in issue is twelve digits (Maestro), so twelve is the threshold: no
 * legitimate card field — a four-digit ending, a two-digit month, a four-digit
 * year — comes anywhere near it.
 *
 * `\p{Nd}` rather than `[0-9]` because a PAN keyed on an Arabic-Indic or
 * fullwidth keypad is still a PAN, and an ASCII-only class would wave it past.
 */
const PAN_LIKE_DIGITS = /\p{Nd}{12,}/u;

/**
 * The key of the single message every tripwire rejection answers with. It
 * names the rule rather than the field, because the fix is always the same:
 * derive the brand and the last four in the browser and send only those.
 */
export const CARD_DETAILS_REJECTED_KEY =
  "errors.savedCards.cardDetailsMustNotBeSent";

/** Normalises a body key for comparison against `FORBIDDEN_CARD_KEYS`. */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * True when a string could be carrying a card number. Every non-digit is
 * stripped before the run test, rather than a named few, so a PAN typed as
 * "4111 1111 1111 1111", "4111-1111-1111-1111" or "4111.1111.1111.1111" is
 * caught as readily as an unbroken one — the separator a caller reaches for is
 * not something this tripwire can afford to enumerate.
 */
function looksLikeCardNumber(value: string): boolean {
  const digits = value.replace(/[^\p{Nd}]/gu, "");

  return PAN_LIKE_DIGITS.test(digits);
}

/**
 * Walks a decoded JSON value looking for anything resembling a full card
 * number or a security code — a forbidden key at any depth, or a long digit
 * run in any string or number.
 *
 * This is a tripwire, not a validator. No gateway exists, so a PAN reaching
 * this server would be a PAN nobody meant to accept and nobody can protect. A
 * caller that forgets the rule should fail loudly on its first request rather
 * than quietly persist cardholder data, so the whole request is refused instead
 * of the offending field being dropped.
 *
 * Run it on the part of a body that is *about a card*. A whole pay body also
 * carries a guest's phone number, which is short of the twelve-digit threshold
 * in its national form but not necessarily in E.164 with a long country code —
 * scanning the card object alone keeps the tripwire from mistaking a phone for
 * a PAN.
 */
export function containsCardDetails(value: unknown): boolean {
  if (typeof value === "string") {
    return looksLikeCardNumber(value);
  }

  // A PAN sent as a JSON number loses precision but is still a PAN, so numbers
  // are checked through the same digit-run test.
  if (typeof value === "number") {
    return looksLikeCardNumber(String(value));
  }

  if (Array.isArray(value)) {
    return value.some(containsCardDetails);
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, entry]) =>
        FORBIDDEN_CARD_KEYS.has(normaliseKey(key)) ||
        containsCardDetails(entry),
    );
  }

  return false;
}

/** A card's display metadata, validated and in its stored form. */
export type CardMetadataInput = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName: string | null;
};

/** True for a whole number safely representable as a JavaScript integer. */
function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * True when an expiry has already passed. A card is valid to the last day of
 * its expiry month, so the comparison is month-granular rather than day-exact.
 */
function hasExpired(expMonth: number, expYear: number, now: Date): boolean {
  const currentYear = now.getFullYear();
  // `getMonth()` is zero-based; the stored month is one-based.
  const currentMonth = now.getMonth() + 1;

  return (
    expYear < currentYear ||
    (expYear === currentYear && expMonth < currentMonth)
  );
}

/**
 * Hand-rolled validation of a card's display metadata (the project has no
 * validation library). Returns the typed input or the first problem found,
 * translated.
 *
 * Every field is read by name — the value is never spread into a write — so
 * only these five values can ever reach the database. Does **not** run
 * `containsCardDetails`; callers run the tripwire first, before anything is
 * parsed or logged.
 *
 * `now` is injectable for tests; it decides whether the expiry has passed.
 */
export function parseCardMetadata(
  value: unknown,
  t: RequestTranslator,
  now: Date = new Date(),
): { data: CardMetadataInput } | { error: string } {
  // A JSON value of `null`, `[]` or a scalar has no fields to read.
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  const fields = value as Record<string, unknown>;

  const brand = typeof fields.brand === "string" ? fields.brand.trim() : "";
  if (brand === "") {
    return { error: t("errors.savedCards.enterTheCardBrand") };
  }

  if (brand.length > MAX_CARD_BRAND_LENGTH) {
    return {
      error: t("errors.savedCards.cardBrandTooLong", {
        max: MAX_CARD_BRAND_LENGTH,
      }),
    };
  }

  const last4 = typeof fields.last4 === "string" ? fields.last4.trim() : "";
  if (!/^[0-9]{4}$/.test(last4)) {
    return { error: t("errors.savedCards.enterAFourDigitCardEnding") };
  }

  const { expMonth, expYear } = fields;

  if (!isInteger(expMonth) || expMonth < 1 || expMonth > 12) {
    return { error: t("errors.savedCards.enterAnExpiryMonthBetween1") };
  }

  if (!isInteger(expYear) || expYear < 1000 || expYear > 9999) {
    return { error: t("errors.savedCards.enterAFourDigitExpiryYear") };
  }

  if (hasExpired(expMonth, expYear, now)) {
    return { error: t("errors.savedCards.thatCardHasExpiredAddA") };
  }

  const { holderName } = fields;
  if (
    holderName !== undefined &&
    holderName !== null &&
    typeof holderName !== "string"
  ) {
    return { error: t("errors.savedCards.enterTheCardholderNameAsIt") };
  }

  const trimmedHolderName =
    typeof holderName === "string" ? holderName.trim() : "";
  if (trimmedHolderName.length > MAX_CARD_HOLDER_NAME_LENGTH) {
    return {
      error: t("errors.savedCards.cardholderNameTooLong", {
        max: MAX_CARD_HOLDER_NAME_LENGTH,
      }),
    };
  }

  return {
    data: {
      brand,
      last4,
      expMonth,
      expYear,
      holderName: trimmedHolderName === "" ? null : trimmedHolderName,
    },
  };
}
