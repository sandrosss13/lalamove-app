// Builds `NextResponse`s and reads the session; route handlers only.
import "server-only";

import { NextResponse } from "next/server";

import type { RequestTranslator } from "@/i18n/request-locale";
import type {
  HubApiErrorResponse,
  WalletBankAccountsResponse,
  WalletErrorCode,
  WalletErrorResponse,
} from "@/lib/mobile-api/contracts";
import { requireHubApiAccount } from "@/lib/mobile-api/hub-api-guard";
import { toWalletBankAccount } from "@/lib/mobile-api/serializers";
import { listBankAccounts } from "@/lib/wallet/bank-accounts";
import { getAccountHolderName } from "@/lib/wallet/driver-wallet";
import {
  GEORGIAN_BANKS,
  MAX_BANK_ACCOUNTS_PER_DRIVER,
  MIN_WITHDRAWAL_TETRI,
} from "@/lib/wallet/rules";

/*
 * What the driver wallet routes share: one error shape, one gate, one way of
 * reading a body, and the bank-accounts list three of them answer with.
 */

/** Any refusal a wallet route can answer with. */
export type WalletRefusal = WalletErrorResponse | HubApiErrorResponse;

/** The codes a wallet route produces itself (the guard produces the rest). */
type OwnWalletErrorCode = Exclude<
  WalletErrorCode,
  | "UNAUTHENTICATED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "PROFILE_MISSING"
  | "NOT_FOUND"
>;

/** The HTTP status and message key of each refusal. */
const WALLET_ERRORS: Record<
  OwnWalletErrorCode,
  { status: number; messageKey: string }
> = {
  ROLE_NOT_ALLOWED: {
    status: 403,
    messageKey: "errors.wallet.onlyDriversHaveAWallet",
  },
  WALLET_NOT_AVAILABLE: {
    status: 403,
    messageKey: "errors.wallet.notAvailableForRosterDrivers",
  },
  WALLET_FROZEN: { status: 403, messageKey: "errors.wallet.frozen" },
  INVALID_REQUEST: {
    status: 400,
    messageKey: "common.shared.requestBodyMustBeAJson",
  },
  BELOW_MINIMUM: { status: 400, messageKey: "errors.wallet.belowMinimum" },
  INSUFFICIENT_FUNDS: {
    status: 409,
    messageKey: "errors.wallet.insufficientFunds",
  },
  NO_VERIFIED_BANK_ACCOUNT: {
    status: 409,
    messageKey: "errors.wallet.noVerifiedBankAccount",
  },
  BANK_ACCOUNT_NOT_FOUND: {
    status: 404,
    messageKey: "errors.wallet.bankAccountNotFound",
  },
  BANK_ACCOUNT_NOT_VERIFIED: {
    status: 409,
    messageKey: "errors.wallet.bankAccountNotVerified",
  },
  IBAN_INVALID_FORMAT: {
    status: 400,
    messageKey: "errors.wallet.ibanInvalidFormat",
  },
  IBAN_CHECKSUM_INVALID: {
    status: 400,
    messageKey: "errors.wallet.ibanChecksumInvalid",
  },
  IBAN_BANK_MISMATCH: {
    status: 400,
    messageKey: "errors.wallet.ibanBankMismatch",
  },
  BANK_ACCOUNT_DUPLICATE: {
    status: 409,
    messageKey: "errors.wallet.bankAccountDuplicate",
  },
  BANK_ACCOUNT_LIMIT_REACHED: {
    status: 409,
    messageKey: "errors.wallet.bankAccountLimitReached",
  },
  LEGAL_NAME_MISSING: {
    status: 409,
    messageKey: "errors.wallet.legalNameMissing",
  },
  BANK_ACCOUNT_HAS_PENDING_WITHDRAWAL: {
    status: 409,
    messageKey: "errors.wallet.bankAccountHasPendingWithdrawal",
  },
};

/** ₾ with two decimals, for a message: 1000 → "10.00". */
function lari(tetri: number): string {
  return (tetri / 100).toFixed(2);
}

/**
 * The refusal for `code`, with its fixed status and localised message. `extra`
 * carries the two machine-readable details some refusals have; `message`
 * overrides the wording for the validation errors that name a field.
 */
export function walletError(
  t: RequestTranslator,
  code: OwnWalletErrorCode,
  extra: Pick<WalletErrorResponse, "ibanBank" | "availableTetri"> = {},
  message?: string,
): NextResponse<WalletErrorResponse> {
  const { status, messageKey } = WALLET_ERRORS[code];

  return NextResponse.json<WalletErrorResponse>(
    {
      error:
        message ??
        t(messageKey, {
          minimum: lari(MIN_WITHDRAWAL_TETRI),
          limit: MAX_BANK_ACCOUNTS_PER_DRIVER,
        }),
      code,
      ...extra,
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** A 400 `INVALID_REQUEST` with `message`. */
export function invalidWalletRequest(
  t: RequestTranslator,
  message: string,
): NextResponse<WalletErrorResponse> {
  return walletError(t, "INVALID_REQUEST", {}, message);
}

/** The driver a wallet route is acting for. */
export type WalletDriver = { userId: string; driverProfileId: string };

/**
 * The wallet routes' gate: the hub's own (`requireHubApiAccount` — session,
 * suspension, forced password change, role, profile) narrowed to an
 * **independent** driver.
 *
 * - A logistics company has no driver profile → 403 `ROLE_NOT_ALLOWED`.
 * - A roster driver's jobs are owed to their company, so they have no wallet
 *   → 403 `WALLET_NOT_AVAILABLE`, on every route, reads included.
 *
 * The driver is the session's, always: no wallet route takes a driver or
 * profile id from the request.
 */
export async function requireWalletDriver(
  request: Request,
  t: RequestTranslator,
): Promise<
  { driver: WalletDriver } | { response: NextResponse<WalletRefusal> }
> {
  const guard = await requireHubApiAccount(request, t);

  if (!guard.ok) {
    return { response: guard.response };
  }

  const { userId, driverProfileId, persona } = guard.account;

  if (driverProfileId === null) {
    return { response: walletError(t, "ROLE_NOT_ALLOWED") };
  }

  if (persona !== "INDEPENDENT") {
    return { response: walletError(t, "WALLET_NOT_AVAILABLE") };
  }

  return { driver: { userId, driverProfileId } };
}

/**
 * The request body as a JSON object, or the 400 for one that is not: invalid
 * JSON, `null`, an array or a scalar.
 */
export async function readWalletBody(
  request: Request,
  t: RequestTranslator,
): Promise<
  | { fields: Record<string, unknown> }
  | { response: NextResponse<WalletErrorResponse> }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      response: invalidWalletRequest(
        t,
        t("common.shared.requestBodyMustBeValidJson"),
      ),
    };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      response: invalidWalletRequest(
        t,
        t("common.shared.requestBodyMustBeAJson"),
      ),
    };
  }

  return { fields: body as Record<string, unknown> };
}

/** The body of every bank-accounts answer that returns the list. */
export async function bankAccountsResponse(
  driverProfileId: string,
): Promise<WalletBankAccountsResponse> {
  const [accounts, accountHolderName] = await Promise.all([
    listBankAccounts(driverProfileId),
    getAccountHolderName(driverProfileId),
  ]);

  return {
    accounts: accounts.map(toWalletBankAccount),
    accountHolderName,
    limit: MAX_BANK_ACCOUNTS_PER_DRIVER,
    banks: GEORGIAN_BANKS.map((entry) => ({
      bank: entry.bank,
      bankName: entry.name,
      ibanCode: entry.ibanCode,
    })),
  };
}
