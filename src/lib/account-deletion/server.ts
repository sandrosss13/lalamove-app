import "server-only";

import { OrderStatus, type Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import {
  ACTIVE_ORDER_STATUSES,
  accountDeletionRefusal,
  buildAnonymisedClientProfileData,
  buildAnonymisedUserData,
  type AccountDeletionFacts,
  type AccountDeletionRefusal,
} from "./rules";

/**
 * The I/O half of self-service account deletion. Every decision is made by
 * `./rules`; this module only reads the facts those rules need and writes what
 * they produce. See `./rules` for why deletion is a deactivate-and-anonymise
 * rather than a delete.
 */

/**
 * The client's balance in integer tetri. Always 0: no client balance exists in
 * the schema (see `AccountDeletionFacts.walletBalanceTetri`). A function rather
 * than an inline `0` so the eligibility read and the transaction below both go
 * through it, and introducing a client balance is a change in one place (it will
 * then take the transaction client and the user id).
 */
async function readClientWalletBalanceTetri(): Promise<number> {
  return 0;
}

async function readDeletionFacts(
  client: Prisma.TransactionClient,
  userId: string,
): Promise<AccountDeletionFacts> {
  const [activeOrderCount, walletBalanceTetri] = await Promise.all([
    client.order.count({
      where: { clientId: userId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
    }),
    readClientWalletBalanceTetri(),
  ]);

  return { activeOrderCount, walletBalanceTetri };
}

/**
 * Why this client may not delete their account right now, or `null`. What the
 * `/account` card reads to show the reason — and disable the button — before
 * the client tries; the transaction below re-checks under a lock regardless.
 */
export async function getAccountDeletionRefusal(
  userId: string,
): Promise<AccountDeletionRefusal | null> {
  return accountDeletionRefusal(await readDeletionFacts(prisma, userId));
}

export type DeactivateClientAccountOutcome =
  | { kind: "DEACTIVATED"; cancelledInitiatedOrders: number }
  | { kind: "REFUSED"; code: AccountDeletionRefusal }
  | { kind: "NOT_FOUND" }
  | { kind: "NOT_CLIENT" };

/**
 * Thrown inside the transaction to roll it back when the re-check refuses, so
 * the `INITIATED` cancellations made just before it are undone too.
 */
class DeletionRefused extends Error {
  constructor(readonly code: AccountDeletionRefusal) {
    super(code);
  }
}

/**
 * Close a client's account: cancel its unpaid orders, refuse if anything is
 * still in motion, then anonymise and lock it — all in one transaction.
 *
 * **Idempotent.** Every value written is derived from the user id (or is a
 * null), every delete is a `deleteMany` that matches nothing the second time,
 * and an existing `deactivatedAt` is kept rather than overwritten, so running
 * this twice on one account leaves the same rows as running it once.
 *
 * **Order of operations inside the transaction, and why:**
 *
 * 1. `FOR UPDATE` on the user row, so two concurrent deletions of the same
 *    account serialise instead of interleaving.
 * 2. Cancel `INITIATED` orders *before* counting active ones, with the same
 *    status-keyed `updateMany` the cancel route uses. That is what resolves a
 *    race with `POST /api/orders/[id]/pay`: whichever of the two transitions
 *    lands first wins, and if `pay` won, its now-`PENDING` order is counted
 *    below and the deletion is refused (and these cancellations rolled back).
 * 3. Re-check eligibility. The `/account` card already did, but its answer is
 *    from whenever the page was rendered.
 * 4. Anonymise and delete.
 *
 * **What is kept:** the `User` row (anonymised), the `ClientProfile` row
 * (anonymised), every `Order` with its `Payment`, items, photos and documents.
 * Per-order stop contacts (`pickupContactName`, `dropoffContactPhone`, …) are
 * deliberately not touched: they are the people at each end of the job, not
 * the client, and the driver's and company's records of the job need them.
 * An account order carries no copy of the client's own contact — the `guest*`
 * columns are null on every order with a `clientId` — so there is nothing on
 * the order to scrub.
 *
 * **What is deleted:** Better Auth `account` rows (the password hash lives
 * there), sessions and the device tokens hanging off them, verification rows
 * for the account's email, number or id, saved addresses and saved cards
 * (`Order.savedCardId` is `SetNull`, so past orders survive with the link
 * cleared). CRM survey responses are detached (`userId` → null) rather than
 * deleted, keeping the aggregate answers without the person.
 *
 * Sessions are deleted inside the transaction so the lockout is atomic with
 * the anonymisation; Better Auth's own `deleteUserSessions` is called again
 * after commit only because it also clears secondary storage, which this
 * deployment does not configure today — the same reasoning as the admin
 * suspend route.
 */
export async function deactivateClientAccount(
  userId: string,
): Promise<DeactivateClientAccountOutcome> {
  let outcome: DeactivateClientAccountOutcome;

  try {
    outcome = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "user" WHERE "id" = ${userId} FOR UPDATE`;

      if (locked.length === 0) {
        return { kind: "NOT_FOUND" } as const;
      }

      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          role: true,
          email: true,
          phoneNumber: true,
          deactivatedAt: true,
          clientProfile: { select: { phone: true } },
        },
      });

      if (user.role !== "CLIENT") {
        return { kind: "NOT_CLIENT" } as const;
      }

      const { count: cancelledInitiatedOrders } = await tx.order.updateMany({
        where: { clientId: userId, status: OrderStatus.INITIATED },
        data: { status: OrderStatus.CANCELLED },
      });

      const refusal = accountDeletionRefusal(
        await readDeletionFacts(tx, userId),
      );
      if (refusal) {
        throw new DeletionRefused(refusal);
      }

      const now = new Date();

      await tx.user.update({
        where: { id: userId },
        data: {
          ...buildAnonymisedUserData(userId, now),
          // Kept on a re-run, so the recorded time is when it was deleted.
          deactivatedAt: user.deactivatedAt ?? now,
        },
      });

      // `updateMany` because sign-up always creates a profile but the schema
      // does not guarantee one, and a missing profile is not a reason to fail.
      await tx.clientProfile.updateMany({
        where: { userId },
        data: buildAnonymisedClientProfileData(userId),
      });

      // Pending codes and reset tokens. Better Auth keys a phone OTP on the
      // bare number, prefixes email ones (`…-otp-<email>`), and stores a
      // password-reset token's user id as the value. The pre-anonymisation
      // identifiers are used — they are what those rows were written under.
      const identities = [
        user.email,
        user.phoneNumber,
        user.clientProfile?.phone,
      ].filter((value): value is string => Boolean(value));

      await tx.verification.deleteMany({
        where: {
          OR: [
            { value: userId },
            ...identities.flatMap((identity) => [
              { identifier: identity },
              { identifier: { endsWith: `-${identity}` } },
            ]),
          ],
        },
      });

      await tx.account.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.savedAddress.deleteMany({ where: { clientId: userId } });
      await tx.savedCard.deleteMany({ where: { clientId: userId } });
      await tx.crmSurveyResponse.updateMany({
        where: { userId },
        data: { userId: null },
      });

      return { kind: "DEACTIVATED", cancelledInitiatedOrders } as const;
    });
  } catch (error) {
    if (error instanceof DeletionRefused) {
      return { kind: "REFUSED", code: error.code };
    }
    throw error;
  }

  if (outcome.kind === "DEACTIVATED") {
    const authContext = await auth.$context;
    await authContext.internalAdapter.deleteUserSessions(userId);
  }

  return outcome;
}
