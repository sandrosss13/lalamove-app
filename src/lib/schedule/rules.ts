/**
 * Weekdays and times of day as the driver app's settings state them — "Mon to
 * Sat, 07:00 to 20:00" — and how an instant is placed against them.
 *
 * Shared by notification quiet hours, route alerts and work preferences so the
 * three read a clock one way. Everything is on the Tbilisi wall clock
 * (`HUB_TIME_ZONE`): the platform operates in one zone, which has no daylight
 * saving.
 *
 * No runtime dependency on Prisma, Next or `server-only`, so
 * `tests/schedule-rules.spec.ts` pins it without a server.
 */

import { hubMinuteOfDay, hubWeekdayIndex } from "@/lib/dashboard/hub/timezone";

/** `Weekday` in `prisma/schema.prisma`, spelled without Prisma. Monday first. */
export const WEEKDAYS = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
] as const;

export type WeekdayName = (typeof WEEKDAYS)[number];

export const MINUTES_PER_DAY = 1440;

/** `hubWeekdayIndex` numbers Sunday 0, as `Date#getDay` does. */
const WEEKDAY_BY_SUNDAY_FIRST_INDEX: readonly WeekdayName[] = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];

/** The weekday `instant` falls on in Tbilisi. */
export function weekdayOf(instant: Date): WeekdayName {
  return WEEKDAY_BY_SUNDAY_FIRST_INDEX[hubWeekdayIndex(instant)] ?? "MON";
}

/** Minutes since Tbilisi midnight, `0`–`1439`. */
export function minuteOfDayOf(instant: Date): number {
  return hubMinuteOfDay(instant);
}

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `"07:30"` → `450`; null for anything that is not a 24-hour `HH:MM`. */
export function parseTimeOfDay(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = TIME_OF_DAY_PATTERN.exec(value);

  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

/** `450` → `"07:30"`. */
export function formatTimeOfDay(minuteOfDay: number): string {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Whether `minute` is inside the daily window `[start, end)`.
 *
 * A window whose end is before its start wraps past midnight (23:00 → 07:00
 * covers 23:30 and 06:59, not 07:00). **Equal start and end mean the whole
 * day** — the reading a person intends by "00:00 to 00:00", and the one that
 * leaves no way to save a window that never matches.
 */
export function isWithinDailyWindow(
  minute: number,
  startMinute: number,
  endMinute: number,
): boolean {
  if (startMinute === endMinute) {
    return true;
  }

  return startMinute < endMinute
    ? minute >= startMinute && minute < endMinute
    : minute >= startMinute || minute < endMinute;
}

/**
 * A list of weekdays from an untrusted value: de-duplicated, in Monday-first
 * order. Null when it is not a non-empty array of weekday names.
 */
export function parseWeekdays(value: unknown): WeekdayName[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const given: unknown[] = value;

  if (!given.every((day) => WEEKDAYS.some((weekday) => weekday === day))) {
    return null;
  }

  return WEEKDAYS.filter((weekday) => given.includes(weekday));
}
