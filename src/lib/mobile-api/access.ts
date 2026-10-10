/**
 * Who may read the Driver Hub's JSON routes — the decision, with nothing else
 * attached.
 *
 * Deliberately free of runtime imports (no `server-only`, no Better Auth, no
 * Next) so `tests/mobile-api-access.spec.ts` can pin the rule without a server
 * or a database, the same arrangement `job-sheet-access.ts` has. The module
 * that reads the session and turns a denial into a response is
 * `./hub-api-guard`.
 */
import type { HubApiErrorCode } from "@/lib/mobile-api/contracts";

/** The slice of a Better Auth session user this rule reads. */
export type HubApiSessionUser = {
  role: string;
  mustChangePassword?: boolean | null;
};

/** A refusal: the HTTP status to answer with, and its machine-readable code. */
export type HubApiDenial = {
  status: 401 | 403;
  code: Extract<
    HubApiErrorCode,
    "UNAUTHENTICATED" | "PASSWORD_CHANGE_REQUIRED" | "ROLE_NOT_ALLOWED"
  >;
};

/**
 * The roles the hub's screens are for. Spelled as an allowlist rather than
 * "not CLIENT" — the page guard's rule — because a back-office role resolves to
 * no hub account anyway, and an allowlist is the rule that stays correct when a
 * role is added. `GET /api/loads` draws the same line.
 */
const HUB_API_ROLES: readonly string[] = ["DRIVER", "COMPANY"];

/**
 * Why this session may not read the hub, or `null` when it may.
 *
 * The order is the one `GET /api/loads` and `requireDashboardSession()` both
 * use, and it matters: the forced password change is checked **before** the
 * role, for every role, so no account can sidestep the reset by being refused
 * for something else first.
 *
 * A suspended account needs no branch here. Better Auth's `/get-session` hook
 * (`src/lib/auth.ts`) destroys a suspended user's session and returns `null`,
 * so suspension arrives as `user === null` and is answered `UNAUTHENTICATED`.
 */
export function hubApiDenialFor(
  user: HubApiSessionUser | null | undefined,
): HubApiDenial | null {
  if (!user) {
    return { status: 401, code: "UNAUTHENTICATED" };
  }

  if (user.mustChangePassword) {
    return { status: 403, code: "PASSWORD_CHANGE_REQUIRED" };
  }

  if (!HUB_API_ROLES.includes(user.role)) {
    return { status: 403, code: "ROLE_NOT_ALLOWED" };
  }

  return null;
}

/**
 * Whose forced password change a route's gate holds back.
 *
 * - `ANY_ROLE` — every account. Right for a route only a carrier can use
 *   anyway (accept, start, complete, proof of delivery, the driver's own
 *   location and online toggle): whoever is refused there would have been
 *   refused a moment later for their role or for not being the assigned
 *   driver, so checking the flag first costs nobody anything and lets no
 *   account sidestep the reset by being refused for something else.
 * - `DRIVER_ONLY` — only an account whose role is `DRIVER`. Required on a route
 *   **shared with another party**, where "every account" would lock out people
 *   the gate was never about. `GET /api/orders/[id]/location` is the one: the
 *   ordering client polls it for the tracking map, and the rule — "a driver on
 *   a temporary password does nothing in the account's name until it is
 *   changed" — says nothing about a client following their own delivery.
 */
export type PasswordChangeGateAudience = "ANY_ROLE" | "DRIVER_ONLY";

/**
 * Whether the forced-password-change gate holds this account back on a route
 * with the given audience. The route answers 403 `PASSWORD_CHANGE_REQUIRED`
 * when it does (`passwordChangeRefusal` in `src/lib/orders/action-errors.ts`).
 */
export function passwordChangeGateApplies(
  user: { role?: string | null; mustChangePassword?: boolean | null },
  audience: PasswordChangeGateAudience,
): boolean {
  if (!user.mustChangePassword) {
    return false;
  }

  return audience === "ANY_ROLE" || user.role === "DRIVER";
}
