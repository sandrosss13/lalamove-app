/**
 * The admin Orders list's URL handling: `?q=&status=&page=` → a validated
 * filter, the filter → a Prisma `where`, and back → the pagination links'
 * query string.
 *
 * **Why this runs with no browser and no database**, as
 * `tests/order-photo-rules.spec.ts` does: `src/lib/admin/orders-filters.ts` is
 * free of `server-only` and of any Prisma value import (its Prisma imports are
 * type-only), so every rule can be asserted on plain objects. Keep it that way.
 */

import { expect, test } from "@playwright/test";

import {
  ADMIN_ORDER_STATUSES,
  ADMIN_ORDERS_MAX_QUERY_LENGTH,
  ADMIN_ORDERS_PAGE_SIZE,
  adminOrdersPageCount,
  adminOrdersQueryString,
  adminOrderTotalGel,
  buildAdminOrderWhere,
  parseAdminOrderFilters,
} from "@/lib/admin/orders-filters";

test.describe("parseAdminOrderFilters", () => {
  test("defaults every field when the URL carries none", () => {
    expect(parseAdminOrderFilters({})).toEqual({
      query: "",
      status: null,
      page: 1,
    });
  });

  test("trims the search and caps its length", () => {
    expect(parseAdminOrderFilters({ q: "  GE-48210  " }).query).toBe(
      "GE-48210",
    );
    expect(parseAdminOrderFilters({ q: "x".repeat(500) }).query).toHaveLength(
      ADMIN_ORDERS_MAX_QUERY_LENGTH,
    );
  });

  test("takes the first value of a repeated param", () => {
    expect(parseAdminOrderFilters({ q: ["first", "second"] }).query).toBe(
      "first",
    );
  });

  test("accepts a known status in any case and drops an unknown one", () => {
    expect(parseAdminOrderFilters({ status: "IN_TRANSIT" }).status).toBe(
      "IN_TRANSIT",
    );
    expect(parseAdminOrderFilters({ status: "claimed" }).status).toBe(
      "CLAIMED",
    );
    expect(parseAdminOrderFilters({ status: "SHIPPED" }).status).toBeNull();
    // Inherited object keys must not pass as statuses.
    expect(parseAdminOrderFilters({ status: "toString" }).status).toBeNull();
  });

  test("falls back to page 1 for anything but a positive integer", () => {
    for (const raw of ["0", "-3", "2.5", "2abc", "abc", "", "1e400"]) {
      expect(parseAdminOrderFilters({ page: raw }).page, raw).toBe(1);
    }
    expect(parseAdminOrderFilters({ page: "7" }).page).toBe(7);
  });
});

test.describe("buildAdminOrderWhere", () => {
  test("is empty with no filters", () => {
    expect(buildAdminOrderWhere({ query: "", status: null })).toEqual({});
  });

  test("searches reference, client email and client name, case-insensitively", () => {
    expect(buildAdminOrderWhere({ query: "giorgi", status: null })).toEqual({
      OR: [
        { reference: { contains: "giorgi", mode: "insensitive" } },
        { client: { email: { contains: "giorgi", mode: "insensitive" } } },
        { client: { name: { contains: "giorgi", mode: "insensitive" } } },
      ],
    });
  });

  test("combines the status with the search", () => {
    const where = buildAdminOrderWhere({ query: "GE-1", status: "PENDING" });
    expect(where.status).toBe("PENDING");
    expect(where.OR).toHaveLength(3);
  });
});

test.describe("adminOrdersQueryString", () => {
  test("omits every default so the plain list has no query string", () => {
    expect(adminOrdersQueryString({ query: "", status: null, page: 1 })).toBe(
      "",
    );
  });

  test("round-trips through the parser", () => {
    const filters = { query: "a&b c", status: "COMPLETED" as const, page: 3 };
    const qs = adminOrdersQueryString(filters);
    const parsed = parseAdminOrderFilters(
      Object.fromEntries(new URLSearchParams(qs.slice(1))),
    );
    expect(qs.startsWith("?")).toBe(true);
    expect(parsed).toEqual(filters);
  });
});

test("page count is at least one and rounds up", () => {
  expect(adminOrdersPageCount(0)).toBe(1);
  expect(adminOrdersPageCount(ADMIN_ORDERS_PAGE_SIZE)).toBe(1);
  expect(adminOrdersPageCount(ADMIN_ORDERS_PAGE_SIZE + 1)).toBe(2);
});

test("lists every status once, in lifecycle order", () => {
  expect(ADMIN_ORDER_STATUSES).toEqual([
    "INITIATED",
    "PENDING",
    "CLAIMED",
    "ACCEPTED",
    "IN_TRANSIT",
    "COMPLETED",
    "CANCELLED",
  ]);
});

test("the total adds the tier adjustment and overtime, rounded to tetri", () => {
  expect(
    adminOrderTotalGel({
      price: 100.1,
      serviceLevelAdjustment: 25.2,
      overtimeFee: 0,
    }),
  ).toBe(125.3);
  expect(
    adminOrderTotalGel({
      price: 80,
      serviceLevelAdjustment: -8,
      overtimeFee: 12.5,
    }),
  ).toBe(84.5);
});
