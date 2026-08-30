/**
 * The one time zone the Driver Hub thinks in, and the calendar arithmetic every
 * hub screen and every hub loader does against it.
 *
 * ## Why a fixed IANA zone rather than UTC or the runtime's
 *
 * The hub used to be split: `jobs-format.ts` printed clock times in
 * `Asia/Tbilisi` while the other screens printed theirs in UTC, and every loader
 * bucketed its days in UTC. The result was that the same job showed two
 * different clock times depending on which screen you were on, and "Earned
 * today" covered 04:00→04:00 Tbilisi while the header beside it named the
 * Tbilisi date — the two disagreed for four hours every night. This module
 * exists so that cannot happen again: the constant and the helpers below are the
 * only definition of what a "day" is anywhere in the hub.
 *
 * A *fixed* zone gets two properties at once that no other choice gets both of:
 *
 * 1. **It is the driver's wall clock.** This is a single-country product —
 *    GEL fares, Tbilisi routes, a "Driver Hub · Georgia" brand row — so the day
 *    a driver calls "today" is the Tbilisi day. UTC gets this wrong by four
 *    hours on every timestamp and wrong about the *day* for anything after
 *    20:00 local.
 * 2. **It is identical on the server and in the browser.** This tree
 *    server-renders and then hydrates. A formatter that read the machine's zone
 *    (`Intl` with no `timeZone`, or `Date#getHours`) would produce one string in
 *    Node and another in the browser and trip a hydration mismatch — and on the
 *    loader side it would make the figures depend on which host the deploy
 *    landed on. Neither is true of a zone that is written down.
 *
 * ## Why `Intl` and `AT TIME ZONE` rather than a hard-coded +4
 *
 * Georgia has observed no daylight saving since 2005 and sits at UTC+4 all year,
 * so `instant + 4h` would give the right answer today for every helper here, and
 * would be considerably less code. It is deliberately not what these helpers do.
 * A zone rule is politics, not physics: Georgia has changed its offset and its
 * DST policy several times since 1990, and if it changes again the failure mode
 * of a hard-coded offset is silent — no error, no test failure, just every
 * earnings figure quietly bucketed against the wrong midnight. Going through
 * `Intl.DateTimeFormat` on the JS side and `AT TIME ZONE` on the SQL side means
 * the rule is read from the tz database at the moment it is applied, so a future
 * rule change is picked up by a Node upgrade and a Postgres tzdata refresh
 * rather than by someone remembering this file exists.
 *
 * ## Not `server-only`
 *
 * Unlike its neighbours in this directory, this module is imported from
 * `"use client"` components (`src/components/driver-hub/screens/*-format.ts`) as
 * well as from the loaders — that shared import is the whole point. It therefore
 * imports nothing, touches no Prisma client and reads no environment: it is a
 * constant, some `Intl` arithmetic and one SQL string builder.
 */

/** Georgia's only time zone, and the hub's single source of "what day is it". */
export const HUB_TIME_ZONE = "Asia/Tbilisi";

/**
 * Milliseconds in a calendar day.
 *
 * Used only to convert a *naive* (zone-free) midnight into a day number, never
 * to step across a real instant — see `hubDayNumber`. Days in a zone with DST
 * are not all 86.4M ms long, which is exactly why the helpers below add days by
 * incrementing a calendar field and re-resolving the offset rather than by
 * adding this constant to an instant.
 */
const MS_PER_DAY = 86_400_000;

/** How many characters of an ISO timestamp make up its `YYYY-MM-DD` prefix. */
const ISO_DATE_LENGTH = 10;

/**
 * The wall-clock fields of an instant in `HUB_TIME_ZONE`.
 *
 * `hourCycle: "h23"` rather than `hour12: false`: the latter renders midnight as
 * "24" under some ICU builds, which would silently push every start-of-day
 * calculation onto the previous day.
 */
const CIVIL_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: HUB_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** A calendar date in `HUB_TIME_ZONE`. `month` is 1-based, unlike `Date`. */
export type HubCivilDate = {
  year: number;
  month: number;
  day: number;
};

type HubCivilDateTime = HubCivilDate & {
  hour: number;
  minute: number;
  second: number;
};

/**
 * An instant's wall-clock fields in `HUB_TIME_ZONE`.
 *
 * Read out of `formatToParts` by part name rather than by parsing a formatted
 * string: the parts are addressed by what they are, so no assumption about a
 * locale's field order can silently swap the month and the day.
 */
function civilPartsOf(instant: Date): HubCivilDateTime {
  const parts = CIVIL_PARTS_FORMATTER.formatToParts(instant);
  const field = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);

  return {
    year: field("year"),
    month: field("month"),
    day: field("day"),
    hour: field("hour"),
    minute: field("minute"),
    second: field("second"),
  };
}

/**
 * A zone-free `Y-M-D h:m:s` reinterpreted as if it were UTC.
 *
 * Every field is allowed to overflow — `naiveUtc(2026, 13, 0)` is 31 December
 * 2026 — which is what lets `hubDayStartFor` express "the last day of this
 * month" as day zero of the next one without a leap-year table.
 *
 * Built with `setUTCFullYear` rather than `Date.UTC` to sidestep the two-digit
 * -year trap, where `Date.UTC(99, …)` silently means 1999.
 */
function naiveUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);

  return date;
}

/**
 * `HUB_TIME_ZONE`'s offset from UTC at `instant`, in milliseconds (+4h today).
 *
 * Derived by formatting the instant in the zone and asking how far the resulting
 * wall clock sits from the same instant read as UTC — which is the only way to
 * get an offset out of the tz database from JavaScript without a library. The
 * instant is floored to the second first because `formatToParts` has no
 * millisecond field to compare against.
 */
function zoneOffsetMs(instant: Date): number {
  const parts = civilPartsOf(instant);
  const wallClock = naiveUtc(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const wholeSeconds = Math.floor(instant.getTime() / 1000) * 1000;

  return wallClock.getTime() - wholeSeconds;
}

/**
 * The instant at which the wall clock in `HUB_TIME_ZONE` reads the given civil
 * date and time — the inverse of `civilPartsOf`.
 *
 * Two passes, because the offset that applies is a function of the answer we are
 * trying to find. The first pass subtracts the offset in force *near* the target
 * to get within a day of it; the second re-reads the offset at that candidate
 * and corrects. In a zone with no DST both passes agree and the second is a
 * no-op — it is here so that a future rule change lands correctly instead of
 * being off by an hour for six months a year.
 */
function instantFromCivil(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const naive = naiveUtc(year, month, day, hour, minute, second).getTime();
  const firstGuess = new Date(naive - zoneOffsetMs(new Date(naive)));

  return new Date(naive - zoneOffsetMs(firstGuess));
}

/** Two-digit zero padding for a month or day. */
function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** The calendar date `instant` falls on in `HUB_TIME_ZONE`. */
export function hubCivilDate(instant: Date): HubCivilDate {
  const { year, month, day } = civilPartsOf(instant);

  return { year, month, day };
}

/**
 * The `YYYY-MM-DD` key an instant belongs to in `HUB_TIME_ZONE`.
 *
 * This is the key every loader groups by and every screen labels a bar with, so
 * a bar reading "Sun" really is the driver's Sunday.
 */
export function toHubDayKey(instant: Date): string {
  const { year, month, day } = hubCivilDate(instant);

  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/**
 * A `YYYY-MM-DD` key as the instant that day *begins* in `HUB_TIME_ZONE` — for
 * `2026-08-30` that is `2026-08-29T20:00:00Z`.
 *
 * The caller is responsible for the key being a real calendar date; callers
 * taking one from a URL round-trip it through `toHubDayKey` to prove it (see
 * `earnings.ts`). Keys produced by a loader are real by construction.
 */
export function parseHubDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number);

  return instantFromCivil(year ?? Number.NaN, month ?? 1, day ?? 1);
}

/**
 * The instant a given civil date begins at in `HUB_TIME_ZONE`.
 *
 * Fields may overflow, so "the last day of this month" is `hubDayStartFor(year,
 * month + 1, 0)`. Exported for the Earnings month presets, which are the only
 * place the hub reasons about a month rather than a day or a week.
 */
export function hubDayStartFor(year: number, month: number, day: number): Date {
  return instantFromCivil(year, month, day);
}

/** The instant the Tbilisi day `instant` falls on began. */
export function startOfHubDay(instant: Date): Date {
  const { year, month, day } = hubCivilDate(instant);

  return instantFromCivil(year, month, day);
}

/**
 * The start of the Tbilisi day `days` after the one `instant` falls on;
 * `days` may be negative.
 *
 * Note that the time of day is *not* carried over — the result is always a
 * midnight. Every caller in the hub steps between day boundaries, and a helper
 * that preserved the clock time would be a different (and DST-unsafe) operation
 * wearing the same name.
 *
 * The step is taken on the calendar field and then re-resolved through the zone,
 * not by adding `MS_PER_DAY` to an instant, so a day that is 23 or 25 hours long
 * under some future rule still counts as one day.
 */
export function startOfHubDayPlus(instant: Date, days: number): Date {
  const { year, month, day } = hubCivilDate(instant);

  return instantFromCivil(year, month, day + days);
}

/**
 * The instant the Tbilisi day `instant` falls on ends — i.e. the start of the
 * next one.
 *
 * Exclusive on purpose: it is the upper bound of a half-open `>= start AND <
 * end` query, which counts a whole day without anyone having to write down what
 * its final instant is (`23:59:59.999`? `.999999`?).
 */
export function endOfHubDayExclusive(instant: Date): Date {
  return startOfHubDayPlus(instant, 1);
}

/**
 * How many whole days have elapsed in `HUB_TIME_ZONE` since 1 January 1970.
 *
 * The point of a day *number* is that two of them can simply be subtracted:
 * `Date` offers no way to count calendar days across a zone, and doing it by
 * dividing a millisecond difference is what puts a boundary an hour out the
 * first time a zone gains DST. Every "N days between" figure in the hub goes
 * through this.
 */
export function hubDayNumber(instant: Date): number {
  const { year, month, day } = hubCivilDate(instant);

  return Math.round(naiveUtc(year, month, day).getTime() / MS_PER_DAY);
}

/** Whole Tbilisi calendar days from `from` to `to`; negative when `to` is earlier. */
export function differenceInHubDays(from: Date, to: Date): number {
  return hubDayNumber(to) - hubDayNumber(from);
}

/**
 * The day of the week in `HUB_TIME_ZONE`, `0` for Sunday through `6` for
 * Saturday — the same numbering as `Date#getDay`, so a reader does not have to
 * learn a second convention.
 *
 * Derived from the day number rather than from a second formatter: 1 January
 * 1970 was a Thursday, which is index 4, so the epoch day number offset by 4 is
 * the weekday.
 */
export function hubWeekdayIndex(instant: Date): number {
  return (((hubDayNumber(instant) + 4) % 7) + 7) % 7;
}

/**
 * The instant the Monday of `instant`'s week began, in `HUB_TIME_ZONE`.
 *
 * Monday-first because that is where the design's week starts — the Performance
 * bars run Mon–Sun and the Earnings "This week" preset covers Mon–Sun — not
 * because of any locale default.
 */
export function startOfHubWeek(instant: Date): Date {
  // `hubWeekdayIndex` is 0 for Sunday, so shift the week to start on Monday.
  const daysSinceMonday = (hubWeekdayIndex(instant) + 6) % 7;

  return startOfHubDayPlus(instant, -daysSinceMonday);
}

/**
 * SQL that reduces a UTC-stored `timestamp` column to the *Tbilisi* calendar day
 * it falls on, as a naive `timestamp` at that day's midnight.
 *
 * The double `AT TIME ZONE` is not a typo and the order of the two zones is not
 * interchangeable. `Order.completedAt` is Prisma's `DateTime` on Postgres, which
 * is `timestamp(3) without time zone` holding the UTC wall clock:
 *
 * - `column AT TIME ZONE 'UTC'` reads that naive value *as* UTC and yields a
 *   real `timestamptz` — an instant.
 * - `… AT TIME ZONE 'Asia/Tbilisi'` converts that instant to Tbilisi's wall
 *   clock and yields a naive `timestamp` again, which `date_trunc` then floors
 *   to Tbilisi midnight.
 *
 * The single-step form `column AT TIME ZONE 'Asia/Tbilisi'` — the obvious thing
 * to write, and what an earlier draft of this change used — is wrong twice over:
 * it interprets the stored UTC value as though it were already Tbilisi local
 * (shifting the wrong way), and it leaves a `timestamptz` for `date_trunc`,
 * which then floors it in the *session's* `TimeZone`, making the answer depend
 * on the database's own configuration. Both were confirmed against the live
 * database before this shape was settled on.
 *
 * Prisma reads the resulting naive `timestamp` back as a UTC-anchored `Date`, so
 * `hubDayKeyFromSqlDay` — not `toHubDayKey` — is what turns a returned row into
 * its key.
 *
 * `columnRef` is interpolated into the statement text, so it must be a
 * hard-coded identifier written in this repo and never anything derived from a
 * request. The zone is likewise a module constant, not a parameter.
 */
export function hubDayTruncSql(columnRef: string): string {
  return `date_trunc('day', ${columnRef} AT TIME ZONE 'UTC' AT TIME ZONE '${HUB_TIME_ZONE}')`;
}

/**
 * The suffix that pins a *bound* `Date` parameter to UTC in a raw query, as in
 * `"completedAt" >= (${instant} AT TIME ZONE 'UTC')`.
 *
 * Not cosmetic. Prisma binds a JS `Date` as `timestamp with time zone`, and
 * comparing the `timestamp without time zone` column against it makes Postgres
 * promote the *column* using the session's own `TimeZone` setting — so a bare
 * `"completedAt" >= ${instant}` silently selects a different set of rows on a
 * database whose session zone is not UTC. Measured, not assumed: with the
 * session on `Pacific/Kiritimati` the bare form excluded a row the pinned form
 * kept. Converting the parameter to a naive UTC wall clock instead makes both
 * sides of the comparison naive, and the answer independent of the session.
 *
 * This deployment's session zone is UTC today, so the bare form happened to be
 * right; it is one `ALTER DATABASE … SET TimeZone` away from not being.
 */
export const HUB_UTC_BOUND_SQL = "AT TIME ZONE 'UTC'";

/**
 * The `YYYY-MM-DD` key of a day bucket returned by `hubDayTruncSql`.
 *
 * The column comes back as a naive `timestamp` that Prisma anchors to UTC, so
 * its ISO date prefix already *is* the Tbilisi day key — the zone conversion
 * happened in Postgres. Passing such a value to `toHubDayKey` would convert it a
 * second time, which happens to give the same answer for a midnight-anchored
 * value and would stop doing so the moment the truncation granularity changed.
 */
export function hubDayKeyFromSqlDay(day: Date): string {
  return day.toISOString().slice(0, ISO_DATE_LENGTH);
}
