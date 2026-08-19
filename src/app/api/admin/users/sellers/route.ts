import { NextResponse } from "next/server";

import type {
  AdminRole,
  DriverAccountType,
  GeorgianCity,
  Prisma,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may *read* the seller list. Stated per route rather than imported
 * from one shared constant so the gate on each endpoint can be read — and
 * audited — without following an import.
 *
 * `SUPPORT` is included for the same reason as the clients listing: the Sellers
 * tab is offered to that role by `@/components/admin/admin-nav`, so the read
 * endpoint behind it has to answer. The suspend/unsuspend endpoints stay
 * `SUPER_ADMIN`/`USER_MANAGER`-only.
 */
const ALLOWED_ROLES: readonly AdminRole[] = [
  "SUPER_ADMIN",
  "USER_MANAGER",
  "SUPPORT",
];

/** Rows per page. Matches the clients table so the two tabs page alike. */
const PAGE_SIZE = 25;

/** Which side of the marketplace's supply half a row came from. */
export type AdminSellerType = "DRIVER" | "COMPANY";

/**
 * One seller account as the admin table renders it.
 *
 * "Seller" covers two different tables — an independent `DriverProfile` and a
 * fleet-operating `LogisticsCompany` — which staff moderate as one list, so
 * both are flattened into this shape and told apart by `type`. Fields only one
 * side has (`accountType`, which is a driver concept) are nullable rather than
 * split into a union, so the table can render one set of columns.
 */
export type AdminSellerRow = {
  /** `User.id` — the id the suspend/unsuspend endpoints take. */
  userId: string;
  type: AdminSellerType;
  /** The account name from Better Auth. */
  name: string;
  email: string;
  phone: string;
  city: GeorgianCity;
  /**
   * The company a row is associated with: the fleet's own name for a
   * `COMPANY`, the registered business name for a business driver, null for an
   * individual driver.
   */
  companyName: string | null;
  vatId: string | null;
  /** Drivers only — a `LogisticsCompany` is a business by definition. */
  accountType: DriverAccountType | null;
  isSuspended: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
};

/** Body of `GET /api/admin/users/sellers`. */
export type AdminSellerListResponse = {
  items: AdminSellerRow[];
  /** The page actually returned (1-based). */
  page: number;
  pageSize: number;
  /** Matching drivers *and* companies across every page. */
  total: number;
  /** Always at least 1, so an empty list still renders as "Page 1 of 1". */
  pageCount: number;
};

/**
 * `?page=` → a 1-based page number. Anything absent, unparseable or below 1
 * falls back to the first page rather than erroring: a malformed page number in
 * a URL is not worth failing a read-only listing over.
 */
function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * The shared `?q=` filter, expressed twice because Prisma types the `where` of
 * each model separately even though the three searched fields — account name,
 * email, phone — are the same on both.
 */
function buildDriverWhere(query: string): Prisma.DriverProfileWhereInput {
  if (query === "") {
    return {};
  }

  return {
    OR: [
      { user: { name: { contains: query, mode: "insensitive" } } },
      { user: { email: { contains: query, mode: "insensitive" } } },
      { phone: { contains: query, mode: "insensitive" } },
    ],
  };
}

function buildCompanyWhere(query: string): Prisma.LogisticsCompanyWhereInput {
  if (query === "") {
    return {};
  }

  return {
    OR: [
      { user: { name: { contains: query, mode: "insensitive" } } },
      { user: { email: { contains: query, mode: "insensitive" } } },
      { phone: { contains: query, mode: "insensitive" } },
    ],
  };
}

/** The `User` columns both halves of the list need. */
const SELLER_USER_SELECT = {
  name: true,
  email: true,
  isSuspended: true,
  suspendedAt: true,
  suspendedReason: true,
} as const;

/**
 * GET /api/admin/users/sellers?q=&page= — the paginated seller list behind
 * `/admin/users/sellers`, merging independent drivers and logistics companies.
 *
 * Pagination happens in application code, after both queries: the two tables
 * have no SQL-level union in Prisma, and slicing each side separately would
 * produce a page that is neither correctly ordered nor correctly sized. That
 * means both result sets are read in full, which is fine at back-office scale
 * (thousands of accounts, one internal reader at a time) and is the same
 * trade-off the task specifies. If the supply side ever outgrows that, the fix
 * is a raw `UNION ALL` query with `LIMIT`/`OFFSET`, not a bigger page size.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const page = parsePage(url.searchParams.get("page"));

  const [drivers, companies] = await Promise.all([
    prisma.driverProfile.findMany({
      where: buildDriverWhere(query),
      select: {
        userId: true,
        phone: true,
        city: true,
        accountType: true,
        companyName: true,
        vatId: true,
        createdAt: true,
        user: { select: SELLER_USER_SELECT },
      },
    }),
    prisma.logisticsCompany.findMany({
      where: buildCompanyWhere(query),
      select: {
        userId: true,
        phone: true,
        city: true,
        companyName: true,
        vatId: true,
        createdAt: true,
        user: { select: SELLER_USER_SELECT },
      },
    }),
  ]);

  const driverRows: AdminSellerRow[] = drivers.map((driver) => ({
    userId: driver.userId,
    type: "DRIVER",
    name: driver.user.name,
    email: driver.user.email,
    phone: driver.phone,
    city: driver.city,
    companyName: driver.companyName,
    vatId: driver.vatId,
    accountType: driver.accountType,
    isSuspended: driver.user.isSuspended,
    suspendedAt: driver.user.suspendedAt?.toISOString() ?? null,
    suspendedReason: driver.user.suspendedReason,
    createdAt: driver.createdAt.toISOString(),
  }));

  const companyRows: AdminSellerRow[] = companies.map((company) => ({
    userId: company.userId,
    type: "COMPANY",
    name: company.user.name,
    email: company.user.email,
    phone: company.phone,
    city: company.city,
    companyName: company.companyName,
    vatId: company.vatId,
    accountType: null,
    isSuspended: company.user.isSuspended,
    suspendedAt: company.user.suspendedAt?.toISOString() ?? null,
    suspendedReason: company.user.suspendedReason,
    createdAt: company.createdAt.toISOString(),
  }));

  // Newest first, like every other admin listing. Comparing the ISO strings is
  // exact here rather than a shortcut: `toISOString()` is always fixed-width
  // UTC, so lexicographic order *is* chronological order.
  const merged = [...driverRows, ...companyRows].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  const start = (page - 1) * PAGE_SIZE;

  const body: AdminSellerListResponse = {
    items: merged.slice(start, start + PAGE_SIZE),
    page,
    pageSize: PAGE_SIZE,
    total: merged.length,
    pageCount: Math.max(1, Math.ceil(merged.length / PAGE_SIZE)),
  };

  return NextResponse.json(body, { status: 200 });
}
