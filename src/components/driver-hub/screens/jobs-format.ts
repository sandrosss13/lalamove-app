/**
 * Display helpers for the Job history screen — its table and its detail panel,
 * which have to agree character-for-character on what a timestamp reads as.
 *
 * They live in their own module rather than in `jobs-screen.tsx` so the detail
 * panel can reach them without importing the screen that renders it, matching
 * `vehicles-format.ts` and `drivers-format.ts`.
 *
 * ## Time zone
 *
 * Every formatter here is pinned to `HUB_TIME_ZONE` — the hub's one zone, whose
 * module explains why this product pins a fixed IANA zone rather than using UTC
 * or the browser's. This screen was the first to get that right: it prints
 * *clock times*, and under UTC a job completed at 22:30 in Tbilisi rendered as
 * "18:30" — four hours wrong on every single row, and wrong about which *day* it
 * happened on for anything after 20:00. The rest of the hub has since been moved
 * onto the same zone, display and day-bucketing alike, so the constant is now
 * imported rather than spelled out here and no screen can drift off it again.
 *
 * The locale is never the machine's, for the other half of the same reason: a
 * formatter reading it would render one string in Node and a different one in
 * the browser after hydration. The clock is pinned to `en-GB` (24-hour, the
 * handoff's style); day and month *words* follow the reader's app locale, which
 * callers pass in through `JobsTimeFormat` — the route's locale is the same on
 * both sides of hydration. `en` still resolves to `en-GB` ("4 Aug").
 *
 * The other half of that determinism is "now", which is *not* read from the
 * clock here: every relative label takes the instant its caller was rendered at,
 * threaded down from the server page. See `formatJobTime` below.
 */
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import type { Translator } from "@/i18n/translator";
import {
  HUB_TIME_ZONE,
  hubCivilDate,
  hubDateTimeFormat,
  hubDayNumber,
} from "@/lib/dashboard/hub/timezone";

/** What the design prints where a timestamp genuinely does not exist. */
export const EMPTY_VALUE = "—";

/**
 * GEL in major units with two decimals, matching the handoff's `₾18.40`.
 * `Order.price` and its fare columns are already major units, so nothing is
 * divided here.
 */
const gelFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatGel(amountGel: number): string {
  return `₾${gelFormatter.format(amountGel)}`;
}

/** `14.23` → `14.2 km`, the one decimal the design's Distance column shows. */
export function formatDistanceKm(distanceKm: number): string {
  return `${distanceKm.toFixed(1)} km`;
}

/** `09:40`. 24-hour, because the handoff's times are. */
const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: HUB_TIME_ZONE,
});

/** `4 Aug` — a date inside the current year, where the year is redundant. */
const DAY_MONTH_OPTIONS = { day: "numeric", month: "short" } as const;

/** `4 Aug 2025` — a date in another year, where it is not. */
const DAY_MONTH_YEAR_OPTIONS = {
  day: "numeric",
  month: "short",
  year: "numeric",
} as const;

/** The unabbreviated form, for the `title` on a cell that may truncate. */
const FULL_OPTIONS = {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
} as const;

/**
 * What the day-labelled formatters need to speak the reader's language: the
 * `driverHub.jobsFormat` translator for "Today" / "Yesterday" / "Tomorrow",
 * and the locale for month names. Every formatter that takes one falls back to
 * English when it is omitted.
 */
export type JobsTimeFormat = {
  t: Translator;
  locale: string;
};

/** Component hook: the `JobsTimeFormat` for the active locale. */
export function useJobsTimeFormat(): JobsTimeFormat {
  const t = useTranslations("driverHub.jobsFormat");
  const locale = useLocale();

  return useMemo(() => ({ t, locale }), [t, locale]);
}

/**
 * Which calendar day and year this instant falls on *in Tbilisi*.
 *
 * Both come from the shared timezone module rather than from a formatter of this
 * file's own. A day *number* is what lets two civil dates simply be subtracted,
 * which `Date` offers no way to do across a zone; taking the year from the same
 * source means "is this the current year" is answered in Tbilisi's calendar too,
 * rather than in the runtime's or in UTC's.
 */
function civilDate(date: Date): { dayNumber: number; year: number } {
  return { dayNumber: hubDayNumber(date), year: hubCivilDate(date).year };
}

/**
 * The design's day wording: `null` for today, "Yesterday", "Tomorrow", or the
 * date itself.
 *
 * "Tomorrow" is not in the handoff, which has no future rows — but a Scheduled
 * order carries the client's requested slot, which routinely *is* in the
 * future, and rendering that as a bare "13:30" would read as this afternoon.
 */
function relativeDayLabel(
  date: Date,
  now: Date,
  format?: JobsTimeFormat,
): string | null {
  const civilThen = civilDate(date);
  const civilNow = civilDate(now);
  const dayDelta = civilNow.dayNumber - civilThen.dayNumber;

  if (dayDelta === 0) {
    return null;
  }

  if (dayDelta === 1) {
    return format ? format.t("yesterday") : "Yesterday";
  }

  if (dayDelta === -1) {
    return format ? format.t("tomorrow") : "Tomorrow";
  }

  return hubDateTimeFormat(
    format?.locale,
    civilThen.year === civilNow.year
      ? DAY_MONTH_OPTIONS
      : DAY_MONTH_YEAR_OPTIONS,
  ).format(date);
}

/**
 * The table's Time column: `09:40` today, `Yesterday 18:20` before that, and
 * the date otherwise — exactly the mix the handoff's rows show.
 *
 * `nowIso` is a parameter rather than `new Date()` on purpose. The screen is
 * server-rendered and then hydrated, so a "now" read from the clock would be
 * sampled twice — once on the server, once in the browser — and a render that
 * straddled Tbilisi midnight would relabel a row from "09:40" to
 * "Yesterday 09:40" between the two passes, which is a hydration mismatch.
 * Threading one instant down from the page makes both passes agree by
 * construction.
 */
export function formatJobTime(
  iso: string,
  nowIso: string,
  format?: JobsTimeFormat,
): string {
  const date = new Date(iso);
  const day = relativeDayLabel(date, new Date(nowIso), format);
  const clock = clockFormatter.format(date);

  return day === null ? clock : `${day} ${clock}`;
}

/** The detail panel's "Today · 09:40" line, from the same day vocabulary. */
export function formatJobDateLabel(
  iso: string,
  nowIso: string,
  format?: JobsTimeFormat,
): string {
  const date = new Date(iso);
  const day =
    relativeDayLabel(date, new Date(nowIso), format) ??
    (format ? format.t("today") : "Today");

  return `${day} · ${clockFormatter.format(date)}`;
}

/**
 * `4 August 2026, 18:20`, for the `title` of a cell narrow enough to truncate.
 * A truncated timestamp is a label; this is the thing itself.
 */
export function formatJobTimestamp(
  iso: string,
  format?: Pick<JobsTimeFormat, "locale">,
): string {
  return hubDateTimeFormat(format?.locale, FULL_OPTIONS).format(new Date(iso));
}

/**
 * `toTelHref` **moved** to `@/components/driver-hub/hub-job-parts`.
 *
 * It was never a formatter in this module's sense — everything else here is
 * pinned to `HUB_TIME_ZONE`, and that one was a parsing rule about
 * a stored free-text column. The driver's Job sheet needed the same rule, and
 * the per-screen formatter convention this file's header defends (which is why
 * `loads-format.ts` carries its own clock rather than importing this one) is a
 * rule about *locale-dependent display*, not a reason to write the same
 * phone-number parse twice. `StopPhoneLink` there renders it with the plain-text
 * fallback attached, which is the half that gets forgotten at a bare call site.
 */

/** `1, "job"` → `"1 job"`; `3` → `"3 jobs"`. */
export function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/**
 * Fare columns are `Float`s, so adding them accumulates binary-fraction dust.
 * Anything summed for display is rounded to the cent it is printed at, the same
 * rule `src/lib/dashboard/hub/jobs.ts` applies at the server boundary.
 */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
