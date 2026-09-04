/**
 * The Driver Hub's Drivers screen — a fleet's roster — fetched and shaped in one
 * pass.
 *
 * Business accounts only. `getHubDrivers()` returns `null` for an individual
 * account rather than an empty roster, so a non-business session cannot read a
 * roster through this module even if a page guard were ever removed: the page
 * redirects, the nav hides the entry, and this loader refuses — three
 * independent checks off the one `kind` that `resolveHubAccount()` derived.
 *
 * Server-only: it talks to Prisma directly. The object it returns is handed
 * from a server component into a `"use client"` tree, so every value in it is
 * plain serialisable data — in particular every timestamp is an ISO string,
 * never a `Date`.
 *
 * ## Real vs sample
 *
 * Everything at the top level of `HubDriver` is read from the database,
 * including the three recent jobs the detail panel lists. Everything the schema
 * cannot answer — the rating and the four verification rows — is quarantined
 * under `sampled`, one sub-object per driver, sourced entirely from
 * `@/lib/dashboard/hub/sample`. The tiles split the same way. The screen renders
 * a `<SampleNote />` beside anything read out of a `sampled` object and nothing
 * else.
 *
 * ## Scoping
 *
 * Every aggregate is filtered by `companyId` as well as by the roster's user
 * ids, exactly as `company-dashboard-data.ts` explains: `Order.driverId`
 * outlives a driver's membership of a roster (`DriverProfile.companyId` is
 * nullable and set null on removal), so without the company filter a driver who
 * moved here from another fleet — or from independent work — would drag their
 * old volume and earnings onto this page.
 *
 * Time boundaries are Tbilisi days, from `@/lib/dashboard/hub/timezone`, which
 * is the one zone every hub screen and every hub loader now agrees on. They were
 * UTC until the hub was unified on that zone; the module explains why a fixed
 * IANA zone beats both UTC and the host's own.
 */
import "server-only";

import { OrderStatus } from "@prisma/client";
import type {
  DriverApplicationStatus,
  GeorgianCity,
  LicenceCategory,
} from "@prisma/client";

import type { HubAccount } from "@/lib/dashboard/hub/account";
import type { SampleVerificationRow } from "@/lib/dashboard/hub/sample";
import {
  SAMPLE_FLEET_AVG_RATING,
  SAMPLE_FLEET_RATED_JOB_COUNT,
  sampleDriverFacts,
} from "@/lib/dashboard/hub/sample";
import { startOfHubWeek } from "@/lib/dashboard/hub/timezone";
import { formatCity } from "@/lib/format-city";
import { prisma } from "@/lib/prisma";

/** How many recent jobs the driver detail panel lists. */
const RECENT_JOBS_PER_DRIVER = 3;

/** Whether the driver has the app open and is taking work right now. */
export type HubDriverPresence = "Online" | "Offline";

/**
 * The roster's second status axis: where this driver stands with operations.
 *
 * Derived from the two facts the schema actually records — `User.isSuspended`
 * and `DriverApplication.status` — plus `DriverProfile.activatedAt`, which is
 * the gate every server-side check already uses. The design's "Offboarded" is
 * deliberately absent: removing a driver from a fleet nulls
 * `DriverProfile.companyId` and keeps no membership record, so a former roster
 * member is indistinguishable from someone who was never on it. There is
 * nothing to list, and inventing the state would put ex-employees back on an
 * operator's screen as though the platform still tracked them.
 *
 * Retire the gap once a roster-membership model records joins and leaves.
 */
export type HubDriverReviewState =
  /** `User.isSuspended` — login and every API call are already blocked. */
  | "Suspended"
  /** An onboarding application still with operations (PENDING/ACTION_REQUIRED). */
  | "In review"
  /** No `activatedAt`: cannot go online, cannot be dispatched to. */
  | "Not activated"
  /** Activated, not suspended, nothing outstanding. */
  | "Active";

export type HubDriverLicence = {
  categories: LicenceCategory[];
  /** ISO string. Real — this is what the Today screen's expiry alert reads. */
  expiresAt: string;
};

/** The fleet vehicle this driver currently holds, via an open assignment. */
export type HubDriverVehicle = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  /** `VehicleTypeSpec.label`, e.g. "Large Van". */
  vehicleTypeLabel: string;
};

/** One row of the detail panel's "Recent jobs" list. Real. */
export type HubDriverRecentJob = {
  id: string;
  pickupAddress: string;
  dropoffAddress: string;
  /** price + overtimeFee, in GEL major units. */
  fareGel: number;
  /** ISO string, or null for a job with no completion timestamp on record. */
  completedAt: string | null;
};

/**
 * The per-driver figures the schema cannot source. **Nothing in here is real.**
 *
 * Keyed off `DriverProfile.id`, which in any database but a seeded demo misses
 * and falls through to a neutral fallback (`rating: null`, every document "In
 * review") rather than a plausible-looking invention about a real person — see
 * `sampleDriverFacts()`.
 */
export type HubDriverSampled = {
  /** null for a driver with no rated jobs; the roster prints "—". */
  rating: number | null;
  acceptanceRatePercent: number;
  verification: readonly SampleVerificationRow[];
};

export type HubDriver = {
  driverProfileId: string;
  /** `User.id` — what the mutation endpoints key on, e.g. driver removal. */
  userId: string;
  name: string;
  email: string;
  phone: string;
  city: GeorgianCity;
  /**
   * Humanised city, which is what the design's **Zone** column shows.
   *
   * City is the honest proxy: there is no zone model. `GeorgianCity` stops at
   * TBILISI, so the design's districts ("Vake", "Saburtalo", "Gldani") have
   * nowhere in the schema to live. Retire once a `Zone` model exists — the same
   * one `SAMPLE_ZONE_DEMAND` is waiting on.
   */
  cityLabel: string;
  isOnline: boolean;
  presence: HubDriverPresence;
  reviewState: HubDriverReviewState;
  /** ISO string, or null while the driver is not yet activated. */
  activatedAt: string | null;
  /** ISO string — `DriverProfile.createdAt`, the design's "joined <month>". */
  joinedAt: string;
  /** null for a driver who has not filed a licence yet. */
  licence: HubDriverLicence | null;
  /** null when this driver currently holds no fleet vehicle. */
  assignedVehicle: HubDriverVehicle | null;
  /** COMPLETED orders for this company since the start of the current Tbilisi week. */
  jobsThisWeek: number;
  /** All-time sum(price + overtimeFee) of COMPLETED orders for this company. */
  totalEarnedGel: number;
  /** Newest first, at most `RECENT_JOBS_PER_DRIVER`. */
  recentJobs: HubDriverRecentJob[];
  sampled: HubDriverSampled;
};

export type HubDriversData = {
  /** Complete, unpaginated roster, oldest member first. */
  drivers: HubDriver[];
  tiles: {
    registeredDriversCount: number;
    onlineNowCount: number;
    /** Drivers whose `reviewState` is anything but "Active". */
    needsReviewCount: number;
    sampled: {
      fleetAvgRating: number;
      fleetRatedJobCount: number;
    };
  };
};

/** What a driver earns on an order: the quoted price plus settled overtime. */
function orderTotal(sums: {
  price: number | null;
  overtimeFee: number | null;
}): number {
  return (sums.price ?? 0) + (sums.overtimeFee ?? 0);
}

/**
 * Resolves the one review state to show, most blocking first.
 *
 * The order matters: a suspended driver whose application is also mid-review
 * must read as suspended, because that is the state that actually stops them
 * working. `APPROVED` and `DRAFT` applications fall through — an approved one
 * says nothing beyond what `activatedAt` already says, and a draft belongs to a
 * driver who has not submitted anything for operations to look at.
 */
function reviewStateOf(driver: {
  isSuspended: boolean;
  applicationStatus: DriverApplicationStatus | null;
  activatedAt: Date | null;
}): HubDriverReviewState {
  if (driver.isSuspended) {
    return "Suspended";
  }

  if (
    driver.applicationStatus === "PENDING" ||
    driver.applicationStatus === "ACTION_REQUIRED"
  ) {
    return "In review";
  }

  if (driver.activatedAt === null) {
    return "Not activated";
  }

  return "Active";
}

/**
 * Fetches and shapes the signed-in company's driver roster.
 *
 * Returns `null` for anything that is not a business account — see this
 * module's header. Never returns null for a business account with an empty
 * roster: no drivers yet is an ordinary, renderable state, not a missing row.
 */
export async function getHubDrivers(
  account: HubAccount,
): Promise<HubDriversData | null> {
  const { companyId } = account;

  // Both halves of the guard are load-bearing: `kind` is the product rule, and
  // the null check is what lets `companyId` narrow to a string below.
  if (account.kind !== "BUSINESS" || companyId === null) {
    return null;
  }

  // The roster is fetched first because every query after it is keyed off the
  // user ids it returns.
  const rawDrivers = await prisma.driverProfile.findMany({
    where: { companyId },
    include: {
      user: {
        select: { id: true, name: true, email: true, isSuspended: true },
      },
      licence: { select: { categories: true, expiresAt: true } },
      application: { select: { status: true } },
      // Same defensive `orderBy` as `company-dashboard-data.ts`: at most one
      // assignment per driver is open at a time (partial unique index), so the
      // newest open row is the current pairing even if a bad write left two.
      assignments: {
        where: { unassignedAt: null },
        include: {
          vehicle: {
            select: {
              id: true,
              plateNumber: true,
              make: true,
              model: true,
              vehicleTypeSpec: { select: { label: true } },
            },
          },
        },
        orderBy: { assignedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const driverUserIds = rawDrivers.map((driver) => driver.userId);
  // The same Monday-anchored Tbilisi week the Performance bars run over, so a
  // driver's "jobs this week" here and their bars there count the same jobs.
  const startOfWeek = startOfHubWeek(new Date());

  const [jobsThisWeekRows, totalEarnedRows, recentJobRows] = await Promise.all([
    // Both aggregates use the same `groupBy` shape as `OpsDriver`'s counts in
    // `company-dashboard-data.ts` rather than a second, differently-scoped
    // approach — the two screens must not disagree about a driver's volume.
    prisma.order.groupBy({
      by: ["driverId"],
      where: {
        companyId,
        driverId: { in: driverUserIds },
        status: OrderStatus.COMPLETED,
        completedAt: { gte: startOfWeek },
      },
      _count: true,
    }),
    prisma.order.groupBy({
      by: ["driverId"],
      where: {
        companyId,
        driverId: { in: driverUserIds },
        status: OrderStatus.COMPLETED,
      },
      _sum: { price: true, overtimeFee: true },
    }),
    // Prisma cannot express "the newest three rows per driver" — there is no
    // lateral join — so the company's completed jobs are read newest-first and
    // sliced per driver in memory. Only the six columns the panel prints are
    // selected, which is what keeps an unbounded row count cheap; the same
    // trade-off `company-dashboard-data.ts` makes for its region rollup.
    prisma.order.findMany({
      where: {
        companyId,
        driverId: { in: driverUserIds },
        status: OrderStatus.COMPLETED,
      },
      select: {
        id: true,
        driverId: true,
        pickupAddress: true,
        dropoffAddress: true,
        price: true,
        overtimeFee: true,
        completedAt: true,
      },
      orderBy: { completedAt: "desc" },
    }),
  ]);

  const jobsThisWeekByDriver = new Map(
    jobsThisWeekRows.map((row) => [row.driverId, row._count]),
  );
  const totalEarnedByDriver = new Map(
    totalEarnedRows.map((row) => [row.driverId, orderTotal(row._sum)]),
  );

  const recentJobsByDriver = new Map<string, HubDriverRecentJob[]>();
  for (const order of recentJobRows) {
    // `driverId: { in: [...] }` already excludes nulls; the check is what
    // narrows the type so it can key the map without a cast.
    if (order.driverId === null) {
      continue;
    }

    const jobs = recentJobsByDriver.get(order.driverId) ?? [];
    if (jobs.length >= RECENT_JOBS_PER_DRIVER) {
      continue;
    }

    jobs.push({
      id: order.id,
      pickupAddress: order.pickupAddress,
      dropoffAddress: order.dropoffAddress,
      fareGel: order.price + order.overtimeFee,
      completedAt: order.completedAt?.toISOString() ?? null,
    });
    recentJobsByDriver.set(order.driverId, jobs);
  }

  const drivers: HubDriver[] = rawDrivers.map((driver) => {
    const assignment = driver.assignments[0];
    const facts = sampleDriverFacts(driver.id);

    return {
      driverProfileId: driver.id,
      userId: driver.userId,
      name: driver.user.name,
      email: driver.user.email,
      phone: driver.phone,
      city: driver.city,
      cityLabel: formatCity(driver.city),
      isOnline: driver.isOnline,
      presence: driver.isOnline ? "Online" : "Offline",
      reviewState: reviewStateOf({
        isSuspended: driver.user.isSuspended,
        applicationStatus: driver.application?.status ?? null,
        activatedAt: driver.activatedAt,
      }),
      activatedAt: driver.activatedAt?.toISOString() ?? null,
      joinedAt: driver.createdAt.toISOString(),
      licence: driver.licence
        ? {
            categories: driver.licence.categories,
            expiresAt: driver.licence.expiresAt.toISOString(),
          }
        : null,
      assignedVehicle: assignment
        ? {
            id: assignment.vehicle.id,
            plateNumber: assignment.vehicle.plateNumber,
            make: assignment.vehicle.make,
            model: assignment.vehicle.model,
            vehicleTypeLabel: assignment.vehicle.vehicleTypeSpec.label,
          }
        : null,
      jobsThisWeek: jobsThisWeekByDriver.get(driver.userId) ?? 0,
      totalEarnedGel: totalEarnedByDriver.get(driver.userId) ?? 0,
      recentJobs: recentJobsByDriver.get(driver.userId) ?? [],
      sampled: {
        rating: facts.rating,
        acceptanceRatePercent: facts.acceptanceRatePercent,
        verification: facts.verification,
      },
    };
  });

  return {
    drivers,
    tiles: {
      registeredDriversCount: drivers.length,
      // Counted from the roster already in hand rather than a second
      // `driverProfile.count`, so the tile and the rows below it can never
      // disagree about who is online.
      onlineNowCount: drivers.filter((driver) => driver.isOnline).length,
      needsReviewCount: drivers.filter(
        (driver) => driver.reviewState !== "Active",
      ).length,
      sampled: {
        fleetAvgRating: SAMPLE_FLEET_AVG_RATING,
        fleetRatedJobCount: SAMPLE_FLEET_RATED_JOB_COUNT,
      },
    },
  };
}
