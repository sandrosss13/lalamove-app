/**
 * The one rule for `ClientProfile.legalAddress` — a BUSINESS client's
 * registered (legal) address, printed as the CLIENT block on the order-details
 * document.
 *
 * Shared by its three callers so they cannot drift apart:
 *
 * - `POST /api/client-profile` — the authority. It refuses a too-long value
 *   with a 400 and stores whatever this returns.
 * - The sign-up form's business step and the `/account` profile form — a
 *   courtesy check before the request, so the visitor sees the message against
 *   the field instead of as a form-level alert after a round trip.
 *
 * Pure and dependency-free on purpose: the two forms are client components, so
 * this file must not reach for Prisma or anything server-only, and it is
 * covered by `tests/client-legal-address.spec.ts` without a server.
 *
 * Returns a reason code rather than a message, the same way
 * `parseDriverPersonalId` does: the route maps it onto
 * `errors.clientProfile.*` and the forms onto their own namespaces, each in the
 * request's locale.
 */

/**
 * Upper bound, in characters, after trimming. Generous for any Georgian
 * address (street, building, city, postcode) while keeping the document's
 * CLIENT block to a few lines.
 */
export const LEGAL_ADDRESS_MAX_LENGTH = 300;

/** Why a submitted legal address was refused. */
export type LegalAddressError = "notAString" | "tooLong";

/**
 * Parses an optional legal address:
 *
 * - absent, `null`, empty or whitespace-only → `{ legalAddress: null }` — the
 *   field is optional, and blank means "clear it", never an empty string in
 *   the column;
 * - a string → trimmed, and refused as `"tooLong"` past
 *   `LEGAL_ADDRESS_MAX_LENGTH` (measured after trimming, so stray padding is
 *   never what tips a value over the limit);
 * - anything else (a number, an object) → `"notAString"`.
 *
 * Whether the value applies at all — BUSINESS only — is the caller's decision,
 * not this function's: it knows nothing about account types.
 */
export function parseLegalAddress(
  value: unknown,
): { legalAddress: string | null } | { error: LegalAddressError } {
  if (value === undefined || value === null) {
    return { legalAddress: null };
  }

  if (typeof value !== "string") {
    return { error: "notAString" };
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return { legalAddress: null };
  }

  if (trimmed.length > LEGAL_ADDRESS_MAX_LENGTH) {
    return { error: "tooLong" };
  }

  return { legalAddress: trimmed };
}
