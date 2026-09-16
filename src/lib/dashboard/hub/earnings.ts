/**
 * Everything the Driver Hub's **Earnings & payouts** sections render, fetched
 * and shaped in one server pass over a caller-supplied date range.
 *
 * Those sections are the top half of `/dashboard/performance`. They were their
 * own route until the wallet and the performance screen were merged, and
 * `/dashboard/earnings` was deleted rather than redirected; this module did not
 * change shape in the merge, and `getHubPerformance` still answers the other
 * half over its own window. The page runs the two concurrently.
 *
 * ## Who may read it
 *
 * All three personas, an employed `ROSTER` driver included. A roster driver was
 * once redirected off the earnings route and refused the export with a `403`,
 * on the ground that the fares they drove were settled to their employer and a
 * total headed with their own name therefore asserted something false about
 * whose money it was. Product overruled that and both gates are gone. What
 * replaced the refusal is the figures' own framing: `hubOrderScopeSql` scopes a
 * driver — employed or not — to `driverId = <this user>`, so the sums answer
 * "what did the jobs I drove earn", which is the question an employee checking
 * their week against their payslip is actually asking. Nothing in this module
 * blanks, zeroes or relabels a figure by persona, and nothing here should start
 * to; the only persona branch below is `BUSINESS`, and it is about *scope* —
 * a fleet sees the orders its company holds — not about entitlement.
 *
 * The range lives in the URL, exactly as the back office's Sales Analytics range
 * does (`src/lib/admin/analytics.ts`): the filter bar pushes new query params,
 * Next re-renders the page on the server, and every tile, the chart and the
 * breakdown come back recomputed. That is what makes this a server module with
 * no client fetching, and what makes a range shareable and bookmarkable.
 *
 * `resolveHubEarningsRange()` below is the only place preset → dates is decided,
 * so the tab a driver clicked, the two date inputs, the caption and the numbers
 * can never describe four different windows.
 *
 * ## Real vs sample
 *
 * Everything at the top level of `HubEarningsData` is `SUM(driverPayout +
 * overtimeDriverPayout)` over real `COMPLETED` orders — each order's stored 85%
 * share, which is what the driver (or the fulfilling company) earned, never what
 * the client paid for the job. `price` and `overtimeFee` are the client's money
 * and must not reach this screen; summing them here is the bug this module used
 * to have. No `serviceLevelAdjustment` term belongs in that sum either, and its
 * absence is deliberate: the Priority uplift and the Pooling discount are
 * already inside the basis `driverPayout` was computed from at booking
 * (`roundCurrency(price + serviceLevelAdjustment)`), so adding it again would
 * pay it out twice. The `fleet` breakdown a BUSINESS account gets is real on
 * the same terms — the same orders, the same two payout columns, sliced by
 * `Order.driverId` instead of by day — which is why it sits at the top level
 * beside `grossFares` rather than under `sampled`. Everything under `sampled`
 * is fictional and must
 * be rendered with a `<SampleNote />` beside it — tips, incentives, adjustments,
 * the online-hours figures derived from them, and the payout-history table. The
 * split is a nesting level rather than a naming convention on purpose: a screen
 * cannot read a fictional number without typing the word `sampled` on the way to
 * it.
 *
 * Note in particular that `sampled.rangeTotal` is sampled even though most of it
 * is real — it folds estimated tips and incentives into real fares, so the whole
 * figure inherits the badge. The honest number to headline is `grossFares`.
 *
 * Server-only: it talks to Prisma directly. The object it returns crosses into a
 * `"use client"` tree, so dates leave as plain `YYYY-MM-DD` strings and numbers
 * leave unformatted for the screen to present.
 *
 * Time boundaries: every bucket is a **Tbilisi** day, from
 * `@/lib/dashboard/hub/timezone` — both the SQL grouping and the JS-side range
 * arithmetic that zero-fills it. They were UTC days until the hub was unified on
 * one zone, which meant a bar labelled "Sun" actually ran 04:00 Sunday to 04:00
 * Monday on the driver's own clock and disagreed with the clock times the Jobs
 * screen printed for the very same orders. The zone is fixed rather than read
 * from the host, so a deploy cannot move a bar; the timezone module explains
 * the choice, and the exact SQL shape, at length.
 */
import "server-only";

import { OrderStatus, Prisma } from "@prisma/client";

import type { HubAccount, HubPersona } from "@/lib/dashboard/hub/account";
import {
  SAMPLE_INCENTIVES_NOTE,
  SAMPLE_PAYOUT_HISTORY,
  sampleEarningsExtras,
  sampleOnlineHours,
} from "@/lib/dashboard/hub/sample";
import type {
  SampleEarningsExtras,
  SamplePayoutRow,
} from "@/lib/dashboard/hub/sample";
import {
  differenceInHubDays,
  hubCivilDate,
  hubDayKeyFromSqlDay,
  hubDayStartFor,
  HUB_UTC_BOUND_SQL,
  hubDayTruncSql,
  hubWeekdayIndex,
  parseHubDayKey,
  startOfHubDay,
  startOfHubDayPlus,
  startOfHubWeek,
  toHubDayKey,
} from "@/lib/dashboard/hub/timezone";
import { prisma } from "@/lib/prisma";

/**
 * A company id no cuid can ever equal, used only to make a missing
 * `HubAccount.companyId` fail closed. See `hubOrderScopeSql` below.
 */
const UNMATCHABLE_COMPANY_ID = "__hub-account-has-no-company__";

/**
 * Pins a bound `Date` parameter to UTC inside a raw query. See
 * `HUB_UTC_BOUND_SQL` for why a bare bound would make the window depend on the
 * database session's own `TimeZone`.
 */
const UTC_BOUND = Prisma.raw(HUB_UTC_BOUND_SQL);

/** `YYYY-MM-DD`, the only shape accepted from the query string. */
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** How many days the "Last 30 days" preset covers. */
const LAST_N_DAYS = 30;

/**
 * Above this many days the chart groups by week instead of by day, per the
 * design ("Daily earnings" at ten days or fewer, "Weekly earnings" above).
 * Thirty daily bars in the width the card has are unreadable; five weekly ones
 * are not.
 */
const DAILY_GROUPING_MAX_DAYS = 10;

/**
 * Hard ceiling on the span a range may cover, in days.
 *
 * A year plus a leap day: the longest window a driver plausibly asks for is a
 * full tax year, and every preset is a month or less. The cap is not about the
 * presets, though — it is about a hand-edited `?from=1970-01-01`, which would
 * otherwise ask Postgres to scan the whole order history and this module to
 * zero-fill twenty thousand day objects into a payload bound for the browser.
 * Over-long ranges are clamped forward from `to` rather than rejected, because
 * the recent end of the window is the part anyone actually wanted.
 */
export const MAX_HUB_EARNINGS_RANGE_DAYS = 366;

/** The preset tabs across the top of the filter bar. */
export type HubEarningsPresetId =
  "this-week" | "last-week" | "this-month" | "last-30-days";

export type HubEarningsPreset = {
  id: HubEarningsPresetId;
  /** Tab copy, straight from the design. */
  label: string;
};

/**
 * The four presets, in the order the design's tab strip shows them. Exported so
 * the filter bar renders from the same list this module resolves against and
 * cannot offer a tab that does not resolve.
 */
export const HUB_EARNINGS_PRESETS: readonly HubEarningsPreset[] = [
  { id: "this-week", label: "This week" },
  { id: "last-week", label: "Last week" },
  { id: "this-month", label: "This month" },
  { id: "last-30-days", label: "Last 30 days" },
];

/** Where a visitor with no (or an unusable) range in the URL lands. */
export const HUB_EARNINGS_DEFAULT_PRESET: HubEarningsPresetId = "this-week";

/**
 * A resolved range: two inclusive `YYYY-MM-DD` Tbilisi dates, plus which tab
 * should look selected.
 *
 * Inclusive on both ends because that is what the design's two `<input
 * type="date">` fields hold and what the "from → to · N days" caption reads
 * back. The half-open `Date` bounds a query needs are derived inside
 * `getHubEarnings`, not carried here, so nothing serialisable ever holds a
 * `Date`.
 */
export type ResolvedHubEarningsRange = {
  /** `"custom"` whenever the dates did not come from a preset. */
  preset: HubEarningsPresetId | "custom";
  from: string;
  to: string;
  /** Whole Tbilisi days in `[from, to]`, both ends counted. */
  days: number;
};

/** One Tbilisi day of the range, zero-filled. */
export type HubEarningsDay = {
  /** Tbilisi `YYYY-MM-DD`. */
  date: string;
  jobs: number;
  /**
   * `SUM(driverPayout + overtimeDriverPayout)` for that day — the driver's (or
   * fulfilling company's) earned share, never the client's price.
   */
  fares: number;
};

/**
 * One column of the chart. Identical to a `HubEarningsDay` when the grouping is
 * daily; a Monday-anchored Tbilisi week when it is weekly.
 */
export type HubEarningsBucket = {
  /** Tbilisi `YYYY-MM-DD` of the bucket's first day *within the range*. */
  startDate: string;
  /** Tbilisi `YYYY-MM-DD` of its last day within the range; equals `startDate` when daily. */
  endDate: string;
  jobs: number;
  fares: number;
};

/**
 * One fleet driver's contribution to the range's revenue.
 *
 * Every field is real, read from `COMPLETED` `Order` rows scoped to the
 * signed-in company. Nothing here is sampled, so nothing here is badged.
 */
export type HubEarningsDriverRow = {
  /** `User.id` — what `Order.driverId` holds. Stable key for the table row. */
  driverId: string;
  /**
   * `User.name`.
   *
   * Read from `User` rather than from the company's current roster on purpose:
   * `Order.driverId` outlives a driver's membership of a fleet
   * (`DriverProfile.companyId` is nullable and is nulled on removal), so a
   * driver who has since left still has orders this company was paid for and
   * must still be nameable in a range that covers them.
   */
  name: string;
  /** COMPLETED orders this driver ran for the company, in range. */
  jobsCompleted: number;
  /**
   * `SUM(driverPayout + overtimeDriverPayout)` for those orders — what the
   * fleet earned on them, never what its clients were billed.
   */
  grossFaresGel: number;
  /** `grossFaresGel / jobsCompleted`, or 0 when the driver completed nothing. */
  averagePerJobGel: number;
  /**
   * This driver's share of the range's `grossFares`, 0–100, one decimal.
   *
   * Computed here rather than in the screen so the denominator is unarguably
   * the same `grossFares` the headline tile prints. Rounding is per row, so the
   * column need not sum to exactly 100 — see `HubEarningsFleet` on never
   * printing a re-summed total.
   */
  sharePercent: number;
};

/**
 * The BUSINESS per-driver revenue breakdown for the range.
 *
 * Built entirely from existing `Order` columns — no schema change, no sampled
 * value, no new index. The company's own tenancy scope is applied in the query
 * exactly as `drivers.ts` applies it.
 *
 * **Reconciliation.** `sum(drivers[].grossFaresGel) + unassigned.grossFaresGel`
 * equals `HubEarningsData.grossFares` only up to per-row rounding: the day
 * series rounds per Tbilisi day and this rollup rounds per driver, both off
 * `Float` columns, so the two can drift by cents even though they are the same
 * set of orders. A screen showing a total row must therefore print
 * `data.grossFares` and never a re-sum of these rows.
 */
export type HubEarningsFleet = {
  /** Drivers who completed at least one job in range, largest revenue first. */
  drivers: readonly HubEarningsDriverRow[];
  /**
   * The company's completed orders in range that carry **no** `driverId`.
   *
   * Real and non-zero in ordinary operation: a company claims an order with its
   * own identity and assigns a driver at dispatch time, and `Order.driverId` is
   * `onDelete: SetNull`, so a deleted user's completed orders lose their driver
   * while keeping their money. Carried as its own object rather than folded into
   * `drivers` as a fake row so the screen labels it honestly, and so
   * `drivers.length` remains the count of actual drivers.
   *
   * Its presence is what lets the table reconcile with `grossFares` at all.
   */
  unassigned: {
    jobsCompleted: number;
    grossFaresGel: number;
    sharePercent: number;
  };
};

export type HubEarningsData = {
  range: ResolvedHubEarningsRange;
  /**
   * Which account shape this data was assembled for.
   *
   * Carried on the payload rather than re-derived in the screen because
   * `HubEarningsData` is what crosses into the `"use client"` tree — the screen
   * never sees a `HubAccount`, and a client component has no business
   * re-deriving a persona from `kind` and `companyId` anyway. All three
   * variants occur here, `ROSTER` included: an employed driver used to be
   * redirected away from this data and refused the export, and both gates were
   * removed by product decision — see the module header. The screen branches on
   * `BUSINESS` only, so `INDEPENDENT` and `ROSTER` render identically, which is
   * correct: `hubOrderScopeSql` scopes both to the orders assigned to them.
   */
  persona: HubPersona;
  /** Which shape `buckets` is in — see `DAILY_GROUPING_MAX_DAYS`. */
  grouping: "daily" | "weekly";
  /** Every Tbilisi day in range, oldest first, zero-filled. */
  days: readonly HubEarningsDay[];
  /** What the chart plots: `days` verbatim, or weekly sums of them. */
  buckets: readonly HubEarningsBucket[];
  /**
   * `SUM(driverPayout + overtimeDriverPayout)` over the whole range — what was
   * actually earned, not what the client paid. The honest headline.
   *
   * "Gross" here means *before* the sampled tips, incentives and adjustments
   * below, not before the platform's commission: the commission is already
   * taken out, because these are the stored payout columns.
   */
  grossFares: number;
  jobsCompleted: number;
  /** `grossFares / jobsCompleted`, or 0 when nothing completed in range. */
  averagePerJob: number;
  /**
   * Who in the fleet earned the money above. `null` for anything that is not a
   * BUSINESS account — an individual driver's earnings have no per-driver
   * breakdown, and `null` says that rather than an empty array, which would
   * read as "a fleet with nobody in it".
   */
  fleet: HubEarningsFleet | null;
  /** Everything below this line is fictional — badge it. */
  sampled: {
    /** Tips, incentives and adjustments for the range. */
    extras: SampleEarningsExtras;
    /** Estimated hours online, for the "Nh online" note. */
    onlineHours: number;
    /** `rangeTotal / onlineHours`, for the "₾N per online hour" note. */
    perOnlineHour: number;
    /**
     * Fares + tips + incentives + adjustments — the breakdown card's "Range
     * total" footer. Sampled because three of its four terms are.
     */
    rangeTotal: number;
    /** Caption under the Incentives tile. */
    incentivesNote: string;
    /**
     * The payout table. Deliberately *not* range-filtered: a payout period is a
     * fixed weekly settlement window, which is why the breakdown card's footer
     * reads "Range total" rather than "Payout total".
     */
    payouts: readonly SamplePayoutRow[];
  };
};

/**
 * The one clause that scopes this file's query to the signed-in account: a fleet
 * sees the orders it holds, a driver sees the orders assigned to them.
 *
 * The SQL twin of the `Prisma.OrderWhereInput` helper of the same name in
 * `today.ts`, `jobs.ts` and `performance.ts` — this screen's only query is raw,
 * because `groupBy` cannot bucket by a truncated timestamp. It is repeated
 * across all four files rather than lifted into a shared module: four screens,
 * four independent server passes, and a clause this small is not worth a fifth
 * file that all four have to be read alongside. It *is* the tenancy boundary,
 * though, so if you change it here, change it in all four.
 *
 * `Prisma.sql` keeps both branches parameterised — the account id is never
 * interpolated into the statement text.
 */
function hubOrderScopeSql(account: HubAccount): Prisma.Sql {
  if (account.kind === "BUSINESS") {
    // A null `companyId` would become `"companyId" = NULL`, which matches
    // nothing in SQL — but the Prisma-side twin of this helper would read as
    // `IS NULL` and match every unclaimed order, so both use the same
    // unmatchable sentinel and fail closed identically.
    return Prisma.sql`"companyId" = ${account.companyId ?? UNMATCHABLE_COMPANY_ID}`;
  }

  return Prisma.sql`"driverId" = ${account.userId}`;
}

/**
 * Prices are `Float` columns, so summing them accumulates binary-fraction dust;
 * money crossing this boundary is rounded to the cent it will be printed at.
 * Repeated in the sibling hub modules for the same reason `hubOrderScopeSql` is.
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A `YYYY-MM-DD` param as the instant its Tbilisi day begins, or `null` when it
 * is missing, repeated (`?from=a&from=b`), malformed, or not a real calendar
 * date.
 *
 * Round-tripped through `toHubDayKey` rather than trusted: that is what catches
 * "2026-02-31", which rolls forward into March rather than failing.
 */
function parseHubDayParam(value: string | string[] | undefined): Date | null {
  if (typeof value !== "string" || !DATE_PARAM_PATTERN.test(value)) {
    return null;
  }

  const parsed = parseHubDayKey(value);

  return toHubDayKey(parsed) === value ? parsed : null;
}

/** Whole Tbilisi days in the inclusive interval `[from, to]`. */
function inclusiveDayCount(from: Date, to: Date): number {
  return differenceInHubDays(from, to) + 1;
}

/**
 * The two inclusive Tbilisi dates a preset stands for, relative to `today`.
 *
 * The design's own preset dates (This week 24–30 Aug, Last week 17–23 Aug, This
 * month 1–31 Aug, Last 30 days 31 Jul – 29 Aug) are reproduced exactly: weeks
 * run Monday to Sunday and cover the whole week even when part of it is still
 * ahead, while "Last 30 days" ends *yesterday*. That asymmetry is the design's,
 * and it is a defensible one — a trailing average over completed days is not
 * distorted by a day that is still accruing, whereas "this week" is explicitly
 * the current week and should show its shape so far.
 */
function presetRange(
  preset: HubEarningsPresetId,
  today: Date,
): { from: Date; to: Date } {
  switch (preset) {
    case "this-week": {
      const monday = startOfHubWeek(today);
      return { from: monday, to: startOfHubDayPlus(monday, 6) };
    }
    case "last-week": {
      const monday = startOfHubDayPlus(startOfHubWeek(today), -7);
      return { from: monday, to: startOfHubDayPlus(monday, 6) };
    }
    case "this-month": {
      // The month is read off the *Tbilisi* calendar, so the first hours of the
      // 1st belong to the new month rather than to the old one.
      const { year, month } = hubCivilDate(today);
      return {
        from: hubDayStartFor(year, month, 1),
        // Day 0 of the next month is the last day of this one, leap years
        // included.
        to: hubDayStartFor(year, month + 1, 0),
      };
    }
    case "last-30-days": {
      const yesterday = startOfHubDayPlus(today, -1);
      return {
        from: startOfHubDayPlus(yesterday, -(LAST_N_DAYS - 1)),
        to: yesterday,
      };
    }
  }
}

/** A known preset id, or `null` for anything else in the query string. */
function parsePresetParam(
  value: string | string[] | undefined,
): HubEarningsPresetId | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = HUB_EARNINGS_PRESETS.find((preset) => preset.id === value);

  return match?.id ?? null;
}

/**
 * Turns two `YYYY-MM-DD` strings into a range that is safe to query with.
 *
 * Three corrections, in this order:
 *
 * 1. **Reject** — if either string is not a real calendar date, neither is
 *    trusted and the whole range falls back to the default preset. Half-
 *    honouring a pair where only one side parsed would silently show a window
 *    nobody asked for, which is worse than showing the default one.
 * 2. **Clamp inverted** — `from` after `to` is swapped. The date inputs cannot
 *    produce it; a hand-edited URL can.
 * 3. **Cap the span** — anything longer than `MAX_HUB_EARNINGS_RANGE_DAYS` is
 *    trimmed from the `from` end, keeping the recent days.
 *
 * Total by design: there is no error path, because an earnings page that 400s on
 * a mistyped URL is less useful than one that falls back to this week.
 */
function normaliseRange(
  from: string,
  to: string,
  today: Date,
): ResolvedHubEarningsRange {
  const parsedFrom = parseHubDayParam(from);
  const parsedTo = parseHubDayParam(to);

  if (parsedFrom === null || parsedTo === null) {
    return resolvePreset(HUB_EARNINGS_DEFAULT_PRESET, today);
  }

  const [first, last] =
    parsedFrom.getTime() <= parsedTo.getTime()
      ? [parsedFrom, parsedTo]
      : [parsedTo, parsedFrom];

  const cappedFirst =
    inclusiveDayCount(first, last) > MAX_HUB_EARNINGS_RANGE_DAYS
      ? startOfHubDayPlus(last, -(MAX_HUB_EARNINGS_RANGE_DAYS - 1))
      : first;

  return {
    preset: "custom",
    from: toHubDayKey(cappedFirst),
    to: toHubDayKey(last),
    days: inclusiveDayCount(cappedFirst, last),
  };
}

/** A preset id as a resolved range. */
function resolvePreset(
  preset: HubEarningsPresetId,
  today: Date,
): ResolvedHubEarningsRange {
  const { from, to } = presetRange(preset, today);

  return {
    preset,
    from: toHubDayKey(from),
    to: toHubDayKey(to),
    days: inclusiveDayCount(from, to),
  };
}

/**
 * The page's entry point: reads `?preset=` / `?from=` / `?to=` and returns the
 * range every part of the screen is built from.
 *
 * Precedence is dates over preset. Both are honoured because the filter bar
 * expresses the two intents differently — a tab click is `?preset=last-week`,
 * an edited date field is `?from=…&to=…` — and typed dates must win over a
 * `preset` param that merely lingered in the URL from the previous click. When
 * neither is usable the default preset applies.
 *
 * Kept next to `getHubEarnings` rather than in the page so that preset → dates
 * is decided in exactly one place; the page hands the returned `from`/`to`
 * straight back into `getHubEarnings`, which re-normalises them anyway.
 */
export function resolveHubEarningsRange(
  searchParams: Record<string, string | string[] | undefined>,
): ResolvedHubEarningsRange {
  // One `now` for the whole resolution, so a request that crosses Tbilisi
  // midnight cannot resolve "this week" and "last week" against two different
  // days.
  const today = startOfHubDay(new Date());

  const from = searchParams.from;
  const to = searchParams.to;

  if (typeof from === "string" && typeof to === "string") {
    return normaliseRange(from, to, today);
  }

  return resolvePreset(
    parsePresetParam(searchParams.preset) ?? HUB_EARNINGS_DEFAULT_PRESET,
    today,
  );
}

/**
 * Groups the zero-filled day rows into Monday-anchored Tbilisi weeks.
 *
 * A bucket's `startDate`/`endDate` are the first and last days *of the range*
 * that fall in that week, not the calendar week's own Monday and Sunday, so the
 * first and last columns of a chart over a partial week are labelled with the
 * days they actually cover rather than with days that were never queried.
 */
function toWeeklyBuckets(
  days: readonly HubEarningsDay[],
): readonly HubEarningsBucket[] {
  const buckets = new Map<string, HubEarningsBucket>();

  for (const day of days) {
    // Safe: every `date` here was produced by `toHubDayKey` a moment ago.
    const weekKey = toHubDayKey(startOfHubWeek(parseHubDayKey(day.date)));
    const existing = buckets.get(weekKey);

    if (existing === undefined) {
      buckets.set(weekKey, {
        startDate: day.date,
        endDate: day.date,
        jobs: day.jobs,
        fares: day.fares,
      });
      continue;
    }

    // `days` is oldest-first, so each further day of a week extends its end.
    existing.endDate = day.date;
    existing.jobs += day.jobs;
    existing.fares = roundCurrency(existing.fares + day.fares);
  }

  return [...buckets.values()];
}

/** One `groupBy` row, before names are resolved and shares are computed. */
type FleetRevenueRow = {
  /** `null` for the company's completed orders with no driver on them. */
  driverId: string | null;
  jobsCompleted: number;
  grossFaresGel: number;
};

/**
 * Per-driver `COMPLETED` revenue for a fleet, over the same half-open instant
 * window the day series is built from, plus the names those driver ids resolve
 * to.
 *
 * `null` for anything that is not a BUSINESS account with a company: an
 * individual driver's earnings have no per-driver breakdown, and returning null
 * rather than an empty array is what lets the screen tell "not a fleet" apart
 * from "a fleet whose drivers completed nothing". An individual account pays
 * nothing for this helper — it returns before it queries.
 *
 * Two round trips rather than one join: `groupBy` cannot include a relation's
 * columns, so the names are resolved in a second query keyed on the ids the
 * first returned. `drivers.ts` makes the same trade for the same reason.
 */
async function loadFleetRevenue(
  account: HubAccount,
  fromInstant: Date,
  toExclusiveInstant: Date,
): Promise<{
  rows: FleetRevenueRow[];
  namesByDriverId: ReadonlyMap<string, string>;
} | null> {
  const { companyId } = account;

  // Both halves are load-bearing: `persona` is the product rule, and the null
  // check is what narrows `companyId` to a string for the query below.
  if (account.persona !== "BUSINESS" || companyId === null) {
    return null;
  }

  const grouped = await prisma.order.groupBy({
    by: ["driverId"],
    where: {
      // The tenancy boundary. Deliberately *not* also filtered to the current
      // roster: `Order.driverId` outlives a driver's membership of a fleet, and
      // dropping a departed driver's orders would make this table fail to add
      // up to the `grossFares` figure printed above it.
      companyId,
      status: OrderStatus.COMPLETED,
      // Half-open, and the same two instants the day series uses, so a driver's
      // row and the chart's bars cover the identical window. A Prisma-built
      // `where` needs no `AT TIME ZONE 'UTC'` treatment — that is only for the
      // raw query below, where the bound would otherwise be promoted using the
      // database session's own zone.
      completedAt: { gte: fromInstant, lt: toExclusiveInstant },
    },
    _count: true,
    // The carrier's two payout columns, never the client's `price` and
    // `overtimeFee` — see this module's header and `prisma/schema.prisma`'s
    // `driverPayout` comment. A `_sum` over no rows is `null` in Prisma, which
    // is why both terms are `?? 0`-defaulted.
    _sum: { driverPayout: true, overtimeDriverPayout: true },
  });

  const rows: FleetRevenueRow[] = grouped.map((row) => ({
    driverId: row.driverId,
    jobsCompleted: row._count,
    grossFaresGel: roundCurrency(
      (row._sum.driverPayout ?? 0) + (row._sum.overtimeDriverPayout ?? 0),
    ),
  }));

  const driverIds = rows
    .map((row) => row.driverId)
    .filter((id): id is string => id !== null);

  // Read off `User` rather than `DriverProfile`: `Order.driverId` is a `User`
  // id (the `DriverDeliveries` relation), and a driver who has left this fleet
  // has a `DriverProfile` whose `companyId` no longer points here — filtering by
  // the roster would leave their row nameless while their money still counts.
  //
  // Skipped entirely on an empty list: `{ in: [] }` is a guaranteed-empty read
  // that is still a round trip.
  const users =
    driverIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: driverIds } },
          select: { id: true, name: true },
        });

  return {
    rows,
    namesByDriverId: new Map(users.map((user) => [user.id, user.name])),
  };
}

/**
 * Groups the raw rows into the screen's breakdown: named drivers largest first,
 * plus whatever the company earned on orders with no driver on them.
 *
 * `grossFares` is passed in rather than re-summed here so the share column's
 * denominator is provably the same number the headline tile prints.
 */
function toFleetBreakdown(
  rows: readonly FleetRevenueRow[],
  namesByDriverId: ReadonlyMap<string, string>,
  grossFares: number,
): HubEarningsFleet {
  const share = (fares: number): number =>
    grossFares === 0 ? 0 : Math.round((fares / grossFares) * 1000) / 10;

  const drivers: HubEarningsDriverRow[] = rows
    .filter(
      (row): row is FleetRevenueRow & { driverId: string } =>
        row.driverId !== null,
    )
    .map((row) => ({
      driverId: row.driverId,
      // A driver whose `User` row has since been deleted keeps their orders
      // (`onDelete: SetNull` fires on the FK, not on history) but loses their
      // name, so the fallback is a label rather than an empty cell — the money
      // is real and must still be attributable to *something*.
      name: namesByDriverId.get(row.driverId) ?? "Former driver",
      jobsCompleted: row.jobsCompleted,
      grossFaresGel: row.grossFaresGel,
      averagePerJobGel:
        row.jobsCompleted === 0
          ? 0
          : roundCurrency(row.grossFaresGel / row.jobsCompleted),
      sharePercent: share(row.grossFaresGel),
    }))
    // Largest earner first, then by name so two equal rows have a stable order
    // across renders rather than whatever the database returned.
    .sort(
      (a, b) => b.grossFaresGel - a.grossFaresGel || a.name.localeCompare(b.name),
    );

  const unassignedRow = rows.find((row) => row.driverId === null);
  const unassignedFares = unassignedRow?.grossFaresGel ?? 0;

  return {
    drivers,
    unassigned: {
      jobsCompleted: unassignedRow?.jobsCompleted ?? 0,
      grossFaresGel: unassignedFares,
      sharePercent: share(unassignedFares),
    },
  };
}

/**
 * Fetches and shapes every figure the earnings sections show, for either
 * account kind and any of the three personas, over the given range.
 *
 * `range` is re-normalised rather than trusted: it normally arrives straight
 * from `resolveHubEarningsRange`, but this function is the thing that touches
 * the database, so the span cap and the calendar-date check belong on this side
 * of the boundary too.
 *
 * The caller's `preset` survives that re-normalisation when the dates come back
 * untouched, and only then. `normaliseRange` answers the narrower question "is
 * this pair of dates usable", and every pair it approves is by definition
 * `"custom"` to it — it has no way to recognise that 24–30 August happens to be
 * what "This week" resolved to. Dropping the label here is what made the filter
 * bar render Custom for a range the driver had never customised, and left the
 * date fields at full opacity instead of dimmed. If normalisation *did* have to
 * correct the dates, the window is no longer the one the preset names, so
 * `"custom"` is then the honest answer and is kept.
 *
 * One query. The tiles are summed from the same zero-filled day rows the chart
 * plots, rather than from a separate aggregate, so the headline figure can never
 * disagree with the bars underneath it.
 */
export async function getHubEarnings(
  account: HubAccount,
  range: {
    from: string;
    to: string;
    preset?: ResolvedHubEarningsRange["preset"];
  },
): Promise<HubEarningsData> {
  const normalised = normaliseRange(
    range.from,
    range.to,
    startOfHubDay(new Date()),
  );

  const survivedIntact =
    normalised.from === range.from && normalised.to === range.to;

  const resolved: ResolvedHubEarningsRange =
    survivedIntact && range.preset !== undefined
      ? { ...normalised, preset: range.preset }
      : normalised;

  // The query bounds are half-open — `>= from AND < to + 1 day` — so the last
  // day of an inclusive range is counted whole without anyone having to write
  // down what its final instant is. Both are the *instants* Tbilisi days begin
  // at (20:00Z the evening before), which is what the `completedAt` comparison
  // needs: the column holds a UTC wall clock, so the bound has to be a UTC
  // instant even though the day it opens is a local one.
  const fromInstant = parseHubDayKey(resolved.from);
  const toExclusiveInstant = startOfHubDayPlus(parseHubDayKey(resolved.to), 1);

  // The one non-Prisma-idiomatic query in this module, for the reason
  // `driver-dashboard-data.ts` gives: `groupBy` cannot bucket by a truncated
  // timestamp, so a daily series needs raw SQL. `COUNT(*)` is cast to `int`
  // because an uncast Postgres count arrives as a `BigInt`, which does not
  // survive serialisation into a client component.
  //
  // The day expression comes from the timezone module, which explains why the
  // two `AT TIME ZONE` steps are both needed and why their order is not
  // interchangeable. `Prisma.raw` is safe here: its argument is a module
  // constant built from two hard-coded strings, never anything from a request.
  //
  // The two range bounds carry `AT TIME ZONE 'UTC'` for a separate reason — see
  // `HUB_UTC_BOUND_SQL`: Prisma binds a `Date` as `timestamptz`, and without
  // it Postgres would promote the naive column using the *session's* zone, which
  // would quietly move the window on a database not configured to UTC.
  //
  // The summed expression is the two **payout** columns, never `price` and
  // `overtimeFee`. Those two are what the CLIENT pays; this screen answers "what
  // did I earn", asked by the account that fulfilled the job. It used to sum
  // `price + overtimeFee`, which was wrong twice over: it showed drivers client
  // money as their own income (overstated by ~17.6% at a 15% commission), and it
  // was not even the client's correct total, because `serviceLevelAdjustment` is
  // a third column stored beside `price` and the client is billed
  // `price + serviceLevelAdjustment + overtimeFee`.
  //
  // The absence of `serviceLevelAdjustment` from this sum is deliberate, not the
  // same omission carried forward: `driverPayout` was computed at booking from
  // `roundCurrency(price + serviceLevelAdjustment)`, so the Priority uplift and
  // the Pooling discount are already inside it. Adding the adjustment here would
  // pay it out twice, once uncommissioned.
  //
  // The BUSINESS per-driver rollup runs *alongside* this query rather than
  // after it: neither depends on the other, and a fleet owner should not pay
  // two serial round trips for one screen. For every other persona
  // `loadFleetRevenue` returns `null` without touching the database.
  const [rows, fleetRevenue] = await Promise.all([
    prisma.$queryRaw<{ day: Date; jobs: number; fares: number }[]>`
      SELECT ${Prisma.raw(hubDayTruncSql('"completedAt"'))} AS day,
             COUNT(*)::int AS jobs,
             SUM("driverPayout" + "overtimeDriverPayout") AS fares
      FROM "Order"
      WHERE ${hubOrderScopeSql(account)}
        AND "status" = 'COMPLETED'
        AND "completedAt" >= (${fromInstant} ${UTC_BOUND})
        AND "completedAt" < (${toExclusiveInstant} ${UTC_BOUND})
      GROUP BY 1
      ORDER BY 1
    `,
    loadFleetRevenue(account, fromInstant, toExclusiveInstant),
  ]);

  const rowsByDay = new Map(
    rows.map((row) => [
      hubDayKeyFromSqlDay(row.day),
      { jobs: Number(row.jobs), fares: Number(row.fares) },
    ]),
  );

  // Days with no completed jobs are absent from the grouped rows; the chart
  // needs every day present so a gap reads as a zero, not as missing data.
  const days: HubEarningsDay[] = [];
  let grossFares = 0;
  let jobsCompleted = 0;
  let weekendJobs = 0;

  for (let offset = 0; offset < resolved.days; offset++) {
    const day = startOfHubDayPlus(fromInstant, offset);
    const date = toHubDayKey(day);
    const row = rowsByDay.get(date);
    const jobs = row?.jobs ?? 0;
    const fares = roundCurrency(row?.fares ?? 0);

    days.push({ date, jobs, fares });

    grossFares += fares;
    jobsCompleted += jobs;

    // Saturday and Sunday in Tbilisi — the denominator `sampleEarningsExtras`
    // asks for, counted here because this loop already knows each day's weekday.
    const weekday = hubWeekdayIndex(day);
    if (weekday === 0 || weekday === 6) {
      weekendJobs += jobs;
    }
  }

  grossFares = roundCurrency(grossFares);

  const grouping: "daily" | "weekly" =
    resolved.days > DAILY_GROUPING_MAX_DAYS ? "weekly" : "daily";

  const extras = sampleEarningsExtras({
    completedJobs: jobsCompleted,
    weekendJobs,
  });
  const onlineHours = sampleOnlineHours(jobsCompleted);
  const rangeTotal = roundCurrency(
    grossFares + extras.tipsGel + extras.incentivesGel + extras.adjustmentsGel,
  );

  return {
    range: resolved,
    persona: account.persona,
    grouping,
    days,
    buckets:
      grouping === "weekly"
        ? toWeeklyBuckets(days)
        : days.map((day) => ({
            startDate: day.date,
            endDate: day.date,
            jobs: day.jobs,
            fares: day.fares,
          })),
    grossFares,
    jobsCompleted,
    averagePerJob:
      jobsCompleted === 0 ? 0 : roundCurrency(grossFares / jobsCompleted),
    // Shaped here rather than inside `loadFleetRevenue` because the share
    // column's denominator is `grossFares`, which is only final one line above.
    fleet:
      fleetRevenue === null
        ? null
        : toFleetBreakdown(
            fleetRevenue.rows,
            fleetRevenue.namesByDriverId,
            grossFares,
          ),
    sampled: {
      extras,
      onlineHours,
      perOnlineHour:
        onlineHours === 0 ? 0 : roundCurrency(rangeTotal / onlineHours),
      rangeTotal,
      incentivesNote: SAMPLE_INCENTIVES_NOTE,
      payouts: SAMPLE_PAYOUT_HISTORY,
    },
  };
}
