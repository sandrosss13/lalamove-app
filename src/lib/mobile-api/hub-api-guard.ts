// Hard build-time boundary: this module reads the Better Auth session and
// resolves a hub account through Prisma. Mirrors `@/lib/dashboard/auth`.
import "server-only";

import { NextResponse } from "next/server";

import type { RequestTranslator } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { loadHubAccount, type HubAccount } from "@/lib/dashboard/hub/account";
import { hubApiDenialFor } from "@/lib/mobile-api/access";
import type {
  HubApiErrorCode,
  HubApiErrorResponse,
} from "@/lib/mobile-api/contracts";

/**
 * The message key each refusal is localised from. `PROFILE_MISSING` is absent
 * because its wording depends on the role and is chosen at the call site.
 */
const ERROR_MESSAGE_KEYS: Record<
  Exclude<HubApiErrorCode, "PROFILE_MISSING">,
  string
> = {
  UNAUTHENTICATED: "common.shared.unauthorized",
  PASSWORD_CHANGE_REQUIRED:
    "errors.dashboardHubApi.changeYourTemporaryPasswordBeforeContinuing",
  ROLE_NOT_ALLOWED:
    "errors.dashboardHubApi.onlyDriversAndLogisticsCompaniesCan",
  NOT_FOUND: "common.shared.orderNotFound",
};

/** What a hub JSON route has in hand once the guard lets it through. */
export type HubApiContext = {
  account: HubAccount;
  /** The session user's sign-in email, for the account screen. */
  email: string;
};

export type HubApiGuardResult =
  | ({ ok: true } & HubApiContext)
  | { ok: false; response: NextResponse<HubApiErrorResponse> };

/** A JSON refusal in the hub API's one error shape. Never cached. */
function errorResponse(
  message: string,
  code: HubApiErrorCode,
  status: number,
): NextResponse<HubApiErrorResponse> {
  return NextResponse.json<HubApiErrorResponse>(
    { error: message, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** The refusal for `code`, localised with the request's translator. */
export function hubApiError(
  t: RequestTranslator,
  code: Exclude<HubApiErrorCode, "PROFILE_MISSING">,
  status: number,
): NextResponse<HubApiErrorResponse> {
  return errorResponse(t(ERROR_MESSAGE_KEYS[code]), code, status);
}

/**
 * The 403 for an account whose driver/company profile row does not exist yet —
 * an interrupted sign-up. Worded per account type, as `GET /api/loads` does.
 */
export function hubApiProfileMissing(
  t: RequestTranslator,
  isCompany: boolean,
): NextResponse<HubApiErrorResponse> {
  return errorResponse(
    isCompany
      ? t("errors.loads.yourCompanyProfileIsnTSetUp")
      : t("common.shared.yourDriverProfileIsnTSet"),
    "PROFILE_MISSING",
    403,
  );
}

/**
 * The Driver Hub's session gate for JSON route handlers: the non-redirecting
 * counterpart of `requireDashboardSession()` + `resolveHubAccount()`.
 *
 * Those two `redirect()`, which is correct for a page and wrong for a `fetch()`
 * or a native client — a route handler turns it into a 307 to the HTML sign-in
 * page. This answers the same conditions as status codes instead:
 *
 * - no session, or a suspended account → 401 `UNAUTHENTICATED`
 * - a pending forced password change → 403 `PASSWORD_CHANGE_REQUIRED`
 * - any role but DRIVER / COMPANY → 403 `ROLE_NOT_ALLOWED`
 * - no driver/company profile row yet → 403 `PROFILE_MISSING`
 *
 * and nothing on its path can redirect: the session is read straight from
 * `auth.api.getSession` with the request's own headers (which is also what
 * carries the native app's replayed `Cookie`), and the account is loaded with
 * `loadHubAccount`, which takes the already-validated user rather than
 * re-entering the redirecting guard.
 *
 * The returned `account` is scoped to the session user and nothing else — no
 * route built on this accepts an account, user or company id from the request.
 */
export async function requireHubApiAccount(
  request: Request,
  t: RequestTranslator,
): Promise<HubApiGuardResult> {
  const session = await auth.api.getSession({ headers: request.headers });
  const denial = hubApiDenialFor(session?.user);

  if (denial !== null) {
    return { ok: false, response: hubApiError(t, denial.code, denial.status) };
  }

  // `hubApiDenialFor` returns a denial for a missing session, so this cannot
  // fire; it exists to narrow `session` for the compiler without an assertion.
  if (!session) {
    return { ok: false, response: hubApiError(t, "UNAUTHENTICATED", 401) };
  }

  const { id: userId, role, email } = session.user;
  const account = await loadHubAccount(userId, role);

  if (account === null) {
    return {
      ok: false,
      response: hubApiProfileMissing(t, role === "COMPANY"),
    };
  }

  return { ok: true, account, email };
}

/** A 200 in the hub API's shape. Never cached: every body is per-account. */
export function hubApiOk<T>(body: T): NextResponse<T> {
  return NextResponse.json<T>(body, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
