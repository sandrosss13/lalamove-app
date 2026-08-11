# Task 01: Dashboard data-aggregation module

## Status

complete

## Wave

1

## Description

The new company ops dashboard has 6 tabs (Overview, Orders, Revenue, Fleet, Drivers, Vehicles) that all need data derived from `Order`, `Vehicle`, `DriverProfile`, and `LogisticsCompany`. Rather than each tab/page component running its own ad-hoc Prisma queries, this task creates one server-only module with a single exported function that fetches and shapes everything in one pass, returned as one typed object. Every other task in this feature imports types from this module — it is the load-bearing contract the rest of the feature is built on.

This mirrors the existing `CompanyBookings` component's query (open-market + own orders) but extends it with fields needed for the drawer/detail views, and adds several new aggregate queries (revenue trend, revenue by service type, revenue by region, driver payouts, per-driver deliveries-today) that don't exist anywhere in the app today.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-06-shell-and-scaffold.md (and transitively every task in waves 3–4, which import types from this module)

**Context from dependencies:** None — this task only needs the existing Prisma schema and the existing `CompanyBookings` query pattern (both described in full below).

## Files to Create

- `src/lib/company-dashboard-data.ts` — server-only module (no `"use client"`, imports `prisma` directly) exporting `getCompanyDashboardData(userId: string)` and every type below.

## Technical Details

### Existing pattern this extends

`src/components/dashboard/company-bookings.tsx` already runs the "open-market ∪ own orders" query this task's `orders` field is built from:

```ts
const fleet = await prisma.vehicle.findMany({
  where: { companyId },
  select: { id: true, plateNumber: true, make: true, model: true, vehicleTypeSpecId: true },
  orderBy: { createdAt: "desc" },
});

const fleetVehicleTypeSpecIds = [...new Set(fleet.map((v) => v.vehicleTypeSpecId))];

const orders = await prisma.order.findMany({
  where: {
    OR: [
      { status: "PENDING", companyId: null, vehicleTypeSpecId: { in: fleetVehicleTypeSpecIds } },
      { companyId },
    ],
  },
  orderBy: { createdAt: "desc" },
});
```

This task reuses that same `OR` shape but extends the `include`/`select` to cover everything the new Orders tab and order-detail drawer need (client name, driver name, vehicle plate, vehicle type label), and separately derives `overview`/`revenue` aggregates from a similarly-scoped but `COMPLETED`-filtered query.

### Company resolution

Every existing `logistics-company/**` route and `company-dashboard.tsx` resolves the company the same way — follow this exactly:

```ts
const company = await prisma.logisticsCompany.findUnique({
  where: { userId },
  select: { id: true, companyName: true, vatId: true, phone: true, city: true },
});

if (!company) {
  return null;
}
```

`getCompanyDashboardData` returns `null` in this case. The caller (task-06, rewriting `company-dashboard.tsx`) renders the existing "finish your company profile" fallback when this happens — do not throw or redirect from inside this module.

### Full type contract (write these exactly — every other task depends on these exact field names)

```ts
import type {
  GeorgianCity,
  OrderStatus,
  CargoCategory,
  LoadingAccessType,
  VehicleCategory,
} from "@prisma/client";

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
  vehicleTypeSpecId: string; // matches OpsOrder.vehicleTypeSpecId — used to narrow which fleet vehicles can fulfil a given order (e.g. in the order-detail drawer's dispatch form)
  vehicleTypeCode: string;
  vehicleTypeLabel: string;
  maxPayloadKg: number;
  loadingAccessType: LoadingAccessType;
  category: VehicleCategory;
  /** null when no driver currently has this vehicle (DriverVehicleAssignment.unassignedAt is null for none) */
  activeAssignment: OpsVehicleAssignment | null;
};

export type OpsDriver = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  city: GeorgianCity;
  isOnline: boolean;
  assignedVehicle: { id: string; plateNumber: string; make: string; model: string } | null;
  deliveriesTodayCount: number;
  completedTotalCount: number; // all-time COMPLETED orders for this driver
  earnedThisMonthTotal: number; // sum(price + overtimeFee) COMPLETED, completedAt >= start of this calendar month
  /** true when this driver has an order in ACCEPTED or IN_TRANSIT right now */
  hasActiveDelivery: boolean;
};

export type CompanyDashboardData = {
  company: {
    id: string;
    companyName: string;
    vatId: string;
    phone: string;
    city: GeorgianCity;
  };
  overview: {
    activeOrdersCount: number; // status in CLAIMED/ACCEPTED/IN_TRANSIT, companyId = self
    completedTodayCount: number; // COMPLETED, completedAt >= start of today, companyId = self
    revenueTodayTotal: number; // sum(price + overtimeFee), same filter as completedTodayCount
    revenueMonthTotal: number; // same, completedAt >= start of this calendar month
    onlineDriversCount: number; // driverProfile.isOnline true, companyId = self
    fleetSize: number; // vehicle.count, companyId = self
    recentOrders: OpsOrder[]; // latest 8 of `orders` below, newest first
  };
  orders: OpsOrder[]; // full unbounded list: open-market matches ∪ own, newest first
  fleet: OpsVehicle[]; // full unbounded company vehicle list
  drivers: OpsDriver[]; // full unbounded roster
  revenue: {
    dailyTrend: { date: string; total: number }[]; // last 90 days, one entry per day with COMPLETED revenue that day (0 for days with none), date as "YYYY-MM-DD", oldest first
    byServiceType: { vehicleTypeSpecId: string; label: string; total: number; orderCount: number }[];
    byRegion: { city: GeorgianCity | "UNASSIGNED"; total: number; orderCount: number }[]; // derived from the assigned driver's city on COMPLETED orders; "UNASSIGNED" bucket for any COMPLETED order somehow missing a driver
    driverPayouts: { userId: string; name: string; completedOrdersCount: number; totalEarned: number }[]; // last 90 days, per roster driver
  };
};

export async function getCompanyDashboardData(
  userId: string,
): Promise<CompanyDashboardData | null> {
  // implementation below
}
```

### Implementation steps

1. Resolve `company` as shown above; return `null` if not found.
2. Run every remaining query inside a single `Promise.all` for parallelism. Structure suggested below — feel free to combine queries where it's more efficient, as long as the final shape matches the type contract exactly.

3. **Orders** (`OpsOrder[]`, reused for both `orders` and `overview.recentOrders`):

```ts
const rawOrders = await prisma.order.findMany({
  where: {
    OR: [
      {
        status: "PENDING",
        companyId: null,
        vehicleTypeSpecId: { in: fleetVehicleTypeSpecIds }, // computed from fleet query below — see note
      },
      { companyId: company.id },
    ],
  },
  include: {
    client: { select: { name: true } },
    driver: { select: { id: true, name: true } },
    vehicle: { select: { plateNumber: true } },
    vehicleTypeSpec: { select: { label: true } },
  },
  orderBy: { createdAt: "desc" },
});

const orders: OpsOrder[] = rawOrders.map((o) => ({
  id: o.id,
  status: o.status,
  cargoCategory: o.cargoCategory,
  description: o.description,
  pickupAddress: o.pickupAddress,
  dropoffAddress: o.dropoffAddress,
  distanceKm: o.distanceKm,
  price: o.price,
  overtimeFee: o.overtimeFee,
  vehicleTypeSpecId: o.vehicleTypeSpecId,
  vehicleTypeLabel: o.vehicleTypeSpec.label,
  clientName: o.client.name,
  driverUserId: o.driverId,
  driverName: o.driver?.name ?? null,
  vehicleId: o.vehicleId,
  vehiclePlate: o.vehicle?.plateNumber ?? null,
  createdAt: o.createdAt.toISOString(),
  inTransitAt: o.inTransitAt?.toISOString() ?? null,
  completedAt: o.completedAt?.toISOString() ?? null,
  waitingMinutes: o.waitingMinutes,
  isOpenMarket: o.companyId === null,
}));
```

   `fleetVehicleTypeSpecIds` needs the fleet's distinct vehicle type ids computed first — fetch a minimal `vehicle.findMany({ where: { companyId: company.id }, select: { vehicleTypeSpecId: true } })` up front (outside the `Promise.all`, since the orders query depends on it), same as `CompanyBookings` does today.

4. **Fleet** (`OpsVehicle[]`):

```ts
const rawVehicles = await prisma.vehicle.findMany({
  where: { companyId: company.id },
  include: {
    vehicleTypeSpec: true,
    assignments: {
      where: { unassignedAt: null },
      include: { driverProfile: { include: { user: { select: { id: true, name: true } } } } },
      take: 1,
    },
  },
  orderBy: { createdAt: "desc" },
});

const fleet: OpsVehicle[] = rawVehicles.map((v) => {
  const active = v.assignments[0];
  return {
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
    activeAssignment: active
      ? {
          driverProfileId: active.driverProfileId,
          driverUserId: active.driverProfile.userId,
          driverName: active.driverProfile.user.name,
          isOnline: active.driverProfile.isOnline,
        }
      : null,
  };
});
```

5. **Drivers** (`OpsDriver[]`) — needs today's start-of-day boundary and "has an active delivery right now":

```ts
const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0);

const rawDrivers = await prisma.driverProfile.findMany({
  where: { companyId: company.id },
  include: {
    user: { select: { id: true, name: true, email: true } },
    assignments: {
      where: { unassignedAt: null },
      include: { vehicle: { select: { id: true, plateNumber: true, make: true, model: true } } },
      take: 1,
    },
  },
  orderBy: { createdAt: "asc" },
});

const driverUserIds = rawDrivers.map((d) => d.userId);
const startOfMonthForDrivers = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

const [deliveriesTodayCounts, completedTotalCounts, earnedThisMonthAggs, activeDeliveryDriverIds] = await Promise.all([
  prisma.order.groupBy({
    by: ["driverId"],
    where: { driverId: { in: driverUserIds }, status: "COMPLETED", completedAt: { gte: startOfToday } },
    _count: true,
  }),
  prisma.order.groupBy({
    by: ["driverId"],
    where: { driverId: { in: driverUserIds }, status: "COMPLETED" },
    _count: true,
  }),
  prisma.order.groupBy({
    by: ["driverId"],
    where: { driverId: { in: driverUserIds }, status: "COMPLETED", completedAt: { gte: startOfMonthForDrivers } },
    _sum: { price: true, overtimeFee: true },
  }),
  prisma.order.findMany({
    where: { driverId: { in: driverUserIds }, status: { in: ["ACCEPTED", "IN_TRANSIT"] } },
    select: { driverId: true },
  }),
]);

const deliveriesTodayByDriver = new Map(deliveriesTodayCounts.map((r) => [r.driverId, r._count]));
const completedTotalByDriver = new Map(completedTotalCounts.map((r) => [r.driverId, r._count]));
const earnedThisMonthByDriver = new Map(
  earnedThisMonthAggs.map((r) => [r.driverId, (r._sum.price ?? 0) + (r._sum.overtimeFee ?? 0)]),
);
const activeDeliverySet = new Set(activeDeliveryDriverIds.map((r) => r.driverId));

const drivers: OpsDriver[] = rawDrivers.map((d) => {
  const assignment = d.assignments[0];
  return {
    userId: d.userId,
    name: d.user.name,
    email: d.user.email,
    phone: d.phone,
    city: d.city,
    isOnline: d.isOnline,
    assignedVehicle: assignment
      ? { id: assignment.vehicle.id, plateNumber: assignment.vehicle.plateNumber, make: assignment.vehicle.make, model: assignment.vehicle.model }
      : null,
    deliveriesTodayCount: deliveriesTodayByDriver.get(d.userId) ?? 0,
    completedTotalCount: completedTotalByDriver.get(d.userId) ?? 0,
    earnedThisMonthTotal: earnedThisMonthByDriver.get(d.userId) ?? 0,
    hasActiveDelivery: activeDeliverySet.has(d.userId),
  };
});
```

6. **Overview aggregates**:

```ts
const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

const [activeOrdersCount, completedTodayAgg, revenueMonthAgg, onlineDriversCount, fleetSize] = await Promise.all([
  prisma.order.count({ where: { companyId: company.id, status: { in: ["CLAIMED", "ACCEPTED", "IN_TRANSIT"] } } }),
  prisma.order.aggregate({
    where: { companyId: company.id, status: "COMPLETED", completedAt: { gte: startOfToday } },
    _sum: { price: true, overtimeFee: true },
    _count: true,
  }),
  prisma.order.aggregate({
    where: { companyId: company.id, status: "COMPLETED", completedAt: { gte: startOfMonth } },
    _sum: { price: true, overtimeFee: true },
  }),
  prisma.driverProfile.count({ where: { companyId: company.id, isOnline: true } }),
  prisma.vehicle.count({ where: { companyId: company.id } }),
]);

const overview = {
  activeOrdersCount,
  completedTodayCount: completedTodayAgg._count,
  revenueTodayTotal: (completedTodayAgg._sum.price ?? 0) + (completedTodayAgg._sum.overtimeFee ?? 0),
  revenueMonthTotal: (revenueMonthAgg._sum.price ?? 0) + (revenueMonthAgg._sum.overtimeFee ?? 0),
  onlineDriversCount,
  fleetSize,
  recentOrders: orders.slice(0, 8),
};
```

7. **Revenue trend (last 90 days)** — this is the one query that isn't plain Prisma. Prisma's `groupBy` cannot bucket by a truncated timestamp, so use `$queryRaw` with `date_trunc`:

```ts
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
ninetyDaysAgo.setHours(0, 0, 0, 0);

// The one non-Prisma-idiomatic query in this module — Prisma's `groupBy` can't
// bucket by a truncated timestamp, so raw SQL is used here only.
const trendRows = await prisma.$queryRaw<{ day: Date; total: number }[]>`
  SELECT date_trunc('day', "completedAt") AS day, SUM("price" + "overtimeFee") AS total
  FROM "Order"
  WHERE "companyId" = ${company.id}
    AND "status" = 'COMPLETED'
    AND "completedAt" >= ${ninetyDaysAgo}
  GROUP BY 1
  ORDER BY 1
`;
```

   Then fill in every day in the 90-day window (not just days with revenue) so the chart never has silent gaps:

```ts
const trendByDay = new Map(trendRows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.total)]));
const dailyTrend: { date: string; total: number }[] = [];
for (let i = 0; i < 90; i++) {
  const d = new Date(ninetyDaysAgo);
  d.setDate(d.getDate() + i);
  const key = d.toISOString().slice(0, 10);
  dailyTrend.push({ date: key, total: trendByDay.get(key) ?? 0 });
}
```

8. **Revenue by service type**:

```ts
const byServiceRaw = await prisma.order.groupBy({
  by: ["vehicleTypeSpecId"],
  where: { companyId: company.id, status: "COMPLETED" },
  _sum: { price: true, overtimeFee: true },
  _count: true,
});

const specLabels = await prisma.vehicleTypeSpec.findMany({
  where: { id: { in: byServiceRaw.map((r) => r.vehicleTypeSpecId) } },
  select: { id: true, label: true },
});
const labelById = new Map(specLabels.map((s) => [s.id, s.label]));

const byServiceType = byServiceRaw.map((r) => ({
  vehicleTypeSpecId: r.vehicleTypeSpecId,
  label: labelById.get(r.vehicleTypeSpecId) ?? "Unknown",
  total: (r._sum.price ?? 0) + (r._sum.overtimeFee ?? 0),
  orderCount: r._count,
}));
```

9. **Revenue by region** — cannot `groupBy` on a joined field, so fetch and reduce in the server function (small volume, per the requirements' "no pagination" assumption):

```ts
const completedForRegion = await prisma.order.findMany({
  where: { companyId: company.id, status: "COMPLETED" },
  select: { price: true, overtimeFee: true, driver: { select: { driverProfile: { select: { city: true } } } } },
});

const regionMap = new Map<string, { total: number; orderCount: number }>();
for (const o of completedForRegion) {
  const city = o.driver?.driverProfile?.city ?? "UNASSIGNED";
  const entry = regionMap.get(city) ?? { total: 0, orderCount: 0 };
  entry.total += o.price + o.overtimeFee;
  entry.orderCount += 1;
  regionMap.set(city, entry);
}
const byRegion = Array.from(regionMap.entries()).map(([city, v]) => ({
  city: city as GeorgianCity | "UNASSIGNED",
  ...v,
}));
```

10. **Driver payouts (last 90 days)**:

```ts
const payoutsRaw = await prisma.order.groupBy({
  by: ["driverId"],
  where: { companyId: company.id, status: "COMPLETED", driverId: { not: null }, completedAt: { gte: ninetyDaysAgo } },
  _sum: { price: true, overtimeFee: true },
  _count: true,
});

const driverNameById = new Map(rawDrivers.map((d) => [d.userId, d.user.name]));

const driverPayouts = payoutsRaw
  .filter((r) => r.driverId !== null)
  .map((r) => ({
    userId: r.driverId as string,
    name: driverNameById.get(r.driverId as string) ?? "Unknown driver",
    completedOrdersCount: r._count,
    totalEarned: (r._sum.price ?? 0) + (r._sum.overtimeFee ?? 0),
  }));
```

11. Assemble and return the final `CompanyDashboardData` object.

## Acceptance Criteria

- [ ] `src/lib/company-dashboard-data.ts` exports `getCompanyDashboardData` and every type listed in the contract above, with those exact field names.
- [ ] Returns `null` when no `LogisticsCompany` row exists for the given `userId`.
- [ ] `orders` includes both open-market matches and the company's own orders, matching `CompanyBookings`' existing filter logic exactly.
- [ ] `fleet` and `drivers` each correctly reflect the active `DriverVehicleAssignment` (or `null`/no assignment) in both directions.
- [ ] `revenue.dailyTrend` has exactly 90 entries, one per day, zero-filled for days with no completed revenue.
- [ ] `pnpm typecheck` passes with this file in isolation (it has no consumers yet in this wave — a standalone `tsc` pass over the file, or a scratch import, is sufficient to verify).

## Notes

- Every date field returned to callers must be a string (`.toISOString()`), never a raw `Date` — this object eventually gets passed from a server component into a `"use client"` component tree, and `Date` objects don't survive that boundary serialization the same way plain data does.
- Do not add pagination/`take`/`skip` anywhere in this module — every list is intentionally unbounded, matching the rest of the app.
