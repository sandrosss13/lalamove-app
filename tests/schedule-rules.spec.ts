/**
 * Weekdays and times of day on the Tbilisi wall clock, pinned without a
 * server: what notification quiet hours, route alerts and work preferences all
 * read a clock with.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  formatTimeOfDay,
  isWithinDailyWindow,
  minuteOfDayOf,
  parseTimeOfDay,
  parseWeekdays,
  WEEKDAYS,
  weekdayOf,
} from "@/lib/schedule/rules";

test("the weekdays match the database enum and the wire contract", () => {
  const schema = readFileSync(
    join(process.cwd(), "prisma", "schema.prisma"),
    "utf8",
  );
  const enumBody = /enum Weekday \{([^}]*)\}/.exec(schema)?.[1] ?? "";

  expect(enumBody.trim().split(/\s+/)).toEqual([...WEEKDAYS]);

  const contract = readFileSync(
    join(process.cwd(), "src", "lib", "mobile-api", "contracts.ts"),
    "utf8",
  );
  const union = /export type Weekday =([^;]*);/.exec(contract)?.[1] ?? "";

  expect(union.match(/"([A-Z]+)"/g)?.map((name) => name.slice(1, -1))).toEqual([
    ...WEEKDAYS,
  ]);
});

test("an instant is read on the Tbilisi clock, four hours ahead of UTC", () => {
  // Friday 2 October 2026, 14:30 in Tbilisi.
  const friday = new Date("2026-10-02T10:30:00.000Z");

  expect(weekdayOf(friday)).toBe("FRI");
  expect(minuteOfDayOf(friday)).toBe(14 * 60 + 30);

  // 21:00 UTC on Friday is already 01:00 on Saturday in Tbilisi.
  const lateFriday = new Date("2026-10-02T21:00:00.000Z");

  expect(weekdayOf(lateFriday)).toBe("SAT");
  expect(minuteOfDayOf(lateFriday)).toBe(60);
  expect(weekdayOf(new Date("2026-10-04T08:00:00.000Z"))).toBe("SUN");
  expect(weekdayOf(new Date("2026-10-05T08:00:00.000Z"))).toBe("MON");
});

test("a time of day is 24-hour HH:MM and nothing else", () => {
  expect(parseTimeOfDay("00:00")).toBe(0);
  expect(parseTimeOfDay("07:30")).toBe(450);
  expect(parseTimeOfDay("23:59")).toBe(1439);

  for (const value of [
    "24:00",
    "7:30",
    "07:60",
    "0730",
    "07:30:00",
    "",
    450,
    null,
  ]) {
    expect(parseTimeOfDay(value)).toBeNull();
  }

  expect(formatTimeOfDay(450)).toBe("07:30");
  expect(formatTimeOfDay(0)).toBe("00:00");
  expect(formatTimeOfDay(1380)).toBe("23:00");
});

test("a window includes its start and excludes its end", () => {
  expect(isWithinDailyWindow(420, 420, 1200)).toBe(true);
  expect(isWithinDailyWindow(1199, 420, 1200)).toBe(true);
  expect(isWithinDailyWindow(1200, 420, 1200)).toBe(false);
  expect(isWithinDailyWindow(419, 420, 1200)).toBe(false);
});

test("a window whose end is before its start wraps past midnight", () => {
  // 23:00 → 07:00.
  expect(isWithinDailyWindow(1380, 1380, 420)).toBe(true);
  expect(isWithinDailyWindow(0, 1380, 420)).toBe(true);
  expect(isWithinDailyWindow(419, 1380, 420)).toBe(true);
  expect(isWithinDailyWindow(420, 1380, 420)).toBe(false);
  expect(isWithinDailyWindow(720, 1380, 420)).toBe(false);
});

test("equal start and end are the whole day", () => {
  expect(isWithinDailyWindow(0, 0, 0)).toBe(true);
  expect(isWithinDailyWindow(900, 480, 480)).toBe(true);
});

test("weekdays are de-duplicated and put in Monday-first order", () => {
  expect(parseWeekdays(["SUN", "MON", "SUN"])).toEqual(["MON", "SUN"]);
  expect(parseWeekdays([...WEEKDAYS])).toEqual([...WEEKDAYS]);
});

test("an empty or malformed weekday list is refused", () => {
  for (const value of [[], ["Mo"], ["MON", 2], "MON", null, undefined]) {
    expect(parseWeekdays(value)).toBeNull();
  }
});
