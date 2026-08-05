# Task 09: Provider reporting, earnings & Excel export

## Status

pending

## Wave

5

## Description

Adds a "Reports" section to each provider's `/dashboard`: an order-history table, an earnings/
revenue summary, fleet & driver utilization for companies, and an Excel (`.xlsx`) export of order
history. This is explicitly scoped to start simple — tables and summary totals, not charts/graphs
(no charting library exists in this codebase and none is added by this task); the Excel export is a
hard requirement, not optional, per product decision. Each provider only ever sees their own data —
there is no cross-provider or platform-wide reporting view.

## Dependencies

**Depends on:** task-06-account-dashboards.md, task-07-dispatch-and-fulfillment.md
**Blocks:** None

**Context from dependencies:** task-06 built the `/dashboard` route with
`src/components/dashboard/driver-dashboard.tsx` (`DriverDashboard({ userId, userName })`) and
`src/components/dashboard/company-dashboard.tsx` (`CompanyDashboard({ userId })`), both server
components already fetching identity/fleet/roster data and structured so an additional section can
be appended at the bottom. task-07 built the order lifecycle this task reports on
(`Order.status` through `PENDING → CLAIMED → ACCEPTED → IN_TRANSIT → COMPLETED`/`CANCELLED`,
`Order.completedAt`, `Order.overtimeFee` computed at completion) and appended a "Deliveries"/
"Bookings" section to both dashboard components — this task appends a further "Reports" section
after that one, following the same pattern (each task only adds a new sibling section, never
restructures what a prior task built).

## Files to Create

- `src/lib/reporting.ts` — pure, framework-free functions the dashboard components and the export
  route both call, so the numbers shown on screen and the numbers exported are computed by the same
  code:
  ```ts
  import type { Order, OrderStatus } from "@prisma/client";

  type ReportableOrder = Pick<
    Order,
    "id" | "status" | "price" | "overtimeFee" | "createdAt" | "completedAt" | "distanceKm"
  >;

  /** Rolling windows, not calendar week/month — avoids timezone/boundary edge cases. */
  const EARNINGS_PERIODS = [
    { label: "Last 7 days", days: 7 },
    { label: "Last 30 days", days: 30 },
    { label: "All time", days: null },
  ] as const;

  export type EarningsSummaryRow = {
    label: string;
    orderCount: number;
    totalRevenue: number;
  };

  /** Sums `price + overtimeFee` for COMPLETED orders within each rolling window. */
  export function computeEarningsSummary(
    orders: ReportableOrder[],
  ): EarningsSummaryRow[] {
    const completed = orders.filter(
      (o): o is ReportableOrder & { completedAt: Date } =>
        o.status === "COMPLETED" && o.completedAt !== null,
    );
    const now = Date.now();
    return EARNINGS_PERIODS.map(({ label, days }) => {
      const inWindow =
        days === null
          ? completed
          : completed.filter(
              (o) => now - o.completedAt.getTime() <= days * 24 * 60 * 60 * 1000,
            );
      return {
        label,
        orderCount: inWindow.length,
        totalRevenue:
          Math.round(
            inWindow.reduce((sum, o) => sum + o.price + o.overtimeFee, 0) * 100,
          ) / 100,
      };
    });
  }

  export type UtilizationRow = {
    id: string;
    label: string;
    activeDeliveries: number; // ACCEPTED or IN_TRANSIT right now
    completedDeliveries: number; // lifetime COMPLETED count
  };

  const ACTIVE_STATUSES: OrderStatus[] = ["ACCEPTED", "IN_TRANSIT"];

  /** Groups orders by a resolved owner id (vehicleId or driverId) into per-owner counts. */
  export function computeUtilization<T extends { id: string; label: string }>(
    owners: T[],
    orders: { status: OrderStatus }[][], // orders[i] = the orders belonging to owners[i]
  ): UtilizationRow[] {
    return owners.map((owner, i) => {
      const ownerOrders = orders[i] ?? [];
      return {
        id: owner.id,
        label: owner.label,
        activeDeliveries: ownerOrders.filter((o) =>
          ACTIVE_STATUSES.includes(o.status),
        ).length,
        completedDeliveries: ownerOrders.filter((o) => o.status === "COMPLETED")
          .length,
      };
    });
  }
  ```
  (The exact shape of `computeUtilization`'s inputs is a suggestion — adapt it if a simpler grouping
  approach reads more cleanly once you see the actual Prisma query shape, but keep the output
  `UtilizationRow` shape since `reports-section.tsx` below is written against it.)
- `src/components/dashboard/order-history-table.tsx` — `"use client"` component,
  `OrderHistoryTable({ orders }: { orders: OrderHistoryRow[] })` where `OrderHistoryRow` is a small
  exported type (id, status, cargoCategory label, pickupAddress, dropoffAddress, price, overtimeFee,
  createdAt, completedAt — all pre-serialized to plain strings/numbers by the server component that
  fetches them, since this is a client component). Renders an HTML `<table>` with a status filter
  (`<select>` of all `OrderStatus` values + "All") and a sort toggle on the `createdAt`/`price`
  columns, using local component state only (no server round-trip — the full order list for this
  provider is passed in already; this is explicitly a "start simple" implementation, not paginated
  or server-filtered).
- `src/components/dashboard/reports-section.tsx` — server component,
  `ReportsSection({ role, userId, companyId }: { role: "DRIVER" | "COMPANY"; userId: string;
  companyId?: string })`. Fetches this provider's own order history (see query below, scoped by
  `driverId` for a driver or `companyId` for a company), computes `computeEarningsSummary` from it,
  renders: a heading ("Reports"), the earnings summary as a small row of stat cards (one per
  `EarningsSummaryRow`), `<OrderHistoryTable orders={...} />`, and — only when `role === "COMPANY"` —
  a fleet/driver utilization table built from `computeUtilization` (fetch the company's vehicles and
  drivers the same way `company-dashboard.tsx` already does, plus their respective orders, and pass
  through). Below all of that, render an "Export to Excel" link:
  `<a href="/api/dashboard/orders/export">Export to Excel</a>` (a plain link is enough — hitting a
  `GET` endpoint that returns a file download, no client JS required).
- `src/app/api/dashboard/orders/export/route.ts` — `GET`. Session check (`401` unauthenticated).
  `403` if `role === "CLIENT"` (this export is provider-only, mirroring the rest of `/dashboard`'s
  access pattern). Resolve the caller's own order scope exactly like `reports-section.tsx` does — a
  `DRIVER` exports orders where `driverId` equals their own user id; a `COMPANY` exports orders where
  `companyId` equals their own company id (look up their `LogisticsCompany.id` first, same as
  elsewhere in this codebase; if the company has no profile yet, return an empty workbook rather than
  erroring). Build and return an `.xlsx` file:
  ```ts
  import ExcelJS from "exceljs";
  import { NextResponse } from "next/server";

  // ...auth + scope resolution above...

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Orders");
  sheet.columns = [
    { header: "Order ID", key: "id", width: 28 },
    { header: "Status", key: "status", width: 14 },
    { header: "Cargo category", key: "cargoCategory", width: 24 },
    { header: "Pickup", key: "pickupAddress", width: 34 },
    { header: "Dropoff", key: "dropoffAddress", width: 34 },
    { header: "Distance (km)", key: "distanceKm", width: 14 },
    { header: "Price", key: "price", width: 12 },
    { header: "Overtime fee", key: "overtimeFee", width: 14 },
    { header: "Created at", key: "createdAt", width: 22 },
    { header: "Completed at", key: "completedAt", width: 22 },
  ];
  for (const order of orders) {
    sheet.addRow({
      ...order,
      createdAt: order.createdAt.toISOString(),
      completedAt: order.completedAt?.toISOString() ?? "",
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="orders-export.xlsx"',
    },
  });
  ```

## Files to Modify

- `src/components/dashboard/driver-dashboard.tsx` (task-06/07's file) — append, after the bookings
  section task-07 added, `<ReportsSection role="DRIVER" userId={userId} />`.
- `src/components/dashboard/company-dashboard.tsx` (task-06/07's file) — append, after the bookings
  section task-07 added, `<ReportsSection role="COMPANY" userId={userId} companyId={company.id} />`
  (only when `company` is non-null, mirroring the existing null-profile branch).
- `package.json` — add `exceljs` as a dependency (`pnpm add exceljs`). This is the one new runtime
  dependency this pivot introduces; chosen over the `xlsx`/SheetJS npm package because SheetJS's
  npm-published builds have known unpatched security advisories (their maintained releases have
  moved off the npm registry) — `exceljs` is MIT-licensed and actively published with fixes.

## Technical Details

### Order-history query (used by both `reports-section.tsx` and the export route — keep them in sync)

```ts
// Driver:
prisma.order.findMany({
  where: { driverId: userId },
  select: {
    id: true, status: true, cargoCategory: true, pickupAddress: true,
    dropoffAddress: true, distanceKm: true, price: true, overtimeFee: true,
    createdAt: true, completedAt: true,
  },
  orderBy: { createdAt: "desc" },
});

// Company:
prisma.order.findMany({
  where: { companyId },
  select: { /* same select as above */ },
  orderBy: { createdAt: "desc" },
});
```

### Fleet/driver utilization query (company only)

Fetch the company's vehicles and drivers (same shape `company-dashboard.tsx` already fetches for the
Fleet/Drivers sections — reuse that data rather than re-querying if it's already in scope where
`ReportsSection` is rendered), plus, for each, their orders (`vehicleId`/`driverId` respectively,
any status) to feed `computeUtilization`. If this means N+1-style queries for a small fleet, that's
fine for a "start simple" first version — do not add pagination or query batching machinery here;
note it as a follow-up if the fleet size ever becomes large enough to matter.

### No charting library

This task deliberately does not add a charting/graphing library (e.g. recharts, visx, chart.js).
`computeEarningsSummary`/`computeUtilization` return plain structured data specifically so a future
task can render charts from the same numbers without touching this task's data layer — but building
those charts is out of scope here.

## Acceptance Criteria

- [ ] A driver's `/dashboard` shows a "Reports" section with their own order-history table (status/
      dates/price, filterable by status, sortable by date and price) and an earnings summary (order
      count + total revenue for last 7 days / last 30 days / all time), containing only their own
      orders.
- [ ] A company's `/dashboard` shows the same order-history table and earnings summary scoped to the
      company's own orders, plus a fleet & driver utilization table (active vs. completed delivery
      counts per vehicle and per driver).
- [ ] Earnings totals only count `COMPLETED` orders and include `overtimeFee` on top of `price`;
      an order with no `completedAt` (not yet completed) is excluded even if somehow marked
      `COMPLETED`.
- [ ] "Export to Excel" downloads a valid `.xlsx` file (openable in Excel/Google Sheets/LibreOffice)
      containing the same order-history rows visible in the table, with the columns listed above.
- [ ] The export endpoint is scoped to the caller exactly like the on-screen table — a driver only
      ever receives their own deliveries, a company only its own orders — and returns `401`
      unauthenticated / `403` for a `CLIENT` session.
- [ ] No charting/graphing library appears in `package.json` — only `exceljs` is added.
- [ ] `pnpm lint`/`pnpm typecheck` pass for every file this task touches or creates.
- [ ] Verified live: as a test driver and a test company each with a handful of `COMPLETED` test
      orders (some with non-zero `overtimeFee`), confirm the on-screen earnings totals match manual
      calculation, download the Excel export for each and open it to confirm its contents match the
      on-screen table, then clean up all test data.

## Notes

- Do not build any admin-facing or cross-provider reporting (platform-wide totals, comparisons
  across companies, etc.) — every number this task computes is scoped to the single signed-in
  driver's or company's own data, consistent with the rest of `/dashboard`'s owner-scoped access
  pattern.
- Do not add server-side pagination, CSV export, or scheduled/emailed reports — none of that was
  requested; keep this to an on-screen table + summary + one-shot Excel download.
