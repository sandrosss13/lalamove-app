/**
 * The in-progress onboarding wizard, held as one versioned JSON blob on
 * `DriverApplication.draft`.
 *
 * Every field is optional: the client sends whatever it has filled in so far on
 * every save, and the save is a whole-object replace rather than a merge — so a
 * field the driver clears really does disappear, which a deep merge would make
 * impossible. Nothing here is authoritative. The draft is scratch space for
 * resuming the wizard across sessions and devices; the real validation (and the
 * writes to `DriverLicence` and `Vehicle`) happens once, at submit time, against
 * the actual business rules.
 *
 * Pure data and pure functions — no server-only imports — so the wizard's client
 * components and the route handlers can share the same types.
 */

/** Licence categories the wizard offers, mirroring the `LicenceCategory` enum. */
export type OnboardingDraftLicenceCategory = "B" | "C" | "CE";

/** Cargo body types the wizard offers, mirroring the `ChassisType` enum. */
export type OnboardingDraftChassisType =
  "DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS";

/**
 * Vehicle classes the wizard offers. Kept as a structural literal union rather
 * than importing `VehicleClassId` from `vehicle-classes.ts` so the persisted
 * draft shape stays independent of the presentation grouping — a draft saved
 * today must still parse if that constant's copy is retuned later.
 */
export type OnboardingDraftVehicleClassId =
  "SMALL_VAN" | "LARGE_VAN" | "MEDIUM_TRUCK" | "HEAVY_FREIGHT_TRUCK";

export type OnboardingDraftV1 = {
  version: 1;
  personal?: {
    phone?: string;
    fullName?: string;
    idNumber?: string;
    dateOfBirth?: string; // ISO date string
    city?: string; // GeorgianCity enum value
  };
  licence?: {
    licenceNumber?: string;
    expiresAt?: string; // ISO date string
    categories?: OnboardingDraftLicenceCategory[];
  };
  vehicle?: {
    chassisType?: OnboardingDraftChassisType;
    classId?: OnboardingDraftVehicleClassId;
    make?: string;
    model?: string;
    year?: number;
    colour?: string;
    plateNumber?: string;
    payloadKg?: number;
    cargoLengthM?: number;
    cargoWidthM?: number;
    cargoHeightM?: number;
  };
};

/** The current draft version. Bumping this is what a future migration branches on. */
export const ONBOARDING_DRAFT_VERSION = 1;

/** The wizard's four steps; `draftStep` is clamped to this range on save. */
export const ONBOARDING_FIRST_STEP = 1;
export const ONBOARDING_LAST_STEP = 4;

/**
 * Parses a Prisma `JsonValue` into an `OnboardingDraftV1`, or `null` for
 * anything that isn't a plausible draft of this shape (missing/wrong `version`,
 * not an object, an array). Callers treat `null` exactly like "no draft yet"
 * rather than crashing — a draft that somehow got corrupted costs the driver
 * their in-progress answers, not access to the wizard.
 *
 * Note the deliberate `unknown` parameter: Prisma types a `Json?` column as
 * `JsonValue`, which is not assignable to a concrete object type, and casting
 * straight through it would let a malformed row masquerade as a valid draft.
 * This function is the single place that narrowing is allowed to happen, and
 * the single place a future `version: 2` migration would branch.
 *
 * Beyond `version`, the rest is shallow-trusted: this is our own
 * previously-saved data, every field is optional, and deep validation happens at
 * submit time against the real business rules (`task-13`), not here. Callers
 * that accept a draft straight from the browser (`PATCH`) layer their own
 * structural checks on top before writing.
 */
export function parseOnboardingDraft(value: unknown): OnboardingDraftV1 | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.version !== ONBOARDING_DRAFT_VERSION) {
    return null;
  }

  return record as OnboardingDraftV1;
}

/**
 * Prefix and width of the short human-readable application code shown to the
 * driver and to the admin reviewer (e.g. "APP-40219") — a bare `cuid` isn't fit
 * for reading aloud in a support call.
 */
const REFERENCE_PREFIX = "APP-";
const REFERENCE_DIGITS = 5;

/**
 * A candidate application reference. Randomness, not a counter, so a reference
 * leaks nothing about how many drivers have applied. 5 digits is only 100k
 * values, so a collision — while astronomically unlikely at this scale — is
 * possible: the caller must retry on the unique-constraint violation rather than
 * assume this returns something free.
 */
export function generateApplicationReference(): string {
  const value = Math.floor(Math.random() * 10 ** REFERENCE_DIGITS);
  return `${REFERENCE_PREFIX}${value.toString().padStart(REFERENCE_DIGITS, "0")}`;
}
