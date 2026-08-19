// Hard build-time boundary, not decoration. `hasAdminRole` was split out into
// `./roles` precisely so the client-side admin shell could import it without
// dragging Better Auth and Prisma into the browser bundle — but this module
// re-exports it below, making `@/lib/admin/auth` the more natural-looking
// import path of the two. Without this, a future client component reaching for
// it here would fail confusingly (or silently survive on tree-shaking); with
// it, Next fails the build with its explicit "server-only" error instead.
import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";

import type { SystemUserProfile } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Where every failed back-office authorization check lands. A single constant
 * so the guard below and any later redirect (e.g. after sign-out) can never
 * drift apart.
 */
export const ADMIN_SIGN_IN_PATH = "/admin/sign-in";

/**
 * Where a staff member still holding the temporary password their `SUPER_ADMIN`
 * relayed to them out-of-band is sent, until they replace it.
 *
 * Like the sign-in page, this route deliberately lives *outside*
 * `src/app/admin/layout.tsx` (under the `(admin-sign-in)` route group) — the
 * layout is what redirects here, so a page inside its subtree would loop. Kept
 * next to `ADMIN_SIGN_IN_PATH` for the same reason that one is a constant: the
 * guard that redirects here and the page that lives here must not drift.
 */
export const ADMIN_CHANGE_PASSWORD_PATH = "/admin/change-password";

/** What `requireSystemUser()` hands back to an authorized caller. */
export type SystemUserContext = {
  /**
   * The Better Auth session, non-null and known to belong to an `ADMIN` user.
   * Typed off `auth.api.getSession` so the custom `role` /
   * `mustChangePassword` fields stay in sync with `src/lib/auth.ts`.
   */
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  /** The staff member's active back-office profile, carrying `adminRole`. */
  systemUserProfile: SystemUserProfile;
};

/**
 * The back office's single authorization gate, called by
 * `src/app/admin/layout.tsx` (and by admin API routes, which get no layout).
 *
 * Three conditions must all hold, and every failure produces the *same*
 * redirect to `/admin/sign-in` — a signed-out visitor, a signed-in client, and
 * a deactivated staff member are deliberately indistinguishable from the
 * outside, so `/admin` never confirms that a given account exists or that it
 * once had access:
 *
 * 1. There is a session.
 * 2. `session.user.role === "ADMIN"` — the coarse gate. Checked before hitting
 *    the database so the common case (a signed-in CLIENT wandering into
 *    `/admin`) costs no query.
 * 3. An existing `SystemUserProfile` with `isActive`. This is the fine gate and
 *    the revocation path: a `SUPER_ADMIN` flips `isActive` to `false` to cut
 *    off access immediately without deleting the underlying auth rows, so the
 *    profile has to be re-read per request rather than trusted from the
 *    session (which would keep a revoked staff member signed in until their
 *    token expired).
 *
 * `redirect()` throws, so every early exit is `never` and the returned context
 * is non-null by construction.
 *
 * Wrapped in React's `cache()` because the guard is intentionally called at
 * several levels of the same render — the root `/admin` layout, then
 * `AdminSectionLayout` beneath it, then leaf pages that need the profile — and
 * each bare call costs a session validation plus a `systemUserProfile` query.
 * `cache()` dedupes those to one within a single request's render pass; it is
 * per-request memoization, never a cross-request or cross-user cache, so a
 * `SUPER_ADMIN` deactivating someone still takes effect on that staff member's
 * very next request, which is what the per-request re-read exists for.
 */
export const requireSystemUser = cache(async (): Promise<SystemUserContext> => {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.role !== "ADMIN") {
    redirect(ADMIN_SIGN_IN_PATH);
  }

  const systemUserProfile = await prisma.systemUserProfile.findUnique({
    where: { userId: session.user.id },
  });

  if (!systemUserProfile || !systemUserProfile.isActive) {
    redirect(ADMIN_SIGN_IN_PATH);
  }

  return { session, systemUserProfile };
});

/**
 * Re-exported so server-side callers have one import for both halves of the
 * guard (`requireSystemUser` then `hasAdminRole`). The implementation lives in
 * `./roles` because the admin shell needs it client-side too, and this module
 * can never be imported from the browser — see that file's doc comment.
 */
export { hasAdminRole } from "@/lib/admin/roles";
