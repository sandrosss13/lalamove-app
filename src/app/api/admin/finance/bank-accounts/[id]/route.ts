import { NextResponse } from "next/server";

import type { AdminRole, BankAccountStatus } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import {
  reviewBankAccount,
  type BankAccountReview,
  type BankAccountReviewOutcome,
} from "@/lib/wallet/bank-accounts";
import {
  MAX_WALLET_REASON_LENGTH,
  parseRequiredText,
} from "@/lib/wallet/rules";

/** See `../route.ts` for why these two. */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/** Body this endpoint answers with, so the queue can update in place. */
export type AdminBankAccountReviewResponse = {
  accountId: string;
  status: BankAccountStatus;
  isDefault: boolean;
};

type Refusal = (BankAccountReviewOutcome & { kind: "REFUSED" })["refusal"];

/** The status and message key of each refusal. */
const REFUSALS: Record<Refusal, { status: number; messageKey: string }> = {
  NOT_FOUND: {
    status: 404,
    messageKey: "errors.adminWallet.bankAccountNotFound",
  },
  REMOVED: {
    status: 409,
    messageKey: "errors.adminWallet.bankAccountRemoved",
  },
  ALREADY_IN_STATE: {
    status: 409,
    messageKey: "errors.adminWallet.bankAccountAlreadyInState",
  },
  NO_WALLET: {
    status: 409,
    messageKey: "errors.adminWallet.driverHasNoWallet",
  },
  IDENTITY_NOT_REVIEWED: {
    status: 409,
    messageKey: "errors.adminWallet.identityNotReviewed",
  },
  HAS_PENDING_WITHDRAWAL: {
    status: 409,
    messageKey: "errors.adminWallet.bankAccountHasPendingWithdrawal",
  },
};

/**
 * PATCH /api/admin/finance/bank-accounts/[id] — the reviewer's verdict.
 *
 * Body: `{ action: "verify" }` or `{ action: "reject", reason }`. The reason
 * is required and shown to the driver verbatim.
 *
 * Verifying means the reviewer has compared the IBAN's holder with the
 * driver's reviewed identity — no test transfer is made. It needs an
 * activated, independent driver. A driver's first verified account becomes
 * their default. An account with a pending withdrawal cannot be rejected.
 *
 * The verdict and its audit row (`bank_account.verify` / `.reject`) are one
 * transaction — see `reviewBankAccount`.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const t = await getRequestTranslations();
  const { id } = await params;

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

  const { action, reason } = rawBody as Record<string, unknown>;
  let review: BankAccountReview;

  if (action === "verify") {
    review = { action };
  } else if (action === "reject") {
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

    review = { action, reason: parsedReason };
  } else {
    return NextResponse.json(
      { error: t("errors.adminWallet.bankAccountActionInvalid") },
      { status: 400 },
    );
  }

  const outcome = await reviewBankAccount(
    id,
    review,
    authorized.context.actorId,
  );

  if (outcome.kind === "REFUSED") {
    const { status, messageKey } = REFUSALS[outcome.refusal];

    return NextResponse.json(
      { error: t(messageKey), code: outcome.refusal },
      { status },
    );
  }

  const body: AdminBankAccountReviewResponse = {
    accountId: id,
    status: outcome.status,
    isDefault: outcome.isDefault,
  };

  return NextResponse.json(body, { status: 200 });
}
