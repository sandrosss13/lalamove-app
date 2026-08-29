/**
 * Everything the company ops dashboard renders, fetched and shaped in one pass.
 *
 * The dashboard is a single page with six tabs (Overview, Orders, Revenue,
 * Fleet, Drivers, Vehicles) whose data all comes from the same four models, so
 * one aggregation function is cheaper — and far easier to keep consistent —
 * than each tab running its own ad-hoc queries.
 *
 * Server-only: it talks to Prisma directly. The object it returns is handed
 * from a server component into a `"use client"` tree, so every value in it is
 * plain serialisable data — in particular every timestamp is an ISO string,
 * never a `Date`.
 *
 * Scoping: everything is filtered by the `LogisticsCompany` owned by the given
 * `userId`, the same way every `logistics-company/**` route resolves its
 * caller. No other company's rows are ever readable through this module. That
 * includes the per-driver aggregates: `Order.driverId` outlives a driver's
 * membership of a roster (`DriverProfile.companyId` is nullable and set null on
 * delete), so every driver query is scoped by `companyId` as well, or a driver
 * who moved here from another company — or from independent work — would drag
 * their old delivery volume and revenue onto this dashboard.
 *
 * Time boundaries: every "today"/"this month"/window boundary in this file is
 * UTC-based, because the raw SQL trend query buckets with `date_trunc('day',
 * ...)` which runs in UTC through Prisma's Postgres connector; mixing local and
 * UTC boundaries would make the Overview KPIs disagree with the trend chart on
 * any server that is not on UTC.
 */

import { OrderStatus } from "@prisma/client";
import type {
  BusinessApplicationVehicleStatus,
  CargoCategory,
  GeorgianCity,
  LoadingAccessType,
  VehicleCategory,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** How many of the newest orders the Overview tab previews. */
const RECENT_ORDERS_LIMIT = 8;

/** Length of the revenue trend and driver-payout window, in days (today included). */
const REVENUE_WINDOW_DAYS = 90;

/** Length of the "YYYY-MM-DD" prefix of an ISO timestamp. */
const ISO_DATE_LENGTH = 10;

/**
 * An order a company has taken but not yet finished. `CLAIMED` is off the open
 * market but not yet dispatched; the other two are with a driver.
 */
const ACTIVE_ORDER_STATUSES = [
  OrderStatus.CLAIMED,
  OrderStatus.ACCEPTED,
  OrderStatus.IN_TRANSIT,
];

/** Statuses that mean a driver is on a delivery right now. */
const DRIVER_BUSY_STATUSES = [OrderStatus.ACCEPTED, OrderStatus.IN_TRANSIT];

export type OpsOrder = {
  id: string;
  status: OrderStatus;
  cargoCategory: CargoCategory;
  description: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  distanceKm: number;
  price: number;
  overtimeFee: number;
  vehicleTypeSpecId: string;
  vehicleTypeLabel: string;
  clientName: string;
  driverUserId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  createdAt: string; // ISO string — Date is not serializable across the server/client boundary
  inTransitAt: string | null;
  completedAt: string | null;
  waitingMinutes: number | null;
  /** true = still PENDING and companyId is null (open market, not yet claimed by this company) */
  isOpenMarket: boolean;
};

export type OpsVehicleAssignment = {
  driverProfileId: string;
  driverUserId: string;
  driverName: string;
  isOnline: boolean;
};

export type OpsVehicle = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  photoUrls: string[];
  /**
   * Matches `OpsOrder.vehicleTypeSpecId` — used to narrow which fleet vehicles
   * can fulfil a given order (e.g. in the order-detail drawer's dispatch form).
   */
  vehicleTypeSpecId: string;
  vehicleTypeCode: string;
  vehicleTypeLabel: string;
  maxPayloadKg: number;
  loadingAccessType: LoadingAccessType;
  category: VehicleCategory;
  /** null when no driver currently has this vehicle (no open `DriverVehicleAssignment`) */
  activeAssignment: OpsVehicleAssignment | null;
  /**
   * This vehicle's fleet-application verdict, or null for a vehicle that
   * predates business applications (admin-created, or added through the
   * company's own fleet form). Null is not "unreviewed" — see `dispatchable`.
   */
  applicationStatus: BusinessApplicationVehicleStatus | null;
  /**
   * Whether the dispatch endpoint will accept this vehicle: it has no review row
   * at all (grandfathered), or its row is APPROVED. Computed here so the console
   * and the API cannot disagree about it.
   */
  dispatchable: boolean;
};

export type OpsDriver = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  city: GeorgianCity;
  isOnline: boolean;
  assignedVehicle: {
    id: string;
    plateNumber: string;
    make: string;
    model: string;
  } | null;
  /** COMPLETED orders for this driver *on this company's behalf* since UTC midnight. */
  deliveriesTodayCount: number;
  /** All-time COMPLETED orders for this driver on this company's behalf. */
  completedTotalCount: number;
  /**
   * sum(price + overtimeFee) of this driver's COMPLETED orders for this company
   * since the start of the current UTC calendar month.
   */
  earnedThisMonthTotal: number;
  /** true when this driver has one of this company's orders in ACCEPTED or IN_TRANSIT right now */
  hasActiveDelivery: boolean;
};

export type CompanyDashboardData = {
  company: {
    id: string;
    companyName: string;
    vatId: string;
    phone: string;
    city: GeorgianCity;
    /**
     * ISO timestamp of the moment operations activated this fleet, or null while
     * it is still under review. Null means every claim and dispatch call will be
     * refused.
     */
    activatedAt: string | null;
  };
  overview: {
    /** status in CLAIMED/ACCEPTED/IN_TRANSIT, companyId = self */
    activeOrdersCount: number;
    /** COMPLETED, completedAt >= start of today, companyId = self */
    completedTodayCount: number;
    /** sum(price + overtimeFee), same filter as completedTodayCount */
    revenueTodayTotal: number;
    /** same, completedAt >= start of this calendar month */
    revenueMonthTotal: number;
    onlineDriversCount: number;
    fleetSize: number;
    /** Latest `RECENT_ORDERS_LIMIT` of `orders` below, newest first. */
    recentOrders: OpsOrder[];
  };
  /** Full unbounded list: open-market matches ∪ own orders, newest first. */
  orders: OpsOrder[];
  /** Full unbounded company vehicle list. */
  fleet: OpsVehicle[];
  /** Full unbounded driver roster. */
  drivers: OpsDriver[];
  revenue: {
    /**
     * One entry per day of the trend window (zero-filled for days with no
     * completed revenue), date as "YYYY-MM-DD", oldest first.
     */
    dailyTrend: { date: string; total: number }[];
    byServiceType: {
      vehicleTypeSpecId: string;
      label: string;
      total: number;
      orderCount: number;
    }[];
    /**
     * Derived from the assigned driver's city on COMPLETED orders — this is the
     * driver's home city, not delivery geography, because the schema has no
     * region on `Order`. "UNASSIGNED" buckets any COMPLETED order missing a driver.
     */
    byRegion: {
      city: GeorgianCity | "UNASSIGNED";
      total: number;
      orderCount: number;
    }[];
    /** Per roster driver, over the trend window. */
    driverPayouts: {
      userId: string;
      name: string;
      completedOrdersCount: number;
      totalEarned: number;
    }[];
  };
};

/** A fresh `Date` at UTC midnight of the UTC day `date` falls on. */
function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** A fresh `Date` at UTC midnight on the first day of the UTC month `date` falls on. */
function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * The UTC "YYYY-MM-DD" key that lines the trend query's `date_trunc` buckets up
 * with the zero-filled day list.
 */
function toDayKey(date: Date): string {
  return date.toISOString().slice(0, ISO_DATE_LENGTH);
}

/** Total charged for an order: the quoted price plus whatever overtime was settled on top. */
function orderTotal(sums: {
  price: number | null;
  overtimeFee: number | null;
}): number {
  return (sums.price ?? 0) + (sums.overtimeFee ?? 0);
}

/**
 * Fetches and shapes every figure the company ops dashboard shows.
 *
 * Returns `null` when the signed-in user has no `LogisticsCompany` row — sign-up
 * always creates one, so that only happens if it was interrupted part-way. The
 * caller renders the "finish your company profile" fallback; deciding that here
 * would tie this module to a particular UI.
 */
export async function getCompanyDashboardData(
  userId: string,
): Promise<CompanyDashboardData | null> {
  const company = await prisma.logisticsCompany.findUnique({
    where: { userId },
    select: {
      id: true,
      companyName: true,
      vatId: true,
      phone: true,
      city: true,
      activatedAt: true,
    },
  });

  if (!company) {
    return null;
  }

  const companyId = company.id;

  // All period boundaries are derived from one `now`, so every figure on the
  // page refers to the same instant even if the queries straddle midnight.
  //
  // They are all UTC boundaries. The trend's buckets come from `date_trunc`
  // over timestamps Prisma stores in UTC, so they are UTC days; anchoring the
  // KPIs to local midnight instead would leave the "today" figure and the
  // trend's last bar measuring different windows (and `revenueMonthTotal`
  // differing from the sum of that month's bars) on any non-UTC server.
  const now = new Date();
  const startOfToday = startOfUtcDay(now);
  const startOfMonth = startOfUtcMonth(now);
  // Inclusive of today: the window is the last `REVENUE_WINDOW_DAYS` days
  // ending with today, so today's revenue is the last point on the trend.
  const revenueWindowStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - (REVENUE_WINDOW_DAYS - 1),
    ),
  );

  // The fleet and the roster are fetched first because two later queries are
  // keyed off them: orders by the fleet's distinct vehicle types, and the
  // per-driver aggregates by the roster's user ids.
  const [rawVehicles, rawDrivers] = await Promise.all([
    prisma.vehicle.findMany({
      where: { companyId },
      include: {
        vehicleTypeSpec: true,
        // The fleet-application review row for this vehicle, or null for one
        // that predates business applications. Singular, because
        // `BusinessApplicationVehicle.vehicleId` is `@unique`.
        applicationVehicle: { select: { status: true } },
        // At most one assignment per vehicle is open at a time (enforced at the
        // API layer), so the first open row is *the* current pairing. The
        // `orderBy` is defensive: should a bad write ever leave two rows open,
        // the newest one wins rather than an arbitrary one.
        assignments: {
          where: { unassignedAt: null },
          include: {
            driverProfile: {
              include: { user: { select: { id: true, name: true } } },
            },
          },
          orderBy: { assignedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.driverProfile.findMany({
      where: { companyId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        // Same defensive `orderBy` as the fleet query above: the most recently
        // assigned open row is the one treated as current.
        assignments: {
          where: { unassignedAt: null },
          include: {
            vehicle: {
              select: { id: true, plateNumber: true, make: true, model: true },
            },
          },
          orderBy: { assignedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // A delivery can only be taken in a vehicle of the type it asks for, so the
  // distinct set of fleet types is what the open-market list is filtered by —
  // the same rule `CompanyBookings` applies today.
  const fleetVehicleTypeSpecIds = [
    ...new Set(rawVehicles.map((vehicle) => vehicle.vehicleTypeSpecId)),
  ];
  const driverUserIds = rawDrivers.map((driver) => driver.userId);

  const [
    rawOrders,
    deliveriesTodayCounts,
    completedTotalCounts,
    earnedThisMonthAggs,
    busyDriverRows,
    activeOrdersCount,
    completedTodayAgg,
    revenueMonthAgg,
    onlineDriversCount,
    fleetSize,
    trendRows,
    byServiceRaw,
    vehicleTypeSpecs,
    completedForRegion,
    payoutsRaw,
  ] = await Promise.all([
    // Orders already taken by this company are not type-filtered: that match was
    // already made when the order was claimed.
    prisma.order.findMany({
      where: {
        OR: [
          {
            status: OrderStatus.PENDING,
            companyId: null,
            vehicleTypeSpecId: { in: fleetVehicleTypeSpecIds },
          },
          { companyId },
        ],
      },
      include: {
        client: { select: { name: true } },
        driver: { select: { name: true } },
        vehicle: { select: { plateNumber: true } },
        vehicleTypeSpec: { select: { label: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // Each per-driver aggregate is scoped by `companyId` as well as by the
    // roster's user ids: a driver's completed orders follow them between
    // companies, and without the company filter another roster's (or the
    // driver's own independent) volume and revenue would leak onto this page —
    // and the Drivers tab would disagree with `revenue.driverPayouts`, which is
    // scoped.
    prisma.order.groupBy({
      by: ["driverId"],
      where: {
        companyId,
        driverId: { in: driverUserIds },
        status: OrderStatus.COMPLETED,
        completedAt: { gte: startOfToday },
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
      _count: true,
    }),
    prisma.order.groupBy({
      by: ["driverId"],
      where: {
        companyId,
        driverId: { in: driverUserIds },
        status: OrderStatus.COMPLETED,
        completedAt: { gte: startOfMonth },
      },
      _sum: { price: true, overtimeFee: true },
    }),
    prisma.order.findMany({
      where: {
        companyId,
        driverId: { in: driverUserIds },
        status: { in: DRIVER_BUSY_STATUSES },
      },
      select: { driverId: true },
    }),

    prisma.order.count({
      where: { companyId, status: { in: ACTIVE_ORDER_STATUSES } },
    }),
    prisma.order.aggregate({
      where: {
        companyId,
        status: OrderStatus.COMPLETED,
        completedAt: { gte: startOfToday },
      },
      _sum: { price: true, overtimeFee: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: {
        companyId,
        status: OrderStatus.COMPLETED,
        completedAt: { gte: startOfMonth },
      },
      _sum: { price: true, overtimeFee: true },
    }),
    prisma.driverProfile.count({ where: { companyId, isOnline: true } }),
    prisma.vehicle.count({ where: { companyId } }),

    // The one non-Prisma-idiomatic query in this module: `groupBy` cannot bucket
    // by a truncated timestamp, so the daily revenue trend needs raw SQL.
    prisma.$queryRaw<{ day: Date; total: number }[]>`
      SELECT date_trunc('day', "completedAt") AS day, SUM("price" + "overtimeFee") AS total
      FROM "Order"
      WHERE "companyId" = ${companyId}
        AND "status" = 'COMPLETED'
        AND "completedAt" >= ${revenueWindowStart}
      GROUP BY 1
      ORDER BY 1
    `,

    prisma.order.groupBy({
      by: ["vehicleTypeSpecId"],
      where: { companyId, status: OrderStatus.COMPLETED },
      _sum: { price: true, overtimeFee: true },
      _count: true,
    }),
    // The whole (seeded, single-digit-sized) spec table, rather than a lookup
    // keyed off the grouped rows, so it can run in this same parallel batch.
    prisma.vehicleTypeSpec.findMany({ select: { id: true, label: true } }),

    // Region is the assigned driver's city, which lives two joins away — not
    // something `groupBy` can bucket on — so it is reduced in memory instead.
    prisma.order.findMany({
      where: { companyId, status: OrderStatus.COMPLETED },
      select: {
        price: true,
        overtimeFee: true,
        driver: { select: { driverProfile: { select: { city: true } } } },
      },
    }),

    prisma.order.groupBy({
      by: ["driverId"],
      where: {
        companyId,
        status: OrderStatus.COMPLETED,
        driverId: { not: null },
        completedAt: { gte: revenueWindowStart },
      },
      _sum: { price: true, overtimeFee: true },
      _count: true,
    }),
  ]);

  const orders: OpsOrder[] = rawOrders.map((order) => ({
    id: order.id,
    status: order.status,
    cargoCategory: order.cargoCategory,
    description: order.description,
    pickupAddress: order.pickupAddress,
    dropoffAddress: order.dropoffAddress,
    distanceKm: order.distanceKm,
    price: order.price,
    overtimeFee: order.overtimeFee,
    vehicleTypeSpecId: order.vehicleTypeSpecId,
    vehicleTypeLabel: order.vehicleTypeSpec.label,
    clientName: order.client.name,
    driverUserId: order.driverId,
    driverName: order.driver?.name ?? null,
    vehicleId: order.vehicleId,
    vehiclePlate: order.vehicle?.plateNumber ?? null,
    createdAt: order.createdAt.toISOString(),
    inTransitAt: order.inTransitAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    waitingMinutes: order.waitingMinutes,
    isOpenMarket: order.companyId === null,
  }));

  const fleet: OpsVehicle[] = rawVehicles.map((vehicle) => {
    const active = vehicle.assignments[0];
    return {
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      photoUrls: vehicle.photoUrls,
      vehicleTypeSpecId: vehicle.vehicleTypeSpecId,
      vehicleTypeCode: vehicle.vehicleTypeSpec.code,
      vehicleTypeLabel: vehicle.vehicleTypeSpec.label,
      maxPayloadKg: vehicle.vehicleTypeSpec.maxPayloadKg,
      loadingAccessType: vehicle.vehicleTypeSpec.loadingAccessType,
      category: vehicle.vehicleTypeSpec.category,
      activeAssignment: active
        ? {
            driverProfileId: active.driverProfileId,
            driverUserId: active.driverProfile.userId,
            driverName: active.driverProfile.user.name,
            isOnline: active.driverProfile.isOnline,
          }
        : null,
      applicationStatus: vehicle.applicationVehicle?.status ?? null,
      // Mirrors the dispatch endpoint's per-vehicle gate exactly: no review row
      // (grandfathered) or an approved one. Kept in sync with
      // `src/app/api/logistics-company/orders/[id]/dispatch/route.ts`.
      dispatchable:
        vehicle.applicationVehicle === null ||
        vehicle.applicationVehicle.status === "APPROVED",
    };
  });

  const deliveriesTodayByDriver = new Map(
    deliveriesTodayCounts.map((row) => [row.driverId, row._count]),
  );
  const completedTotalByDriver = new Map(
    completedTotalCounts.map((row) => [row.driverId, row._count]),
  );
  const earnedThisMonthByDriver = new Map(
    earnedThisMonthAggs.map((row) => [row.driverId, orderTotal(row._sum)]),
  );
  const busyDriverIds = new Set(busyDriverRows.map((row) => row.driverId));

  const drivers: OpsDriver[] = rawDrivers.map((driver) => {
    const assignment = driver.assignments[0];
    return {
      userId: driver.userId,
      name: driver.user.name,
      email: driver.user.email,
      phone: driver.phone,
      city: driver.city,
      isOnline: driver.isOnline,
      assignedVehicle: assignment
        ? {
            id: assignment.vehicle.id,
            plateNumber: assignment.vehicle.plateNumber,
            make: assignment.vehicle.make,
            model: assignment.vehicle.model,
          }
        : null,
      deliveriesTodayCount: deliveriesTodayByDriver.get(driver.userId) ?? 0,
      completedTotalCount: completedTotalByDriver.get(driver.userId) ?? 0,
      earnedThisMonthTotal: earnedThisMonthByDriver.get(driver.userId) ?? 0,
      hasActiveDelivery: busyDriverIds.has(driver.userId),
    };
  });

  // Days with no completed revenue are absent from the grouped rows; the chart
  // needs every day present so a gap reads as a zero, not as missing data.
  const trendByDay = new Map(
    trendRows.map((row) => [toDayKey(row.day), Number(row.total)]),
  );
  const dailyTrend: { date: string; total: number }[] = [];
  for (let dayOffset = 0; dayOffset < REVENUE_WINDOW_DAYS; dayOffset++) {
    const day = new Date(revenueWindowStart);
    day.setUTCDate(day.getUTCDate() + dayOffset);
    const key = toDayKey(day);
    dailyTrend.push({ date: key, total: trendByDay.get(key) ?? 0 });
  }

  const labelById = new Map(
    vehicleTypeSpecs.map((spec) => [spec.id, spec.label]),
  );
  const byServiceType = byServiceRaw
    .map((row) => ({
      vehicleTypeSpecId: row.vehicleTypeSpecId,
      label: labelById.get(row.vehicleTypeSpecId) ?? "Unknown",
      total: orderTotal(row._sum),
      orderCount: row._count,
    }))
    .sort((a, b) => b.total - a.total);

  const regionTotals = new Map<
    GeorgianCity | "UNASSIGNED",
    { total: number; orderCount: number }
  >();
  for (const order of completedForRegion) {
    const city = order.driver?.driverProfile?.city ?? "UNASSIGNED";
    const entry = regionTotals.get(city) ?? { total: 0, orderCount: 0 };
    entry.total += order.price + order.overtimeFee;
    entry.orderCount += 1;
    regionTotals.set(city, entry);
  }
  const byRegion = Array.from(regionTotals.entries())
    .map(([city, totals]) => ({ city, ...totals }))
    .sort((a, b) => b.total - a.total);

  const driverNameById = new Map(
    rawDrivers.map((driver) => [driver.userId, driver.user.name]),
  );
  const driverPayouts = payoutsRaw
    // `driverId: { not: null }` already excludes these; the filter is what
    // narrows the type so the id can be read without a cast.
    .filter((row): row is typeof row & { driverId: string } => {
      return row.driverId !== null;
    })
    .map((row) => ({
      userId: row.driverId,
      name: driverNameById.get(row.driverId) ?? "Unknown driver",
      completedOrdersCount: row._count,
      totalEarned: orderTotal(row._sum),
    }))
    .sort((a, b) => b.totalEarned - a.totalEarned);

  return {
    // Spread rather than returned whole: `activatedAt` comes back from Prisma as
    // a `Date`, and this object crosses into a `"use client"` tree, where every
    // value has to be plain serialisable data.
    company: {
      ...company,
      activatedAt: company.activatedAt?.toISOString() ?? null,
    },
    overview: {
      activeOrdersCount,
      completedTodayCount: completedTodayAgg._count,
      revenueTodayTotal: orderTotal(completedTodayAgg._sum),
      revenueMonthTotal: orderTotal(revenueMonthAgg._sum),
      onlineDriversCount,
      fleetSize,
      recentOrders: orders.slice(0, RECENT_ORDERS_LIMIT),
    },
    orders,
    fleet,
    drivers,
    revenue: { dailyTrend, byServiceType, byRegion, driverPayouts },
  };
}
