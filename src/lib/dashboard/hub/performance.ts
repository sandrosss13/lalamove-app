/**
 * Everything the Driver Hub's **Performance** screen renders, fetched and shaped
 * in one server pass.
 *
 * ## The window
 *
 * Every real figure on this screen describes **the current Tbilisi week, Monday
 * through Sunday**. That is one window, stated once, for a reason: the design's
 * chart is seven day-columns labelled Mon…Sun, its tile deltas all read "vs last
 * week", and the sampled online-hours series it pairs the jobs bars against is
 * itself a Monday-first week. A trailing seven days ending today would line none
 * of those up — Thursday's jobs bar would sit under Monday's hours bar.
 *
 * Days of the week that have not happened yet are returned as real zeroes
 * flagged `isFuture`, so the chart can dim them as "not yet" rather than as "you
 * did nothing". `jobsPerDay` divides by the days *elapsed*, not by seven, or the
 * figure would sag every Monday for reasons that have nothing to do with the
 * driver.
 *
 * A week is a thin basis for a rate, and a thirty-day one would be steadier.
 * That is the trade the design asks for, and splitting the difference — rates
 * over a month, bars over a week — would put two windows on one screen with
 * nothing on it to say which is which.
 *
 * The week is anchored to Tbilisi midnight, not UTC. It was UTC until the hub
 * was unified on one zone, which put every bar boundary four hours off the day
 * the driver's own clock showed and made a job finished at 22:00 on Sunday land
 * in Monday's column. `@/lib/dashboard/hub/timezone` holds the zone and the
 * reasoning; this module just uses it.
 *
 * ## Real vs sample
 *
 * Everything at the top level of `HubPerformanceData` is derived from
 * `Order.status`. Everything under `sampled` is fictional and must be rendered
 * with a `<SampleNote />` beside it. The split is a nesting level rather than a
 * naming convention on purpose: a screen cannot read a fictional number without
 * typing the word `sampled` on the way to it.
 *
 * Note that **every** period-over-period delta is sampled, including the deltas
 * on the three tiles whose current value is real. A delta needs last week's
 * value held somewhere comparable, and recomputing it would be a second full
 * aggregation on every request — `sample.ts` explains this at
 * `SAMPLE_PERFORMANCE_DELTAS` and names the model that retires it.
 *
 * `fleet` — the BUSINESS-only per-driver breakdown — is covered by that same
 * top-level rule, and it is worth saying out loud because it is the only surface
 * on this screen with no fictional value anywhere in it. Every column on
 * `HubPerformanceDriverRow` comes from `Order.status`, `Order.createdAt`,
 * `Order.completedAt`, `Order.driverId` and `Order.companyId`, so the table
 * carries no `<SampleNote />` at all. It has no per-driver acceptance column for
 * that reason: acceptance is unrecorded rather than unaggregated, and
 * `sampleDriverFacts()` falls back to a bare `0`, which would print a confident,
 * specific and wrong `0%` against a named person on the roster their employer
 * uses to evaluate them.
 *
 * One value under `sampled` is not constant across personas: the rating pair. A
 * company is not rated, its drivers are, so a BUSINESS account reads the
 * fleet-wide pair the Drivers screen already shows. It is flagged here because a
 * reader of `sampled` would otherwise take the whole sub-object for a set of
 * module constants passed straight through.
 *
 * Server-only: it talks to Prisma directly. The object it returns crosses into a
 * `"use client"` tree, so dates leave as plain `YYYY-MM-DD` strings and numbers
 * leave unformatted for the screen to present.
 */
import "server-only";

import { OrderStatus, Prisma } from "@prisma/client";

import type { HubAccount, HubPersona } from "@/lib/dashboard/hub/account";
import {
  SAMPLE_ACCEPTANCE_RATE_PERCENT,
  SAMPLE_AVG_RATING,
  SAMPLE_FLEET_AVG_RATING,
  SAMPLE_FLEET_RATED_JOB_COUNT,
  SAMPLE_IDLE_MINUTES_PER_HOUR,
  SAMPLE_ONLINE_HOURS_WEEK,
  SAMPLE_PERFORMANCE_DELTAS,
  SAMPLE_RATED_JOB_COUNT,
  SAMPLE_SCORE_NOTES,
} from "@/lib/dashboard/hub/sample";
import type {
  SampleMetricDelta,
  SampleOnlineHoursDay,
  SamplePerformanceMetric,
  SampleScoreNote,
} from "@/lib/dashboard/hub/sample";
import {
  HUB_TIME_ZONE,
  hubDayKeyFromSqlDay,
  HUB_UTC_BOUND_SQL,
  hubDayTruncSql,
  startOfHubDay,
  startOfHubDayPlus,
  startOfHubWeek,
  toHubDayKey,
} from "@/lib/dashboard/hub/timezone";
import { prisma } from "@/lib/prisma";

/**
 * A company id no cuid can ever equal, used only to make a missing
 * `HubAccount.companyId` fail closed. See `hubOrderScope` below.
 */
const UNMATCHABLE_COMPANY_ID = "__hub-account-has-no-company__";

/**
 * Days in the window: one Monday-anchored Tbilisi week. See the module comment
 * for why it is a week and not a trailing thirty days.
 *
 * `today.ts` computes its glance-card completion rate over a window of the same
 * length so the two screens cannot show different completion figures — change
 * one, change both.
 */
export const HUB_PERFORMANCE_WINDOW_DAYS = 7;

/**
 * Pins a bound `Date` parameter to UTC inside a raw query. See
 * `HUB_UTC_BOUND_SQL` for why a bare bound would make the window depend on the
 * database session's own `TimeZone`.
 */
const UTC_BOUND = Prisma.raw(HUB_UTC_BOUND_SQL);

/** The two outcomes a job can finish in; the basis of both rates. */
const TERMINAL_JOB_STATUSES = [OrderStatus.COMPLETED, OrderStatus.CANCELLED];

/**
 * "Mon", "Tue", … in the hub's zone. At module scope because a `DateTimeFormat`
 * is expensive to construct and this one is asked for seven labels per request.
 * Its output is matched against `SAMPLE_ONLINE_HOURS_WEEK`'s `day` values, so
 * the locale is pinned rather than left to the server's — and the zone must be
 * `HUB_TIME_ZONE` because the instants it formats are Tbilisi midnights, which
 * fall on the previous UTC day and would label every bar one day early.
 */
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: HUB_TIME_ZONE,
});

/** One column of the jobs-completed bar chart. */
export type HubPerformanceDay = {
  /** Tbilisi `YYYY-MM-DD`. */
  date: string;
  /** Three-letter Tbilisi weekday; lines up with `SampleOnlineHoursDay.day`. */
  weekday: string;
  jobsCompleted: number;
  /**
   * True for days of this week that have not started yet. A zero on a future
   * day means "not yet", not "nothing was done" — the design dims empty bars,
   * and these deserve dimming for a different reason.
   */
  isFuture: boolean;
};

/**
 * One row of the fleet breakdown: what a single driver on this company's roster
 * did with the week.
 *
 * **Every field on this type is real.** There is deliberately no `sampled`
 * sub-object here, and one must not be added — see the note on the fleet type
 * below for the specific trap.
 *
 * The two windows this screen already carries are reproduced per driver rather
 * than reconciled: `completionRatePercent` and `cancellationRatePercent` count
 * jobs by when they were *booked* (`createdAt`), because `Order` has no
 * `cancelledAt` and a cancellation can only be dated by its booking; while
 * `jobsCompleted` counts by when the job *finished* (`completedAt`), so this
 * column and the chart above it describe the same set of jobs. A row where the
 * two disagree is not a bug — it is a driver who finished last week's work.
 */
export type HubPerformanceDriverRow = {
  /**
   * `User.id`. The same key `HubDriver.userId` carries on the Drivers screen,
   * so an operator can line the two tables up, and the same key
   * `Order.driverId` holds.
   */
  userId: string;
  /** `User.name`, the display name the Drivers roster shows. */
  name: string;
  /** COMPLETED orders booked this week for this company. */
  completedCount: number;
  /** CANCELLED orders booked this week for this company. */
  cancelledCount: number;
  /** `completedCount + cancelledCount` — the denominator of both rates below. */
  finishedJobCount: number;
  /**
   * Share of this driver's finished jobs that completed, as a percentage, or
   * `null` when nothing of theirs finished this week.
   *
   * `null` rather than `0` for exactly the reason the fleet-level field gives:
   * a rate with no denominator is not zero, and printing 0% would tell an
   * operator that every job this driver took failed, when in fact they took
   * none. The screen prints an em dash.
   */
  completionRatePercent: number | null;
  /** The complement of `completionRatePercent`; `null` on the same condition. */
  cancellationRatePercent: number | null;
  /** COMPLETED orders this week dated by `completedAt` — the chart's basis. */
  jobsCompleted: number;
  /**
   * `jobsCompleted / window.daysElapsed`, one decimal — divided by the days
   * *elapsed*, not by seven, exactly as the fleet figure is, so the column does
   * not sag every Monday for reasons that have nothing to do with the driver.
   */
  jobsPerDay: number;
};

/**
 * The BUSINESS-only per-driver breakdown of everything the tiles above it
 * aggregate.
 *
 * Non-null only for `persona === "BUSINESS"`. A driver-shaped account — either
 * `INDEPENDENT` or `ROSTER` — gets `null`, not an empty object: there is no
 * fleet to break down, and `null` is the answer that makes a screen branch on
 * the fact rather than on an empty array that could equally mean "a fleet with
 * nobody on it".
 */
export type HubPerformanceFleet = {
  /**
   * Every driver currently on this company's roster, including those who did
   * nothing this week — a row of em dashes is the actionable signal an operator
   * came for, and dropping it would make an idle driver indistinguishable from
   * one who left.
   *
   * Ordered busiest first (`finishedJobCount` descending), ties broken by name.
   * The order is fixed here rather than left to the screen because the table
   * this feeds carries no sort control.
   */
  drivers: readonly HubPerformanceDriverRow[];
  /**
   * Finished jobs this week that this company holds but that **no row above
   * accounts for**.
   *
   * Two things land here, and neither is an error. An order the company claimed
   * but never dispatched has `driverId: null` and belongs to nobody. An order
   * carried by a driver who has since left the roster keeps its `driverId`
   * (`DriverProfile.companyId` is set null on removal, `Order.driverId` is
   * not), and that user is no longer in the roster query above.
   *
   * It exists so the table can say out loud that its rows do not add up to the
   * tiles. Without it a reader sums the rows, finds a smaller number than the
   * fleet's own `finishedJobCount`, and concludes the screen is broken.
   *
   * Computed by subtraction from figures this function already has, so it costs
   * no extra query, and it cannot go negative: the row set is a strict subset
   * of the same window and the same company scope.
   */
  unattributedFinishedJobCount: number;
};

export type HubPerformanceData = {
  /**
   * Which account shape is reading this screen. Derived once in
   * `resolveHubAccount()` and carried here so the screen can branch at all —
   * before this field existed, Performance was byte-identical for an
   * independent driver, an employed one and a fleet owner.
   */
  persona: HubPersona;
  window: {
    /** Tbilisi `YYYY-MM-DD` of the week's Monday. */
    from: string;
    /** Tbilisi `YYYY-MM-DD` of the week's Sunday. */
    to: string;
    /** Always `HUB_PERFORMANCE_WINDOW_DAYS`. */
    days: number;
    /** Days of the window that have started, Monday through today. */
    daysElapsed: number;
  };
  /**
   * Share of finished jobs that completed rather than cancelled, as a
   * percentage, or `null` when nothing finished this week — a rate with no
   * denominator is not zero, and the screen prints "—" for it.
   */
  completionRatePercent: number | null;
  /** The complement of `completionRatePercent`; `null` on the same condition. */
  cancellationRatePercent: number | null;
  /**
   * Jobs behind both rates.
   *
   * Keyed on `createdAt`, not `completedAt`: `Order` has no `cancelledAt`, so a
   * cancellation cannot be dated by when it happened, and the only timestamp
   * both outcomes share is when the job was booked. Both rates therefore read
   * "of the jobs taken on this week that have since finished, what share
   * completed" — which is a *different* week's-worth of jobs than the bars
   * below, and is stated here because a reader would otherwise assume one.
   */
  finishedJobCount: number;
  /** Completed jobs in the window, dated by `completedAt` — the bars' total. */
  jobsCompleted: number;
  /** `jobsCompleted / window.daysElapsed`, rounded to one decimal. */
  jobsPerDay: number;
  /** Seven entries, Monday first, zero-filled. */
  jobsByDay: readonly HubPerformanceDay[];
  /**
   * The per-driver breakdown behind the fleet figures above. Real data, and
   * non-null only for `persona === "BUSINESS"`.
   */
  fleet: HubPerformanceFleet | null;
  /** Everything below this line is fictional — badge it. */
  sampled: {
    acceptanceRatePercent: number;
    averageRating: number;
    ratedJobCount: number;
    idleMinutesPerHour: number;
    /** The hours half of the "online hours vs jobs completed" chart. */
    onlineHoursWeek: readonly SampleOnlineHoursDay[];
    /** Period-over-period deltas for all five tiles — see the module comment. */
    deltas: Record<SamplePerformanceMetric, SampleMetricDelta>;
    /** The "What affects your score" rows. */
    scoreNotes: readonly SampleScoreNote[];
  };
};

/**
 * The one clause that scopes every `Order` query in this file to the signed-in
 * account: a fleet sees the orders it holds, a driver sees the orders assigned
 * to them.
 *
 * Repeated verbatim in `today.ts` and `jobs.ts` (and as SQL in `earnings.ts`)
 * rather than lifted into a shared module. Four screens, four independent server
 * passes, and a clause this small is not worth a fifth file that all four have
 * to be read alongside — but it *is* the tenancy boundary, so if you change it
 * here, change it in all four.
 */
function hubOrderScope(account: HubAccount): Prisma.OrderWhereInput {
  if (account.kind === "BUSINESS") {
    // `{ companyId: null }` reads as `IS NULL` in Prisma, which would match
    // every unclaimed order on the platform. `resolveHubAccount` always sets
    // `companyId` for a BUSINESS so this branch is unreachable, but the type
    // permits null and the failure mode is a cross-tenant read rather than an
    // error, so it fails closed instead of being asserted away.
    return { companyId: account.companyId ?? UNMATCHABLE_COMPANY_ID };
  }

  return { driverId: account.userId };
}

/**
 * The same boundary as `hubOrderScope`, in SQL, for the one query that cannot be
 * expressed through Prisma's query builder — `groupBy` cannot bucket by a
 * truncated timestamp, so the daily series needs raw SQL, exactly as
 * `driver-dashboard-data.ts` does for its earnings trend.
 *
 * `Prisma.sql` keeps both branches parameterised: the account id is never
 * interpolated into the statement text.
 */
function hubOrderScopeSql(account: HubAccount): Prisma.Sql {
  if (account.kind === "BUSINESS") {
    return Prisma.sql`"companyId" = ${account.companyId ?? UNMATCHABLE_COMPANY_ID}`;
  }

  return Prisma.sql`"driverId" = ${account.userId}`;
}

/** One decimal place, the precision the design's rate figures are shown at. */
function roundRate(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The roster's own counts, for the BUSINESS breakdown table.
 *
 * Structured exactly as `drivers.ts` structures the Drivers screen: the roster
 * is fetched first because every aggregate after it is keyed off the user ids it
 * returns, and every aggregate carries `companyId` as well as those ids. The
 * second filter is not redundant — `Order.driverId` outlives a driver's
 * membership of a roster, because removing a driver nulls
 * `DriverProfile.companyId` and leaves the orders they carried pointing at them.
 * Without it, a driver who moved here from another fleet would drag that fleet's
 * outcomes onto this company's screen, which is a cross-tenant read.
 *
 * The roster query is deliberately roster-first rather than an orders-first
 * `groupBy` with the names looked up afterwards. That would be one query fewer,
 * but it would silently omit every driver who did nothing this week — the row an
 * operator most needs to see — and would include drivers who have left the
 * roster, under names the company can no longer act on.
 *
 * Returns raw counts only. `jobsPerDay` is finished by the caller, which is
 * where `window.daysElapsed` is known — and dividing there rather than here is
 * what guarantees the rows and the tiles above them use the same divisor.
 */
async function loadFleetDriverCounts(
  companyId: string,
  weekStart: Date,
  weekEndExclusive: Date,
): Promise<
  {
    userId: string;
    name: string;
    completedCount: number;
    cancelledCount: number;
    jobsCompleted: number;
  }[]
> {
  // `createdAt: "asc"` only so the query is deterministic; the display order is
  // applied by the caller, which sorts busiest first.
  const roster = await prisma.driverProfile.findMany({
    where: { companyId },
    select: { userId: true, user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  // An empty roster yields `[]` here, which Prisma renders as a predicate that
  // matches nothing, so both aggregates come back empty and this function
  // returns `[]`. A fleet with nobody on it is a renderable state, exactly as
  // `drivers.ts` says of its own empty roster — it is not a reason to skip the
  // caller's `fleet` object.
  const driverUserIds = roster.map((driver) => driver.userId);

  const [terminalRows, completedRows] = await Promise.all([
    // Both outcomes in one pass, keyed on `createdAt` — the window both rates
    // run over, because `Order` has no `cancelledAt` and a cancellation can only
    // be dated by when the job was booked.
    prisma.order.groupBy({
      by: ["driverId", "status"],
      where: {
        companyId,
        driverId: { in: driverUserIds },
        status: { in: TERMINAL_JOB_STATUSES },
        createdAt: { gte: weekStart, lt: weekEndExclusive },
      },
      _count: { _all: true },
    }),
    // Keyed on `completedAt` instead, so this column counts the same jobs the
    // chart above the table draws.
    prisma.order.groupBy({
      by: ["driverId"],
      where: {
        companyId,
        driverId: { in: driverUserIds },
        status: OrderStatus.COMPLETED,
        completedAt: { gte: weekStart, lt: weekEndExclusive },
      },
      _count: { _all: true },
    }),
  ]);

  // Grouping by two columns returns up to two rows per driver, one per outcome,
  // so these accumulate rather than assign.
  const completedByDriver = new Map<string, number>();
  const cancelledByDriver = new Map<string, number>();
  for (const row of terminalRows) {
    // `driverId: { in: [...] }` already excludes nulls; the check is what
    // narrows the type so it can key the map without a cast.
    if (row.driverId === null) {
      continue;
    }

    const target =
      row.status === OrderStatus.COMPLETED
        ? completedByDriver
        : cancelledByDriver;
    target.set(row.driverId, (target.get(row.driverId) ?? 0) + row._count._all);
  }

  const jobsCompletedByDriver = new Map<string, number>();
  for (const row of completedRows) {
    if (row.driverId === null) {
      continue;
    }

    jobsCompletedByDriver.set(row.driverId, row._count._all);
  }

  // Read back with a `?? 0` fallback so a driver with no orders this week gets a
  // real zero rather than being dropped from the list.
  return roster.map((driver) => ({
    userId: driver.userId,
    name: driver.user.name,
    completedCount: completedByDriver.get(driver.userId) ?? 0,
    cancelledCount: cancelledByDriver.get(driver.userId) ?? 0,
    jobsCompleted: jobsCompletedByDriver.get(driver.userId) ?? 0,
  }));
}

/**
 * Fetches and shapes every figure the Performance screen shows, for every
 * persona.
 *
 * Independent queries in one `Promise.all`, the pattern
 * `driver-dashboard-data.ts` sets: the rate counts and the daily series read
 * different columns over different date keys and share nothing but the window.
 * A BUSINESS account adds the per-driver breakdown as a third entry in that same
 * `Promise.all` rather than a serial round-trip after it; the other two personas
 * resolve that slot to `null` and issue no roster query at all.
 */
export async function getHubPerformance(
  account: HubAccount,
): Promise<HubPerformanceData> {
  const scope = hubOrderScope(account);

  // Both halves are load-bearing: `persona` is the product rule, and the null
  // check is what lets `companyId` narrow to a string for the roster query. A
  // BUSINESS account always has a `companyId`, but the type permits null and
  // this fails closed rather than asserting it away — the same shape
  // `getHubDrivers()` uses.
  const { companyId } = account;
  const fleetCompanyId =
    account.persona === "BUSINESS" && companyId !== null ? companyId : null;

  // Both bounds come from one `now`, so a request that crosses Tbilisi midnight
  // cannot count its rates against one week and its bars against another. The
  // fleet breakdown below is handed these same two bounds for the same reason.
  const now = new Date();
  const startOfToday = startOfHubDay(now);
  const weekStart = startOfHubWeek(now);
  const weekEndExclusive = startOfHubDayPlus(
    weekStart,
    HUB_PERFORMANCE_WINDOW_DAYS,
  );

  const [terminalCounts, dayRows, fleetDriverCounts] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: {
        ...scope,
        status: { in: TERMINAL_JOB_STATUSES },
        createdAt: { gte: weekStart, lt: weekEndExclusive },
      },
      _count: { _all: true },
    }),

    // The day expression comes from the timezone module, which explains why the
    // two `AT TIME ZONE` steps are both needed and why their order is not
    // interchangeable. `Prisma.raw` is safe here: its argument is a module
    // constant built from two hard-coded strings, never anything from a request.
    //
    // The two range bounds carry `AT TIME ZONE 'UTC'` for a separate reason —
    // see `HUB_UTC_BOUND_SQL`: Prisma binds a `Date` as `timestamptz`, and
    // without it Postgres would promote the naive column using the *session's*
    // zone, moving the window on a database not configured to UTC.
    prisma.$queryRaw<{ day: Date; jobs: number }[]>`
      SELECT ${Prisma.raw(hubDayTruncSql('"completedAt"'))} AS day,
             COUNT(*)::int AS jobs
      FROM "Order"
      WHERE ${hubOrderScopeSql(account)}
        AND "status" = 'COMPLETED'
        AND "completedAt" >= (${weekStart} ${UTC_BOUND})
        AND "completedAt" < (${weekEndExclusive} ${UTC_BOUND})
      GROUP BY 1
      ORDER BY 1
    `,

    // Only a fleet owner has a roster to break down, so the two driver-shaped
    // personas resolve this slot without touching the database.
    fleetCompanyId === null
      ? Promise.resolve(null)
      : loadFleetDriverCounts(fleetCompanyId, weekStart, weekEndExclusive),
  ]);

  let completedCount = 0;
  let cancelledCount = 0;
  for (const bucket of terminalCounts) {
    if (bucket.status === OrderStatus.COMPLETED) {
      completedCount += bucket._count._all;
    } else {
      cancelledCount += bucket._count._all;
    }
  }
  const finishedJobCount = completedCount + cancelledCount;

  // Days with no completed jobs are absent from the grouped rows; the chart
  // needs every day present so a gap reads as a zero, not as missing data.
  const jobsByDay = new Map(
    dayRows.map((row) => [hubDayKeyFromSqlDay(row.day), Number(row.jobs)]),
  );

  const days: HubPerformanceDay[] = [];
  let jobsCompleted = 0;
  let daysElapsed = 0;

  for (let offset = 0; offset < HUB_PERFORMANCE_WINDOW_DAYS; offset++) {
    const day = startOfHubDayPlus(weekStart, offset);
    const date = toHubDayKey(day);
    const dayJobs = jobsByDay.get(date) ?? 0;
    const isFuture = day.getTime() > startOfToday.getTime();

    days.push({
      date,
      weekday: WEEKDAY_FORMATTER.format(day),
      jobsCompleted: dayJobs,
      isFuture,
    });

    jobsCompleted += dayJobs;
    if (!isFuture) {
      daysElapsed += 1;
    }
  }

  // Built after the loop because `daysElapsed` is the divisor the rows share
  // with the tiles above them.
  let fleet: HubPerformanceFleet | null = null;
  if (fleetDriverCounts !== null) {
    const fleetDrivers: HubPerformanceDriverRow[] = fleetDriverCounts
      .map((row) => {
        const rowFinished = row.completedCount + row.cancelledCount;

        return {
          userId: row.userId,
          name: row.name,
          completedCount: row.completedCount,
          cancelledCount: row.cancelledCount,
          finishedJobCount: rowFinished,
          // `null`, never `0`, on an empty denominator — printing 0% would say
          // every job this driver took failed, when they took none.
          completionRatePercent:
            rowFinished === 0
              ? null
              : roundRate((row.completedCount / rowFinished) * 100),
          cancellationRatePercent:
            rowFinished === 0
              ? null
              : roundRate((row.cancelledCount / rowFinished) * 100),
          jobsCompleted: row.jobsCompleted,
          // The same divisor the fleet tile uses, so a reader can add the
          // column up and land near the tile above it.
          jobsPerDay: roundRate(row.jobsCompleted / daysElapsed),
        };
      })
      // Busiest first: an operator scans for who carried the week and who did
      // not move. The locale is pinned for the same reason every formatter in
      // this hub pins one — an unpinned `localeCompare` reads the host's
      // locale, which would make the row order depend on which machine the
      // deploy landed on.
      .sort(
        (a, b) =>
          b.finishedJobCount - a.finishedJobCount ||
          a.name.localeCompare(b.name, "en-GB"),
      );

    const attributedFinishedJobCount = fleetDrivers.reduce(
      (total, row) => total + row.finishedJobCount,
      0,
    );

    fleet = {
      drivers: fleetDrivers,
      // Cannot go negative: the rows are a strict subset of the same company,
      // the same statuses and the same window as `finishedJobCount` above.
      unattributedFinishedJobCount:
        finishedJobCount - attributedFinishedJobCount,
    };
  }

  return {
    persona: account.persona,
    window: {
      from: toHubDayKey(weekStart),
      to: toHubDayKey(
        startOfHubDayPlus(weekStart, HUB_PERFORMANCE_WINDOW_DAYS - 1),
      ),
      days: HUB_PERFORMANCE_WINDOW_DAYS,
      daysElapsed,
    },
    completionRatePercent:
      finishedJobCount === 0
        ? null
        : roundRate((completedCount / finishedJobCount) * 100),
    cancellationRatePercent:
      finishedJobCount === 0
        ? null
        : roundRate((cancelledCount / finishedJobCount) * 100),
    finishedJobCount,
    jobsCompleted,
    // `daysElapsed` is at least 1 — the loop always passes today — so this
    // never divides by zero.
    jobsPerDay: roundRate(jobsCompleted / daysElapsed),
    jobsByDay: days,
    fleet,
    sampled: {
      acceptanceRatePercent: SAMPLE_ACCEPTANCE_RATE_PERCENT,
      // The only persona-keyed value in this sub-object. A fleet is not rated;
      // its drivers are, so a BUSINESS account reads the fleet-wide pair the
      // Drivers screen already shows rather than one driver's 4.86 over one
      // driver's 61 jobs. Both pairs are equally fictional and both retire with
      // the same `OrderRating` model — this picks the one that is fictional
      // about the right subject.
      averageRating:
        account.persona === "BUSINESS"
          ? SAMPLE_FLEET_AVG_RATING
          : SAMPLE_AVG_RATING,
      ratedJobCount:
        account.persona === "BUSINESS"
          ? SAMPLE_FLEET_RATED_JOB_COUNT
          : SAMPLE_RATED_JOB_COUNT,
      idleMinutesPerHour: SAMPLE_IDLE_MINUTES_PER_HOUR,
      onlineHoursWeek: SAMPLE_ONLINE_HOURS_WEEK,
      deltas: SAMPLE_PERFORMANCE_DELTAS,
      scoreNotes: SAMPLE_SCORE_NOTES,
    },
  };
}
