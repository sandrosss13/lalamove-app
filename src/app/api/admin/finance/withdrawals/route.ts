import { NextResponse } from "next/server";

import type {
  AdminRole,
  GeorgianBank,
  Prisma,
  WithdrawalStatus,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { driverDisplayName } from "@/lib/admin/driver-name";
import { prisma } from "@/lib/prisma";
import { bankName, isWithdrawalStatus } from "@/lib/wallet/rules";

/**
 * Staff who may see and settle withdrawals: the finance role and the super
 * admin, as on every other finance endpoint. Paying a withdrawal is the
 * finance role's core job. Stated per route so each endpoint's gate can be
 * read on its own.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/** Rows per page. Matches the other admin listings so every table pages alike. */
const PAGE_SIZE = 25;

/** One withdrawal as the queue renders it. */
export type AdminWithdrawalRow = {
  withdrawalId: string;
  amountTetri: number;
  status: WithdrawalStatus;
  /** The destination as it was when the driver asked — what to transfer to. */
  bank: GeorgianBank;
  bankName: string;
  iban: string;
  accountHolderName: string;
  bankReference: string | null;
  rejectionReason: string | null;
  reversalReason: string | null;
  requestedAt: string;
  decidedAt: string | null;
  driver: {
    driverProfileId: string;
    name: string;
    phone: string;
    /** Suspended since asking. The request stands; the decision is staff's. */
    isSuspended: boolean;
  };
};

/** Body of `GET /api/admin/finance/withdrawals`. */
export type AdminWithdrawalListResponse = {
  items: AdminWithdrawalRow[];
  page: number;
  pageSize: number;
  total: number;
  /** Always at least 1, so an empty list still renders as "Page 1 of 1". */
  pageCount: number;
  /** Withdrawals waiting to be paid, across every page and filter. */
  pendingCount: number;
  /** What those add up to. */
  pendingTotalTetri: number;
};

/** `?page=` → a 1-based page number; anything unusable is the first page. */
function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * GET /api/admin/finance/withdrawals?status=&page= — the queue behind
 * `/admin/finance/withdrawals`. Pending requests are listed oldest first (pay
 * in the order asked); every other view newest first. `status` is `PENDING`,
 * `PAID`, `REJECTED` or `REVERSED`; absent or unrecognised means all.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const url = new URL(request.url);
  const page = parsePage(url.searchParams.get("page"));
  const rawStatus = url.searchParams.get("status");
  const statusFilter = isWithdrawalStatus(rawStatus) ? rawStatus : null;

  const where: Prisma.WithdrawalWhereInput = statusFilter
    ? { status: statusFilter }
    : {};
  const direction = statusFilter === "PENDING" ? "asc" : "desc";

  const [total, pending, withdrawals] = await Promise.all([
    prisma.withdrawal.count({ where }),
    prisma.withdrawal.aggregate({
      where: { status: "PENDING" },
      _count: true,
      _sum: { amountTetri: true },
    }),
    prisma.withdrawal.findMany({
      where,
      select: {
        id: true,
        amountTetri: true,
        status: true,
        bank: true,
        iban: true,
        accountHolderName: true,
        bankReference: true,
        rejectionReason: true,
        reversalReason: true,
        createdAt: true,
        decidedAt: true,
        driverProfile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            user: { select: { name: true, isSuspended: true } },
          },
        },
      },
      orderBy: [{ createdAt: direction }, { id: direction }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const items: AdminWithdrawalRow[] = withdrawals.map((withdrawal) => ({
    withdrawalId: withdrawal.id,
    amountTetri: withdrawal.amountTetri,
    status: withdrawal.status,
    bank: withdrawal.bank,
    bankName: bankName(withdrawal.bank),
    iban: withdrawal.iban,
    accountHolderName: withdrawal.accountHolderName,
    bankReference: withdrawal.bankReference,
    rejectionReason: withdrawal.rejectionReason,
    reversalReason: withdrawal.reversalReason,
    requestedAt: withdrawal.createdAt.toISOString(),
    decidedAt: withdrawal.decidedAt?.toISOString() ?? null,
    driver: {
      driverProfileId: withdrawal.driverProfile.id,
      name: driverDisplayName(withdrawal.driverProfile),
      phone: withdrawal.driverProfile.phone,
      isSuspended: withdrawal.driverProfile.user.isSuspended,
    },
  }));

  const body: AdminWithdrawalListResponse = {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    pendingCount: pending._count,
    pendingTotalTetri: pending._sum.amountTetri ?? 0,
  };

  return NextResponse.json(body, { status: 200 });
}
