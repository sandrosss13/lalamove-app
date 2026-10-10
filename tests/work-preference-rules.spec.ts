/**
 * A driver's work preferences, pinned without a server: what may be saved, and
 * each rule that keeps a load from being offered. The offer matcher's use of
 * them is pinned in `tests/offer-rules.spec.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { WEEKDAYS } from "@/lib/schedule/rules";
import {
  applyWorkPreferencesUpdate,
  HANDLING_TAGS,
  isInPreferredAreas,
  MAX_TRIP_KM_LIMIT,
  preferenceMismatch,
  UNSAVED_WORK_PREFERENCES,
  wantsOffer,
  workingTimeMismatch,
  type PreferenceLoad,
  type WorkPreferences,
} from "@/lib/work-preferences/rules";

const REPO = process.cwd();
const CITIES = ["TBILISI", "RUSTAVI", "MTSKHETA", "BATUMI", "KUTAISI"];

/** 14:00 on Friday 2 October 2026 in Tbilisi. */
const FRIDAY_AFTERNOON = new Date("2026-10-02T10:00:00.000Z");

/** The design's sample preferences. */
const PREFS: WorkPreferences = {
  cities: ["TBILISI", "RUSTAVI", "MTSKHETA"],
  intercity: false,
  maxTripKm: 400,
  days: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
  startMinute: 7 * 60,
  endMinute: 20 * 60,
  excludedHandlingTags: ["COLD_CHAIN", "HAZMAT"],
  canBringHelper: true,
};

function load(overrides: Partial<PreferenceLoad> = {}): PreferenceLoad {
  return {
    pickupCity: "TBILISI",
    dropoffCity: "RUSTAVI",
    tripKm: 31,
    handlingTags: [],
    helperCount: 0,
    ...overrides,
  };
}

test("the handling tags match the database enum and the wire contract", () => {
  const schema = readFileSync(join(REPO, "prisma", "schema.prisma"), "utf8");
  const enumBody = /enum CargoHandlingTag \{([^}]*)\}/.exec(schema)?.[1] ?? "";

  expect(enumBody.trim().split(/\s+/)).toEqual([...HANDLING_TAGS]);

  const contract = readFileSync(
    join(REPO, "src", "lib", "mobile-api", "contracts.ts"),
    "utf8",
  );
  const union =
    /export type CargoHandlingTag =([^;]*);/.exec(contract)?.[1] ?? "";

  expect(union.match(/"([A-Z_]+)"/g)?.map((name) => name.slice(1, -1))).toEqual(
    [...HANDLING_TAGS],
  );
});

test.describe("wantsOffer", () => {
  test("a driver with no saved preferences wants everything", () => {
    const anything = load({
      pickupCity: null,
      dropoffCity: null,
      tripKm: 4000,
      handlingTags: ["HAZMAT"],
      helperCount: 3,
    });

    // 03:00 on a Sunday in Tbilisi.
    expect(
      wantsOffer(null, anything, new Date("2026-10-03T23:00:00.000Z")),
    ).toBe(true);
  });

  test("a load inside every preference is wanted", () => {
    expect(preferenceMismatch(PREFS, load(), FRIDAY_AFTERNOON)).toBeNull();
    expect(wantsOffer(PREFS, load(), FRIDAY_AFTERNOON)).toBe(true);
  });
});

test.describe("areas", () => {
  test("both ends in chosen cities is inside", () => {
    expect(isInPreferredAreas(PREFS, load())).toBe(true);
    expect(isInPreferredAreas(PREFS, load({ dropoffCity: "TBILISI" }))).toBe(
      true,
    );
  });

  test("a job in a city that was not chosen is outside", () => {
    const batumi = load({ pickupCity: "BATUMI", dropoffCity: "BATUMI" });

    expect(isInPreferredAreas(PREFS, batumi)).toBe(false);
    expect(preferenceMismatch(PREFS, batumi, FRIDAY_AFTERNOON)).toBe(
      "OUTSIDE_AREAS",
    );
    // "Intercity" is about jobs that leave town, not jobs in another town.
    expect(isInPreferredAreas({ ...PREFS, intercity: true }, batumi)).toBe(
      false,
    );
  });

  test("a job that leaves the chosen cities needs Intercity", () => {
    const toBatumi = load({ dropoffCity: "BATUMI" });

    expect(isInPreferredAreas(PREFS, toBatumi)).toBe(false);
    expect(isInPreferredAreas({ ...PREFS, intercity: true }, toBatumi)).toBe(
      true,
    );
  });

  test("an intercity job must start in a chosen city", () => {
    const fromBatumi = load({ pickupCity: "BATUMI", dropoffCity: "TBILISI" });

    expect(isInPreferredAreas({ ...PREFS, intercity: true }, fromBatumi)).toBe(
      false,
    );
  });

  test("Intercity alone is intercity work from anywhere", () => {
    const onlyIntercity = { cities: [], intercity: true };

    expect(
      isInPreferredAreas(
        onlyIntercity,
        load({ pickupCity: "BATUMI", dropoffCity: "KUTAISI" }),
      ),
    ).toBe(true);
    expect(
      isInPreferredAreas(
        onlyIntercity,
        load({ pickupCity: "BATUMI", dropoffCity: "BATUMI" }),
      ),
    ).toBe(false);
  });

  test("an end with no resolved city is not in a chosen city", () => {
    expect(isInPreferredAreas(PREFS, load({ dropoffCity: null }))).toBe(false);
    expect(isInPreferredAreas(PREFS, load({ pickupCity: null }))).toBe(false);
    expect(
      isInPreferredAreas(
        { ...PREFS, intercity: true },
        load({ dropoffCity: null }),
      ),
    ).toBe(true);
  });
});

test.describe("longest trip", () => {
  test("a route longer than the maximum is not offered", () => {
    expect(
      preferenceMismatch(PREFS, load({ tripKm: 400 }), FRIDAY_AFTERNOON),
    ).toBeNull();
    expect(
      preferenceMismatch(PREFS, load({ tripKm: 400.1 }), FRIDAY_AFTERNOON),
    ).toBe("TRIP_TOO_LONG");
  });

  test("null is any distance", () => {
    expect(
      preferenceMismatch(
        { ...PREFS, maxTripKm: null },
        load({ tripKm: 4000 }),
        FRIDAY_AFTERNOON,
      ),
    ).toBeNull();
  });
});

test.describe("working days and hours", () => {
  test("it is the moment of the offer that counts, on the Tbilisi clock", () => {
    // 06:59, 07:00, 19:59 and 20:00 on Friday in Tbilisi.
    expect(
      workingTimeMismatch(PREFS, new Date("2026-10-02T02:59:00.000Z")),
    ).toBe("OUTSIDE_WORKING_HOURS");
    expect(
      workingTimeMismatch(PREFS, new Date("2026-10-02T03:00:00.000Z")),
    ).toBeNull();
    expect(
      workingTimeMismatch(PREFS, new Date("2026-10-02T15:59:00.000Z")),
    ).toBeNull();
    expect(
      workingTimeMismatch(PREFS, new Date("2026-10-02T16:00:00.000Z")),
    ).toBe("OUTSIDE_WORKING_HOURS");
  });

  test("a day that is not a working day", () => {
    // Sunday 12:00 in Tbilisi.
    const sunday = new Date("2026-10-04T08:00:00.000Z");

    expect(workingTimeMismatch(PREFS, sunday)).toBe("NOT_A_WORKING_DAY");
    expect(preferenceMismatch(PREFS, load(), sunday)).toBe("NOT_A_WORKING_DAY");
  });

  test("equal start and end are all day", () => {
    const allDay = { ...PREFS, startMinute: 0, endMinute: 0 };

    expect(
      workingTimeMismatch(allDay, new Date("2026-10-02T23:30:00.000Z")),
    ).toBeNull();
  });

  test("a night shift belongs to the day it started on", () => {
    const nights = {
      days: ["FRI"] as WorkPreferences["days"],
      startMinute: 22 * 60,
      endMinute: 6 * 60,
    };

    // Friday 23:00, then Saturday 02:00 — still Friday's shift.
    expect(
      workingTimeMismatch(nights, new Date("2026-10-02T19:00:00.000Z")),
    ).toBeNull();
    expect(
      workingTimeMismatch(nights, new Date("2026-10-02T22:00:00.000Z")),
    ).toBeNull();
    // Friday 02:00 is Thursday's shift; Saturday 23:00 is Saturday's.
    expect(
      workingTimeMismatch(nights, new Date("2026-10-01T22:00:00.000Z")),
    ).toBe("NOT_A_WORKING_DAY");
    expect(
      workingTimeMismatch(nights, new Date("2026-10-03T19:00:00.000Z")),
    ).toBe("NOT_A_WORKING_DAY");
    // Monday 02:00 is Sunday's shift.
    expect(
      workingTimeMismatch(
        { ...nights, days: ["SUN"] },
        new Date("2026-10-04T22:00:00.000Z"),
      ),
    ).toBeNull();
  });
});

test.describe("cargo and helper", () => {
  test("a load carrying an excluded handling tag is not offered", () => {
    expect(
      preferenceMismatch(
        PREFS,
        load({ handlingTags: ["FRAGILE", "HAZMAT"] }),
        FRIDAY_AFTERNOON,
      ),
    ).toBe("EXCLUDED_CARGO");
    expect(
      preferenceMismatch(
        PREFS,
        load({ handlingTags: ["FRAGILE"] }),
        FRIDAY_AFTERNOON,
      ),
    ).toBeNull();
  });

  test("a load asking for helpers needs a driver who can bring one", () => {
    const needsHelp = load({ helperCount: 1 });

    expect(preferenceMismatch(PREFS, needsHelp, FRIDAY_AFTERNOON)).toBeNull();
    expect(
      preferenceMismatch(
        { ...PREFS, canBringHelper: false },
        needsHelp,
        FRIDAY_AFTERNOON,
      ),
    ).toBe("HELPER_REQUIRED");
    expect(
      preferenceMismatch(
        { ...PREFS, canBringHelper: false },
        load(),
        FRIDAY_AFTERNOON,
      ),
    ).toBeNull();
  });
});

test.describe("applyWorkPreferencesUpdate", () => {
  const first = (body: unknown) =>
    applyWorkPreferencesUpdate(null, body, CITIES);

  test("a first save starts from nothing restricted and must name an area", () => {
    expect(UNSAVED_WORK_PREFERENCES).toEqual({
      cities: [],
      intercity: false,
      maxTripKm: null,
      days: [...WEEKDAYS],
      startMinute: 0,
      endMinute: 0,
      excludedHandlingTags: [],
      canBringHelper: true,
    });
    expect(first({ cities: ["TBILISI"] })).toEqual({
      preferences: { ...UNSAVED_WORK_PREFERENCES, cities: ["TBILISI"] },
    });
    expect(first({ intercity: true })).toEqual({
      preferences: { ...UNSAVED_WORK_PREFERENCES, intercity: true },
    });
    expect(first({ maxTripKm: 150 })).toEqual({
      refusal: { reason: "NO_AREA" },
    });
  });

  test("takes the design's whole form", () => {
    expect(
      first({
        cities: ["MTSKHETA", "TBILISI", "RUSTAVI", "TBILISI"],
        intercity: false,
        maxTripKm: 400,
        days: ["SA", "MON"].map((day) => (day === "SA" ? "SAT" : day)),
        hours: { start: "07:00", end: "20:00" },
        excludedHandlingTags: ["HAZMAT", "COLD_CHAIN"],
        canBringHelper: false,
      }),
    ).toEqual({
      preferences: {
        cities: ["TBILISI", "RUSTAVI", "MTSKHETA"],
        intercity: false,
        maxTripKm: 400,
        days: ["MON", "SAT"],
        startMinute: 420,
        endMinute: 1200,
        excludedHandlingTags: ["COLD_CHAIN", "HAZMAT"],
        canBringHelper: false,
      },
    });
  });

  test("an update changes only what is sent", () => {
    expect(
      applyWorkPreferencesUpdate(PREFS, { maxTripKm: null }, CITIES),
    ).toEqual({
      preferences: { ...PREFS, maxTripKm: null },
    });
    expect(
      applyWorkPreferencesUpdate(PREFS, { hours: { end: "18:30" } }, CITIES),
    ).toEqual({ preferences: { ...PREFS, endMinute: 1110 } });
  });

  test("removing the last area is refused", () => {
    expect(applyWorkPreferencesUpdate(PREFS, { cities: [] }, CITIES)).toEqual({
      refusal: { reason: "NO_AREA" },
    });
  });

  test("refuses each malformed field", () => {
    const cases: [unknown, unknown][] = [
      [[], { reason: "NOT_AN_OBJECT" }],
      [{}, { reason: "NOTHING_TO_UPDATE" }],
      [{ cities: ["PARIS"] }, { reason: "INVALID_CITIES" }],
      [{ cities: "TBILISI" }, { reason: "INVALID_CITIES" }],
      [{ intercity: "yes" }, { reason: "NOT_A_BOOLEAN", field: "intercity" }],
      [
        { canBringHelper: 1 },
        { reason: "NOT_A_BOOLEAN", field: "canBringHelper" },
      ],
      [{ maxTripKm: 0 }, { reason: "INVALID_MAX_TRIP_KM" }],
      [{ maxTripKm: 12.5 }, { reason: "INVALID_MAX_TRIP_KM" }],
      [{ maxTripKm: MAX_TRIP_KM_LIMIT + 1 }, { reason: "INVALID_MAX_TRIP_KM" }],
      [{ maxTripKm: "400 km" }, { reason: "INVALID_MAX_TRIP_KM" }],
      [{ days: [] }, { reason: "INVALID_DAYS" }],
      [
        { hours: { start: "7" } },
        { reason: "INVALID_TIME", field: "hours.start" },
      ],
      [
        { hours: { end: "24:00" } },
        { reason: "INVALID_TIME", field: "hours.end" },
      ],
      [
        { excludedHandlingTags: ["General"] },
        { reason: "INVALID_HANDLING_TAGS" },
      ],
    ];

    for (const [body, refusal] of cases) {
      expect(applyWorkPreferencesUpdate(PREFS, body, CITIES)).toEqual({
        refusal,
      });
    }
  });
});

test("the load board does not read work preferences", () => {
  const board = readFileSync(
    join(REPO, "src", "app", "api", "loads", "route.ts"),
    "utf8",
  );

  expect(board).not.toMatch(/work-preferences|workPreferences/);
});
