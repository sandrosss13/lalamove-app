/**
 * Everything the driver ops dashboard renders, fetched and shaped in one pass.
 *
 * The dashboard is a single page with four tabs (Overview, Deliveries, Earnings,
 * Vehicle) whose data all comes from the same three models, so one aggregation
 * function is cheaper — and far easier to keep consistent — than each tab
 * running its own ad-hoc queries. This is the driver-scoped twin of
 * `company-dashboard-data.ts`, and deliberately mirrors its structure.
 *
 * Server-only: it talks to Prisma directly. The object it returns is handed
 * from a server component into a `"use client"` tree, so every value in it is
 * plain serialisable data — in particular every timestamp is an ISO string,
 * never a `Date`.
 *
 * Scoping: everything is filtered by the signed-in driver's own `userId` (their
 * `Order.driverId` / `DriverProfile.userId`), so no other driver's rows are ever
 * readable through this module. The one exception is by design: an independent
 * driver also sees unclaimed open-market orders matching a vehicle type they
 * have registered, exactly as `DriverBookings` already shows them.
 *
 * Time boundaries: every "today"/"this month"/window boundary in this file is
 * UTC-based, because the raw SQL trend query buckets with `date_trunc('day',
 * ...)` which runs in UTC through Prisma's Postgres connector; mixing local and
 * UTC boundaries would make the Overview KPIs disagree with the trend chart on
 * any server that is not on UTC.
 */

import { OrderStatus } from "@prisma/client";
import type {
  CargoCategory,
  GeorgianCity,
  LoadingAccessType,
  VehicleCategory,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Length of the earnings trend window, in days (today included). */
const EARNINGS_WINDOW_DAYS = 90;

/** Length of the "YYYY-MM-DD" prefix of an ISO timestamp. */
const ISO_DATE_LENGTH = 10;

/**
 * Statuses that mean this driver is on a delivery right now. A driver holds at
 * most one of these at a time, which is what makes `activeOrderId` singular.
 */
const ACTIVE_DELIVERY_STATUSES = [OrderStatus.ACCEPTED, OrderStatus.IN_TRANSIT];

export type DriverOpsOrder = {
  id: string;
  status: OrderStatus;
  cargoCategory: CargoCategory;
  description: string | null;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  distanceKm: number;
  price: number;
  overtimeFee: number;
  vehicleTypeSpecId: string;
  vehicleTypeLabel: string;
  clientName: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
  createdAt: string; // ISO string — Date is not serializable across the server/client boundary
  inTransitAt: string | null;
  completedAt: string | null;
  waitingMinutes: number | null;
  /** true = still PENDING and driverId is null (open market — only ever true for independent drivers) */
  isOpenMarket: boolean;
};

export type DriverOpsVehicle = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  photoUrls: string[];
  /**
   * Matches `DriverOpsOrder.vehicleTypeSpecId` — used to narrow which of the
   * driver's vehicles can fulfil a given order (e.g. in the accept form).
   */
  vehicleTypeSpecId: string;
  vehicleTypeCode: string;
  vehicleTypeLabel: string;
  maxPayloadKg: number;
  loadingAccessType: LoadingAccessType;
  category: VehicleCategory;
};

export type DriverDashboardData = {
  driver: {
    userId: string;
    name: string;
    city: GeorgianCity;
    isOnline: boolean;
    isIndependent: boolean;
    companyName: string | null;
  };
  overview: {
    /** COMPLETED, completedAt >= start of the current UTC day */
    completedTodayCount: number;
    /** sum(price + overtimeFee), same filter as completedTodayCount */
    earningsTodayTotal: number;
    /** same, completedAt >= start of the current UTC calendar month */
    earningsMonthTotal: number;
    /** All-time COMPLETED count for this driver. */
    completedTotalCount: number;
    /** the one ACCEPTED/IN_TRANSIT order right now, or null — a driver has at most one active delivery */
    activeOrderId: string | null;
  };
  /** Full unbounded list: open-market matches (independent only) ∪ own, newest first. */
  orders: DriverOpsOrder[];
  /**
   * Full unbounded list of the driver's own vehicles, newest first (empty for
   * rostered drivers — their vehicles are company-owned).
   */
  vehicles: DriverOpsVehicle[];
  earnings: {
    /**
     * One entry per day of the trend window (zero-filled for days with no
     * completed earnings), date as "YYYY-MM-DD", oldest first.
     */
    dailyTrend: { date: string; total: number }[];
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

/** What a driver earns on an order: the quoted price plus whatever overtime was settled on top. */
function orderTotal(sums: {
  price: number | null;
  overtimeFee: number | null;
}): number {
  return (sums.price ?? 0) + (sums.overtimeFee ?? 0);
}

/**
 * Fetches and shapes every figure the driver ops dashboard shows.
 *
 * Returns `null` when the signed-in user has no `DriverProfile` row — sign-up
 * always creates one, so that only happens if it was interrupted part-way. The
 * caller renders the "finish your driver profile" fallback; deciding that here
 * would tie this module to a particular UI.
 */
export async function getDriverDashboardData(
  userId: string,
): Promise<DriverDashboardData | null> {
  // The profile is fetched first because the orders query is keyed off it: the
  // open-market filter needs the driver's registered vehicle types, and whether
  // there is an open market for them at all depends on `companyId`. Its vehicles
  // are pulled in full here rather than by a second `vehicle.findMany`, since
  // the Vehicle tab needs exactly the rows the type filter is derived from.
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
    include: {
      user: { select: { name: true } },
      company: { select: { companyName: true } },
      vehicles: {
        include: { vehicleTypeSpec: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!driverProfile) {
    return null;
  }

  // A rostered driver never works the open market — their company claims and
  // dispatches work to them — so they only ever see their own deliveries.
  const isIndependent = driverProfile.companyId === null;

  // A delivery can only be taken in a vehicle of the type it asks for, so the
  // distinct set of registered types is what the open-market list is filtered
  // by — the same rule `DriverBookings` applies today.
  const registeredVehicleTypeSpecIds = [
    ...new Set(
      driverProfile.vehicles.map((vehicle) => vehicle.vehicleTypeSpecId),
    ),
  ];

  // All period boundaries are derived from one `now`, so every figure on the
  // page refers to the same instant even if the queries straddle midnight.
  //
  // They are all UTC boundaries. The trend's buckets come from `date_trunc`
  // over timestamps Prisma stores in UTC, so they are UTC days; anchoring the
  // KPIs to local midnight instead would leave the "today" figure and the
  // trend's last bar measuring different windows (and `earningsMonthTotal`
  // differing from the sum of that month's bars) on any non-UTC server.
  const now = new Date();
  const startOfToday = startOfUtcDay(now);
  const startOfMonth = startOfUtcMonth(now);
  // Inclusive of today: the window is the last `EARNINGS_WINDOW_DAYS` days
  // ending with today, so today's earnings are the last point on the trend.
  const earningsWindowStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - (EARNINGS_WINDOW_DAYS - 1),
    ),
  );

  const [
    rawOrders,
    completedTodayAgg,
    earningsMonthAgg,
    completedTotalCount,
    activeOrder,
    trendRows,
  ] = await Promise.all([
    // Deliveries already taken by this driver are not type-filtered: that match
    // was already made when the order was accepted or dispatched.
    prisma.order.findMany({
      where: isIndependent
        ? {
            OR: [
              {
                status: OrderStatus.PENDING,
                driverId: null,
                vehicleTypeSpecId: { in: registeredVehicleTypeSpecIds },
              },
              { driverId: userId },
            ],
          }
        : { driverId: userId },
      include: {
        client: { select: { name: true } },
        vehicle: { select: { plateNumber: true } },
        vehicleTypeSpec: { select: { label: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    prisma.order.aggregate({
      where: {
        driverId: userId,
        status: OrderStatus.COMPLETED,
        completedAt: { gte: startOfToday },
      },
      _sum: { price: true, overtimeFee: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: {
        driverId: userId,
        status: OrderStatus.COMPLETED,
        completedAt: { gte: startOfMonth },
      },
      _sum: { price: true, overtimeFee: true },
    }),
    prisma.order.count({
      where: { driverId: userId, status: OrderStatus.COMPLETED },
    }),
    prisma.order.findFirst({
      where: { driverId: userId, status: { in: ACTIVE_DELIVERY_STATUSES } },
      select: { id: true },
    }),

    // The one non-Prisma-idiomatic query in this module: `groupBy` cannot bucket
    // by a truncated timestamp, so the daily earnings trend needs raw SQL.
    prisma.$queryRaw<{ day: Date; total: number }[]>`
      SELECT date_trunc('day', "completedAt") AS day, SUM("price" + "overtimeFee") AS total
      FROM "Order"
      WHERE "driverId" = ${userId}
        AND "status" = 'COMPLETED'
        AND "completedAt" >= ${earningsWindowStart}
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  const orders: DriverOpsOrder[] = rawOrders.map((order) => ({
    id: order.id,
    status: order.status,
    cargoCategory: order.cargoCategory,
    description: order.description,
    pickupAddress: order.pickupAddress,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    dropoffAddress: order.dropoffAddress,
    dropoffLat: order.dropoffLat,
    dropoffLng: order.dropoffLng,
    distanceKm: order.distanceKm,
    price: order.price,
    overtimeFee: order.overtimeFee,
    vehicleTypeSpecId: order.vehicleTypeSpecId,
    vehicleTypeLabel: order.vehicleTypeSpec.label,
    clientName: order.client.name,
    vehicleId: order.vehicleId,
    vehiclePlate: order.vehicle?.plateNumber ?? null,
    createdAt: order.createdAt.toISOString(),
    inTransitAt: order.inTransitAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    waitingMinutes: order.waitingMinutes,
    isOpenMarket: order.driverId === null,
  }));

  const vehicles: DriverOpsVehicle[] = driverProfile.vehicles.map(
    (vehicle) => ({
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
    }),
  );

  // Days with no completed earnings are absent from the grouped rows; the chart
  // needs every day present so a gap reads as a zero, not as missing data.
  const trendByDay = new Map(
    trendRows.map((row) => [toDayKey(row.day), Number(row.total)]),
  );
  const dailyTrend: { date: string; total: number }[] = [];
  for (let dayOffset = 0; dayOffset < EARNINGS_WINDOW_DAYS; dayOffset++) {
    const day = new Date(earningsWindowStart);
    day.setUTCDate(day.getUTCDate() + dayOffset);
    const key = toDayKey(day);
    dailyTrend.push({ date: key, total: trendByDay.get(key) ?? 0 });
  }

  return {
    driver: {
      userId,
      name: driverProfile.user.name,
      city: driverProfile.city,
      isOnline: driverProfile.isOnline,
      isIndependent,
      companyName: driverProfile.company?.companyName ?? null,
    },
    overview: {
      completedTodayCount: completedTodayAgg._count,
      earningsTodayTotal: orderTotal(completedTodayAgg._sum),
      earningsMonthTotal: orderTotal(earningsMonthAgg._sum),
      completedTotalCount,
      activeOrderId: activeOrder?.id ?? null,
    },
    orders,
    vehicles,
    earnings: { dailyTrend },
  };
}
