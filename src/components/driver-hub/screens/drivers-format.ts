/**
 * Display helpers shared by the Drivers screen's three parts (roster table,
 * detail panel, register form).
 *
 * They live in their own module rather than in `drivers-screen.tsx` because the
 * detail panel and the register form both need them and importing them from the
 * screen would make the screen and its panels mutually dependent.
 *
 * Every formatter here is deliberately locale-pinned and anchored to
 * `HUB_TIME_ZONE`. This tree server-renders and then hydrates, so a formatter
 * that reads the runtime's locale or time zone would produce a different string
 * on the two sides and trip a hydration mismatch; a fixed IANA zone is the same
 * on both. That zone is also the one `src/lib/dashboard/hub/drivers.ts` buckets
 * `jobsThisWeek` in, so the roster's join months and its weekly counts describe
 * the same calendar — see `@/lib/dashboard/hub/timezone` for why the hub pins
 * Tbilisi rather than UTC or the browser's zone.
 */
import { HUB_TIME_ZONE } from "@/lib/dashboard/hub/timezone";

/**
 * GEL in major units with two decimals, matching the handoff's `₾658.40`.
 *
 * `Order.price` is already in major units (see `sample.ts`'s note), so nothing
 * is divided here — the value arrives ready to format.
 */
const gelFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatGel(amountGel: number): string {
  return `₾${gelFormatter.format(amountGel)}`;
}

/** The design's "joined Feb 2026". */
const joinedMonthFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: HUB_TIME_ZONE,
});

export function formatJoinedMonth(isoDate: string): string {
  return joinedMonthFormatter.format(new Date(isoDate));
}

/**
 * A rating, or the design's em dash for a driver with none.
 *
 * `null` is the honest answer for an unrated driver and must not collapse to
 * `0.00`, which would read as "rated, and terribly".
 */
export function formatRating(rating: number | null): string {
  return rating === null ? "—" : rating.toFixed(2);
}

/**
 * How many trailing characters of a cuid make up a display id.
 *
 * Matches `SHORT_ID_LENGTH` in `src/lib/dashboard/hub/jobs.ts` so a job id
 * printed on the Jobs screen and the same job id printed in this screen's
 * "Recent jobs" list are character-for-character identical. The full cuid is
 * always carried alongside as a `title`, because a truncated id is a label, not
 * an identifier.
 */
const SHORT_ID_LENGTH = 6;

export function shortId(id: string): string {
  return id.slice(-SHORT_ID_LENGTH).toUpperCase();
}

/**
 * Up to two initials for the detail panel's avatar.
 *
 * Falls back to a single dash rather than an empty circle: `User.name` is a
 * required column, but a name of pure whitespace would otherwise render a
 * blank disc that looks like a loading state.
 */
export function initialsOf(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  return initials === "" ? "—" : initials;
}
