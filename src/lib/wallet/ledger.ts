// Reads and writes money rows through Prisma, so it can never be part of a
// browser bundle. Fails the build loudly if a client component imports it.
import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  adjustmentRefusalFor,
  signedEntryAmount,
  toTetri,
  walletBalances,
  walletCreditDecisionFor,
  type WalletBalances,
  type WalletCreditDecision,
  type WalletEntryType,
} from "@/lib/wallet/rules";

/**
 * The driver wallet's ledger: the lock every balance-changing operation takes,
 * the balance read, the one function that credits a job, and the manual
 * adjustment. Withdrawals and bank accounts are in the sibling modules and
 * take the same lock.
 *
 * The ledger is append-only: this module and `./withdrawals` only ever
 * `create` rows in `WalletLedgerEntry`.
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

/**
 * Serialises every balance-changing operation on one driver's wallet.
 *
 * A transaction-scoped Postgres advisory lock keyed by the driver profile:
 * held until the transaction ends, released on commit or rollback, and
 * compatible with transaction-mode connection pooling. Whoever takes it reads
 * the balance and writes against it with nobody else doing the same for this
 * driver — which is what stops two simultaneous withdrawal requests from both
 * seeing the same free balance.
 *
 * An advisory lock rather than `FOR UPDATE` on the `DriverProfile` row because
 * that row is rewritten every few seconds by the driver's location beacon,
 * and a wallet operation should neither wait on nor block it.
 *
 * `$executeRaw`, not `$queryRaw`: the function returns `void`, a column type
 * Prisma cannot deserialise.
 */
export async function lockWallet(
  tx: Tx,
  driverProfileId: string,
): Promise<void> {
  const key = `driver-wallet:${driverProfileId}`;

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/**
 * A driver's balance (the sum of their ledger entries), what is reserved by
 * pending withdrawals, and the difference. Derived on every read — there is no
 * stored balance to drift from the ledger.
 */
export async function readWalletBalances(
  db: Db,
  driverProfileId: string,
): Promise<WalletBalances> {
  const [entries, pending] = await Promise.all([
    db.walletLedgerEntry.aggregate({
      where: { driverProfileId },
      _sum: { amountTetri: true },
    }),
    db.withdrawal.aggregate({
      where: { driverProfileId, status: "PENDING" },
      _sum: { amountTetri: true },
    }),
  ]);

  return walletBalances(
    entries._sum.amountTetri ?? 0,
    pending._sum.amountTetri ?? 0,
  );
}

/* ------------------------------------------------------------------------- */
/* Crediting a job                                                           */
/* ------------------------------------------------------------------------- */

export type WalletCreditOutcome =
  | { kind: "NOT_FOUND" }
  | {
      kind: "SKIPPED";
      reason: (WalletCreditDecision & { kind: "SKIP" })["reason"];
    }
  /** Deliberately not credited, and recorded for staff — see `WalletCreditHold`. */
  | { kind: "HELD"; reason: "ROSTER_SELF_CLAIM"; created: boolean }
  /** `postedEntries` is 0 when every entry already existed (a repeat call). */
  | { kind: "CREDITED"; driverProfileId: string; postedEntries: number };

/**
 * Credits a job to its driver's wallet **if and only if** it qualifies —
 * `walletCreditDecisionFor` is the rule — and does nothing otherwise.
 *
 * **This is the only function that posts job money.** It is called from the two
 * places either precondition can become true, so whichever happens second
 * credits:
 *
 * - `POST /api/orders/[id]/complete`, after the completion commits;
 * - `confirmGatewayPayment` (`src/lib/orders/payment-settlement.ts`), after
 *   the gateway confirmation commits.
 *
 * Safe to call any number of times, concurrently, for any order:
 *
 * - it runs under the order's row lock, so two calls for one order run in turn;
 * - the entries are written with `ON CONFLICT DO NOTHING` against the ledger's
 *   `(orderId, type)` unique index, so a second call posts nothing.
 *
 * Amounts are the order's `driverPayout` and `overtimeDriverPayout` — the
 * driver's own figures, already net of commission — converted by `toTetri`.
 * The client's price and the commission rate are never read here.
 */
export async function creditWalletForOrder(
  orderId: string,
): Promise<WalletCreditOutcome> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;

    if (locked.length === 0) {
      return { kind: "NOT_FOUND" } as const;
    }

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        status: true,
        paymentMethodType: true,
        companyId: true,
        driverClaimedAs: true,
        driverClaimCompanyId: true,
        driverPayout: true,
        overtimeDriverPayout: true,
        payment: { select: { gatewayConfirmedAt: true } },
        walletCreditHold: { select: { id: true } },
        driver: {
          select: { driverProfile: { select: { id: true, companyId: true } } },
        },
      },
    });

    const driverProfile = order.driver?.driverProfile ?? null;

    const decision = walletCreditDecisionFor({
      orderStatus: order.status,
      paymentMethodType: order.paymentMethodType,
      gatewayConfirmed: (order.payment?.gatewayConfirmedAt ?? null) !== null,
      orderCompanyId: order.companyId,
      // The capacity recorded at the claim — not the roster as it stands now,
      // which may have changed since. See `walletCreditDecisionFor`.
      claimedAs: order.driverClaimedAs,
      driver: driverProfile,
    });

    if (decision.kind === "SKIP") {
      return { kind: "SKIPPED", reason: decision.reason } as const;
    }

    // Unreachable after the decision above; narrows the type without a cast.
    if (driverProfile === null) {
      return { kind: "SKIPPED", reason: "NO_DRIVER" } as const;
    }

    // A hold is sticky: once a job was set aside it is never credited
    // automatically, even if the driver has since left their company. (For a
    // job whose claim was recorded this is belt and braces — the decision
    // above already holds it; for an older one it is the only memory there is.)
    if (order.walletCreditHold !== null) {
      return {
        kind: "HELD",
        reason: "ROSTER_SELF_CLAIM",
        created: false,
      } as const;
    }

    const payoutTetri = toTetri(order.driverPayout);
    const overtimeTetri = toTetri(order.overtimeDriverPayout);

    if (decision.kind === "HOLD") {
      // Already credited while the driver was independent: nothing to hold.
      const alreadyCredited = await tx.walletLedgerEntry.count({
        where: { orderId },
      });

      if (alreadyCredited > 0) {
        return {
          kind: "CREDITED",
          driverProfileId: driverProfile.id,
          postedEntries: 0,
        } as const;
      }

      await tx.walletCreditHold.create({
        data: {
          orderId,
          driverProfileId: driverProfile.id,
          // The company the job was claimed under, when that was recorded —
          // the driver may no longer be on its roster, and that is the company
          // the open question is about. Otherwise their employer today.
          companyId: order.driverClaimCompanyId ?? driverProfile.companyId,
          reason: decision.reason,
          amountTetri: payoutTetri + overtimeTetri,
        },
      });

      return { kind: "HELD", reason: decision.reason, created: true } as const;
    }

    await lockWallet(tx, driverProfile.id);

    const entries: Prisma.WalletLedgerEntryCreateManyInput[] = [];

    // A zero figure posts nothing: the ledger holds no zero rows.
    if (payoutTetri > 0) {
      entries.push({
        driverProfileId: driverProfile.id,
        type: "JOB_PAYOUT",
        amountTetri: signedEntryAmount("JOB_PAYOUT", payoutTetri),
        orderId,
      });
    }

    if (overtimeTetri > 0) {
      entries.push({
        driverProfileId: driverProfile.id,
        type: "JOB_OVERTIME",
        amountTetri: signedEntryAmount("JOB_OVERTIME", overtimeTetri),
        orderId,
      });
    }

    const { count } =
      entries.length === 0
        ? { count: 0 }
        : await tx.walletLedgerEntry.createMany({
            data: entries,
            skipDuplicates: true,
          });

    return {
      kind: "CREDITED",
      driverProfileId: driverProfile.id,
      postedEntries: count,
    } as const;
  });
}

/**
 * `creditWalletForOrder` for a caller whose own work has already committed and
 * must not be failed by the wallet — the completion route. A failure is logged
 * and swallowed: the credit is not lost, because the function is idempotent
 * and the same order can be credited by calling it again.
 */
export async function creditWalletForOrderSafely(
  orderId: string,
): Promise<void> {
  try {
    await creditWalletForOrder(orderId);
  } catch (error) {
    console.error(`Failed to credit the wallet for order ${orderId}:`, error);
  }
}

/* ------------------------------------------------------------------------- */
/* Manual adjustment                                                         */
/* ------------------------------------------------------------------------- */

export type WalletAdjustmentOutcome =
  | { kind: "NOT_FOUND" }
  /** A roster driver: there is no wallet to adjust. */
  | { kind: "NO_WALLET" }
  | { kind: "REFUSED"; refusal: "INVALID_AMOUNT" | "EXCEEDS_AVAILABLE" }
  | { kind: "POSTED"; entryId: string; balances: WalletBalances };

/**
 * Posts a manual `ADJUSTMENT` entry of `amountTetri` (either sign) with its
 * reason, and its audit-log row, in one transaction under the wallet lock.
 *
 * The audit row is written inside the transaction, not after it: a ledger
 * entry created by a person must never exist without the record of who.
 */
export async function postWalletAdjustment(input: {
  driverProfileId: string;
  amountTetri: number;
  reason: string;
  actorId: string;
}): Promise<WalletAdjustmentOutcome> {
  const { driverProfileId, amountTetri, reason, actorId } = input;

  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, driverProfileId);

    const profile = await tx.driverProfile.findUnique({
      where: { id: driverProfileId },
      select: { companyId: true },
    });

    if (profile === null) {
      return { kind: "NOT_FOUND" } as const;
    }

    if (profile.companyId !== null) {
      return { kind: "NO_WALLET" } as const;
    }

    const before = await readWalletBalances(tx, driverProfileId);
    const refusal = adjustmentRefusalFor({
      amountTetri,
      availableTetri: before.availableTetri,
    });

    if (refusal !== null) {
      return { kind: "REFUSED", refusal } as const;
    }

    const entry = await tx.walletLedgerEntry.create({
      data: {
        driverProfileId,
        type: "ADJUSTMENT" satisfies WalletEntryType,
        amountTetri,
        reason,
        createdById: actorId,
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "wallet.adjust",
        entityType: "DriverProfile",
        entityId: driverProfileId,
        metadata: {
          entryId: entry.id,
          amountTetri,
          reason,
          balanceBeforeTetri: before.balanceTetri,
          balanceAfterTetri: before.balanceTetri + amountTetri,
        },
      },
    });

    return {
      kind: "POSTED",
      entryId: entry.id,
      balances: walletBalances(
        before.balanceTetri + amountTetri,
        before.reservedTetri,
      ),
    } as const;
  });
}
