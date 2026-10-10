import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type {
  WalletWithdrawalResponse,
  WalletWithdrawalsResponse,
} from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { toWalletWithdrawal } from "@/lib/mobile-api/serializers";
import {
  invalidWalletRequest,
  readWalletBody,
  requireWalletDriver,
  walletError,
  type WalletRefusal,
} from "@/lib/mobile-api/wallet-api";
import { prisma } from "@/lib/prisma";
import { getWithdrawals } from "@/lib/wallet/driver-wallet";
import { readWalletBalances } from "@/lib/wallet/ledger";
import {
  MAX_REQUEST_KEY_LENGTH,
  isPositiveTetriAmount,
  parsePageSize,
  parseRequiredText,
} from "@/lib/wallet/rules";
import { requestWithdrawal } from "@/lib/wallet/withdrawals";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/wallet/withdrawals?cursor=&limit= — the driver's
 * withdrawals, newest first, each with its status and (once paid) the bank
 * reference. Cursor-paged like the activity list.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<WalletWithdrawalsResponse | WalletRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireWalletDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const params = new URL(request.url).searchParams;
  const page = await getWithdrawals(
    resolved.driver.driverProfileId,
    params.get("cursor"),
    parsePageSize(params.get("limit")),
  );

  if (page === null) {
    return invalidWalletRequest(t, t("errors.wallet.unknownCursor"));
  }

  return hubApiOk<WalletWithdrawalsResponse>({
    withdrawals: page.items.map(toWalletWithdrawal),
    nextCursor: page.nextCursor,
  });
}

/**
 * POST /api/dashboard/hub/wallet/withdrawals — request a withdrawal.
 *
 * Body: `{ amountTetri, requestKey, bankAccountId? }`. The amount is reserved
 * at once — it stops being available — and stays reserved until staff either
 * pay it by bank transfer (outside the system) and mark it `PAID`, or reject
 * it, which makes it available again. **The answer promises no arrival time
 * and charges no fee.**
 *
 * Refused, in this order, when: the wallet is frozen (a suspended account);
 * the amount is under the minimum; the account is missing or not verified;
 * the amount is more than is available. The check and the reservation are one
 * transaction under the wallet's lock, so simultaneous requests cannot
 * together reserve more than the balance.
 *
 * `requestKey` is **required** (400 `INVALID_REQUEST` without one). It is what
 * makes a retry — or a double tap — safe: the same key returns the first
 * withdrawal (200) instead of creating a second. While it was optional, a
 * client that left it out and sent the request twice reserved the amount
 * twice; each reservation was valid on its own, so nothing on the server could
 * tell the second from a deliberate second withdrawal. Requiring the key moves
 * that guarantee from "if the client remembers" to every request.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<WalletWithdrawalResponse | WalletRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireWalletDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const { driverProfileId } = resolved.driver;

  const read = await readWalletBody(request, t);
  if ("response" in read) {
    return read.response;
  }

  const { amountTetri, bankAccountId, requestKey } = read.fields;

  if (!isPositiveTetriAmount(amountTetri)) {
    return invalidWalletRequest(t, t("errors.wallet.amountMustBeWholeTetri"));
  }

  if (
    bankAccountId !== undefined &&
    bankAccountId !== null &&
    (typeof bankAccountId !== "string" || bankAccountId.trim() === "")
  ) {
    return invalidWalletRequest(
      t,
      t("errors.wallet.bankAccountIdMustBeString"),
    );
  }

  if (requestKey === undefined || requestKey === null) {
    return invalidWalletRequest(
      t,
      t("errors.wallet.requestKeyRequired", { max: MAX_REQUEST_KEY_LENGTH }),
    );
  }

  const parsedKey = parseRequiredText(requestKey, MAX_REQUEST_KEY_LENGTH);

  if (parsedKey === null) {
    return invalidWalletRequest(
      t,
      t("errors.wallet.requestKeyInvalid", { max: MAX_REQUEST_KEY_LENGTH }),
    );
  }

  const outcome = await requestWithdrawal({
    driverProfileId,
    amountTetri,
    bankAccountId: typeof bankAccountId === "string" ? bankAccountId : null,
    requestKey: parsedKey,
  });

  if (outcome.kind === "REFUSED") {
    return walletError(
      t,
      outcome.refusal,
      outcome.refusal === "INSUFFICIENT_FUNDS" ||
        outcome.refusal === "BELOW_MINIMUM"
        ? { availableTetri: outcome.availableTetri }
        : {},
    );
  }

  const balances = await readWalletBalances(prisma, driverProfileId);

  return NextResponse.json<WalletWithdrawalResponse>(
    {
      withdrawal: toWalletWithdrawal(outcome.withdrawal),
      balanceTetri: balances.balanceTetri,
      availableTetri: balances.availableTetri,
    },
    {
      status: outcome.kind === "CREATED" ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
