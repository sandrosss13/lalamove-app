/**
 * Everything the Driver Hub's **Today** screen renders, fetched and shaped in
 * one server pass.
 *
 * The screen answers four questions at a glance — what was earned today, what
 * job is running right now, where the demand is, and what needs acting on — so
 * one aggregation function is both cheaper and far easier to keep consistent
 * than each card running its own query. This mirrors the structure of
 * `src/lib/driver-dashboard-data.ts`, which is the convention every hub module
 * follows.
 *
 * ## Real vs sample
 *
 * Everything at the top level of `HubTodayData` is derived from `Order`,
 * `DriverLicence` and `Vehicle`, and is true. Everything under `sampled` comes
 * from `@/lib/dashboard/hub/sample` and must be rendered with a `<SampleNote />`
 * beside it. The split is a nesting level rather than a naming convention on
 * purpose: a screen cannot read a fictional number without typing the word
 * `sampled` on the way to it, which makes an accidental un-badged placeholder a
 * visible mistake in review rather than an invisible one.
 *
 * One deliberate departure from the brief's screen matrix: the glance card's
 * **completion rate** is real here rather than sampled. `sample.ts` exports no
 * completion figure — precisely because the number *is* derivable from
 * `Order.status` — and the honesty rule makes that module the only place a
 * placeholder may live, so inventing one locally is not an option. It is
 * computed over the same Monday-anchored Tbilisi week `performance.ts` uses, so
 * the two screens can never disagree. The other three glance rows stay sampled for
 * reasons the schema, not this file, decides: acceptance needs a `JobOffer`
 * model (a declined offer leaves no row at all), rating needs an `OrderRating`
 * model, and a cancellation cannot be attributed to anyone because `Order`
 * records no actor for it.
 *
 * Server-only: it talks to Prisma directly. The object it returns is handed
 * from a server component into a `"use client"` tree, so every value in it is
 * plain serialisable data — in particular every timestamp is an ISO string,
 * never a `Date`. Numbers are returned unformatted; the screen owns currency
 * and date presentation.
 *
 * Time boundaries: every "today" boundary here is a **Tbilisi** day, via
 * `@/lib/dashboard/hub/timezone`. This used to be UTC, following the convention
 * `driver-dashboard-data.ts` set, and that was wrong in a way the screen made
 * visible: "Earned today" covered a UTC day — 04:00 to 04:00 in Tbilisi — while
 * the header beside it named the Tbilisi date, so for four hours every night the
 * tile and its own label described different days. The hub is a single-country
 * product, so the day it buckets by is now the day a driver would call today.
 * The zone is fixed rather than read from the host, so the figures do not depend
 * on where the deploy landed; the timezone module explains the choice at length.
 */
import "server-only";

import { OrderStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import type { HubAccount } from "@/lib/dashboard/hub/account";
import {
  SAMPLE_ACCEPTANCE_RATE_PERCENT,
  SAMPLE_AVG_RATING,
  SAMPLE_CANCELLATIONS_TODAY,
  SAMPLE_ONLINE_TIME_TODAY_LABEL,
  SAMPLE_RATED_JOB_COUNT,
  SAMPLE_ZONE_DEMAND,
  SAMPLE_ZONE_DEMAND_CAPTION,
  sampleVehicleFacts,
} from "@/lib/dashboard/hub/sample";
import type {
  SampleComplianceStatus,
  SampleZoneDemandRow,
} from "@/lib/dashboard/hub/sample";
import {
  differenceInHubDays,
  startOfHubDay,
  startOfHubDayPlus,
  startOfHubWeek,
} from "@/lib/dashboard/hub/timezone";
import { prisma } from "@/lib/prisma";

/**
 * Statuses that mean a job is running right now. An individual driver holds at
 * most one of these at a time — the same assumption `driver-dashboard-data.ts`
 * makes for its `activeOrderId` — which is what makes `currentJob` singular.
 */
const ACTIVE_JOB_STATUSES = [OrderStatus.ACCEPTED, OrderStatus.IN_TRANSIT];

/** The two outcomes a job can finish in; the basis of the completion rate. */
const TERMINAL_JOB_STATUSES = [OrderStatus.COMPLETED, OrderStatus.CANCELLED];

/**
 * Days in the completion rate's window: one Monday-anchored Tbilisi week, the same
 * window `performance.ts` uses for the identically-derived figure on its own
 * tile. Two screens showing two different completion rates would be a bug the
 * user reports, so the window is a week here for the reason it is a week there
 * — see `HUB_PERFORMANCE_WINDOW_DAYS`. Change one, change both.
 */
const COMPLETION_WINDOW_DAYS = 7;

/**
 * A company id no cuid can ever equal, used only to make a missing
 * `HubAccount.companyId` fail closed. See `hubOrderScope` below.
 */
const UNMATCHABLE_COMPANY_ID = "__hub-account-has-no-company__";

/**
 * The stops of the current job. Exactly two are ever returned: `Order` models a
 * single pickup → single dropoff booking and has no multi-stop table, so the
 * design's three-stop example has no equivalent in this schema and no third
 * stop is synthesised to fill the gap.
 */
export type HubTodayStop = {
  kind: "PICKUP" | "DROPOFF";
  address: string;
  /**
   * When the leg was actually served, ISO, or `null` while it is still ahead —
   * `inTransitAt` for the pickup (the load is aboard), `completedAt` for the
   * drop-off. A job in progress therefore always has a null drop-off time,
   * which is where the design shows an ETA; nothing in the schema can supply
   * one, so the screen shows the stop as pending instead.
   */
  at: string | null;
};

/** The one job in flight right now, as the "Current job" card renders it. */
export type HubTodayCurrentJob = {
  id: string;
  /** Narrowed to the two in-flight statuses — see `ACTIVE_JOB_STATUSES`. */
  status: "ACCEPTED" | "IN_TRANSIT";
  /** Exactly two entries: `[0]` pickup, `[1]` drop-off. */
  stops: readonly HubTodayStop[];
  distanceKm: number;
  /** `price + overtimeFee` — the quote plus whatever overtime is settled. */
  fare: number;
  /** Vehicle class the job was booked for, e.g. "Cargo Van". */
  vehicleTypeLabel: string;
  /** When the job was created; the design's "accepted HH:MM". */
  createdAt: string;
  inTransitAt: string | null;
  completedAt: string | null;
};

/**
 * The driver's licence expiry, the one attention row on this screen with real
 * data behind it (`DriverLicence.expiresAt` is written at onboarding submit).
 */
export type HubLicenceAlert = {
  /** ISO timestamp of `DriverLicence.expiresAt`. */
  expiresAt: string;
  /**
   * Whole Tbilisi days from today until the expiry day; negative once past. Lets
   * the screen print "expires in N days" without re-deriving a day count from
   * the ISO string against a browser clock in another timezone.
   */
  daysRemaining: number;
  /** True once `expiresAt` is in the past — the screen's expired styling. */
  isExpired: boolean;
};

/** A sampled compliance row in the "Needs your attention" card. */
export type HubTodayVehicleAlert = {
  kind: "INSURANCE" | "INSPECTION";
  /** The real `Vehicle.plateNumber` the sampled facts were looked up by. */
  vehiclePlate: string;
  status: SampleComplianceStatus;
  /** Human due date from `sample.ts`, or its "not on file" fallback. */
  due: string;
};

export type HubTodayData = {
  /** `SUM(price + overtimeFee)` over jobs completed in today's Tbilisi day. */
  earnedToday: number;
  jobsCompletedToday: number;
  /** `earnedToday / jobsCompletedToday`, or 0 when nothing was completed. */
  averagePerJob: number;
  /** The job in flight, or `null` when nothing is running. */
  currentJob: HubTodayCurrentJob | null;
  /**
   * Share of finished jobs that completed rather than cancelled, as a
   * percentage over the current Monday-anchored Tbilisi week, or `null` when no job
   * finished in that week — a rate with no denominator is not zero, and the
   * screen prints "—" for it. Same derivation, same week, as the Performance
   * screen's completion tile.
   */
  completionRatePercent: number | null;
  /** Jobs behind `completionRatePercent`; 0 means the rate is `null`. */
  completedOrCancelledCount: number;
  /**
   * The signed-in driver's licence expiry, or `null` when there is none to
   * report. Null for a BUSINESS account by design: a company has no licence of
   * its own, and its drivers' licences belong on the Drivers screen where they
   * can be named.
   */
  licenceAlert: HubLicenceAlert | null;
  /** Everything below this line is fictional — badge it. */
  sampled: {
    /** Today's online time, e.g. "6h 12m". Needs an `OnlineSession` model. */
    onlineTimeLabel: string;
    glance: {
      acceptanceRatePercent: number;
      cancellationsToday: number;
      averageRating: number;
      ratedJobCount: number;
    };
    zoneDemand: {
      caption: string;
      rows: readonly SampleZoneDemandRow[];
    };
    /**
     * Insurance and inspection rows, or empty when the account has no vehicle
     * to hang them off — an empty card beats a row about a vehicle that does
     * not exist.
     */
    vehicleAlerts: readonly HubTodayVehicleAlert[];
  };
};

/**
 * The one clause that scopes every `Order` query in this file to the signed-in
 * account: a fleet sees the orders it holds, a driver sees the orders assigned
 * to them.
 *
 * Repeated verbatim in `jobs.ts`, `earnings.ts` and `performance.ts` rather than
 * lifted into a shared module. Four screens, four independent server passes, and
 * a clause this small is not worth a fifth file that all four have to be read
 * alongside — but it *is* the tenancy boundary, so if you change it here, change
 * it in all four.
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
 * Prices are `Float` columns, so summing them accumulates binary-fraction dust;
 * money crossing this boundary is rounded to the cent it will be printed at.
 * Repeated in the sibling hub modules for the same reason `hubOrderScope` is.
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/** One decimal place, the precision the design's rate figures are shown at. */
function roundRate(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The two compliance facts the "Needs your attention" card is built from: the
 * driver's licence expiry (real) and a plate to attach the sampled insurance and
 * inspection rows to.
 *
 * Both come from one query per account kind, so the card costs a single round
 * trip rather than one per row.
 */
async function loadComplianceSource(account: HubAccount): Promise<{
  licenceExpiresAt: Date | null;
  vehiclePlate: string | null;
}> {
  if (account.kind === "BUSINESS") {
    // Any one of the fleet's vehicles will do: the sampled rows are per-plate
    // placeholders, and the Vehicles screen is where the whole fleet's
    // compliance actually belongs. Oldest first, because that is the vehicle
    // most likely to have something expiring.
    const vehicle =
      account.companyId === null
        ? null
        : await prisma.vehicle.findFirst({
            where: { companyId: account.companyId },
            select: { plateNumber: true },
            orderBy: { createdAt: "asc" },
          });

    return {
      licenceExpiresAt: null,
      vehiclePlate: vehicle?.plateNumber ?? null,
    };
  }

  // A driver mid-onboarding may have no profile row yet, in which case there is
  // nothing to report and no query worth running.
  if (account.driverProfileId === null) {
    return { licenceExpiresAt: null, vehiclePlate: null };
  }

  // Own vehicles first, then the fleet vehicle currently assigned to them —
  // the same two-place lookup `resolveHubAccount` does for the header subline,
  // and for the same reason: the two kinds of driver hold vehicles differently.
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { id: account.driverProfileId },
    select: {
      licence: { select: { expiresAt: true } },
      vehicles: {
        select: { plateNumber: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      assignments: {
        where: { unassignedAt: null },
        select: { vehicle: { select: { plateNumber: true } } },
        orderBy: { assignedAt: "desc" },
        take: 1,
      },
    },
  });

  return {
    licenceExpiresAt: driverProfile?.licence?.expiresAt ?? null,
    // `noUncheckedIndexedAccess` — both lists are `take: 1` and may be empty.
    vehiclePlate:
      driverProfile?.vehicles[0]?.plateNumber ??
      driverProfile?.assignments[0]?.vehicle.plateNumber ??
      null,
  };
}

/** The sampled insurance and inspection rows for one real plate. */
function vehicleAlertsFor(
  plateNumber: string | null,
): readonly HubTodayVehicleAlert[] {
  if (plateNumber === null) {
    return [];
  }

  const facts = sampleVehicleFacts(plateNumber);

  return [
    {
      kind: "INSURANCE",
      vehiclePlate: plateNumber,
      status: facts.insuranceStatus,
      due: facts.insuranceDue,
    },
    {
      // `Vehicle` stores no inspection state at all, so unlike insurance there
      // is not even a sampled status to report — "Pending" is the honest
      // reading of "nothing has been recorded".
      kind: "INSPECTION",
      vehiclePlate: plateNumber,
      status: "Pending",
      due: facts.inspectionDue,
    },
  ];
}

/**
 * Fetches and shapes every figure the Today screen shows, for either account
 * kind.
 *
 * Total by design — there is no `null` return. Unlike
 * `getDriverDashboardData()`, the account was already resolved (and its missing
 * -profile case already handled) by `resolveHubAccount()` in the hub layout, so
 * by the time this runs there is always something to render, even if that is a
 * screen of zeroes for a driver who has not started yet.
 */
export async function getHubToday(account: HubAccount): Promise<HubTodayData> {
  const scope = hubOrderScope(account);

  // Every boundary is derived from one `now`, so all four cards refer to the
  // same instant even if the queries straddle midnight.
  const now = new Date();
  const startOfToday = startOfHubDay(now);
  const completionWindowStart = startOfHubWeek(now);
  const completionWindowEnd = startOfHubDayPlus(
    completionWindowStart,
    COMPLETION_WINDOW_DAYS,
  );

  const [earnedTodayAgg, currentOrder, terminalCounts, compliance] =
    await Promise.all([
      prisma.order.aggregate({
        where: {
          ...scope,
          status: OrderStatus.COMPLETED,
          completedAt: { gte: startOfToday },
        },
        _sum: { price: true, overtimeFee: true },
        _count: true,
      }),

      // A fleet can legitimately have several jobs in flight at once, unlike a
      // single driver. The design's card holds one, so this is the one that
      // started most recently — the rest are all on the Jobs screen, which is
      // where a dispatcher looks anyway.
      prisma.order.findFirst({
        where: { ...scope, status: { in: ACTIVE_JOB_STATUSES } },
        select: {
          id: true,
          status: true,
          pickupAddress: true,
          dropoffAddress: true,
          distanceKm: true,
          price: true,
          overtimeFee: true,
          createdAt: true,
          inTransitAt: true,
          completedAt: true,
          vehicleTypeSpec: { select: { label: true } },
        },
        orderBy: { createdAt: "desc" },
      }),

      // Keyed on `createdAt`, not `completedAt`: `Order` has no `cancelledAt`,
      // so a cancellation cannot be dated by when it happened and the only
      // timestamp both outcomes share is when the job was booked. The rate is
      // therefore "of the jobs taken on this week that have since finished,
      // what share completed" — stated here because a reader would otherwise
      // assume it matched the completion-dated figures above. `performance.ts`
      // derives its completion tile the same way, over the same week.
      prisma.order.groupBy({
        by: ["status"],
        where: {
          ...scope,
          status: { in: TERMINAL_JOB_STATUSES },
          createdAt: { gte: completionWindowStart, lt: completionWindowEnd },
        },
        _count: { _all: true },
      }),

      loadComplianceSource(account),
    ]);

  const earnedToday = roundCurrency(
    (earnedTodayAgg._sum.price ?? 0) + (earnedTodayAgg._sum.overtimeFee ?? 0),
  );
  const jobsCompletedToday = earnedTodayAgg._count;

  let completedCount = 0;
  let cancelledCount = 0;
  for (const bucket of terminalCounts) {
    if (bucket.status === OrderStatus.COMPLETED) {
      completedCount += bucket._count._all;
    } else {
      cancelledCount += bucket._count._all;
    }
  }
  const completedOrCancelledCount = completedCount + cancelledCount;

  const currentJob: HubTodayCurrentJob | null =
    currentOrder === null
      ? null
      : {
          id: currentOrder.id,
          // The `where` above admits only these two, but Prisma types `status`
          // as the whole enum; narrowing here is what lets the client type be
          // the honest two-member union.
          status:
            currentOrder.status === OrderStatus.IN_TRANSIT
              ? "IN_TRANSIT"
              : "ACCEPTED",
          stops: [
            {
              kind: "PICKUP",
              address: currentOrder.pickupAddress,
              at: currentOrder.inTransitAt?.toISOString() ?? null,
            },
            {
              kind: "DROPOFF",
              address: currentOrder.dropoffAddress,
              at: currentOrder.completedAt?.toISOString() ?? null,
            },
          ],
          distanceKm: currentOrder.distanceKm,
          fare: roundCurrency(currentOrder.price + currentOrder.overtimeFee),
          vehicleTypeLabel: currentOrder.vehicleTypeSpec.label,
          createdAt: currentOrder.createdAt.toISOString(),
          inTransitAt: currentOrder.inTransitAt?.toISOString() ?? null,
          completedAt: currentOrder.completedAt?.toISOString() ?? null,
        };

  const licenceAlert: HubLicenceAlert | null =
    compliance.licenceExpiresAt === null
      ? null
      : {
          expiresAt: compliance.licenceExpiresAt.toISOString(),
          // Day-to-day rather than instant-to-instant: a licence expiring later
          // today should read "expires in 0 days", not round up to one. Counted
          // in whole Tbilisi calendar days rather than by dividing a millisecond
          // gap, so the answer stays right if the zone ever gains a 23-hour day.
          daysRemaining: differenceInHubDays(now, compliance.licenceExpiresAt),
          // Compared at full precision, so a licence that lapsed earlier today
          // reads as expired even while `daysRemaining` is still 0.
          isExpired: compliance.licenceExpiresAt.getTime() <= now.getTime(),
        };

  return {
    earnedToday,
    jobsCompletedToday,
    averagePerJob:
      jobsCompletedToday === 0
        ? 0
        : roundCurrency(earnedToday / jobsCompletedToday),
    currentJob,
    completionRatePercent:
      completedOrCancelledCount === 0
        ? null
        : roundRate((completedCount / completedOrCancelledCount) * 100),
    completedOrCancelledCount,
    licenceAlert,
    sampled: {
      onlineTimeLabel: SAMPLE_ONLINE_TIME_TODAY_LABEL,
      glance: {
        acceptanceRatePercent: SAMPLE_ACCEPTANCE_RATE_PERCENT,
        cancellationsToday: SAMPLE_CANCELLATIONS_TODAY,
        averageRating: SAMPLE_AVG_RATING,
        ratedJobCount: SAMPLE_RATED_JOB_COUNT,
      },
      zoneDemand: {
        caption: SAMPLE_ZONE_DEMAND_CAPTION,
        rows: SAMPLE_ZONE_DEMAND,
      },
      vehicleAlerts: vehicleAlertsFor(compliance.vehiclePlate),
    },
  };
}
