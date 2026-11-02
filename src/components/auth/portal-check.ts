/**
 * The checks a freshly signed-in session has to pass before the sign-in form
 * lets it through — shared by the email and the phone path, so a phone code
 * can never open a portal a password could not.
 *
 * Both checks necessarily run *after* the session exists: checking beforehand
 * would need an email → role (or number → role) lookup, which is an account
 * enumeration oracle. A rejected session is signed straight back out here, so
 * no caller can forget to, and `src/lib/auth.ts` enforces the same boundary
 * server-side as a backstop.
 */

import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/account-types";
import type { FlowRole } from "@/lib/auth-flow";
import { authClient, signOut } from "@/lib/auth-client";

import type { PortalRole } from "./phone-auth-flow";

/** Every value the schema's `UserRole` can hold. ADMIN has no portal here. */
export type SessionRole = PortalRole | "ADMIN";

/** True when `value` is one of the known account types. */
function isAccountType(value: unknown): value is AccountType {
  return typeof value === "string" && value in ACCOUNT_TYPE_LABELS;
}

/** The profile route that answers for the signed-in account of each role. */
const PROFILE_ENDPOINTS: Record<PortalRole, string> = {
  CLIENT: "/api/client-profile",
  DRIVER: "/api/driver-profile",
  COMPANY: "/api/logistics-company",
};

/**
 * The signed-in account's own profile row, `null` when it has none, or
 * `undefined` when that cannot be determined (the request failed, or the body
 * is not JSON). All three routes answer for the *signed-in* user only, so the
 * session cookie — sent by default on same-origin requests — is the whole
 * input, and each returns the row or a bare `null`.
 */
export async function fetchOwnProfile(
  role: PortalRole,
): Promise<Record<string, unknown> | null | undefined> {
  const response = await fetch(PROFILE_ENDPOINTS[role]).catch(() => null);
  if (!response?.ok) {
    return undefined;
  }

  const body = (await response.json().catch(() => undefined)) as unknown;
  if (body === null) {
    return null;
  }

  return typeof body === "object"
    ? (body as Record<string, unknown>)
    : undefined;
}

/**
 * Reads the account type stored on the signed-in account's own profile, or
 * `null` when it cannot be determined.
 *
 * `null` covers every unverifiable case — the request failed, the profile row
 * doesn't exist yet (a registration interrupted between account creation and
 * the profile write), or the body isn't shaped as expected — and callers must
 * treat it as "don't block". This lookup is a secondary safety net on top of
 * the role check, so an incomplete profile has to fail open rather than lock a
 * legitimate account out of a portal it belongs to.
 *
 * Only the two card roles have an account type to ask about. A
 * `LogisticsCompany` has no account-type column, so a company session is never
 * passed here — the parameter type says so, and the caller skips the check.
 */
async function fetchStoredAccountType(
  sessionRole: FlowRole,
): Promise<AccountType | null> {
  const profile = await fetchOwnProfile(sessionRole);
  return isAccountType(profile?.accountType) ? profile.accountType : null;
}

/** The session's actual role, as `getSession` reports it right now. */
export async function readSessionRole(): Promise<SessionRole | undefined> {
  // `getSession` returns the custom `role` field, typed via
  // `inferAdditionalFields` in auth-client.
  const { data: session } = await authClient.getSession();
  return session?.user.role as SessionRole | undefined;
}

export type PortalCheckResult =
  | { ok: true }
  | { ok: false; reason: "role"; actualRole: SessionRole }
  | { ok: false; reason: "accountType"; storedAccountType: AccountType };

/**
 * Whether the session just created belongs in the portal the two picks
 * resolved to. On `ok: false` the session has already been signed out; the
 * caller only has to say why.
 *
 * 1. Role. The resolved portal is the only role allowed through, on every
 *    host — a driver can't sign in through the client portal, a company can't
 *    sign in through the individual-driver one, and an admin account can't
 *    sign in here at all.
 * 2. Account type. For a client or driver its profile endpoint is the
 *    authority on which account type was chosen at registration; compare that
 *    against the step-2 pick so a business account can't be signed into
 *    through the Individual card. A company is skipped entirely:
 *    `LogisticsCompany` has no account-type column, so the role check is the
 *    whole gate, and asking `/api/driver-profile` on its behalf could only
 *    ever 403. An unknowable stored type (`null`) never blocks.
 */
export async function checkSignedInPortal(
  resolvedRole: PortalRole,
  pickedRole: FlowRole,
  pickedAccountType: AccountType,
): Promise<PortalCheckResult> {
  const actualRole = await readSessionRole();

  if (actualRole && actualRole !== resolvedRole) {
    // Wrong portal: undo the session so the user isn't left signed in.
    await signOut();
    return { ok: false, reason: "role", actualRole };
  }

  const storedAccountType =
    resolvedRole === "COMPANY"
      ? null
      : await fetchStoredAccountType(pickedRole);

  if (storedAccountType !== null && storedAccountType !== pickedAccountType) {
    // Same treatment as a role mismatch: no half-accepted session left behind.
    await signOut();
    return { ok: false, reason: "accountType", storedAccountType };
  }

  return { ok: true };
}
