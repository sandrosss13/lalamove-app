/**
 * Display helpers shared by the earnings sections of `/dashboard/performance`
 * and their four child components (the filter bar, the export button, the
 * breakdown card and the payout table).
 *
 * They live in their own module rather than in `earnings-screen.tsx` for the
 * reason `vehicles-format.ts` gives for its own: the cards
 * need them too, and importing them from `earnings-screen.tsx` would make it
 * and its cards mutually dependent. `performance-screen.tsx` reads
 * `formatRangeSubtitle` from here for the same reason — it registers the page
 * subtitle for both halves of the merged screen, and must not import it through
 * the component it renders. Nothing here decides what a number *means* — that
 * is `src/lib/dashboard/hub/earnings.ts`.
 *
 * `formatGel` is deliberately a third copy rather than an import from one of the
 * sibling format modules. Each screen owns its own presentation layer here, and
 * a cross-screen import would tie Earnings' money formatting to a file another
 * screen is free to change; the shared vocabulary is `hub-primitives.tsx`, and
 * a two-line `Intl` wrapper has never earned a place in it.
 *
 * Every date formatter is anchored to `HUB_TIME_ZONE` and written in the
 * reader's app locale (passed in, never read from the runtime):
 *
 * 1. This tree server-renders and then hydrates. A formatter that read the
 *    runtime's locale or time zone would produce one string in Node and another
 *    in the browser — a hydration mismatch. A fixed IANA zone and the route's
 *    own locale cannot.
 * 2. `earnings.ts` buckets every day in that same zone. Both used to be UTC,
 *    which put every bar four hours off the driver's own day and disagreed with
 *    the clock times on the Jobs screen; see `@/lib/dashboard/hub/timezone` for
 *    why the hub pins Tbilisi rather than UTC or the browser's zone.
 */
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import type { Translator } from "@/i18n/translator";
import {
  hubDateTimeFormat,
  parseHubDayKey,
} from "@/lib/dashboard/hub/timezone";

/**
 * `en-US` with two decimals, matching the handoff's `₾142.60` and the sibling
 * screens. Pinned rather than left to the browser so a driver on a `de-DE`
 * locale does not read `₾1.200,50` beside a hard-coded `₾0.40` and see two
 * currencies.
 *
 * `Order.price` is already in GEL major units, so nothing is divided here.
 */
const gelFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole GEL, for the value above a chart bar — the design's `₾143`. */
const wholeGelFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/** The design's `Mon`, for a daily bar's label. */
const WEEKDAY_OPTIONS = { weekday: "short" } as const;

/** The design's `24 Aug`, for a weekly bar's label. */
const DAY_MONTH_OPTIONS = { day: "numeric", month: "short" } as const;

/** `24`, the opening half of a subhead whose two ends share a month. */
const DAY_OPTIONS = { day: "numeric" } as const;

/** `31 July`, the opening half of a subhead whose two ends share a year. */
const DAY_LONG_MONTH_OPTIONS = { day: "numeric", month: "long" } as const;

/** `30 August 2026`, the design's own subhead vocabulary. */
const LONG_DATE_OPTIONS = {
  day: "numeric",
  month: "long",
  year: "numeric",
} as const;

/** What the design prints where a figure is genuinely not known. */
export const EMPTY_VALUE = "—";

/** Characters of a `YYYY-MM-DD` key that name its year, and its month. */
const YEAR_KEY_LENGTH = 4;
const MONTH_KEY_LENGTH = 7;

/** `18.4` → `₾18.40`. */
export function formatGel(amountGel: number): string {
  return `₾${gelFormatter.format(amountGel)}`;
}

/**
 * `142.6` → `₾143`, the rounded value the design prints above a bar, or an em
 * dash for a day that earned nothing — the design shows "—" rather than "₾0"
 * so an empty day reads as empty rather than as a rounding of something small.
 */
export function formatBarValue(amountGel: number): string {
  return amountGel > 0
    ? `₾${wholeGelFormatter.format(amountGel)}`
    : EMPTY_VALUE;
}

/**
 * `6.44` → `6h`, the design's "Nh online" precision.
 *
 * Rounded to the whole hour because the figure is an estimate derived from a
 * job count (see `sampleOnlineHours`), and printing a tenth of an hour would
 * dress a guess up as a measurement.
 */
export function formatHours(hours: number): string {
  return `${hours.toFixed(0)}h`;
}

/** A day key → the design's `Mon`, named for the Tbilisi day it covers. */
export function formatWeekday(dateKey: string, locale?: string): string {
  return hubDateTimeFormat(locale, WEEKDAY_OPTIONS).format(
    parseHubDayKey(dateKey),
  );
}

/** A day key → the design's `24 Aug`, named for the Tbilisi day it covers. */
export function formatDayMonth(dateKey: string, locale?: string): string {
  return hubDateTimeFormat(locale, DAY_MONTH_OPTIONS).format(
    parseHubDayKey(dateKey),
  );
}

/**
 * What `formatRangeSubtitle` needs to speak the reader's language: the
 * `driverHub.earningsFormat` translator for the day count, and the locale for
 * month names. Omitted, the subtitle falls back to English.
 */
export type EarningsDateFormat = {
  t: Translator;
  locale: string;
};

/** Component hook: the `EarningsDateFormat` for the active locale. */
export function useEarningsDateFormat(): EarningsDateFormat {
  const t = useTranslations("driverHub.earningsFormat");
  const locale = useLocale();

  return useMemo(() => ({ t, locale }), [t, locale]);
}

/** `1, "day"` → `"1 day"`; `7` → `"7 days"`. */
export function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/**
 * The header subhead for a selected range: `24 – 30 August 2026 · 7 days`.
 *
 * The month and year are printed once when both ends share them, twice when
 * they do not (`31 July – 29 August 2026`, `28 December 2025 – 3 January
 * 2026`), which is the shape the design's own subhead uses and the shape a
 * reader can scan without re-reading.
 *
 * Safe to call during render on both sides of hydration: both arguments are
 * `YYYY-MM-DD` strings resolved on the server, and every formatter above is
 * pinned to the route's locale and `HUB_TIME_ZONE` — there is no second clock
 * involved, unlike
 * Today's subhead, which is why this one is not formatted in the page.
 *
 * Called by `PerformanceScreen`, not by `EarningsScreen`: the merged screen has
 * one header and the shell holds one subtitle override, so the composition
 * makes the single registration for both halves.
 */
export function formatRangeSubtitle(
  from: string,
  to: string,
  days: number,
  format?: EarningsDateFormat,
): string {
  const locale = format?.locale;
  const fromDate = parseHubDayKey(from);
  const toDate = parseHubDayKey(to);

  // Both comparisons read the keys' own prefixes rather than fields off the
  // parsed instants: a Tbilisi midnight lands on the previous UTC day, so
  // `getUTCFullYear()`/`getUTCMonth()` would name the wrong year for a range
  // starting on 1 January and the wrong month for one starting on the 1st.
  const sameYear =
    from.slice(0, YEAR_KEY_LENGTH) === to.slice(0, YEAR_KEY_LENGTH);
  const sameMonth =
    sameYear &&
    from.slice(0, MONTH_KEY_LENGTH) === to.slice(0, MONTH_KEY_LENGTH);

  const start = hubDateTimeFormat(
    locale,
    sameMonth
      ? DAY_OPTIONS
      : sameYear
        ? DAY_LONG_MONTH_OPTIONS
        : LONG_DATE_OPTIONS,
  ).format(fromDate);
  const end = hubDateTimeFormat(locale, LONG_DATE_OPTIONS).format(toDate);
  const dayCount = format
    ? format.t("daysCount", { count: days })
    : pluralise(days, "day");

  return `${start} – ${end} · ${dayCount}`;
}
