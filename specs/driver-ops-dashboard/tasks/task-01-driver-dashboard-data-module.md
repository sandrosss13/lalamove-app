# Task 01: Driver dashboard data-aggregation module

## Status

complete

## Wave

1

## Description

The new driver ops dashboard has 4 tabs (Overview, Deliveries, Earnings, Vehicle) that all need data derived from `DriverProfile`, `Order`, and `Vehicle`. This task creates one server-only module with a single exported function that fetches and shapes everything in one pass, mirroring `specs/company-ops-dashboard/tasks/task-01-dashboard-data-module.md`'s approach exactly but scoped to one driver instead of a fleet. It reuses the exact query logic already proven in `src/components/dashboard/driver-bookings.tsx` (the "open market ∪ own" order filter) and extends it with a few aggregates (today/month earnings, an earnings trend, a "currently active delivery" lookup) that don't exist anywhere in the app yet.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-03-shell-and-scaffold.md, task-08-order-detail-drawer.md

**Context from dependencies:** None — this task only needs the existing Prisma schema and `driver-bookings.tsx`'s query pattern (both described in full below).

## Files to Create

- `src/lib/driver-dashboard-data.ts` — server-only module (no `"use client"`, imports `prisma` directly) exporting `getDriverDashboardData(userId: string)` and every type below.

## Technical Details

### Existing pattern this extends: `src/components/dashboard/driver-bookings.tsx` (read in full, do not modify)

```ts
const driverProfile = await prisma.driverProfile.findUnique({
  where: { userId },
  select: {
    isOnline: true,
    vehicles: { select: { id: true, plateNumber: true, make: true, model: true, vehicleTypeSpecId: true } },
  },
});

const registeredVehicleTypeSpecIds = [...new Set(driverProfile.vehicles.map((v) => v.vehicleTypeSpecId))];

const orders = await prisma.order.findMany({
  where: isIndependent
    ? {
        OR: [
          { status: OrderStatus.PENDING, driverId: null, vehicleTypeSpecId: { in: registeredVehicleTypeSpecIds } },
          { driverId: userId },
        ],
      }
    : { driverId: userId },
  include: { vehicle: { select: { plateNumber: true, make: true, model: true } } },
  orderBy: { createdAt: "desc" },
});
```

`isIndependent` there is `companyId === null` on the driver's profile.

### Full type contract (write these exactly — every other task depends on these exact field names)

```ts
import type {
  GeorgianCity,
  OrderStatus,
  CargoCategory,
  LoadingAccessType,
  VehicleCategory,
} from "@prisma/client";

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
  createdAt: string; // ISO string
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
    completedTodayCount: number; // COMPLETED, completedAt >= start of today
    earningsTodayTotal: number; // sum(price + overtimeFee), same filter
    earningsMonthTotal: number; // same, completedAt >= start of this calendar month
    completedTotalCount: number; // all-time COMPLETED count
    /** the one ACCEPTED/IN_TRANSIT order right now, or null — a driver has at most one active delivery */
    activeOrderId: string | null;
  };
  orders: DriverOpsOrder[]; // full unbounded list: open-market matches (independent only) ∪ own, newest first
  vehicles: DriverOpsVehicle[]; // full unbounded list of the driver's own vehicles (empty for rostered drivers — their vehicles are company-owned)
  earnings: {
    dailyTrend: { date: string; total: number }[]; // last 90 days, one entry per day (0 for days with none), "YYYY-MM-DD", oldest first
  };
};

export async function getDriverDashboardData(
  userId: string,
): Promise<DriverDashboardData | null> {
  // implementation below
}
```

### Implementation steps

1. Resolve the driver profile, including everything needed for `driver`, the orders query, and the vehicle list, in one query:

```ts
const driverProfile = await prisma.driverProfile.findUnique({
  where: { userId },
  include: {
    user: { select: { name: true } },
    company: { select: { companyName: true } },
    vehicles: { select: { vehicleTypeSpecId: true } }, // only the type ids are needed here for the open-market filter
  },
});

if (!driverProfile) {
  return null;
}

const isIndependent = driverProfile.companyId === null;
```

2. **Orders** (`DriverOpsOrder[]`) — same filter as `driver-bookings.tsx`, extended `include`:

```ts
const registeredVehicleTypeSpecIds = [...new Set(driverProfile.vehicles.map((v) => v.vehicleTypeSpecId))];

const rawOrders = await prisma.order.findMany({
  where: isIndependent
    ? {
        OR: [
          { status: "PENDING", driverId: null, vehicleTypeSpecId: { in: registeredVehicleTypeSpecIds } },
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
});

const orders: DriverOpsOrder[] = rawOrders.map((o) => ({
  id: o.id,
  status: o.status,
  cargoCategory: o.cargoCategory,
  description: o.description,
  pickupAddress: o.pickupAddress,
  pickupLat: o.pickupLat,
  pickupLng: o.pickupLng,
  dropoffAddress: o.dropoffAddress,
  dropoffLat: o.dropoffLat,
  dropoffLng: o.dropoffLng,
  distanceKm: o.distanceKm,
  price: o.price,
  overtimeFee: o.overtimeFee,
  vehicleTypeSpecId: o.vehicleTypeSpecId,
  vehicleTypeLabel: o.vehicleTypeSpec.label,
  clientName: o.client.name,
  vehicleId: o.vehicleId,
  vehiclePlate: o.vehicle?.plateNumber ?? null,
  createdAt: o.createdAt.toISOString(),
  inTransitAt: o.inTransitAt?.toISOString() ?? null,
  completedAt: o.completedAt?.toISOString() ?? null,
  waitingMinutes: o.waitingMinutes,
  isOpenMarket: o.driverId === null,
}));
```

3. **Vehicles** (`DriverOpsVehicle[]`) — the driver's own, regardless of `isIndependent` (a rostered driver simply has none, since their vehicles hang off the company instead):

```ts
const rawVehicles = await prisma.vehicle.findMany({
  where: { driverProfileId: driverProfile.id },
  include: { vehicleTypeSpec: true },
  orderBy: { createdAt: "desc" },
});

const vehicles: DriverOpsVehicle[] = rawVehicles.map((v) => ({
  id: v.id,
  plateNumber: v.plateNumber,
  make: v.make,
  model: v.model,
  year: v.year,
  photoUrls: v.photoUrls,
  vehicleTypeSpecId: v.vehicleTypeSpecId,
  vehicleTypeCode: v.vehicleTypeSpec.code,
  vehicleTypeLabel: v.vehicleTypeSpec.label,
  maxPayloadKg: v.vehicleTypeSpec.maxPayloadKg,
  loadingAccessType: v.vehicleTypeSpec.loadingAccessType,
  category: v.vehicleTypeSpec.category,
}));
```

4. **Overview aggregates**:

```ts
const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0);
const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

const [completedTodayAgg, completedMonthAgg, completedTotalCount, activeOrder] = await Promise.all([
  prisma.order.aggregate({
    where: { driverId: userId, status: "COMPLETED", completedAt: { gte: startOfToday } },
    _sum: { price: true, overtimeFee: true },
    _count: true,
  }),
  prisma.order.aggregate({
    where: { driverId: userId, status: "COMPLETED", completedAt: { gte: startOfMonth } },
    _sum: { price: true, overtimeFee: true },
  }),
  prisma.order.count({ where: { driverId: userId, status: "COMPLETED" } }),
  prisma.order.findFirst({
    where: { driverId: userId, status: { in: ["ACCEPTED", "IN_TRANSIT"] } },
    select: { id: true },
  }),
]);

const overview = {
  completedTodayCount: completedTodayAgg._count,
  earningsTodayTotal: (completedTodayAgg._sum.price ?? 0) + (completedTodayAgg._sum.overtimeFee ?? 0),
  earningsMonthTotal: (completedMonthAgg._sum.price ?? 0) + (completedMonthAgg._sum.overtimeFee ?? 0),
  completedTotalCount,
  activeOrderId: activeOrder?.id ?? null,
};
```

5. **Earnings trend (last 90 days)** — same raw-SQL pattern as the company spec's revenue trend (Prisma's `groupBy` can't bucket by a truncated timestamp), scoped to this driver:

```ts
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
ninetyDaysAgo.setHours(0, 0, 0, 0);

const trendRows = await prisma.$queryRaw<{ day: Date; total: number }[]>`
  SELECT date_trunc('day', "completedAt") AS day, SUM("price" + "overtimeFee") AS total
  FROM "Order"
  WHERE "driverId" = ${userId}
    AND "status" = 'COMPLETED'
    AND "completedAt" >= ${ninetyDaysAgo}
  GROUP BY 1
  ORDER BY 1
`;

const trendByDay = new Map(trendRows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.total)]));
const dailyTrend: { date: string; total: number }[] = [];
for (let i = 0; i < 90; i++) {
  const d = new Date(ninetyDaysAgo);
  d.setDate(d.getDate() + i);
  const key = d.toISOString().slice(0, 10);
  dailyTrend.push({ date: key, total: trendByDay.get(key) ?? 0 });
}
```

6. **Driver identity**:

```ts
const driver = {
  userId,
  name: driverProfile.user.name,
  city: driverProfile.city,
  isOnline: driverProfile.isOnline,
  isIndependent,
  companyName: driverProfile.company?.companyName ?? null,
};
```

7. Assemble and return `{ driver, overview, orders, vehicles, earnings: { dailyTrend } }`.

## Acceptance Criteria

- [ ] `src/lib/driver-dashboard-data.ts` exports `getDriverDashboardData` and every type listed in the contract above, with those exact field names.
- [ ] Returns `null` when no `DriverProfile` row exists for the given `userId`.
- [ ] `orders` matches `driver-bookings.tsx`'s existing filter exactly (independent: open-market matches ∪ own; rostered: own only).
- [ ] `vehicles` is empty for a rostered driver, populated for an independent one.
- [ ] `earnings.dailyTrend` has exactly 90 entries, zero-filled for days with no completed revenue.
- [ ] Every date field is a string (`.toISOString()`), never a raw `Date`.
- [ ] `pnpm typecheck` passes with this file in isolation.
