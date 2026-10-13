/**
 * The licence part of a company's add-driver request
 * (`POST /api/logistics-company/drivers/register`), parsed on its own.
 *
 * The licence is optional for a company driver — the company vouches for the
 * people it puts on its roster — but `DriverLicence` has a required number,
 * expiry and non-empty category list, so "no licence" can only mean "no row".
 * Input is therefore all-or-nothing: every field blank is no licence; any field
 * filled makes all three required and validated exactly as before.
 *
 * Deliberately free of runtime imports (the arrangement
 * `vehicle-documents/rules.ts` has): the valid categories and the clock are
 * passed in, so `tests/driver-registration-licence.spec.ts` pins the rule
 * without Prisma or a server.
 */

import type { LicenceCategory } from "@prisma/client";

import type { Translator } from "@/i18n/translator";

/** A licence the request supplied, validated. */
export type RegisterDriverLicence = {
  number: string;
  /** Parsed and already known to be in the future. */
  expiresAt: Date;
  /** Already de-duplicated, and every entry a valid `LicenceCategory`. */
  categories: LicenceCategory[];
};

/** Whether a request field was left blank: absent, `null`, or whitespace. */
function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

/**
 * Reads `licenceNumber`, `licenceExpiresAt` and `licenceCategories` off a
 * request body. All three blank (an empty category array counts as blank) is
 * `{ licence: null }`; otherwise the first problem is returned, phrased with the
 * same per-field messages the route has always used — a partly filled licence
 * simply reports the first field that is missing.
 */
export function parseOptionalLicence(
  record: Record<string, unknown>,
  t: Translator,
  validCategories: readonly LicenceCategory[],
  now: number = Date.now(),
): { licence: RegisterDriverLicence | null } | { error: string } {
  const {
    licenceNumber: rawNumber,
    licenceExpiresAt: rawExpiresAt,
    licenceCategories: rawCategories,
  } = record;

  if (
    isBlank(rawNumber) &&
    isBlank(rawExpiresAt) &&
    (isBlank(rawCategories) ||
      (Array.isArray(rawCategories) && rawCategories.length === 0))
  ) {
    return { licence: null };
  }

  if (typeof rawNumber !== "string" || rawNumber.trim() === "") {
    return {
      error: t(
        "errors.logisticsCompanyDriversRegister.licencenumberIsRequiredAndMustBe",
      ),
    };
  }

  const expiresAt =
    typeof rawExpiresAt === "string" ? new Date(rawExpiresAt) : null;
  if (expiresAt === null || Number.isNaN(expiresAt.getTime())) {
    return {
      error: t(
        "errors.logisticsCompanyDriversRegister.licenceexpiresatMustBeAValidIso",
      ),
    };
  }

  // Strictly after "now": a licence expiring today has already stopped being
  // usable by the time the driver takes their first order.
  if (expiresAt.getTime() <= now) {
    return {
      error: t(
        "errors.logisticsCompanyDriversRegister.theLicenceExpiryDateMustBe",
      ),
    };
  }

  if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
    return {
      error: t(
        "errors.logisticsCompanyDriversRegister.licencecategoriesMustBeAnArrayWith",
      ),
    };
  }

  if (
    !rawCategories.every(
      (category): category is LicenceCategory =>
        typeof category === "string" &&
        validCategories.includes(category as LicenceCategory),
    )
  ) {
    return {
      error: t(
        "errors.logisticsCompanyDriversRegister.licenceCategoriesMustContainOnly",
        { categories: validCategories.join(", ") },
      ),
    };
  }

  return {
    licence: {
      number: rawNumber.trim(),
      expiresAt,
      // De-duplicated rather than rejected: a repeated "C" is a slip in
      // whatever built the payload, not something the admin can act on, and
      // the stored array is a set either way.
      categories: [...new Set(rawCategories)],
    },
  };
}
