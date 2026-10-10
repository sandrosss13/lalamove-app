import { NextResponse } from "next/server";

import type { AdminRole, WalletEntryType } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { driverDisplayName } from "@/lib/admin/driver-name";
import { prisma } from "@/lib/prisma";
import { readWalletBalances } from "@/lib/wallet/ledger";

/** See `../route.ts` for why these two. */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/** Ledger rows per page. */
const PAGE_SIZE = 25;

/** One ledger entry as the back office shows it. */
export type AdminWalletEntry = {
  entryId: string;
  type: WalletEntryType;
  /** Signed tetri. */
  amountTetri: number;
  createdAt: string;
  order: { id: string; reference: string } | null;
  withdrawalId: string | null;
  /** An adjustment's reason. */
  reason: string | null;
  /** The staff member who caused it, for entries a person caused. */
  createdByName: string | null;
};

/** Body of `GET /api/admin/finance/wallets/[driverProfileId]`. */
export type AdminWalletDetail = {
  driver: {
    driverProfileId: string;
    name: string;
    phone: string;
    isSuspended: boolean;
    /** On a company roster: no wallet. Past entries are still shown. */
    isRoster: boolean;
  };
  balanceTetri: number;
  reservedTetri: number;
  availableTetri: number;
  entries: AdminWalletEntry[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

/** `?page=` → a 1-based page number; anything unusable is the first page. */
function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * GET /api/admin/finance/wallets/[driverProfileId]?page= — one driver's
 * balance and ledger, newest first.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ driverProfileId: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { driverProfileId } = await params;
  const page = parsePage(new URL(request.url).searchParams.get("page"));

  const profile = await prisma.driverProfile.findUnique({
    where: { id: driverProfileId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      companyId: true,
      user: { select: { name: true, isSuspended: true } },
    },
  });

  if (profile === null) {
    const t = await getRequestTranslations();

    return NextResponse.json(
      { error: t("errors.adminWallet.driverNotFound") },
      { status: 404 },
    );
  }

  const [balances, total, rows] = await Promise.all([
    readWalletBalances(prisma, driverProfileId),
    prisma.walletLedgerEntry.count({ where: { driverProfileId } }),
    prisma.walletLedgerEntry.findMany({
      where: { driverProfileId },
      select: {
        id: true,
        type: true,
        amountTetri: true,
        createdAt: true,
        reason: true,
        createdById: true,
        withdrawalId: true,
        order: { select: { id: true, reference: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  // `createdById` is a plain column (see the schema), so names are looked up.
  const actorIds = [
    ...new Set(
      rows
        .map((row) => row.createdById)
        .filter((id): id is string => id !== null),
    ),
  ];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });

  const body: AdminWalletDetail = {
    driver: {
      driverProfileId: profile.id,
      name: driverDisplayName(profile),
      phone: profile.phone,
      isSuspended: profile.user.isSuspended,
      isRoster: profile.companyId !== null,
    },
    balanceTetri: balances.balanceTetri,
    reservedTetri: balances.reservedTetri,
    availableTetri: balances.availableTetri,
    entries: rows.map((row) => ({
      entryId: row.id,
      type: row.type,
      amountTetri: row.amountTetri,
      createdAt: row.createdAt.toISOString(),
      order:
        row.order === null
          ? null
          : { id: row.order.id, reference: row.order.reference },
      withdrawalId: row.withdrawalId,
      reason: row.reason,
      createdByName:
        actors.find((actor) => actor.id === row.createdById)?.name ?? null,
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };

  return NextResponse.json(body, { status: 200 });
}
