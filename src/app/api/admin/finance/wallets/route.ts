import { NextResponse } from "next/server";

import type { AdminRole, Prisma } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { driverDisplayName } from "@/lib/admin/driver-name";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may read drivers' wallets: the finance role and the super admin,
 * as on every other finance endpoint. Reading is wider than adjusting — see
 * `./[driverProfileId]/adjustments/route.ts`.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/** Rows per page. Matches the other admin listings so every table pages alike. */
const PAGE_SIZE = 25;

/** How many held jobs the page lists; `heldCount` says how many there are. */
const HELD_LIMIT = 25;

/** The longest search term read; the rest is ignored. */
const MAX_QUERY_LENGTH = 100;

/** One independent driver's wallet as the list renders it. */
export type AdminWalletRow = {
  driverProfileId: string;
  name: string;
  phone: string;
  isSuspended: boolean;
  balanceTetri: number;
  /** Reserved by pending withdrawals. */
  reservedTetri: number;
  availableTetri: number;
};

/**
 * A completed, gateway-confirmed job that credited nobody because a roster
 * driver claimed it themselves — see `WalletCreditHold`.
 */
export type AdminWalletHeldJob = {
  holdId: string;
  order: { id: string; reference: string };
  driver: { driverProfileId: string; name: string; phone: string };
  companyName: string | null;
  /** What would have been credited. */
  amountTetri: number;
  createdAt: string;
};

/** Body of `GET /api/admin/finance/wallets`. */
export type AdminWalletListResponse = {
  items: AdminWalletRow[];
  page: number;
  pageSize: number;
  total: number;
  /** Always at least 1, so an empty list still renders as "Page 1 of 1". */
  pageCount: number;
  /** The newest held jobs (at most 25), and how many exist in all. */
  heldJobs: AdminWalletHeldJob[];
  heldCount: number;
};

/** `?page=` → a 1-based page number; anything unusable is the first page. */
function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * GET /api/admin/finance/wallets?q=&page= — every independent driver with
 * their balance, behind `/admin/finance/wallets`. `q` matches the driver's
 * name or phone number. Roster drivers are not listed: they have no wallet.
 *
 * Also answers with the **held jobs** — jobs a roster driver claimed on their
 * own, which credit neither a wallet nor a company until the owner decides
 * who is paid.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const url = new URL(request.url);
  const page = parsePage(url.searchParams.get("page"));
  const query = (url.searchParams.get("q") ?? "")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);

  const where: Prisma.DriverProfileWhereInput = {
    companyId: null,
    ...(query === ""
      ? {}
      : {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
            { user: { name: { contains: query, mode: "insensitive" } } },
          ],
        }),
  };

  const [total, profiles, holds, heldCount] = await Promise.all([
    prisma.driverProfile.count({ where }),
    prisma.driverProfile.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        user: { select: { name: true, isSuspended: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.walletCreditHold.findMany({
      select: {
        id: true,
        amountTetri: true,
        companyId: true,
        createdAt: true,
        order: { select: { id: true, reference: true } },
        driverProfile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HELD_LIMIT,
    }),
    prisma.walletCreditHold.count(),
  ]);

  const profileIds = profiles.map((profile) => profile.id);
  const companyIds = holds
    .map((hold) => hold.companyId)
    .filter((id): id is string => id !== null);

  // Two grouped sums for the whole page rather than two queries per driver.
  const [balances, reserved, companies] = await Promise.all([
    prisma.walletLedgerEntry.groupBy({
      by: ["driverProfileId"],
      where: { driverProfileId: { in: profileIds } },
      _sum: { amountTetri: true },
    }),
    prisma.withdrawal.groupBy({
      by: ["driverProfileId"],
      where: { driverProfileId: { in: profileIds }, status: "PENDING" },
      _sum: { amountTetri: true },
    }),
    prisma.logisticsCompany.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, companyName: true },
    }),
  ]);

  const sumFor = (
    groups: { driverProfileId: string; _sum: { amountTetri: number | null } }[],
    id: string,
  ) =>
    groups.find((group) => group.driverProfileId === id)?._sum.amountTetri ?? 0;

  const items: AdminWalletRow[] = profiles.map((profile) => {
    const balanceTetri = sumFor(balances, profile.id);
    const reservedTetri = sumFor(reserved, profile.id);

    return {
      driverProfileId: profile.id,
      name: driverDisplayName(profile),
      phone: profile.phone,
      isSuspended: profile.user.isSuspended,
      balanceTetri,
      reservedTetri,
      availableTetri: balanceTetri - reservedTetri,
    };
  });

  const heldJobs: AdminWalletHeldJob[] = holds.map((hold) => ({
    holdId: hold.id,
    order: { id: hold.order.id, reference: hold.order.reference },
    driver: {
      driverProfileId: hold.driverProfile.id,
      name: driverDisplayName(hold.driverProfile),
      phone: hold.driverProfile.phone,
    },
    companyName:
      companies.find((company) => company.id === hold.companyId)?.companyName ??
      null,
    amountTetri: hold.amountTetri,
    createdAt: hold.createdAt.toISOString(),
  }));

  const body: AdminWalletListResponse = {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    heldJobs,
    heldCount,
  };

  return NextResponse.json(body, { status: 200 });
}
