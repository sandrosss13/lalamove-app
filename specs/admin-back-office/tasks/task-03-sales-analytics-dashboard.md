# Task 03: Sales analytics dashboard + Excel export

## Status

complete

## Wave

3

## Description

Gives staff a date-ranged view of platform performance: turnover, revenue, and order counts by status, computed from the existing `Order` table — no new schema needed. Includes a calendar date-range picker with Today/This Week/This Month shortcuts, and an Excel export of whatever range is currently shown. This is also `/admin`'s default landing page (task-02 redirects `/admin` → `/admin/analytics`).

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-02-admin-auth-and-shell.md
**Blocks:** None.

**Context from dependencies:** task-01 did not add any analytics-specific tables — this task reads the existing `Order` model (`price`, `status`, `createdAt`, `completedAt`, and the `OrderStatus` enum: `PENDING`, `CLAIMED`, `ACCEPTED`, `IN_TRANSIT`, `COMPLETED`, `CANCELLED`). task-02 provides `requireSystemUser()` (`@/lib/admin/auth`) for route/API protection and the shadcn primitives (`calendar`, `popover`, `card`, `table`, `button`) this task's UI uses. The route this task must land on is `/admin/analytics`, already linked from `admin-nav.ts`.

## Files to Create

- `src/app/admin/analytics/page.tsx` — the dashboard page: date-range picker (with Today/This Week/This Month shortcut buttons) + a row of metric cards (turnover, revenue, completed/cancelled/pending/in-process counts) + an "Export to Excel" button. Server component that reads `searchParams` for the selected range (e.g. `?from=2026-08-01&to=2026-08-11`, defaulting to Today if absent) and renders a client component for the interactive picker.
- `src/components/admin/analytics/date-range-picker.tsx` — client component wrapping the shadcn `calendar`/`popover` primitives plus three shortcut buttons (Today, This Week, This Month) that push the corresponding `from`/`to` query params via `useRouter().push`.
- `src/components/admin/analytics/metric-cards.tsx` — presentational component rendering the metric cards from a props object (see shape below).
- `src/app/api/admin/analytics/summary/route.ts` — `GET` endpoint computing the metrics for a `from`/`to` range, used by the page (or called directly server-side — implementer's choice, but if called client-side it must call `requireSystemUser()`-equivalent protection too, see below).
- `src/app/api/admin/analytics/export/route.ts` — `GET` endpoint that generates and streams an `.xlsx` file for a `from`/`to` range.
- `src/lib/admin/analytics.ts` — shared query logic: `getSalesSummary({ from, to })` returns `{ turnover, revenue, completedCount, cancelledCount, pendingCount, inProcessCount }`, used by both the page and the export route so the numbers can never drift between the on-screen view and the download.

## Files to Modify

- `package.json` — run `pnpm add exceljs` for the Excel export.

## Technical Details

### Implementation Steps

1. `pnpm add exceljs`.
2. Implement `getSalesSummary({ from, to }: { from: Date; to: Date })` in `src/lib/admin/analytics.ts` using `prisma.order.groupBy` or a few targeted `aggregate`/`count` calls scoped to `createdAt >= from AND createdAt < to` (treat `to` as exclusive of the *next* day when a shortcut resolves to a calendar day, so "Today" means the full day, not just midnight). Definitions (state these back to the team if they turn out to be wrong — see Notes):
   - `turnover` = `sum(price)` across **all** orders in range regardless of status (gross bookings).
   - `revenue` = `sum(price)` across orders in range with `status === "COMPLETED"` (recognized revenue).
   - `completedCount` = count where `status === "COMPLETED"`.
   - `cancelledCount` = count where `status === "CANCELLED"`.
   - `pendingCount` = count where `status === "PENDING"`.
   - `inProcessCount` = count where `status IN ("CLAIMED", "ACCEPTED", "IN_TRANSIT")` (the requested "orders in process/delivery" bucket).
3. Build the Today/This Week/This Month shortcuts client-side using plain `Date` math (e.g. `startOfWeek`/`startOfMonth` — no new date library needed for three cases; hand-roll them in the component, or add `date-fns` via `pnpm add date-fns` if that reads cleaner — implementer's call, prefer no new dependency if the three cases stay simple).
4. `GET /api/admin/analytics/summary` and the export route both call `requireSystemUser()` (redirecting/`401`-ing appropriately for an API route — return `NextResponse.json({ error: ... }, { status: 401 })` rather than `redirect()`, since these are API routes, not pages) before touching Prisma.
5. Excel export: build the workbook with `exceljs` (one sheet, a header row with the metric labels, a data row with the values, and — nice to have but not required — a second sheet listing the individual orders in range with columns `id, status, price, createdAt, completedAt`). Set `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="sales-report-<from>-to-<to>.xlsx"` on the response.

### Code Snippets

```ts
// src/lib/admin/analytics.ts (shape)
export type SalesSummary = {
  turnover: number;
  revenue: number;
  completedCount: number;
  cancelledCount: number;
  pendingCount: number;
  inProcessCount: number;
};

export async function getSalesSummary(range: {
  from: Date;
  to: Date;
}): Promise<SalesSummary> {
  // prisma.order.aggregate / count calls scoped to range, per Implementation Steps step 2
}
```

### API Endpoints

- `GET /api/admin/analytics/summary?from=<ISO date>&to=<ISO date>` — returns `SalesSummary` as JSON.
- `GET /api/admin/analytics/export?from=<ISO date>&to=<ISO date>` — streams an `.xlsx` file.

## Acceptance Criteria

- [ ] `/admin/analytics` renders metric cards for the default range (Today) on first load.
- [ ] Clicking "This Week" / "This Month" updates the URL query params and the displayed metrics without a full page reload feeling broken (either client-side fetch or a server round-trip via the query-param-driven server component — either is fine).
- [ ] Picking a custom range via the calendar updates the metrics to match.
- [ ] "Export to Excel" downloads a valid `.xlsx` file whose values match what's on screen for the current range.
- [ ] Both API routes reject unauthenticated/non-admin requests with `401`.
- [ ] `pnpm check` passes.

## Notes

- The turnover-vs-revenue distinction above is an assumption, not something the user specified precisely — flag it clearly in the UI (label the cards "Turnover (all orders)" / "Revenue (completed orders)") so it's self-documenting rather than silently guessed.
