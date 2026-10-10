import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type {
  WalletBankAccountResponse,
  WalletBankAccountsResponse,
} from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { toWalletBankAccount } from "@/lib/mobile-api/serializers";
import {
  bankAccountsResponse,
  invalidWalletRequest,
  readWalletBody,
  requireWalletDriver,
  walletError,
  type WalletRefusal,
} from "@/lib/mobile-api/wallet-api";
import { addBankAccount } from "@/lib/wallet/bank-accounts";
import {
  GEORGIAN_BANKS,
  bankName,
  isGeorgianBank,
  validateGeorgianIban,
} from "@/lib/wallet/rules";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/wallet/bank-accounts — the driver's bank accounts,
 * oldest first, with the name every account must be in, the cap, and the
 * selectable banks.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<WalletBankAccountsResponse | WalletRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireWalletDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  return hubApiOk<WalletBankAccountsResponse>(
    await bankAccountsResponse(resolved.driver.driverProfileId),
  );
}

/**
 * POST /api/dashboard/hub/wallet/bank-accounts — add an account.
 *
 * Body: `{ bank, iban }`. The IBAN must be Georgian — `GE`, two check digits,
 * the bank's two-letter code, sixteen digits — pass the ISO mod-97 check, and
 * carry the selected bank's code. The holder is not in the body: it is the
 * driver's legal name from their profile, always.
 *
 * The account starts `PENDING`. **Nothing is transferred to it**: staff verify
 * it against the driver's reviewed identity, and only then can it receive a
 * withdrawal.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<WalletBankAccountResponse | WalletRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireWalletDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const read = await readWalletBody(request, t);
  if ("response" in read) {
    return read.response;
  }

  const { bank, iban } = read.fields;

  if (!isGeorgianBank(bank)) {
    return invalidWalletRequest(
      t,
      t("errors.wallet.bankMustBeOneOf", {
        banks: GEORGIAN_BANKS.map((entry) => entry.bank).join(", "),
      }),
    );
  }

  if (typeof iban !== "string") {
    return invalidWalletRequest(t, t("errors.wallet.ibanMustBeString"));
  }

  const validation = validateGeorgianIban(iban, bank);

  if (!validation.ok) {
    if (validation.refusal !== "IBAN_BANK_MISMATCH") {
      return walletError(t, validation.refusal);
    }

    const ibanBank = validation.ibanBank ?? null;

    return walletError(
      t,
      "IBAN_BANK_MISMATCH",
      { ibanBank },
      ibanBank === null
        ? t("errors.wallet.ibanBelongsToAnotherBank", { bank: bankName(bank) })
        : t("errors.wallet.ibanBankMismatch", {
            ibanBank: bankName(ibanBank),
            bank: bankName(bank),
          }),
    );
  }

  const outcome = await addBankAccount({
    driverProfileId: resolved.driver.driverProfileId,
    bank,
    iban: validation.iban,
  });

  if (outcome.kind === "REFUSED") {
    return walletError(t, outcome.refusal);
  }

  return NextResponse.json<WalletBankAccountResponse>(
    { account: toWalletBankAccount(outcome.account) },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
