// Reads and writes money rows through Prisma; server code only.
import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { lockWallet, readWalletBalances } from "@/lib/wallet/ledger";
import {
  bankName,
  legalNameOf,
  maskIban,
  signedEntryAmount,
  withdrawalRefusalFor,
  type GeorgianBank,
  type WithdrawalRefusal,
  type WithdrawalStatus,
} from "@/lib/wallet/rules";

/**
 * Withdrawals, fulfilled by hand.
 *
 * ```
 *             request                 pay (bank reference)
 *   (none) ───────────▶ PENDING ───────────────────────────▶ PAID ──▶ REVERSED
 *                          │                                   reverse (reason)
 *                          └──────────▶ REJECTED
 *                            reject (reason)
 * ```
 *
 * - **PENDING** reserves the amount: it counts against what the driver can
 *   withdraw, and no ledger entry exists yet.
 * - **PAID** posts the `WITHDRAWAL` debit. Staff made the bank transfer outside
 *   the system and recorded the bank's reference.
 * - **REJECTED** posts nothing; the reservation simply stops counting.
 * - **REVERSED** is for a paid transfer the bank returned: it posts a
 *   `WITHDRAWAL_REVERSAL` credit, giving the money back to the balance.
 *
 * Every transition runs under the wallet lock and is conditional on the state
 * read under that lock, so two staff members acting on one withdrawal produce
 * one transition, one ledger entry and one audit row.
 */

export const WITHDRAWAL_SELECT = {
  id: true,
  amountTetri: true,
  status: true,
  bankAccountId: true,
  bank: true,
  iban: true,
  bankReference: true,
  rejectionReason: true,
  createdAt: true,
  decidedAt: true,
} satisfies Prisma.WithdrawalSelect;

type WithdrawalRow = Prisma.WithdrawalGetPayload<{
  select: typeof WITHDRAWAL_SELECT;
}>;

/** One withdrawal as its driver may see it; every timestamp an ISO string. */
export type WithdrawalRecord = {
  id: string;
  amountTetri: number;
  status: WithdrawalStatus;
  bankAccountId: string;
  bank: GeorgianBank;
  bankName: string;
  maskedIban: string;
  bankReference: string | null;
  rejectionReason: string | null;
  requestedAt: string;
  decidedAt: string | null;
};

export function toWithdrawalRecord(row: WithdrawalRow): WithdrawalRecord {
  return {
    id: row.id,
    amountTetri: row.amountTetri,
    status: row.status,
    bankAccountId: row.bankAccountId,
    bank: row.bank,
    bankName: bankName(row.bank),
    maskedIban: maskIban(row.iban),
    bankReference: row.bankReference,
    rejectionReason: row.rejectionReason,
    requestedAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

export type RequestWithdrawalOutcome =
  | { kind: "CREATED"; withdrawal: WithdrawalRecord }
  /** The same `requestKey` was sent before: this is that first withdrawal. */
  | { kind: "REPLAYED"; withdrawal: WithdrawalRecord }
  | {
      kind: "REFUSED";
      refusal:
        | WithdrawalRefusal
        /** The driver joined a company roster since the guard ran. */
        | "WALLET_NOT_AVAILABLE"
        | "BANK_ACCOUNT_NOT_FOUND"
        /** No `bankAccountId` was sent and there is no default account. */
        | "NO_VERIFIED_BANK_ACCOUNT";
      availableTetri: number;
    };

/**
 * Reserves `amountTetri` for payout to one of the driver's verified accounts
 * (`bankAccountId`, or their default when it is `null`).
 *
 * The whole decision — frozen, minimum, account, free balance — is taken and
 * the row written inside one transaction under the wallet lock, so concurrent
 * requests run in turn and the second sees the first's reservation: together
 * they can never reserve more than the balance.
 */
export async function requestWithdrawal(input: {
  driverProfileId: string;
  amountTetri: number;
  bankAccountId: string | null;
  /**
   * The client's idempotency key — required, so a repeated request is always
   * recognised as one (see the route for why it is not optional).
   */
  requestKey: string;
}): Promise<RequestWithdrawalOutcome> {
  const { driverProfileId, amountTetri, bankAccountId, requestKey } = input;

  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, driverProfileId);

    // Under the wallet lock, so two requests carrying the same key run in
    // turn: the second finds the first's row here and replays it.
    const earlier = await tx.withdrawal.findUnique({
      where: { driverProfileId_requestKey: { driverProfileId, requestKey } },
      select: WITHDRAWAL_SELECT,
    });

    if (earlier !== null) {
      return {
        kind: "REPLAYED",
        withdrawal: toWithdrawalRecord(earlier),
      } as const;
    }

    const profile = await tx.driverProfile.findUniqueOrThrow({
      where: { id: driverProfileId },
      select: {
        companyId: true,
        accountType: true,
        firstName: true,
        lastName: true,
        companyName: true,
        user: { select: { name: true, isSuspended: true } },
      },
    });

    const balances = await readWalletBalances(tx, driverProfileId);
    const refuse = (
      refusal: (RequestWithdrawalOutcome & { kind: "REFUSED" })["refusal"],
    ) =>
      ({
        kind: "REFUSED",
        refusal,
        availableTetri: balances.availableTetri,
      }) as const;

    if (profile.companyId !== null) {
      return refuse("WALLET_NOT_AVAILABLE");
    }

    const account = await tx.driverBankAccount.findFirst({
      where:
        bankAccountId === null
          ? { driverProfileId, removedAt: null, isDefault: true }
          : { id: bankAccountId, driverProfileId, removedAt: null },
      select: { id: true, bank: true, iban: true, status: true },
    });

    if (account === null) {
      // Frozen outranks a missing account, as it does in `withdrawalRefusalFor`.
      if (profile.user.isSuspended) {
        return refuse("WALLET_FROZEN");
      }

      return refuse(
        bankAccountId === null
          ? "NO_VERIFIED_BANK_ACCOUNT"
          : "BANK_ACCOUNT_NOT_FOUND",
      );
    }

    const refusal = withdrawalRefusalFor({
      amountTetri,
      availableTetri: balances.availableTetri,
      isSuspended: profile.user.isSuspended,
      accountStatus: account.status,
    });

    if (refusal !== null) {
      return refuse(refusal);
    }

    const created = await tx.withdrawal.create({
      data: {
        driverProfileId,
        bankAccountId: account.id,
        amountTetri,
        bank: account.bank,
        iban: account.iban,
        // The destination as it is now. A verified account always had a legal
        // name; the account name is the fallback for one cleared since.
        accountHolderName: legalNameOf(profile) ?? profile.user.name,
        requestKey,
      },
      select: WITHDRAWAL_SELECT,
    });

    return {
      kind: "CREATED",
      withdrawal: toWithdrawalRecord(created),
    } as const;
  });
}

/* ------------------------------------------------------------------------- */
/* The admin's decision                                                      */
/* ------------------------------------------------------------------------- */

export type WithdrawalDecision =
  | { action: "pay"; bankReference: string }
  | { action: "reject"; reason: string }
  | { action: "reverse"; reason: string };

export type WithdrawalDecisionOutcome =
  | { kind: "DECIDED"; status: WithdrawalStatus; decidedAt: string }
  | { kind: "NOT_FOUND" }
  /** Not in the state this action needs; `status` is what it is in. */
  | { kind: "INVALID_STATE"; status: WithdrawalStatus }
  /**
   * The ledger does not hold the amount being paid. Cannot happen while every
   * debit goes through this module; refused rather than assumed.
   */
  | { kind: "BALANCE_TOO_LOW" };

/** The state each action requires, and the state it produces. */
const TRANSITIONS: Record<
  WithdrawalDecision["action"],
  { from: WithdrawalStatus; to: WithdrawalStatus; auditAction: string }
> = {
  pay: { from: "PENDING", to: "PAID", auditAction: "withdrawal.pay" },
  reject: { from: "PENDING", to: "REJECTED", auditAction: "withdrawal.reject" },
  reverse: { from: "PAID", to: "REVERSED", auditAction: "withdrawal.reverse" },
};

/**
 * Applies a staff decision to a withdrawal: the status change, the ledger
 * entry it implies (a debit for `pay`, a credit for `reverse`, nothing for
 * `reject`) and the audit row — all in one transaction, under the wallet lock.
 */
export async function decideWithdrawal(
  withdrawalId: string,
  decision: WithdrawalDecision,
  actorId: string,
): Promise<WithdrawalDecisionOutcome> {
  // Read once outside the transaction only to learn whose wallet to lock.
  const target = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    select: { driverProfileId: true },
  });

  if (target === null) {
    return { kind: "NOT_FOUND" };
  }

  const { driverProfileId } = target;
  const transition = TRANSITIONS[decision.action];

  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, driverProfileId);

    const withdrawal = await tx.withdrawal.findUniqueOrThrow({
      where: { id: withdrawalId },
      select: { status: true, amountTetri: true },
    });

    if (withdrawal.status !== transition.from) {
      return { kind: "INVALID_STATE", status: withdrawal.status } as const;
    }

    const decidedAt = new Date();

    if (decision.action === "pay") {
      const { balanceTetri } = await readWalletBalances(tx, driverProfileId);

      if (balanceTetri < withdrawal.amountTetri) {
        return { kind: "BALANCE_TOO_LOW" } as const;
      }

      await tx.walletLedgerEntry.create({
        data: {
          driverProfileId,
          type: "WITHDRAWAL",
          amountTetri: signedEntryAmount("WITHDRAWAL", withdrawal.amountTetri),
          withdrawalId,
          createdById: actorId,
        },
      });
      await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: "PAID",
          bankReference: decision.bankReference,
          decidedAt,
          decidedById: actorId,
        },
      });
    } else if (decision.action === "reject") {
      await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: "REJECTED",
          rejectionReason: decision.reason,
          decidedAt,
          decidedById: actorId,
        },
      });
    } else {
      await tx.walletLedgerEntry.create({
        data: {
          driverProfileId,
          type: "WITHDRAWAL_REVERSAL",
          amountTetri: signedEntryAmount(
            "WITHDRAWAL_REVERSAL",
            withdrawal.amountTetri,
          ),
          withdrawalId,
          createdById: actorId,
        },
      });
      // `decidedAt`/`decidedById` keep naming the payment; the audit log
      // names who reversed it and when.
      await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: "REVERSED", reversalReason: decision.reason },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: transition.auditAction,
        entityType: "Withdrawal",
        entityId: withdrawalId,
        metadata: {
          driverProfileId,
          amountTetri: withdrawal.amountTetri,
          ...(decision.action === "pay"
            ? { bankReference: decision.bankReference }
            : { reason: decision.reason }),
        },
      },
    });

    return {
      kind: "DECIDED",
      status: transition.to,
      decidedAt: decidedAt.toISOString(),
    } as const;
  });
}
