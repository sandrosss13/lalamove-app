// Reads the `Order` table through Prisma, so it can never be part of a browser
// bundle. Fails the build loudly if a client component ever imports it — the
// date-range picker deliberately re-implements its own (pure) date maths rather
// than importing the helpers below for that reason.
import "server-only";

import { OrderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The sales figures the dashboard shows and the Excel export writes.
 *
 * `turnover` and `revenue` are deliberately two different numbers: turnover is
 * gross bookings (every order placed in the range, whatever became of it) while
 * revenue is only what was actually delivered. The cards label them
 * "Turnover (all orders)" / "Revenue (completed orders)" so the distinction is
 * visible on screen rather than buried here.
 */
export type SalesSummary = {
  /** `sum(price)` over every order created in range, regardless of status. */
  turnover: number;
  /** `sum(price)` over orders created in range with `status = COMPLETED`. */
  revenue: number;
  completedCount: number;
  cancelledCount: number;
  pendingCount: number;
  /** `CLAIMED` + `ACCEPTED` + `IN_TRANSIT` — the "in delivery" bucket. */
  inProcessCount: number;
};

/**
 * A half-open interval: `from` inclusive, `to` **exclusive**.
 *
 * Exclusive on the right so a single-day range can be expressed without
 * guessing at a "last instant of the day" — `resolveSalesRange` turns the
 * inclusive calendar dates in the URL into midnight-to-next-midnight bounds,
 * and every query below compares `createdAt >= from AND createdAt < to`.
 */
export type SalesRange = {
  from: Date;
  to: Date;
};

/**
 * A range as it is understood by the page: the two `Date` bounds a query needs,
 * plus the canonical `YYYY-MM-DD` strings they came from, so the page can hand
 * the picker and the export link exactly the values it queried with instead of
 * re-deriving (and possibly re-rounding) them.
 */
export type ResolvedSalesRange = SalesRange & {
  /** Canonical `?from=` value — the first day of the range, inclusive. */
  fromParam: string;
  /** Canonical `?to=` value — the last day of the range, inclusive. */
  toParam: string;
  /**
   * Today as *this server* reckons it. Passed down to the client picker so its
   * Today/This Week/This Month shortcuts resolve against the same calendar the
   * queries below run in. Deriving "today" in the browser instead would make a
   * staff member in a different timezone ask for a day the server never counts,
   * and would also mismatch between SSR and hydration.
   */
  todayParam: string;
};

/**
 * One row per order for the export's detail sheet.
 *
 * Only the columns the sheet prints — an admin download has no business
 * pulling addresses and coordinates out of the database.
 */
export type SalesOrderRow = {
  id: string;
  status: OrderStatus;
  price: number;
  createdAt: Date;
  completedAt: Date | null;
};

/**
 * Hard ceiling on the detail sheet.
 *
 * The summary is a handful of aggregates and stays cheap at any range, but the
 * per-order sheet grows with the range and a hand-typed `?from=2000-01-01`
 * would otherwise try to materialise the whole order history into memory and
 * into an xlsx. 10k rows is well past any range a human reviews and still a
 * small workbook.
 */
export const MAX_EXPORT_ORDER_ROWS = 10_000;

/** `YYYY-MM-DD`, the only shape accepted from the query string. */
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Prices are `Float` columns, so summing them accumulates binary-fraction dust. */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Midnight at the start of `date`, in the server's timezone. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Midnight at the start of the day after `date`, in the server's timezone. */
function startOfNextDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

/** A `Date` at local midnight, formatted back into a `YYYY-MM-DD` param. */
function toDateParam(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A `YYYY-MM-DD` query param as local midnight, or `null` if it is missing,
 * repeated (`?from=a&from=b`), malformed, or not a real calendar date
 * ("2026-02-31" parses but rolls over into March, which the round-trip check
 * catches).
 *
 * Parsed field-by-field rather than with `new Date(value)`, which would read a
 * bare `YYYY-MM-DD` as *UTC* midnight and shift the whole range by a day for
 * any server not running on UTC.
 */
function parseDateParam(value: string | string[] | undefined): Date | null {
  if (typeof value !== "string" || !DATE_PARAM_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);

  return toDateParam(parsed) === value ? parsed : null;
}

/**
 * Turns the `?from=`/`?to=` query params into the range everything downstream
 * uses. Total by design — there is no error path, because a dashboard that
 * 400s on a mistyped URL is less useful than one that falls back to today:
 *
 * - neither param usable → today;
 * - only one usable → that single day;
 * - reversed (`from` after `to`) → swapped, since the picker can't produce it
 *   but a hand-edited URL can.
 */
export function resolveSalesRange(input: {
  from?: string | string[] | undefined;
  to?: string | string[] | undefined;
}): ResolvedSalesRange {
  const today = startOfDay(new Date());
  const parsedFrom = parseDateParam(input.from);
  const parsedTo = parseDateParam(input.to);

  const first = parsedFrom ?? parsedTo ?? today;
  const last = parsedTo ?? parsedFrom ?? today;

  const [firstDay, lastDay] =
    first.getTime() <= last.getTime() ? [first, last] : [last, first];

  return {
    from: firstDay,
    to: startOfNextDay(lastDay),
    fromParam: toDateParam(firstDay),
    toParam: toDateParam(lastDay),
    todayParam: toDateParam(today),
  };
}

/**
 * The single source of the dashboard's numbers.
 *
 * Both the page and the export route call this rather than each running their
 * own queries, so a downloaded workbook can never disagree with the cards that
 * were on screen when the download was clicked.
 *
 * One `groupBy` covers all six figures: every status bucket comes back with its
 * count and its price total, turnover is the sum of all buckets and revenue is
 * the `COMPLETED` bucket alone. Statuses with no orders in range are simply
 * absent from the result, which is why the accumulator starts at zero rather
 * than being indexed by status.
 */
export async function getSalesSummary({
  from,
  to,
}: SalesRange): Promise<SalesSummary> {
  const byStatus = await prisma.order.groupBy({
    by: ["status"],
    where: { createdAt: { gte: from, lt: to } },
    _sum: { price: true },
    _count: { _all: true },
  });

  const summary: SalesSummary = {
    turnover: 0,
    revenue: 0,
    completedCount: 0,
    cancelledCount: 0,
    pendingCount: 0,
    inProcessCount: 0,
  };

  for (const bucket of byStatus) {
    // `_sum` is null for an empty bucket; `groupBy` never returns one, but the
    // generated type allows it.
    const total = bucket._sum.price ?? 0;
    const count = bucket._count._all;

    summary.turnover += total;

    switch (bucket.status) {
      case OrderStatus.COMPLETED:
        summary.revenue += total;
        summary.completedCount += count;
        break;
      case OrderStatus.CANCELLED:
        summary.cancelledCount += count;
        break;
      case OrderStatus.PENDING:
        summary.pendingCount += count;
        break;
      case OrderStatus.CLAIMED:
      case OrderStatus.ACCEPTED:
      case OrderStatus.IN_TRANSIT:
        summary.inProcessCount += count;
        break;
    }
  }

  summary.turnover = roundCurrency(summary.turnover);
  summary.revenue = roundCurrency(summary.revenue);

  return summary;
}

/**
 * The orders behind the summary, for the export's detail sheet — same `where`
 * clause as `getSalesSummary`, so the rows always add up to the totals on the
 * first sheet (up to `MAX_EXPORT_ORDER_ROWS`).
 *
 * Oldest first: a report is read top-to-bottom as a period unfolding, unlike
 * the newest-first operational lists elsewhere in the app.
 */
export async function getSalesOrders({
  from,
  to,
}: SalesRange): Promise<SalesOrderRow[]> {
  return prisma.order.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: {
      id: true,
      status: true,
      price: true,
      createdAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: MAX_EXPORT_ORDER_ROWS,
  });
}
