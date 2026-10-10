import { NextResponse } from "next/server";

import type { AdminRole, WithdrawalStatus } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import {
  MAX_BANK_REFERENCE_LENGTH,
  MAX_WALLET_REASON_LENGTH,
  parseRequiredText,
} from "@/lib/wallet/rules";
import {
  decideWithdrawal,
  type WithdrawalDecision,
} from "@/lib/wallet/withdrawals";

/** See `../route.ts` for why these two. */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/** Body this endpoint answers with, so the queue can update in place. */
export type AdminWithdrawalDecisionResponse = {
  withdrawalId: string;
  status: WithdrawalStatus;
  decidedAt: string;
};

/**
 * PATCH /api/admin/finance/withdrawals/[id] — record what happened to a
 * withdrawal.
 *
 * - `{ action: "pay", bankReference }` — the transfer was made (outside this
 *   system); `PENDING` → `PAID`, and the amount is debited from the ledger.
 * - `{ action: "reject", reason }` — it will not be paid; `PENDING` →
 *   `REJECTED`, and the reserved amount is available to the driver again. The
 *   reason is shown to the driver verbatim.
 * - `{ action: "reverse", reason }` — a paid transfer came back from the bank;
 *   `PAID` → `REVERSED`, and the amount is credited back to the ledger.
 *
 * Nothing here moves money: it records a transfer a person made. A withdrawal
 * not in the state the action needs is a 409, so two staff members acting on
 * one request produce one result. The change, its ledger entry and its audit
 * row (`withdrawal.pay` / `.reject` / `.reverse`) are one transaction — see
 * `decideWithdrawal`.
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

  const { action, bankReference, reason } = rawBody as Record<string, unknown>;
  let decision: WithdrawalDecision;

  if (action === "pay") {
    const reference = parseRequiredText(
      bankReference,
      MAX_BANK_REFERENCE_LENGTH,
    );

    if (reference === null) {
      return NextResponse.json(
        {
          error: t("errors.adminWallet.bankReferenceRequired", {
            max: MAX_BANK_REFERENCE_LENGTH,
          }),
        },
        { status: 400 },
      );
    }

    decision = { action, bankReference: reference };
  } else if (action === "reject" || action === "reverse") {
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

    decision = { action, reason: parsedReason };
  } else {
    return NextResponse.json(
      { error: t("errors.adminWallet.withdrawalActionInvalid") },
      { status: 400 },
    );
  }

  const outcome = await decideWithdrawal(
    id,
    decision,
    authorized.context.actorId,
  );

  if (outcome.kind === "NOT_FOUND") {
    return NextResponse.json(
      { error: t("errors.adminWallet.withdrawalNotFound"), code: outcome.kind },
      { status: 404 },
    );
  }

  if (outcome.kind === "INVALID_STATE") {
    return NextResponse.json(
      {
        error: t("errors.adminWallet.withdrawalAlreadyDecided"),
        code: outcome.kind,
        status: outcome.status,
      },
      { status: 409 },
    );
  }

  if (outcome.kind === "BALANCE_TOO_LOW") {
    return NextResponse.json(
      { error: t("errors.adminWallet.balanceTooLow"), code: outcome.kind },
      { status: 409 },
    );
  }

  const body: AdminWithdrawalDecisionResponse = {
    withdrawalId: id,
    status: outcome.status,
    decidedAt: outcome.decidedAt,
  };

  return NextResponse.json(body, { status: 200 });
}
