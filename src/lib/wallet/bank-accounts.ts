// Reads and writes through Prisma; route handlers and server code only.
import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { lockWallet } from "@/lib/wallet/ledger";
import {
  MAX_BANK_ACCOUNTS_PER_DRIVER,
  bankName,
  legalNameOf,
  maskIban,
  type BankAccountStatus,
  type GeorgianBank,
} from "@/lib/wallet/rules";

/**
 * A driver's withdrawal bank accounts: adding, choosing the default, removing,
 * and the admin's verdict. Every write runs under the wallet lock
 * (`lockWallet`), so the cap, the duplicate check and "one default" are
 * decided against rows nobody else is changing.
 *
 * Invariants kept here:
 * - at most `MAX_BANK_ACCOUNTS_PER_DRIVER` live (not removed) accounts;
 * - no two live accounts of one driver with the same IBAN;
 * - at most one default, and the default is always `VERIFIED`;
 * - an account a pending withdrawal points at is neither removed nor rejected.
 */

type Tx = Prisma.TransactionClient;

export const BANK_ACCOUNT_SELECT = {
  id: true,
  bank: true,
  iban: true,
  status: true,
  rejectionReason: true,
  isDefault: true,
  createdAt: true,
} satisfies Prisma.DriverBankAccountSelect;

type BankAccountRow = Prisma.DriverBankAccountGetPayload<{
  select: typeof BANK_ACCOUNT_SELECT;
}>;

/** One bank account, serialisable: every timestamp an ISO string. */
export type BankAccountRecord = {
  id: string;
  bank: GeorgianBank;
  /** The bank's trading name, e.g. "TBC Bank". */
  bankName: string;
  iban: string;
  maskedIban: string;
  /** The driver's legal name — read from the profile, never stored per account. */
  accountHolderName: string;
  status: BankAccountStatus;
  rejectionReason: string | null;
  isDefault: boolean;
  createdAt: string;
};

export function toBankAccountRecord(
  row: BankAccountRow,
  accountHolderName: string,
): BankAccountRecord {
  return {
    id: row.id,
    bank: row.bank,
    bankName: bankName(row.bank),
    iban: row.iban,
    maskedIban: maskIban(row.iban),
    accountHolderName,
    status: row.status,
    rejectionReason: row.rejectionReason,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
  };
}

const LEGAL_NAME_SELECT = {
  accountType: true,
  firstName: true,
  lastName: true,
  companyName: true,
} satisfies Prisma.DriverProfileSelect;

/** The driver's live accounts, oldest first, with the holder name on each. */
export async function listBankAccounts(
  driverProfileId: string,
): Promise<BankAccountRecord[]> {
  const [profile, rows] = await Promise.all([
    prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      select: LEGAL_NAME_SELECT,
    }),
    prisma.driverBankAccount.findMany({
      where: { driverProfileId, removedAt: null },
      select: BANK_ACCOUNT_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  // An account can only have been added while a legal name existed; the empty
  // string is for a profile whose name was cleared since.
  const holder = profile === null ? "" : (legalNameOf(profile) ?? "");

  return rows.map((row) => toBankAccountRecord(row, holder));
}

/**
 * Makes the oldest verified account the default when the driver has none.
 * Called after anything that can leave a driver with verified accounts and no
 * default: a verification, a removal, a rejection.
 */
async function ensureDefault(tx: Tx, driverProfileId: string): Promise<void> {
  const current = await tx.driverBankAccount.findFirst({
    where: { driverProfileId, removedAt: null, isDefault: true },
    select: { id: true },
  });

  if (current !== null) {
    return;
  }

  const next = await tx.driverBankAccount.findFirst({
    where: { driverProfileId, removedAt: null, status: "VERIFIED" },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (next !== null) {
    await tx.driverBankAccount.update({
      where: { id: next.id },
      data: { isDefault: true },
    });
  }
}

export type AddBankAccountOutcome =
  | { kind: "ADDED"; account: BankAccountRecord }
  | {
      kind: "REFUSED";
      refusal:
        | "LEGAL_NAME_MISSING"
        | "BANK_ACCOUNT_LIMIT_REACHED"
        | "BANK_ACCOUNT_DUPLICATE";
    };

/**
 * Adds a `PENDING` account. `iban` must already have passed
 * `validateGeorgianIban` for `bank` — this function decides only what needs
 * the database: the legal name, the cap and the duplicate.
 */
export async function addBankAccount(input: {
  driverProfileId: string;
  bank: GeorgianBank;
  iban: string;
}): Promise<AddBankAccountOutcome> {
  const { driverProfileId, bank, iban } = input;

  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, driverProfileId);

    const profile = await tx.driverProfile.findUniqueOrThrow({
      where: { id: driverProfileId },
      select: LEGAL_NAME_SELECT,
    });
    const holder = legalNameOf(profile);

    if (holder === null) {
      return { kind: "REFUSED", refusal: "LEGAL_NAME_MISSING" } as const;
    }

    const live = await tx.driverBankAccount.findMany({
      where: { driverProfileId, removedAt: null },
      select: { iban: true },
    });

    // The duplicate first: "already added" is the more useful answer to a
    // driver who is both at the cap and re-typing an account they have.
    if (live.some((account) => account.iban === iban)) {
      return { kind: "REFUSED", refusal: "BANK_ACCOUNT_DUPLICATE" } as const;
    }

    if (live.length >= MAX_BANK_ACCOUNTS_PER_DRIVER) {
      return {
        kind: "REFUSED",
        refusal: "BANK_ACCOUNT_LIMIT_REACHED",
      } as const;
    }

    const created = await tx.driverBankAccount.create({
      data: { driverProfileId, bank, iban },
      select: BANK_ACCOUNT_SELECT,
    });

    return {
      kind: "ADDED",
      account: toBankAccountRecord(created, holder),
    } as const;
  });
}

export type BankAccountChangeOutcome =
  | { kind: "DONE" }
  | {
      kind: "REFUSED";
      refusal:
        | "BANK_ACCOUNT_NOT_FOUND"
        | "BANK_ACCOUNT_NOT_VERIFIED"
        | "BANK_ACCOUNT_HAS_PENDING_WITHDRAWAL";
    };

/** Makes one of the driver's own verified accounts the default. */
export async function setDefaultBankAccount(
  driverProfileId: string,
  accountId: string,
): Promise<BankAccountChangeOutcome> {
  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, driverProfileId);

    // Scoped to the driver in the query itself: somebody else's account and a
    // missing one are the same answer.
    const account = await tx.driverBankAccount.findFirst({
      where: { id: accountId, driverProfileId, removedAt: null },
      select: { status: true },
    });

    if (account === null) {
      return { kind: "REFUSED", refusal: "BANK_ACCOUNT_NOT_FOUND" } as const;
    }

    if (account.status !== "VERIFIED") {
      return {
        kind: "REFUSED",
        refusal: "BANK_ACCOUNT_NOT_VERIFIED",
      } as const;
    }

    await tx.driverBankAccount.updateMany({
      where: { driverProfileId, isDefault: true, id: { not: accountId } },
      data: { isDefault: false },
    });
    await tx.driverBankAccount.update({
      where: { id: accountId },
      data: { isDefault: true },
    });

    return { kind: "DONE" } as const;
  });
}

/**
 * Removes one of the driver's own accounts — unless a pending withdrawal is on
 * its way to it. Soft: the row stays for the withdrawals that were paid to it.
 * Removing the default hands the default to the oldest other verified account.
 */
export async function removeBankAccount(
  driverProfileId: string,
  accountId: string,
): Promise<BankAccountChangeOutcome> {
  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, driverProfileId);

    const account = await tx.driverBankAccount.findFirst({
      where: { id: accountId, driverProfileId, removedAt: null },
      select: { id: true },
    });

    if (account === null) {
      return { kind: "REFUSED", refusal: "BANK_ACCOUNT_NOT_FOUND" } as const;
    }

    const pending = await tx.withdrawal.count({
      where: { bankAccountId: accountId, status: "PENDING" },
    });

    if (pending > 0) {
      return {
        kind: "REFUSED",
        refusal: "BANK_ACCOUNT_HAS_PENDING_WITHDRAWAL",
      } as const;
    }

    await tx.driverBankAccount.update({
      where: { id: accountId },
      data: { removedAt: new Date(), isDefault: false },
    });
    await ensureDefault(tx, driverProfileId);

    return { kind: "DONE" } as const;
  });
}

/* ------------------------------------------------------------------------- */
/* The admin's verdict                                                       */
/* ------------------------------------------------------------------------- */

export type BankAccountReview =
  { action: "verify" } | { action: "reject"; reason: string };

export type BankAccountReviewOutcome =
  | { kind: "REVIEWED"; status: BankAccountStatus; isDefault: boolean }
  | {
      kind: "REFUSED";
      refusal:
        | "NOT_FOUND"
        /** The driver removed it; there is nothing left to judge. */
        | "REMOVED"
        /** Already in the state the verdict asks for. */
        | "ALREADY_IN_STATE"
        /** The driver has joined a company roster and has no wallet. */
        | "NO_WALLET"
        /** Not activated: there is no reviewed identity to verify against. */
        | "IDENTITY_NOT_REVIEWED"
        | "HAS_PENDING_WITHDRAWAL";
    };

/**
 * Verifies or rejects an account, with its audit row, in one transaction.
 *
 * Any state may move to either verdict — a rejected account can be verified
 * (a mistake corrected) and a verified one rejected (verification revoked) —
 * except that an account with a pending withdrawal cannot be rejected: reject
 * or pay the withdrawal first, so no reserved money points at a refused
 * account.
 *
 * Verifying needs an activated, independent driver: activation is the admin
 * approval of the driver's identity documents, and it is that reviewed
 * identity the account is being compared with.
 */
export async function reviewBankAccount(
  accountId: string,
  review: BankAccountReview,
  actorId: string,
): Promise<BankAccountReviewOutcome> {
  // Read once outside the transaction only to learn whose wallet to lock;
  // everything decided below is re-read under that lock.
  const target = await prisma.driverBankAccount.findUnique({
    where: { id: accountId },
    select: { driverProfileId: true },
  });

  if (target === null) {
    return { kind: "REFUSED", refusal: "NOT_FOUND" };
  }

  const { driverProfileId } = target;

  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, driverProfileId);

    const account = await tx.driverBankAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        status: true,
        removedAt: true,
        driverProfile: { select: { companyId: true, activatedAt: true } },
      },
    });

    if (account.removedAt !== null) {
      return { kind: "REFUSED", refusal: "REMOVED" } as const;
    }

    const nextStatus: BankAccountStatus =
      review.action === "verify" ? "VERIFIED" : "REJECTED";

    if (account.status === nextStatus) {
      return { kind: "REFUSED", refusal: "ALREADY_IN_STATE" } as const;
    }

    if (review.action === "verify") {
      if (account.driverProfile.companyId !== null) {
        return { kind: "REFUSED", refusal: "NO_WALLET" } as const;
      }

      if (account.driverProfile.activatedAt === null) {
        return { kind: "REFUSED", refusal: "IDENTITY_NOT_REVIEWED" } as const;
      }
    } else {
      const pending = await tx.withdrawal.count({
        where: { bankAccountId: accountId, status: "PENDING" },
      });

      if (pending > 0) {
        return { kind: "REFUSED", refusal: "HAS_PENDING_WITHDRAWAL" } as const;
      }
    }

    await tx.driverBankAccount.update({
      where: { id: accountId },
      data: {
        status: nextStatus,
        rejectionReason: review.action === "reject" ? review.reason : null,
        reviewedAt: new Date(),
        reviewedById: actorId,
        // A rejected account can no longer be the default; a verified one
        // becomes it below only if the driver has none.
        ...(review.action === "reject" ? { isDefault: false } : {}),
      },
    });
    await ensureDefault(tx, driverProfileId);

    const after = await tx.driverBankAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: { isDefault: true },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action:
          review.action === "verify"
            ? "bank_account.verify"
            : "bank_account.reject",
        entityType: "DriverBankAccount",
        entityId: accountId,
        metadata: {
          driverProfileId,
          previousStatus: account.status,
          ...(review.action === "reject" ? { reason: review.reason } : {}),
        },
      },
    });

    return {
      kind: "REVIEWED",
      status: nextStatus,
      isDefault: after.isDefault,
    } as const;
  });
}
