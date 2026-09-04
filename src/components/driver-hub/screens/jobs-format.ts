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
 * The locale is pinned for the other half of the same reason — `en-GB` gives
 * 24-hour times and "4 Aug", the handoff's own style, whatever the browser is
 * set to, and a formatter reading the machine's locale would render one string
 * in Node and a different one in the browser after hydration.
 *
 * The other half of that determinism is "now", which is *not* read from the
 * clock here: every relative label takes the instant its caller was rendered at,
 * threaded down from the server page. See `formatJobTime` below.
 */
import {
  HUB_TIME_ZONE,
  hubCivilDate,
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
const dayMonthFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: HUB_TIME_ZONE,
});

/** `4 Aug 2025` — a date in another year, where it is not. */
const dayMonthYearFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: HUB_TIME_ZONE,
});

/** The unabbreviated form, for the `title` on a cell that may truncate. */
const fullFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: HUB_TIME_ZONE,
});

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
function relativeDayLabel(date: Date, now: Date): string | null {
  const civilThen = civilDate(date);
  const civilNow = civilDate(now);
  const dayDelta = civilNow.dayNumber - civilThen.dayNumber;

  if (dayDelta === 0) {
    return null;
  }

  if (dayDelta === 1) {
    return "Yesterday";
  }

  if (dayDelta === -1) {
    return "Tomorrow";
  }

  return civilThen.year === civilNow.year
    ? dayMonthFormatter.format(date)
    : dayMonthYearFormatter.format(date);
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
export function formatJobTime(iso: string, nowIso: string): string {
  const date = new Date(iso);
  const day = relativeDayLabel(date, new Date(nowIso));
  const clock = clockFormatter.format(date);

  return day === null ? clock : `${day} ${clock}`;
}

/** The detail panel's "Today · 09:40" line, from the same day vocabulary. */
export function formatJobDateLabel(iso: string, nowIso: string): string {
  const date = new Date(iso);
  const day = relativeDayLabel(date, new Date(nowIso)) ?? "Today";

  return `${day} · ${clockFormatter.format(date)}`;
}

/**
 * `4 August 2026, 18:20`, for the `title` of a cell narrow enough to truncate.
 * A truncated timestamp is a label; this is the thing itself.
 */
export function formatJobTimestamp(iso: string): string {
  return fullFormatter.format(new Date(iso));
}

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
