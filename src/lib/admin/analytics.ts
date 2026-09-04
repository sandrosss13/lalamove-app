// Reads the `Order` table through Prisma, so it can never be part of a browser
// bundle. Fails the build loudly if a client component ever imports it — the
// date-range picker deliberately re-implements its own (pure) date maths rather
// than importing the helpers below for that reason.
import "server-only";

import { OrderStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The sales figures the dashboard shows and the Excel export writes.
 *
 * `turnover` and `revenue` are deliberately two different numbers: turnover is
 * gross bookings (every order this report covers, whatever became of it) while
 * revenue is only what was actually delivered. The cards label them
 * "Turnover (paid orders)" / "Revenue (completed orders)" so the distinction is
 * visible on screen rather than buried here.
 *
 * What "covers" means is `REPORTED_SALES_STATUSES` — every status except
 * `INITIATED`. See that constant for why an unpaid order is not a booking.
 */
export type SalesSummary = {
  /** `sum(price)` over every order in `salesOrderScope`. */
  turnover: number;
  /** `sum(price)` over orders in scope with `status = COMPLETED`. */
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
 * The `SalesSummary` count a status contributes to, or **null for a status this
 * report does not cover at all**.
 *
 * The null is `INITIATED`, and it is the one arm here that is not a bucket. An
 * `INITIATED` order is created but unpaid, and the schema states the invariant
 * plainly: it is off-market, and no driver or company can see it. Nobody has
 * committed to it and it may never be paid for, so counting it as a sale would
 * report as gross bookings an order that is only an intention — and it would
 * report it at a moment (`INITIATED → PENDING` is instantaneous today) that says
 * nothing about whether the money will ever arrive. A figure that moves when a
 * client abandons a half-filled booking form is not a turnover figure. So the
 * whole report is scoped off it: it is out of `turnover`, out of every count,
 * and out of the detail sheet.
 *
 * That single answer is what keeps the two consistent. Excluding an order from
 * turnover but leaving it in a count, or the reverse, is how the numbers stopped
 * adding up in the first place.
 *
 * Note what this is *not* deciding: whether admins may see unpaid orders at all.
 * They may — the order surfaces render `INITIATED` as "Initiated"
 * (`ORDER_STATUS_LABEL`). This says only that a sales report is not where that
 * belongs, because both of its sheets exist to be reconciled against each other.
 *
 * A returned union with no `default`, rather than the statement switch that used
 * to sit inline in `getSalesSummary`: a statement switch over an enum falls
 * through silently, which is exactly how `INITIATED` got counted into turnover
 * and into no bucket without failing the build. Same idiom as `toHubJobStatus`
 * in `src/lib/dashboard/hub/jobs.ts` — the next member added to `OrderStatus`
 * fails to compile here and gets decided on deliberately.
 */
type SalesCountKey =
  "completedCount" | "cancelledCount" | "pendingCount" | "inProcessCount";

function toSalesCountKey(status: OrderStatus): SalesCountKey | null {
  switch (status) {
    case OrderStatus.COMPLETED:
      return "completedCount";
    case OrderStatus.CANCELLED:
      return "cancelledCount";
    case OrderStatus.PENDING:
      return "pendingCount";
    case OrderStatus.CLAIMED:
    case OrderStatus.ACCEPTED:
    case OrderStatus.IN_TRANSIT:
      return "inProcessCount";
    case OrderStatus.INITIATED:
      return null;
  }
}

/**
 * The statuses the report covers, derived from `toSalesCountKey` rather than
 * written out again, so there is one list and it cannot drift from the buckets
 * it feeds.
 *
 * Phrased as an inclusion (`in`) and not an exclusion (`notIn`) so it fails the
 * safe way: a status nobody has classified is left out of a report rather than
 * silently swelling turnover into a bucket that does not exist. The build
 * failure in `toSalesCountKey` is the real guard, and this is what happens if
 * one is ever bypassed.
 */
const REPORTED_SALES_STATUSES: OrderStatus[] = Object.values(
  OrderStatus,
).filter((status) => toSalesCountKey(status) !== null);

/**
 * The orders the whole report is computed over, summary and detail sheet alike.
 *
 * One clause in one place, for the same reason `hubOrderScope` is one in
 * `src/lib/dashboard/hub/jobs.ts`: the export's second sheet is meant to be the
 * rows behind the first sheet's totals, and two `where` clauses that have to be
 * kept in step by hand are two clauses that eventually are not.
 */
function salesOrderScope({ from, to }: SalesRange): Prisma.OrderWhereInput {
  return {
    createdAt: { gte: from, lt: to },
    status: { in: REPORTED_SALES_STATUSES },
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
 *
 * The invariant the counts owe the reader: `completedCount + cancelledCount +
 * pendingCount + inProcessCount` equals the number of orders in
 * `salesOrderScope`, and `turnover` is the price total over exactly those same
 * orders. It holds by construction rather than by inspection — the scope admits
 * only statuses `toSalesCountKey` maps to a bucket, and every bucket that
 * arrives adds its count and its total together, in one place, below.
 *
 * Out of scope here, deliberately: `price` excludes `serviceLevelAdjustment`, so
 * both money figures understate what a Priority client actually paid. That is
 * tracked separately in `specs/client-dashboard-booking-and-payment/
 * action-required.md` and blocked on who owns the tier margin; do not fold a fix
 * for it into this arithmetic.
 */
export async function getSalesSummary(
  range: SalesRange,
): Promise<SalesSummary> {
  const byStatus = await prisma.order.groupBy({
    by: ["status"],
    where: salesOrderScope(range),
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
    const countKey = toSalesCountKey(bucket.status);

    if (countKey === null) {
      // Unreachable: `salesOrderScope` admits only statuses that map to a
      // bucket, and both come from `toSalesCountKey`. Kept because the arm is
      // what makes the mapping exhaustive, and skipping — rather than counting
      // into some nearest bucket — is the behaviour that would still be correct
      // if the scope were ever loosened.
      continue;
    }

    // `_sum` is null for an empty bucket; `groupBy` never returns one, but the
    // generated type allows it.
    const total = bucket._sum.price ?? 0;

    // Turnover and the counts move together, over the same bucket, in the same
    // step: that is what makes "the buckets account for every order behind
    // turnover" a property of the code rather than a claim about it.
    summary.turnover += total;
    summary[countKey] += bucket._count._all;

    // Keyed off the bucket rather than re-testing the status, so revenue can
    // never disagree with the completed count about which orders were delivered.
    if (countKey === "completedCount") {
      summary.revenue += total;
    }
  }

  summary.turnover = roundCurrency(summary.turnover);
  summary.revenue = roundCurrency(summary.revenue);

  return summary;
}

/**
 * The orders behind the summary, for the export's detail sheet — literally the
 * same `where` clause as `getSalesSummary`, so the rows always add up to the
 * totals on the first sheet (up to `MAX_EXPORT_ORDER_ROWS`).
 *
 * That shared scope is why `INITIATED` rows are absent here too, which is a
 * choice and not a side effect. This sheet exists so a reader can check a total
 * instead of taking it on trust; rows the summary did not count would make it
 * fail at the one job it has, and an admin who wants to see unpaid orders is
 * better served by an order list than by a report that no longer reconciles.
 *
 * Oldest first: a report is read top-to-bottom as a period unfolding, unlike
 * the newest-first operational lists elsewhere in the app.
 */
export async function getSalesOrders(
  range: SalesRange,
): Promise<SalesOrderRow[]> {
  return prisma.order.findMany({
    where: salesOrderScope(range),
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
