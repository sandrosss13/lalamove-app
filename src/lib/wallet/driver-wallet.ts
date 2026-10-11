// Reads through Prisma; route handlers and server code only.
import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  BANK_ACCOUNT_SELECT,
  toBankAccountRecord,
  type BankAccountRecord,
} from "@/lib/wallet/bank-accounts";
import { readWalletBalances } from "@/lib/wallet/ledger";
import {
  MAX_BANK_ACCOUNTS_PER_DRIVER,
  MIN_WITHDRAWAL_TETRI,
  bankName,
  legalNameOf,
  maskIban,
  withdrawBlockedReasonFor,
  type GeorgianBank,
  type WalletEntryType,
  type WithdrawBlockedReason,
} from "@/lib/wallet/rules";
import {
  WITHDRAWAL_SELECT,
  toWithdrawalRecord,
  type WithdrawalRecord,
} from "@/lib/wallet/withdrawals";

/**
 * What a driver reads of their own wallet: the summary, the ledger and the
 * withdrawals list. Every function is scoped by the `driverProfileId` the
 * route took from the session — none accepts an id from a request.
 */

/** The wallet at a glance, serialisable. */
export type WalletSummaryRecord = {
  balanceTetri: number;
  availableTetri: number;
  pendingWithdrawalsTetri: number;
  pendingWithdrawalCount: number;
  minimumWithdrawalTetri: number;
  bankAccountLimit: number;
  withdrawBlockedReason: WithdrawBlockedReason | null;
  defaultBankAccount: BankAccountRecord | null;
};

export async function getWalletSummary(
  driverProfileId: string,
): Promise<WalletSummaryRecord> {
  const [balances, pendingWithdrawalCount, profile, verifiedAccounts] =
    await Promise.all([
      readWalletBalances(prisma, driverProfileId),
      prisma.withdrawal.count({
        where: { driverProfileId, status: "PENDING" },
      }),
      prisma.driverProfile.findUniqueOrThrow({
        where: { id: driverProfileId },
        select: {
          accountType: true,
          firstName: true,
          lastName: true,
          companyName: true,
          user: { select: { isSuspended: true } },
        },
      }),
      prisma.driverBankAccount.findMany({
        where: { driverProfileId, removedAt: null, status: "VERIFIED" },
        select: BANK_ACCOUNT_SELECT,
      }),
    ]);

  const defaultAccount =
    verifiedAccounts.find((account) => account.isDefault) ?? null;

  return {
    balanceTetri: balances.balanceTetri,
    availableTetri: balances.availableTetri,
    pendingWithdrawalsTetri: balances.reservedTetri,
    pendingWithdrawalCount,
    minimumWithdrawalTetri: MIN_WITHDRAWAL_TETRI,
    bankAccountLimit: MAX_BANK_ACCOUNTS_PER_DRIVER,
    withdrawBlockedReason: withdrawBlockedReasonFor({
      availableTetri: balances.availableTetri,
      isSuspended: profile.user.isSuspended,
      hasVerifiedAccount: verifiedAccounts.length > 0,
    }),
    defaultBankAccount:
      defaultAccount === null
        ? null
        : toBankAccountRecord(defaultAccount, legalNameOf(profile) ?? ""),
  };
}

/** The driver's legal name — the holder every bank account must be in. */
export async function getAccountHolderName(
  driverProfileId: string,
): Promise<string | null> {
  const profile = await prisma.driverProfile.findUnique({
    where: { id: driverProfileId },
    select: {
      accountType: true,
      firstName: true,
      lastName: true,
      companyName: true,
    },
  });

  return profile === null ? null : legalNameOf(profile);
}

/**
 * The columns a ledger entry is read with. Deliberately narrow on the order:
 * its id and reference, and no money column of any kind — the entry's own
 * `amountTetri` is the only figure, and it is the driver's.
 */
export const WALLET_ENTRY_SELECT = {
  id: true,
  type: true,
  amountTetri: true,
  reason: true,
  createdAt: true,
  order: { select: { id: true, reference: true } },
  withdrawal: { select: { id: true, bank: true, iban: true } },
} satisfies Prisma.WalletLedgerEntrySelect;

type WalletEntryRow = Prisma.WalletLedgerEntryGetPayload<{
  select: typeof WALLET_ENTRY_SELECT;
}>;

/** One ledger entry, serialisable. */
export type WalletEntryRecord = {
  id: string;
  type: WalletEntryType;
  amountTetri: number;
  createdAt: string;
  job: { id: string; reference: string } | null;
  withdrawal: {
    id: string;
    bank: GeorgianBank;
    bankName: string;
    maskedIban: string;
  } | null;
  /** An adjustment's reason. */
  note: string | null;
};

export function toWalletEntryRecord(row: WalletEntryRow): WalletEntryRecord {
  return {
    id: row.id,
    type: row.type,
    amountTetri: row.amountTetri,
    createdAt: row.createdAt.toISOString(),
    job:
      row.order === null
        ? null
        : { id: row.order.id, reference: row.order.reference },
    withdrawal:
      row.withdrawal === null
        ? null
        : {
            id: row.withdrawal.id,
            bank: row.withdrawal.bank,
            bankName: bankName(row.withdrawal.bank),
            maskedIban: maskIban(row.withdrawal.iban),
          },
    note: row.reason,
  };
}

/** One page of a newest-first list, and the cursor for the next. */
export type WalletPage<T> = { items: T[]; nextCursor: string | null };

/**
 * Splits `limit + 1` fetched rows into a page and its cursor: the extra row
 * only proves there is a next page, and the cursor is the last row *shown*.
 */
function toPage<Row extends { id: string }, T>(
  rows: Row[],
  limit: number,
  map: (row: Row) => T,
): WalletPage<T> {
  const shown = rows.slice(0, limit);
  const last = shown[shown.length - 1];

  return {
    items: shown.map(map),
    nextCursor: rows.length > limit && last !== undefined ? last.id : null,
  };
}

/**
 * The cursor as a Prisma argument, or `null` when it names no row of this
 * driver's — in which case the caller answers 400 rather than letting Prisma
 * throw on an unknown cursor (or page from somebody else's row).
 */
async function resolveCursor(
  cursor: string | null,
  exists: (id: string) => Promise<boolean>,
): Promise<{ cursor: { id: string }; skip: 1 } | Record<string, never> | null> {
  if (cursor === null) {
    return {};
  }

  return (await exists(cursor)) ? { cursor: { id: cursor }, skip: 1 } : null;
}

/** The ledger, newest first. `null` when `cursor` is not one of this driver's entries. */
export async function getWalletActivity(
  driverProfileId: string,
  cursor: string | null,
  limit: number,
): Promise<WalletPage<WalletEntryRecord> | null> {
  const paging = await resolveCursor(cursor, async (id) => {
    const entry = await prisma.walletLedgerEntry.findFirst({
      where: { id, driverProfileId },
      select: { id: true },
    });

    return entry !== null;
  });

  if (paging === null) {
    return null;
  }

  const rows = await prisma.walletLedgerEntry.findMany({
    where: { driverProfileId },
    select: WALLET_ENTRY_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...paging,
  });

  return toPage(rows, limit, toWalletEntryRecord);
}

/** The driver's withdrawals, newest first. `null` on an unknown cursor. */
export async function getWithdrawals(
  driverProfileId: string,
  cursor: string | null,
  limit: number,
): Promise<WalletPage<WithdrawalRecord> | null> {
  const paging = await resolveCursor(cursor, async (id) => {
    const withdrawal = await prisma.withdrawal.findFirst({
      where: { id, driverProfileId },
      select: { id: true },
    });

    return withdrawal !== null;
  });

  if (paging === null) {
    return null;
  }

  const rows = await prisma.withdrawal.findMany({
    where: { driverProfileId },
    select: WITHDRAWAL_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...paging,
  });

  return toPage(rows, limit, toWithdrawalRecord);
}
