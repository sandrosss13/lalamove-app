/**
 * The one canonical form a sign-in phone number takes: E.164 (`+995555123456`).
 *
 * `User.phoneNumber` is a unique sign-in identifier, so "the same number typed
 * two ways" must never become two accounts. Every number is passed through
 * `normalizePhoneNumber` before it reaches Better Auth's `phoneNumber` plugin,
 * which keys both the stored one-time code and the user lookup on the exact
 * string it is given.
 *
 * No runtime imports, so `tests/phone-number.spec.ts` pins it without a server.
 */

/** Georgia's country calling code — the default for a number typed nationally. */
const GEORGIA_CALLING_CODE = "995";

/** A Georgian national (significant) number is always nine digits. */
const GEORGIA_NATIONAL_LENGTH = 9;

/** Georgian mobile numbers start with 5; a national number is assumed mobile. */
const GEORGIA_MOBILE_PREFIX = "5";

/** E.164: `+`, a non-zero first digit, eight to fifteen digits in total. */
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/** Separators people type inside a number; anything else makes it invalid. */
const SEPARATORS = /[\s\-().]/g;

/** Whether a string is already in canonical E.164 form. */
export function isE164PhoneNumber(value: string): boolean {
  if (!E164_PATTERN.test(value)) {
    return false;
  }

  // A +995 number of the wrong length is a typo, not a foreign number.
  return (
    !value.startsWith(`+${GEORGIA_CALLING_CODE}`) ||
    value.length === 1 + GEORGIA_CALLING_CODE.length + GEORGIA_NATIONAL_LENGTH
  );
}

/**
 * Normalises what a person typed to E.164, or returns `null` when it cannot be
 * a phone number.
 *
 * Accepted spellings, all of which yield `+995555123456`:
 * `+995 555 12 34 56`, `00995555123456`, `995555123456`, `555 12-34-56`,
 * `0555123456` (the old trunk prefix). A number without a `+`/`00` prefix is
 * read as Georgian; any other country must be written internationally.
 */
export function normalizePhoneNumber(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const compact = input.trim().replace(SEPARATORS, "");
  let candidate: string;

  if (compact.startsWith("+")) {
    candidate = compact;
  } else if (compact.startsWith("00")) {
    candidate = `+${compact.slice(2)}`;
  } else if (
    compact.startsWith(GEORGIA_CALLING_CODE) &&
    compact.length === GEORGIA_CALLING_CODE.length + GEORGIA_NATIONAL_LENGTH
  ) {
    candidate = `+${compact}`;
  } else {
    const national = compact.startsWith("0") ? compact.slice(1) : compact;

    if (
      national.length !== GEORGIA_NATIONAL_LENGTH ||
      !national.startsWith(GEORGIA_MOBILE_PREFIX)
    ) {
      return null;
    }

    candidate = `+${GEORGIA_CALLING_CODE}${national}`;
  }

  return isE164PhoneNumber(candidate) ? candidate : null;
}
