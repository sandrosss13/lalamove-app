// Writes to the database through Prisma, so it can never be part of a browser
// bundle. Fails the build loudly if a client component ever imports it.
import "server-only";

import { PaymentMethodType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  creditWalletForOrder,
  type WalletCreditOutcome,
} from "@/lib/wallet/ledger";

/**
 * What `Payment.provider` says while no gateway exists (written by
 * `POST /api/orders/[id]/pay`). Never acceptable as a confirming gateway.
 */
const NO_GATEWAY_NAME = "none";

/** A gateway's statement that it holds the client's money for one order. */
export type GatewayConfirmation = {
  orderId: string;
  /** The gateway's stable name, e.g. `"tbc-pay"`. Never `"none"`. */
  gatewayName: string;
  /** The gateway's own id for the captured payment. */
  gatewayReference: string;
  /** When the gateway captured the funds; defaults to now. */
  confirmedAt?: Date;
};

export type GatewayConfirmationOutcome =
  | {
      kind: "CONFIRMED";
      /** True when this exact confirmation had been recorded before. */
      alreadyConfirmed: boolean;
      /** What the wallet did with the job — see `creditWalletForOrder`. */
      credit: WalletCreditOutcome;
    }
  | {
      kind: "REFUSED";
      reason:
        /** `gatewayName` is empty or `"none"`, or the reference is empty. */
        | "INVALID_GATEWAY"
        /** The order has no `Payment` row: the client never checked out. */
        | "PAYMENT_NOT_FOUND"
        /** A cash job: no gateway takes its money, and it never credits. */
        | "CASH_PAYMENT"
        /** Already confirmed by a different gateway payment. */
        | "CONFLICTING_CONFIRMATION"
        /** This gateway payment already confirmed another order. */
        | "REFERENCE_ALREADY_USED";
    };

/**
 * Records that a payment gateway has **confirmed receipt of the client's
 * funds** for an order — the second half of the settlement seam
 * (`./payment-settlement`, which re-exports it), and the only writer of
 * `Payment.gatewayConfirmedAt`.
 *
 * **No gateway is integrated, so nothing in the application calls this**; the
 * one caller today is the local-only `scripts/simulate-gateway-payment.ts`.
 * When a provider is chosen, its verified webhook (or the capture call's
 * success path) calls this once the money is captured, and that is the whole
 * integration as far as driver wallets are concerned: this function then asks
 * `creditWalletForOrder` to credit the job, which it does if the order is
 * already `COMPLETED` — and if it is not yet, `POST /api/orders/[id]/complete`
 * asks the same function later. Whichever happens second credits.
 *
 * It is deliberately separate from `Payment.status`. `PAID` is written at
 * checkout for a card with no charge behind it and `provider` says `"none"`;
 * neither is evidence of money, and neither is read as such anywhere. The
 * caller is responsible for having authenticated the gateway (a signed
 * webhook) — this function trusts its arguments.
 *
 * Safe to call more than once: the write is conditional on the payment not
 * being confirmed yet, a repeat of the same confirmation is a success, and the
 * crediting it triggers is idempotent. A *different* confirmation for an
 * already-confirmed payment is refused rather than overwriting the first.
 */
export async function confirmGatewayPayment(
  confirmation: GatewayConfirmation,
): Promise<GatewayConfirmationOutcome> {
  const { orderId } = confirmation;
  const gatewayName = confirmation.gatewayName.trim();
  const gatewayReference = confirmation.gatewayReference.trim();

  if (
    gatewayName === "" ||
    gatewayName.toLowerCase() === NO_GATEWAY_NAME ||
    gatewayReference === ""
  ) {
    return { kind: "REFUSED", reason: "INVALID_GATEWAY" };
  }

  const payment = await prisma.payment.findUnique({
    where: { orderId },
    select: { order: { select: { paymentMethodType: true } } },
  });

  if (payment === null) {
    return { kind: "REFUSED", reason: "PAYMENT_NOT_FOUND" };
  }

  if (payment.order.paymentMethodType === PaymentMethodType.CASH) {
    return { kind: "REFUSED", reason: "CASH_PAYMENT" };
  }

  let newlyConfirmed: boolean;
  try {
    const { count } = await prisma.payment.updateMany({
      where: { orderId, gatewayConfirmedAt: null },
      data: {
        gatewayConfirmedAt: confirmation.confirmedAt ?? new Date(),
        gatewayName,
        gatewayReference,
      },
    });
    newlyConfirmed = count > 0;
  } catch (error) {
    // The `(gatewayName, gatewayReference)` unique index: this captured
    // payment is already attached to a different order.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { kind: "REFUSED", reason: "REFERENCE_ALREADY_USED" };
    }

    throw error;
  }

  if (!newlyConfirmed) {
    const existing = await prisma.payment.findUnique({
      where: { orderId },
      select: { gatewayName: true, gatewayReference: true },
    });

    if (
      existing?.gatewayName !== gatewayName ||
      existing.gatewayReference !== gatewayReference
    ) {
      return { kind: "REFUSED", reason: "CONFLICTING_CONFIRMATION" };
    }
  }

  // Not swallowed: a gateway webhook that fails here should be retried, and a
  // retry is safe — the confirmation above is recorded once, the credit once.
  const credit = await creditWalletForOrder(orderId);

  return { kind: "CONFIRMED", alreadyConfirmed: !newlyConfirmed, credit };
}
