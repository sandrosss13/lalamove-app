import { NextResponse } from "next/server";

import type {
  AdminRole,
  BankAccountStatus,
  DriverAccountType,
  GeorgianBank,
  Prisma,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { driverDisplayName } from "@/lib/admin/driver-name";
import { prisma } from "@/lib/prisma";
import { bankName, isBankAccountStatus, legalNameOf } from "@/lib/wallet/rules";

/**
 * Staff who may see and verify drivers' bank accounts: the finance role and
 * the super admin — the same two every other finance endpoint admits. A bank
 * account is where money will be sent, so the decision sits with the role that
 * sends it; `USER_MANAGER` reviews identity documents but does not handle
 * payouts. Stated per route so each endpoint's gate can be read on its own.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/** Rows per page. Matches the other admin listings so every table pages alike. */
const PAGE_SIZE = 25;

/** One bank account as the verification queue renders it. */
export type AdminBankAccountRow = {
  accountId: string;
  bank: GeorgianBank;
  bankName: string;
  /** In full: the reviewer compares it with the driver's bank statement. */
  iban: string;
  status: BankAccountStatus;
  rejectionReason: string | null;
  isDefault: boolean;
  createdAt: string;
  reviewedAt: string | null;
  /** Other drivers' live accounts with this same IBAN — a third-party signal. */
  sameIbanOnOtherDrivers: number;
  driver: {
    driverProfileId: string;
    name: string;
    /** The name the account must be in; null when the profile has none. */
    legalName: string | null;
    idNumber: string | null;
    accountType: DriverAccountType;
    phone: string;
    /** Whether the driver's identity has been reviewed (activation). */
    isActivated: boolean;
    /** On a company roster now: no wallet, so the account cannot be verified. */
    isRoster: boolean;
  };
};

/** Body of `GET /api/admin/finance/bank-accounts`. */
export type AdminBankAccountListResponse = {
  items: AdminBankAccountRow[];
  page: number;
  pageSize: number;
  total: number;
  /** Always at least 1, so an empty list still renders as "Page 1 of 1". */
  pageCount: number;
  /** Accounts waiting for a verdict, across every page and filter. */
  pendingCount: number;
};

/** `?page=` → a 1-based page number; anything unusable is the first page. */
function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * GET /api/admin/finance/bank-accounts?status=&page= — the verification queue
 * behind `/admin/finance/bank-accounts`, oldest first so the longest wait is
 * on top. `status` is `PENDING`, `VERIFIED` or `REJECTED`; absent or
 * unrecognised means all. Accounts a driver removed are not listed.
 *
 * Each row carries what the reviewer compares the IBAN against: the driver's
 * legal name, ID number and account type.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const url = new URL(request.url);
  const page = parsePage(url.searchParams.get("page"));
  const rawStatus = url.searchParams.get("status");

  const where: Prisma.DriverBankAccountWhereInput = {
    removedAt: null,
    ...(isBankAccountStatus(rawStatus) ? { status: rawStatus } : {}),
  };

  const [total, pendingCount, accounts] = await Promise.all([
    prisma.driverBankAccount.count({ where }),
    prisma.driverBankAccount.count({
      where: { removedAt: null, status: "PENDING" },
    }),
    prisma.driverBankAccount.findMany({
      where,
      select: {
        id: true,
        bank: true,
        iban: true,
        status: true,
        rejectionReason: true,
        isDefault: true,
        createdAt: true,
        reviewedAt: true,
        driverProfile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            accountType: true,
            idNumber: true,
            phone: true,
            activatedAt: true,
            companyId: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  // One query for the whole page: which of these IBANs other drivers hold.
  const sameIban = await prisma.driverBankAccount.findMany({
    where: {
      removedAt: null,
      iban: { in: accounts.map((account) => account.iban) },
    },
    select: { iban: true, driverProfileId: true },
  });

  const items: AdminBankAccountRow[] = accounts.map((account) => ({
    accountId: account.id,
    bank: account.bank,
    bankName: bankName(account.bank),
    iban: account.iban,
    status: account.status,
    rejectionReason: account.rejectionReason,
    isDefault: account.isDefault,
    createdAt: account.createdAt.toISOString(),
    reviewedAt: account.reviewedAt?.toISOString() ?? null,
    sameIbanOnOtherDrivers: sameIban.filter(
      (other) =>
        other.iban === account.iban &&
        other.driverProfileId !== account.driverProfile.id,
    ).length,
    driver: {
      driverProfileId: account.driverProfile.id,
      name: driverDisplayName(account.driverProfile),
      legalName: legalNameOf(account.driverProfile),
      idNumber: account.driverProfile.idNumber,
      accountType: account.driverProfile.accountType,
      phone: account.driverProfile.phone,
      isActivated: account.driverProfile.activatedAt !== null,
      isRoster: account.driverProfile.companyId !== null,
    },
  }));

  const body: AdminBankAccountListResponse = {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    pendingCount,
  };

  return NextResponse.json(body, { status: 200 });
}
