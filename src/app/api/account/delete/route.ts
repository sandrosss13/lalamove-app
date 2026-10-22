import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import {
  ACCOUNT_DELETION_REFUSAL,
  isAccountDeletionConfirmed,
  type AccountDeletionRefusal,
} from "@/lib/account-deletion/rules";
import { deactivateClientAccount } from "@/lib/account-deletion/server";
import { auth } from "@/lib/auth";

/** Catalog key for each refusal's message, shared with the `/account` card. */
const REFUSAL_MESSAGE_KEYS: Record<AccountDeletionRefusal, string> = {
  [ACCOUNT_DELETION_REFUSAL.ACTIVE_ORDERS]:
    "account.accountDeleteCard.blockedActiveOrders",
  [ACCOUNT_DELETION_REFUSAL.WALLET_BALANCE]:
    "account.accountDeleteCard.blockedWalletBalance",
};

/**
 * POST /api/account/delete — the signed-in client closes their own account.
 *
 * Body: `{ confirmation: string }`, the word the `/account` card asked them to
 * type (`ACCOUNT_DELETION_CONFIRMATION_WORDS`). Re-checked here so the
 * deliberate step cannot be skipped by calling the endpoint directly.
 *
 * Answers:
 * - 200 `{ deleted: true }` — anonymised and locked; every session is gone, so
 *   the caller's next request is signed out.
 * - 400 `{ code: "CONFIRMATION_REQUIRED" }` — missing or wrong word.
 * - 401 — no session.
 * - 403 `{ code: "NOT_CLIENT" }` — drivers, companies and staff. Their
 *   accounts carry fleets, rosters, wallets and back-office history that a
 *   self-service anonymisation would orphan; they are closed through support.
 * - 409 `{ code: "ACTIVE_ORDERS" | "WALLET_BALANCE" }` — see
 *   `accountDeletionRefusal`.
 *
 * What is anonymised, deleted and kept is documented on
 * `deactivateClientAccount`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  if (session.user.role !== "CLIENT") {
    return NextResponse.json(
      {
        error: t("account.accountDeleteCard.onlyClientsCanDelete"),
        code: "NOT_CLIENT",
      },
      { status: 403 },
    );
  }

  const rawBody: unknown = await request.json().catch(() => null);
  const confirmation =
    typeof rawBody === "object" && rawBody !== null
      ? (rawBody as Record<string, unknown>).confirmation
      : undefined;

  if (!isAccountDeletionConfirmed(confirmation)) {
    return NextResponse.json(
      {
        error: t("account.accountDeleteCard.confirmationMismatch"),
        code: "CONFIRMATION_REQUIRED",
      },
      { status: 400 },
    );
  }

  const outcome = await deactivateClientAccount(session.user.id);

  switch (outcome.kind) {
    case "DEACTIVATED":
      return NextResponse.json({ deleted: true }, { status: 200 });
    case "REFUSED":
      return NextResponse.json(
        { error: t(REFUSAL_MESSAGE_KEYS[outcome.code]), code: outcome.code },
        { status: 409 },
      );
    case "NOT_CLIENT":
      return NextResponse.json(
        {
          error: t("account.accountDeleteCard.onlyClientsCanDelete"),
          code: "NOT_CLIENT",
        },
        { status: 403 },
      );
    case "NOT_FOUND":
      // The session's own user vanished between the two reads — signed out
      // in every sense that matters.
      return NextResponse.json(
        { error: t("common.shared.unauthorized") },
        { status: 401 },
      );
  }
}
