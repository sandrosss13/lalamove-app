/**
 * A driver's work preferences — where, how far, when and what they want to be
 * **offered** — as pure functions: what may be saved, and whether one load may
 * be offered to one driver right now.
 *
 * Read by the offer matcher only (`src/lib/offers/rules.ts`). The public load
 * board is not filtered by any of this: a driver can still browse and claim
 * everything they are eligible for.
 *
 * No runtime dependency on Prisma, Next or `server-only`, so
 * `tests/work-preference-rules.spec.ts` pins all of it without a server.
 */

import {
  isWithinDailyWindow,
  minuteOfDayOf,
  parseTimeOfDay,
  parseWeekdays,
  WEEKDAYS,
  weekdayOf,
  type WeekdayName,
} from "@/lib/schedule/rules";

/** The longest "longest trip" accepted, in km — a sanity bound. */
export const MAX_TRIP_KM_LIMIT = 5000;

/** `CargoHandlingTag` in `prisma/schema.prisma`, spelled without Prisma. */
export const HANDLING_TAGS = [
  "FRAGILE",
  "COLD_CHAIN",
  "HAZMAT",
  "TIME_CRITICAL",
  "UPRIGHT_ONLY",
  "HEAVY_ITEM",
] as const;

export type HandlingTagName = (typeof HANDLING_TAGS)[number];

/** The stored preferences, spelled without Prisma. */
export type WorkPreferences = {
  /** Cities the driver works in. */
  cities: string[];
  /** The design's "Intercity" chip: jobs that leave the chosen cities. */
  intercity: boolean;
  /** "Longest trip I'll take", km of the job's own route. Null is "Any". */
  maxTripKm: number | null;
  /** Working days. Never empty. */
  days: WeekdayName[];
  /** Working hours, minutes of the Tbilisi day. Equal means all day. */
  startMinute: number;
  endMinute: number;
  /** Handling requirements the driver will not carry. */
  excludedHandlingTags: string[];
  /** False withholds loads that ask for helpers. */
  canBringHelper: boolean;
};

/**
 * What a first save starts from: nothing restricted except the areas, which
 * the driver must choose (the design refuses to save without one).
 */
export const UNSAVED_WORK_PREFERENCES: WorkPreferences = {
  cities: [],
  intercity: false,
  maxTripKm: null,
  days: [...WEEKDAYS],
  startMinute: 0,
  endMinute: 0,
  excludedHandlingTags: [],
  canBringHelper: true,
};

/** A load, as a driver's preferences see it. */
export type PreferenceLoad = {
  /** Null when the booking's address resolved to no listed city. */
  pickupCity: string | null;
  dropoffCity: string | null;
  /** The job's route length — `Order.distanceKm`. */
  tripKm: number;
  handlingTags: readonly string[];
  /** Helpers the client asked for beyond the driver. */
  helperCount: number;
};

/** Which preference keeps a load from being offered. */
export type PreferenceMismatch =
  | "OUTSIDE_AREAS"
  | "TRIP_TOO_LONG"
  | "NOT_A_WORKING_DAY"
  | "OUTSIDE_WORKING_HOURS"
  | "EXCLUDED_CARGO"
  | "HELPER_REQUIRED";

/**
 * Whether a load is inside the driver's areas:
 *
 * - both ends in chosen cities — yes (a job within one chosen city, or between
 *   two of them);
 * - otherwise it is a job between different places, wanted only with
 *   "Intercity" on, and then only when it starts in a chosen city — or when no
 *   city is chosen at all, which is "intercity work from anywhere".
 *
 * An end whose city is unknown is not in a chosen city.
 */
export function isInPreferredAreas(
  preferences: Pick<WorkPreferences, "cities" | "intercity">,
  load: Pick<PreferenceLoad, "pickupCity" | "dropoffCity">,
): boolean {
  const chosen = (city: string | null): boolean =>
    city !== null && preferences.cities.includes(city);

  if (chosen(load.pickupCity) && chosen(load.dropoffCity)) {
    return true;
  }

  const leavesTown =
    load.pickupCity === null || load.pickupCity !== load.dropoffCity;

  return (
    preferences.intercity &&
    leavesTown &&
    (preferences.cities.length === 0 || chosen(load.pickupCity))
  );
}

/**
 * Whether `now` is inside the driver's working time, and if not, which half
 * fails.
 *
 * Days and hours are about **when the offer would be sent**, not when the
 * pick-up is — the design's own line: "Offers outside these hours are not
 * sent, even if you are online." A shift that wraps past midnight belongs to
 * the day it started on: with Fri 22:00 → 06:00, Saturday 02:00 is Friday's
 * shift.
 */
export function workingTimeMismatch(
  preferences: Pick<WorkPreferences, "days" | "startMinute" | "endMinute">,
  now: Date,
): "NOT_A_WORKING_DAY" | "OUTSIDE_WORKING_HOURS" | null {
  const minute = minuteOfDayOf(now);
  const { startMinute, endMinute } = preferences;

  if (!isWithinDailyWindow(minute, startMinute, endMinute)) {
    return "OUTSIDE_WORKING_HOURS";
  }

  const today = WEEKDAYS.indexOf(weekdayOf(now));
  const inYesterdaysShift = startMinute > endMinute && minute < endMinute;
  const shiftDay =
    WEEKDAYS[(today + (inYesterdaysShift ? WEEKDAYS.length - 1 : 0)) % 7];

  return shiftDay !== undefined && preferences.days.includes(shiftDay)
    ? null
    : "NOT_A_WORKING_DAY";
}

/**
 * Why a load is not offered to a driver with these preferences, or null when
 * it may be. The first failing rule is reported, in the order the screen lists
 * them.
 */
export function preferenceMismatch(
  preferences: WorkPreferences,
  load: PreferenceLoad,
  now: Date,
): PreferenceMismatch | null {
  if (!isInPreferredAreas(preferences, load)) {
    return "OUTSIDE_AREAS";
  }

  if (preferences.maxTripKm !== null && load.tripKm > preferences.maxTripKm) {
    return "TRIP_TOO_LONG";
  }

  const time = workingTimeMismatch(preferences, now);

  if (time !== null) {
    return time;
  }

  if (
    load.handlingTags.some((tag) =>
      preferences.excludedHandlingTags.includes(tag),
    )
  ) {
    return "EXCLUDED_CARGO";
  }

  return load.helperCount > 0 && !preferences.canBringHelper
    ? "HELPER_REQUIRED"
    : null;
}

/**
 * **The rule the offer matcher asks.** A driver with no saved preferences
 * (`null`) is offered everything they were offered before preferences existed.
 */
export function wantsOffer(
  preferences: WorkPreferences | null,
  load: PreferenceLoad,
  now: Date,
): boolean {
  return (
    preferences === null || preferenceMismatch(preferences, load, now) === null
  );
}

export type WorkPreferencesRefusal =
  | { reason: "NOT_AN_OBJECT" }
  | { reason: "NOTHING_TO_UPDATE" }
  | { reason: "INVALID_CITIES" }
  | { reason: "NO_AREA" }
  | { reason: "NOT_A_BOOLEAN"; field: "intercity" | "canBringHelper" }
  | { reason: "INVALID_MAX_TRIP_KM" }
  | { reason: "INVALID_DAYS" }
  | { reason: "INVALID_TIME"; field: "hours.start" | "hours.end" }
  | { reason: "INVALID_HANDLING_TAGS" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `value` as a de-duplicated list drawn from `allowed`, in `allowed`'s order. */
function parseSubset(
  value: unknown,
  allowed: readonly string[],
): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const given: unknown[] = value;

  return given.every(
    (item) => typeof item === "string" && allowed.includes(item),
  )
    ? allowed.filter((item) => given.includes(item))
    : null;
}

/**
 * A `PATCH` body applied over the driver's preferences: the preferences as
 * they would be stored, or why not. Fields left out keep their value;
 * `current` null is a first save and starts from `UNSAVED_WORK_PREFERENCES`.
 *
 * The result must name at least one area — a city or "Intercity" — and at
 * least one day, the design's two "Pick at least one" rules.
 *
 * `cities` is the real city enum's values, handed in so this module needs no
 * Prisma.
 */
export function applyWorkPreferencesUpdate(
  current: WorkPreferences | null,
  body: unknown,
  cities: readonly string[],
): { preferences: WorkPreferences } | { refusal: WorkPreferencesRefusal } {
  if (!isRecord(body)) {
    return { refusal: { reason: "NOT_AN_OBJECT" } };
  }

  const next: WorkPreferences = { ...(current ?? UNSAVED_WORK_PREFERENCES) };
  let changed = false;

  if (body.cities !== undefined) {
    const chosen = parseSubset(body.cities, cities);

    if (chosen === null) {
      return { refusal: { reason: "INVALID_CITIES" } };
    }

    next.cities = chosen;
    changed = true;
  }

  for (const field of ["intercity", "canBringHelper"] as const) {
    const value = body[field];

    if (value === undefined) {
      continue;
    }

    if (typeof value !== "boolean") {
      return { refusal: { reason: "NOT_A_BOOLEAN", field } };
    }

    next[field] = value;
    changed = true;
  }

  if (body.maxTripKm !== undefined) {
    const { maxTripKm } = body;

    if (
      maxTripKm !== null &&
      (typeof maxTripKm !== "number" ||
        !Number.isInteger(maxTripKm) ||
        maxTripKm < 1 ||
        maxTripKm > MAX_TRIP_KM_LIMIT)
    ) {
      return { refusal: { reason: "INVALID_MAX_TRIP_KM" } };
    }

    next.maxTripKm = maxTripKm;
    changed = true;
  }

  if (body.days !== undefined) {
    const days = parseWeekdays(body.days);

    if (days === null) {
      return { refusal: { reason: "INVALID_DAYS" } };
    }

    next.days = days;
    changed = true;
  }

  if (body.hours !== undefined) {
    const hours = body.hours;

    if (!isRecord(hours)) {
      return { refusal: { reason: "INVALID_TIME", field: "hours.start" } };
    }

    for (const [field, column] of [
      ["start", "startMinute"],
      ["end", "endMinute"],
    ] as const) {
      if (hours[field] === undefined) {
        continue;
      }

      const minute = parseTimeOfDay(hours[field]);

      if (minute === null) {
        return { refusal: { reason: "INVALID_TIME", field: `hours.${field}` } };
      }

      next[column] = minute;
      changed = true;
    }
  }

  if (body.excludedHandlingTags !== undefined) {
    const tags = parseSubset(body.excludedHandlingTags, HANDLING_TAGS);

    if (tags === null) {
      return { refusal: { reason: "INVALID_HANDLING_TAGS" } };
    }

    next.excludedHandlingTags = tags;
    changed = true;
  }

  if (!changed) {
    return { refusal: { reason: "NOTHING_TO_UPDATE" } };
  }

  if (next.cities.length === 0 && !next.intercity) {
    return { refusal: { reason: "NO_AREA" } };
  }

  return { preferences: next };
}
