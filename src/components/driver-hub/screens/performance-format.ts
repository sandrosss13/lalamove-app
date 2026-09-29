/**
 * Display helpers for the Driver Hub's Performance screen.
 *
 * Kept out of `hub-primitives.tsx` because none of them are part of the
 * vocabulary the other six screens compose from: a rate that can legitimately
 * be "not applicable", a rating on a five-point scale and a Monday–Sunday week
 * label are Performance's own shapes.
 *
 * Formatting only — nothing here decides what a number *means*. That is
 * `src/lib/dashboard/hub/performance.ts`'s job, and it has already rounded
 * every figure to the precision the design shows.
 *
 * These are not tile-only helpers. `formatRate`, `formatDecimal`, `pluralise`
 * and `EMPTY_VALUE` also render the per-driver fleet table a BUSINESS account
 * sees under the chart — which is exactly why `formatRate`'s `null` case earns
 * its em dash twice over: once for a week in which nothing finished, and once
 * per roster member who finished nothing in it.
 */
import {
  hubDateTimeFormat,
  parseHubDayKey,
} from "@/lib/dashboard/hub/timezone";

/** What the design prints where a figure is genuinely not known. */
export const EMPTY_VALUE = "—";

/** Characters of a `YYYY-MM-DD` key that name its month: `YYYY-MM`. */
const MONTH_KEY_LENGTH = 7;

/**
 * Written in the reader's app locale (the caller passes it from `useLocale()`),
 * never the browser's: the route's locale is identical on the server and after
 * hydration, and a `de-DE` browser rendering "24.–30. August" beside English
 * copy would read as a bug. `hubDateTimeFormat` maps the app's `en` to `en-GB`,
 * the handoff's "24–30 August" style.
 *
 * Both formats are pinned to `HUB_TIME_ZONE` (by `hubDateTimeFormat`), because
 * that is the zone the window they label is bucketed in. The week is
 * Monday-to-Sunday in Tbilisi, so a label rendered in any other zone would name
 * days the bars underneath it do not cover.
 */
const DAY_OPTIONS = { day: "numeric" } as const;

const DAY_MONTH_OPTIONS = { day: "numeric", month: "long" } as const;

/** `"Mon"` — a chart column's label. */
const WEEKDAY_OPTIONS = { weekday: "short" } as const;

/**
 * A `YYYY-MM-DD` hub day key → its short weekday name in the reader's locale
 * (`"Mon"`, `"ორშ"`), named for the Tbilisi day the key covers.
 */
export function formatWeekdayShort(dayKey: string, locale?: string): string {
  return hubDateTimeFormat(locale, WEEKDAY_OPTIONS).format(
    parseHubDayKey(dayKey),
  );
}

/**
 * The window's own label: `"24–30 August"`, or `"31 August – 6 September"` when
 * the week straddles two months.
 *
 * The month is named once inside a single month on purpose — "24 August–30
 * August" reads as two separate dates rather than as one range.
 */
export function formatWeekRange(
  fromDayKey: string,
  toDayKey: string,
  locale?: string,
): string {
  const from = parseHubDayKey(fromDayKey);
  const to = parseHubDayKey(toDayKey);
  const dayMonth = hubDateTimeFormat(locale, DAY_MONTH_OPTIONS);

  // Compared on the keys' own `YYYY-MM` prefix rather than by reading a month
  // off the parsed instants: those instants are Tbilisi midnights, which fall on
  // the *previous* UTC day, so `getUTCMonth()` would report the wrong month for
  // any week starting on the 1st.
  if (
    fromDayKey.slice(0, MONTH_KEY_LENGTH) ===
    toDayKey.slice(0, MONTH_KEY_LENGTH)
  ) {
    return `${hubDateTimeFormat(locale, DAY_OPTIONS).format(from)}–${dayMonth.format(to)}`;
  }

  return `${dayMonth.format(from)} – ${dayMonth.format(to)}`;
}

/**
 * `7` → `"7"`, `7.4` → `"7.4"`.
 *
 * The loader rounds every rate and average to one decimal, so a whole number
 * here really is whole and printing it as "7.0" would imply a precision the
 * figure does not carry.
 */
export function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * `98` → `"98%"`, `2.1` → `"2.1%"`, `null` → `"—"`.
 *
 * `null` is the loader's "nothing finished this week", which is emphatically
 * not zero: a 0% completion rate would tell a driver who has simply not
 * finished a job yet that every job they took failed.
 */
export function formatRate(percent: number | null): string {
  if (percent === null) {
    return EMPTY_VALUE;
  }

  return `${formatDecimal(percent)}%`;
}

/**
 * `4.86` → `"4.86"`. Two decimals always, unlike every other figure here — a
 * rating moves in hundredths and "4.9" would hide a whole week of movement.
 */
export function formatRating(rating: number): string {
  return rating.toFixed(2);
}

/** `7.2` → `"7.2h"`, the value label above a column of the hours chart. */
export function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

/** `1, "job"` → `"1 job"`; `4` → `"4 jobs"`. */
export function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
