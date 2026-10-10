/**
 * What a driver may change about their own profile from the app — home base
 * and emergency contact — as a pure parser.
 *
 * No runtime dependency on Prisma, Next or `server-only`, so
 * `tests/driver-profile-rules.spec.ts` pins it without a server.
 */

import { normalizePhoneNumber } from "@/lib/phone-number";

/** The longest emergency contact name stored, after trimming. */
export const MAX_EMERGENCY_CONTACT_NAME_LENGTH = 100;

/** Georgia's calling code: an emergency contact is a Georgian number. */
const GEORGIAN_PREFIX = "+995";

/** The columns an update writes. A key that is absent is left untouched. */
export type DriverProfileChanges = {
  city?: string;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
};

export type DriverProfileRefusal =
  | { reason: "NOT_AN_OBJECT" }
  | { reason: "NOTHING_TO_UPDATE" }
  | { reason: "INVALID_CITY" }
  | {
      reason: "NOT_TEXT";
      field: "emergencyContactName" | "emergencyContactPhone";
    }
  | { reason: "NAME_TOO_LONG" }
  | { reason: "INVALID_PHONE" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A `PATCH` body as the columns to write, or why it is refused.
 *
 * Only the three fields named here are read; anything else in the body —
 * `firstName`, `phone`, `idNumber` — is ignored, not applied, so a client that
 * sends the whole profile back cannot change what is read-only.
 *
 * Null or blank clears an emergency-contact field. The phone is normalised to
 * E.164 and must be a Georgian mobile number, the design's "9-digit Georgian
 * number".
 */
export function parseDriverProfileUpdate(
  body: unknown,
  cities: readonly string[],
): { changes: DriverProfileChanges } | { refusal: DriverProfileRefusal } {
  if (!isRecord(body)) {
    return { refusal: { reason: "NOT_AN_OBJECT" } };
  }

  const changes: DriverProfileChanges = {};

  if (body.city !== undefined) {
    const { city } = body;

    if (typeof city !== "string" || !cities.includes(city)) {
      return { refusal: { reason: "INVALID_CITY" } };
    }

    changes.city = city;
  }

  if (body.emergencyContactName !== undefined) {
    const name = body.emergencyContactName;

    if (name !== null && typeof name !== "string") {
      return { refusal: { reason: "NOT_TEXT", field: "emergencyContactName" } };
    }

    const trimmed = name?.trim() ?? "";

    if (trimmed.length > MAX_EMERGENCY_CONTACT_NAME_LENGTH) {
      return { refusal: { reason: "NAME_TOO_LONG" } };
    }

    changes.emergencyContactName = trimmed === "" ? null : trimmed;
  }

  if (body.emergencyContactPhone !== undefined) {
    const phone = body.emergencyContactPhone;

    if (phone !== null && typeof phone !== "string") {
      return {
        refusal: { reason: "NOT_TEXT", field: "emergencyContactPhone" },
      };
    }

    if (phone === null || phone.trim() === "") {
      changes.emergencyContactPhone = null;
    } else {
      const normalized = normalizePhoneNumber(phone);

      if (normalized === null || !normalized.startsWith(GEORGIAN_PREFIX)) {
        return { refusal: { reason: "INVALID_PHONE" } };
      }

      changes.emergencyContactPhone = normalized;
    }
  }

  return Object.keys(changes).length === 0
    ? { refusal: { reason: "NOTHING_TO_UPDATE" } }
    : { changes };
}
