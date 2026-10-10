import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type {
  WalletBankAccountDeleteResponse,
  WalletBankAccountsResponse,
} from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import {
  bankAccountsResponse,
  invalidWalletRequest,
  readWalletBody,
  requireWalletDriver,
  walletError,
  type WalletRefusal,
} from "@/lib/mobile-api/wallet-api";
import {
  removeBankAccount,
  setDefaultBankAccount,
} from "@/lib/wallet/bank-accounts";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/dashboard/hub/wallet/bank-accounts/[id] — make this account the
 * default. Body: `{ isDefault: true }`, and nothing else is editable: an IBAN
 * is replaced by removing the account and adding another, and the holder is
 * the driver's legal name.
 *
 * Only a `VERIFIED` account can be the default. Answers with the full list.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<WalletBankAccountsResponse | WalletRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireWalletDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const read = await readWalletBody(request, t);
  if ("response" in read) {
    return read.response;
  }

  if (read.fields.isDefault !== true) {
    return invalidWalletRequest(t, t("errors.wallet.isDefaultMustBeTrue"));
  }

  const { driverProfileId } = resolved.driver;
  const { id } = await params;
  const outcome = await setDefaultBankAccount(driverProfileId, id);

  if (outcome.kind === "REFUSED") {
    return walletError(t, outcome.refusal);
  }

  return hubApiOk<WalletBankAccountsResponse>(
    await bankAccountsResponse(driverProfileId),
  );
}

/**
 * DELETE /api/dashboard/hub/wallet/bank-accounts/[id] — remove an account.
 *
 * Refused (409 `BANK_ACCOUNT_HAS_PENDING_WITHDRAWAL`) while a withdrawal is on
 * its way to it. Otherwise any account can go, the default included — the
 * oldest other verified account then becomes the default. Answers with the
 * remaining list.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<WalletBankAccountDeleteResponse | WalletRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireWalletDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const { driverProfileId } = resolved.driver;
  const { id } = await params;
  const outcome = await removeBankAccount(driverProfileId, id);

  if (outcome.kind === "REFUSED") {
    return walletError(t, outcome.refusal);
  }

  return hubApiOk<WalletBankAccountDeleteResponse>(
    await bankAccountsResponse(driverProfileId),
  );
}
