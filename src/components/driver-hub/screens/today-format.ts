/**
 * Display helpers shared by the Today screen and its three card components.
 *
 * They live in their own module rather than in `today-screen.tsx` because the
 * current-job, zone-demand and attention cards all need them, and importing
 * them from the screen would make the screen and its cards mutually dependent —
 * the same reason `drivers-format.ts` and `vehicles-format.ts` exist. Nothing
 * here decides what a number *means*; that is `src/lib/dashboard/hub/today.ts`.
 *
 * Every formatter is locale-pinned and anchored to `HUB_TIME_ZONE`, for two
 * reasons:
 *
 * 1. This tree server-renders and then hydrates. A formatter that read the
 *    runtime's locale or time zone would produce one string in Node and a
 *    different one in the browser, which is a hydration mismatch — the same
 *    reasoning `drivers-format.ts` states for its own formatters. A *fixed*
 *    zone is immune to that in a way the browser's zone is not.
 * 2. `today.ts` buckets every "today" boundary in the same zone. These two used
 *    to disagree: the loader bucketed in UTC while this header named a UTC date,
 *    so "Earned today" covered 04:00→04:00 Tbilisi and the two descriptions of
 *    "today" parted company for four hours every night. Both now describe the
 *    day a driver would call today — see `@/lib/dashboard/hub/timezone`.
 */
import { HUB_TIME_ZONE } from "@/lib/dashboard/hub/timezone";

/**
 * `en-US` with two decimals, matching the handoff's `₾142.60`. Pinned rather
 * than left to the browser so a driver on a `de-DE` locale does not read
 * `₾1.200,50` beside a hard-coded `₾0.40` and see two currencies.
 *
 * `Order.price` is already in GEL major units, so nothing is divided here.
 */
const gelFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The design's "Saturday 30 August", for the header subhead. */
const weekdayDateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: HUB_TIME_ZONE,
});

/** The design's "10 Sep 2026", for a document's expiry date. */
const shortDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: HUB_TIME_ZONE,
});

/** The design's "09:40". `hour12: false` so 13:00 never becomes "1 pm". */
const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: HUB_TIME_ZONE,
});

/** What the design prints where a figure is genuinely not known. */
export const EMPTY_VALUE = "—";

/**
 * How many trailing characters of a cuid make up a display id.
 *
 * Matches `SHORT_ID_LENGTH` in `src/lib/dashboard/hub/jobs.ts` and the copy in
 * `drivers-format.ts`, so the job in this screen's "Current job" card and the
 * same job on the Jobs screen print character-for-character the same id. The
 * full cuid rides along as a `title`, because a truncated id is a label rather
 * than an identifier.
 */
const SHORT_ID_LENGTH = 6;

/**
 * The uppercase 11px micro-label the design puts at the top of every card in
 * Today's first row.
 *
 * A constant rather than a component because two of the three cards are
 * `HubCard`s (whose `title` slot is the *15px* card title used in row two) and
 * the third is a `MetricTile` that already renders this style internally. A
 * literal class string is also what Tailwind's source scanner can see, the same
 * idiom as `HEAD_CLASSES` in `vehicles-screen.tsx`.
 */
export const TILE_LABEL_CLASSES =
  "text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground";

/** `18.4` → `₾18.40`. */
export function formatGel(amountGel: number): string {
  return `₾${gelFormatter.format(amountGel)}`;
}

/** `14.23` → `"14.2 km"`, the precision the design shows distances at. */
export function formatDistanceKm(distanceKm: number): string {
  return `${distanceKm.toFixed(1)} km`;
}

/** An ISO timestamp → the design's `09:40`. */
export function formatClock(iso: string): string {
  return clockFormatter.format(new Date(iso));
}

/** An ISO timestamp → the design's `10 Sep 2026`. */
export function formatShortDate(iso: string): string {
  return shortDateFormatter.format(new Date(iso));
}

/**
 * The header subhead: "Saturday 30 August · Tbilisi".
 *
 * Called on the server with the request's `new Date()` and the account's own
 * city, never in the browser — see `today/page.tsx` for why the string crosses
 * the boundary already formatted.
 */
export function formatTodaySubtitle(now: Date, city: string): string {
  return `${weekdayDateFormatter.format(now)} · ${city}`;
}

/**
 * A rate as the design prints it, or an em dash when there is none.
 *
 * `null` must not collapse to `0%`: a completion rate with no finished job
 * behind it is unknown, not zero, and "0%" would read as "you failed every
 * job".
 */
export function formatPercent(percent: number | null): string {
  return percent === null ? EMPTY_VALUE : `${percent}%`;
}

/** `1, "job"` → `"1 job"`; `8` → `"8 jobs"`. */
export function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/** The last six characters of a cuid, uppercased — the design's `TB4821`. */
export function shortId(id: string): string {
  return id.slice(-SHORT_ID_LENGTH).toUpperCase();
}
