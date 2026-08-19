// Same reason as `./auth`: this pulls in Better Auth and Prisma, so it must
// never end up in a browser bundle.
import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import type { AdminRole, SystemUserProfile } from "@prisma/client";

import { hasAdminRole } from "@/lib/admin/roles";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** What an authorized admin API request gets to work with. */
export type AdminApiContext = {
  /**
   * `User.id` of the signed-in staff member — i.e. the `actorId` every
   * `writeAuditLog()` call in an admin route has to pass.
   */
  actorId: string;
  /** The staff member's active back-office profile, carrying `adminRole`. */
  systemUserProfile: SystemUserProfile;
};

/** Either an authorized caller, or the response to return instead. */
export type AdminApiAuthorization =
  | { ok: true; context: AdminApiContext }
  | { ok: false; response: NextResponse };

/**
 * `requireSystemUser()` for route handlers.
 *
 * It cannot simply call that guard: `requireSystemUser()` answers every failure
 * with `redirect()`, which throws Next's rendering control-flow error and turns
 * into a 307 pointing at an HTML sign-in page. A `fetch()` from the admin UI
 * would then either follow it and try to parse HTML as JSON, or surface a
 * nonsense error — so API routes need the same checks with a `NextResponse`
 * ending. The checks themselves are deliberately identical (session → `ADMIN`
 * role → existing *active* `SystemUserProfile`, re-read per request so a
 * deactivation takes effect immediately), plus the per-route `adminRole` gate
 * the pages apply separately via `hasAdminRole`.
 *
 * Returned rather than thrown so the caller's `return` keeps the route's
 * happy path linear and its type non-null:
 *
 * ```ts
 * const authorized = await authorizeAdminApi(["SUPER_ADMIN", "USER_MANAGER"]);
 * if (!authorized.ok) return authorized.response;
 * ```
 *
 * Both failure modes stay vague on purpose ("Unauthorized." / "Forbidden."):
 * an admin endpoint should not explain to an unauthorized caller which of the
 * conditions they failed.
 */
export async function authorizeAdminApi(
  allowedRoles: readonly AdminRole[],
): Promise<AdminApiAuthorization> {
  const session = await auth.api.getSession({ headers: await headers() });

  // Coarse gate first, so a signed-in customer poking at an admin endpoint
  // costs no database query.
  if (!session || session.user.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const systemUserProfile = await prisma.systemUserProfile.findUnique({
    where: { userId: session.user.id },
  });

  if (!systemUserProfile || !systemUserProfile.isActive) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  if (!hasAdminRole(systemUserProfile, allowedRoles)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return {
    ok: true,
    context: { actorId: session.user.id, systemUserProfile },
  };
}
