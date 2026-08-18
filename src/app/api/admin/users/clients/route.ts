import { NextResponse } from "next/server";

import type { AdminRole, ClientAccountType, Prisma } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may *read* the customer list. Stated per route rather than imported
 * from one shared constant so the gate on each endpoint can be read — and
 * audited — without following an import.
 *
 * `SUPPORT` is included here and deliberately nowhere else in this feature:
 * `@/components/admin/admin-nav` already offers the Clients tab to that role
 * because answering a customer ticket means reading the account it is about, so
 * omitting it here would show a support agent a nav link that only ever 403s.
 * The matching write endpoints (`/api/admin/users/[userId]/suspend` and
 * `.../unsuspend`) stay at `SUPER_ADMIN`/`USER_MANAGER` — read access yes,
 * moderation no.
 */
const ALLOWED_ROLES: readonly AdminRole[] = [
  "SUPER_ADMIN",
  "USER_MANAGER",
  "SUPPORT",
];

/** Rows per page. Small enough to stay scannable, large enough to rarely page. */
const PAGE_SIZE = 25;

/**
 * One client account as the admin table renders it. Dates are ISO strings
 * because this crosses the wire; the page imports this type (type-only, so
 * nothing of this server module reaches the browser) rather than restating the
 * shape, which is what keeps the two from drifting.
 */
export type AdminClientRow = {
  /** `User.id` — the id the suspend/unsuspend endpoints take. */
  userId: string;
  /** The account name from Better Auth. */
  name: string;
  email: string;
  phone: string;
  accountType: ClientAccountType;
  /**
   * The name off the *profile* rather than the auth account: "First Last" for
   * an individual, the company name for a business. Null when the profile
   * carries neither, which the schema allows.
   */
  profileName: string | null;
  vatId: string | null;
  /** Orders this client has ever placed, in any status. */
  orderCount: number;
  isSuspended: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
};

/** Body of `GET /api/admin/users/clients`. */
export type AdminClientListResponse = {
  items: AdminClientRow[];
  /** The page actually returned (1-based). */
  page: number;
  pageSize: number;
  /** Matching rows across every page, for the "N clients" summary. */
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
 * `?q=` → the `where` clause. Searches the three fields staff actually have to
 * hand when a ticket comes in: account name, email and phone. `insensitive` so
 * "GIORGI" finds "Giorgi", `contains` so a partial phone number works.
 */
function buildWhere(query: string): Prisma.ClientProfileWhereInput {
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

/**
 * The profile-side display name — individual first, business second. Returns
 * null rather than an empty string so the UI can fall back to the account name
 * with a plain null check.
 */
function profileDisplayName(profile: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}): string | null {
  const individualName = [profile.firstName, profile.lastName]
    .filter((part): part is string => part !== null && part.trim() !== "")
    .join(" ");

  if (individualName !== "") {
    return individualName;
  }

  const companyName = profile.companyName?.trim();

  return companyName ? companyName : null;
}

/**
 * GET /api/admin/users/clients?q=&page= — the paginated client list behind
 * `/admin/users/clients`.
 *
 * Order counts come from a single `groupBy` over the ids on the current page
 * rather than a count query per row, so the list costs three queries no matter
 * how many rows it shows.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const page = parsePage(url.searchParams.get("page"));
  const where = buildWhere(query);

  const [total, profiles] = await Promise.all([
    prisma.clientProfile.count({ where }),
    prisma.clientProfile.findMany({
      where,
      // Explicit select rather than `include: { user: true }`: the table needs
      // five columns off `User`, and there is no reason for an admin listing to
      // carry the rest of the auth row around.
      select: {
        userId: true,
        accountType: true,
        firstName: true,
        lastName: true,
        companyName: true,
        vatId: true,
        phone: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
            isSuspended: true,
            suspendedAt: true,
            suspendedReason: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const userIds = profiles.map((profile) => profile.userId);

  // Skipped entirely on an empty page — `in: []` is valid but pointless.
  const orderCounts =
    userIds.length === 0
      ? []
      : await prisma.order.groupBy({
          by: ["clientId"],
          where: { clientId: { in: userIds } },
          _count: { _all: true },
        });

  const orderCountByUserId = new Map(
    orderCounts.map((group) => [group.clientId, group._count._all]),
  );

  const items: AdminClientRow[] = profiles.map((profile) => ({
    userId: profile.userId,
    name: profile.user.name,
    email: profile.user.email,
    phone: profile.phone,
    accountType: profile.accountType,
    profileName: profileDisplayName(profile),
    vatId: profile.vatId,
    // A client with no orders has no `groupBy` row at all, hence the default.
    orderCount: orderCountByUserId.get(profile.userId) ?? 0,
    isSuspended: profile.user.isSuspended,
    suspendedAt: profile.user.suspendedAt?.toISOString() ?? null,
    suspendedReason: profile.user.suspendedReason,
    createdAt: profile.createdAt.toISOString(),
  }));

  const body: AdminClientListResponse = {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };

  return NextResponse.json(body, { status: 200 });
}
