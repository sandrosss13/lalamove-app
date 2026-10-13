import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { postWalletAdjustment } from "@/lib/wallet/ledger";
import {
  MAX_WALLET_REASON_LENGTH,
  parseRequiredText,
} from "@/lib/wallet/rules";

/**
 * Staff who may post a manual adjustment: **the super admin only.**
 *
 * Narrower than the rest of the wallet's back office on purpose. An adjustment
 * creates or removes balance with nothing but a reason behind it, and the
 * finance role is the one that pays withdrawals out of that balance — letting
 * one role do both would let it mint money and pay it to itself. Finance can
 * read every ledger and sees every adjustment in it; posting one takes the
 * other role.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN"];

/** Body this endpoint answers with, so the ledger view can update in place. */
export type AdminWalletAdjustmentResponse = {
  entryId: string;
  balanceTetri: number;
  reservedTetri: number;
  availableTetri: number;
};

/**
 * POST /api/admin/finance/wallets/[driverProfileId]/adjustments — post a
 * manual correction to a driver's ledger.
 *
 * Body: `{ amountTetri, reason }`. `amountTetri` is a non-zero whole number of
 * tetri, positive to credit and negative to debit; a debit may not exceed what
 * the driver has available (it would leave pending withdrawals unfunded).
 * `reason` is required, and the driver sees it verbatim on the entry.
 *
 * The entry and its audit row (`wallet.adjust`, with the balance before and
 * after) are one transaction — see `postWalletAdjustment`. A roster driver has
 * no wallet and cannot be adjusted.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ driverProfileId: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const t = await getRequestTranslations();
  const { driverProfileId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeAJson") },
      { status: 400 },
    );
  }

  const { amountTetri, reason } = rawBody as Record<string, unknown>;

  if (typeof amountTetri !== "number") {
    return NextResponse.json(
      { error: t("errors.adminWallet.adjustmentAmountInvalid") },
      { status: 400 },
    );
  }

  const parsedReason = parseRequiredText(reason, MAX_WALLET_REASON_LENGTH);

  if (parsedReason === null) {
    return NextResponse.json(
      {
        error: t("errors.adminWallet.reasonRequired", {
          max: MAX_WALLET_REASON_LENGTH,
        }),
      },
      { status: 400 },
    );
  }

  const outcome = await postWalletAdjustment({
    driverProfileId,
    amountTetri,
    reason: parsedReason,
    actorId: authorized.context.actorId,
  });

  if (outcome.kind === "NOT_FOUND") {
    return NextResponse.json(
      { error: t("errors.adminWallet.driverNotFound"), code: outcome.kind },
      { status: 404 },
    );
  }

  if (outcome.kind === "NO_WALLET") {
    return NextResponse.json(
      { error: t("errors.adminWallet.driverHasNoWallet"), code: outcome.kind },
      { status: 409 },
    );
  }

  if (outcome.kind === "REFUSED") {
    return outcome.refusal === "INVALID_AMOUNT"
      ? NextResponse.json(
          {
            error: t("errors.adminWallet.adjustmentAmountInvalid"),
            code: outcome.refusal,
          },
          { status: 400 },
        )
      : NextResponse.json(
          {
            error: t("errors.adminWallet.adjustmentExceedsAvailable"),
            code: outcome.refusal,
          },
          { status: 409 },
        );
  }

  const body: AdminWalletAdjustmentResponse = {
    entryId: outcome.entryId,
    balanceTetri: outcome.balances.balanceTetri,
    reservedTetri: outcome.balances.reservedTetri,
    availableTetri: outcome.balances.availableTetri,
  };

  return NextResponse.json(body, { status: 201 });
}
