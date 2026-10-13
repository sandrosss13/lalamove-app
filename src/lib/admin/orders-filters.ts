/**
 * The pure half of the admin Orders list (`/admin/orders`): turning the URL's
 * search params into a validated filter, the filter into a Prisma `where`, and
 * a filter back into a query string for the pagination links.
 *
 * Kept free of `server-only`, of Prisma *values* and of next-intl so it can be
 * asserted with no browser and no database (`tests/admin-order-filters.spec.ts`),
 * the same way `@/lib/order-photos/rules` is. Every Prisma import here is
 * type-only and erased at compile time — keep it that way, or the spec turns
 * into an integration test.
 */

import type { OrderStatus, Prisma } from "@prisma/client";

/** Rows per page — matches the other admin listings (`/admin/users/clients`). */
export const ADMIN_ORDERS_PAGE_SIZE = 25;

/**
 * Longest search string honoured. Anything beyond is cut rather than rejected:
 * nobody types a 100-character reference, and an unbounded `contains` pattern
 * is a needless cost on three `ILIKE` scans.
 */
export const ADMIN_ORDERS_MAX_QUERY_LENGTH = 100;

/**
 * Every `OrderStatus`, in lifecycle order, for the status filter's options.
 *
 * Written out as a `Record` and read back with `Object.keys` rather than taken
 * from Prisma's runtime enum object, so this module carries no value import of
 * `@prisma/client`; the `Record` type is what keeps it exhaustive — a status
 * added to the schema fails typecheck here until it is listed.
 */
const ORDER_STATUS_ORDER: Record<OrderStatus, number> = {
  INITIATED: 0,
  PENDING: 1,
  CLAIMED: 2,
  ACCEPTED: 3,
  IN_TRANSIT: 4,
  COMPLETED: 5,
  CANCELLED: 6,
};

export const ADMIN_ORDER_STATUSES: readonly OrderStatus[] = (
  Object.keys(ORDER_STATUS_ORDER) as OrderStatus[]
).sort((a, b) => ORDER_STATUS_ORDER[a] - ORDER_STATUS_ORDER[b]);

/** The list's filter state, as read from the URL. */
export type AdminOrderFilters = {
  /** Trimmed free-text search; `""` when absent. */
  query: string;
  /** A single status to narrow to, or `null` for every status. */
  status: OrderStatus | null;
  /** 1-based page number. */
  page: number;
};

/** Raw App Router search params, as a page receives them. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** The first value of a param, since `?q=a&q=b` arrives as an array. */
function firstValue(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) {
    return raw[0] ?? "";
  }

  return raw ?? "";
}

function isOrderStatus(value: string): value is OrderStatus {
  return Object.prototype.hasOwnProperty.call(ORDER_STATUS_ORDER, value);
}

/**
 * `?q=&status=&page=` → a filter. Lenient by design, like the clients API's
 * `parsePage`: a malformed or hand-edited URL falls back to the default for
 * that field rather than erroring, since a read-only listing is not worth
 * failing over a bad `page=`.
 */
export function parseAdminOrderFilters(
  params: RawSearchParams,
): AdminOrderFilters {
  const query = firstValue(params.q)
    .trim()
    .slice(0, ADMIN_ORDERS_MAX_QUERY_LENGTH);

  const rawStatus = firstValue(params.status).trim().toUpperCase();
  const status = isOrderStatus(rawStatus) ? rawStatus : null;

  // `Number` rather than `parseInt`, so "2abc" is rejected instead of read as 2.
  const parsedPage = Number(firstValue(params.page));
  const page =
    Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  return { query, status, page };
}

/**
 * A filter → the `where` clause. The search covers the three things staff
 * actually have to hand when a ticket comes in: the order reference read out
 * over the phone, and the client's account name or email. `insensitive` so
 * "ge-48210" finds "GE-48210", `contains` so a partial reference works.
 */
export function buildAdminOrderWhere(
  filters: Pick<AdminOrderFilters, "query" | "status">,
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  if (filters.status !== null) {
    where.status = filters.status;
  }

  if (filters.query !== "") {
    where.OR = [
      { reference: { contains: filters.query, mode: "insensitive" } },
      { client: { email: { contains: filters.query, mode: "insensitive" } } },
      { client: { name: { contains: filters.query, mode: "insensitive" } } },
    ];
  }

  return where;
}

/**
 * The list URL's query string for `filters`, leaving out every field at its
 * default so the plain list stays `/admin/orders` rather than
 * `/admin/orders?q=&page=1`. Returned with its leading `?`, or `""`.
 */
export function adminOrdersQueryString(filters: AdminOrderFilters): string {
  const params = new URLSearchParams();

  if (filters.query !== "") {
    params.set("q", filters.query);
  }
  if (filters.status !== null) {
    params.set("status", filters.status);
  }
  if (filters.page > 1) {
    params.set("page", String(filters.page));
  }

  const serialized = params.toString();

  return serialized === "" ? "" : `?${serialized}`;
}

/** Pages needed for `total` rows; at least 1, so "Page 1 of 1" still renders. */
export function adminOrdersPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / ADMIN_ORDERS_PAGE_SIZE));
}

/**
 * What the client is charged for an order, in GEL: the quoted `price`, the
 * service tier's `serviceLevelAdjustment` (stored beside `price`, not folded
 * into it — see the schema) and any `overtimeFee` settled at completion.
 * Rounded to whole tetri so the binary dust of adding three `Float` columns
 * never reaches the screen.
 */
export function adminOrderTotalGel(order: {
  price: number;
  serviceLevelAdjustment: number;
  overtimeFee: number;
}): number {
  const sum = order.price + order.serviceLevelAdjustment + order.overtimeFee;

  return Math.round(sum * 100) / 100;
}
