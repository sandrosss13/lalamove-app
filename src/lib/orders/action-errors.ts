// Builds `NextResponse`s, so it belongs to route handlers only.
import "server-only";

import { NextResponse } from "next/server";

import type { RequestTranslator } from "@/i18n/request-locale";
import {
  passwordChangeGateApplies,
  type PasswordChangeGateAudience,
} from "@/lib/mobile-api/access";
import type {
  OrderActionErrorCode,
  OrderActionErrorResponse,
} from "@/lib/mobile-api/contracts";

/**
 * A refusal in the shape the job-running routes answer with: the localised
 * prose every client has always received, plus a machine code the native app
 * branches on. Never cached — every one of these is about one driver's order.
 */
export function orderActionError(
  message: string,
  code: OrderActionErrorCode,
  status: number,
): NextResponse<OrderActionErrorResponse> {
  return NextResponse.json<OrderActionErrorResponse>(
    { error: message, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * The 403 for an account still on a company-issued temporary password, or
 * `null` when the account is clear to act.
 *
 * The hub's read routes (`requireHubApiAccount`), `GET /api/loads` and
 * `POST /api/loads/[id]/reject` have always refused such an account; the routes
 * that *act* on a job — accept, start, complete, proof of delivery, the two
 * location routes and the online toggle — did not, which left a way around the
 * gate for anyone holding the session: the board was hidden, but the jobs on it
 * could still be taken and run. A temporary password is one that whoever
 * relayed it has also seen, so the reset must come before anything is done in
 * the account's name, not merely before anything is read.
 *
 * Call it immediately after the session check and before any role test, the
 * order `hubApiDenialFor` documents: no account may sidestep the reset by being
 * refused for something else first.
 *
 * The web hub is unaffected: `requireDashboardSession()` already redirects a
 * flagged account to `/dashboard/change-password` before any hub page — and
 * therefore any control that calls these routes — can render.
 *
 * `audience` says whose flag counts, and defaults to every role — right for the
 * carrier-only routes above. A route another party also uses must pass
 * `"DRIVER_ONLY"`, or the gate over-reaches onto people it was never about:
 * see `PasswordChangeGateAudience`, which is where the rule is stated and
 * pinned by `tests/mobile-api-access.spec.ts`.
 */
export function passwordChangeRefusal(
  user: { role?: string | null; mustChangePassword?: boolean | null },
  t: RequestTranslator,
  audience: PasswordChangeGateAudience = "ANY_ROLE",
): NextResponse<OrderActionErrorResponse> | null {
  if (!passwordChangeGateApplies(user, audience)) {
    return null;
  }

  return orderActionError(
    t("errors.dashboardHubApi.changeYourTemporaryPasswordBeforeContinuing"),
    "PASSWORD_CHANGE_REQUIRED",
    403,
  );
}
