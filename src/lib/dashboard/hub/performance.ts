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
 * Server-only: it talks to Prisma directly. The object it returns crosses into a
 * `"use client"` tree, so dates leave as plain `YYYY-MM-DD` strings and numbers
 * leave unformatted for the screen to present.
 */
import "server-only";

import { OrderStatus, Prisma } from "@prisma/client";

import type { HubAccount } from "@/lib/dashboard/hub/account";
import {
  SAMPLE_ACCEPTANCE_RATE_PERCENT,
  SAMPLE_AVG_RATING,
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

export type HubPerformanceData = {
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
 * Fetches and shapes every figure the Performance screen shows, for either
 * account kind.
 *
 * Two independent queries in one `Promise.all`, the pattern
 * `driver-dashboard-data.ts` sets: the rate counts and the daily series read
 * different columns over different date keys and share nothing but the window.
 */
export async function getHubPerformance(
  account: HubAccount,
): Promise<HubPerformanceData> {
  const scope = hubOrderScope(account);

  // Both bounds come from one `now`, so a request that crosses Tbilisi midnight
  // cannot count its rates against one week and its bars against another.
  const now = new Date();
  const startOfToday = startOfHubDay(now);
  const weekStart = startOfHubWeek(now);
  const weekEndExclusive = startOfHubDayPlus(
    weekStart,
    HUB_PERFORMANCE_WINDOW_DAYS,
  );

  const [terminalCounts, dayRows] = await Promise.all([
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

  return {
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
    sampled: {
      acceptanceRatePercent: SAMPLE_ACCEPTANCE_RATE_PERCENT,
      averageRating: SAMPLE_AVG_RATING,
      ratedJobCount: SAMPLE_RATED_JOB_COUNT,
      idleMinutesPerHour: SAMPLE_IDLE_MINUTES_PER_HOUR,
      onlineHoursWeek: SAMPLE_ONLINE_HOURS_WEEK,
      deltas: SAMPLE_PERFORMANCE_DELTAS,
      scoreNotes: SAMPLE_SCORE_NOTES,
    },
  };
}
