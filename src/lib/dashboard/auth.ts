// Hard build-time boundary, not decoration: this module pulls in Better Auth
// and `next/headers`, neither of which belongs in a browser bundle. Mirrors
// `@/lib/admin/auth`, whose doc comment explains the same choice at length.
import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

/** Where a signed-out visitor to any `/dashboard` route is sent. */
export const DASHBOARD_SIGN_IN_PATH = "/sign-in";

/** Where a user still holding a company-issued temporary password is sent. */
export const DASHBOARD_CHANGE_PASSWORD_PATH = "/change-password";

/** Where a CLIENT who wanders into the provider-side dashboard is sent. */
export const CLIENT_HOME_PATH = "/account";

/**
 * A Better Auth session known to have passed `requireDashboardSession()`.
 * Typed off `auth.api.getSession` so the custom `role` / `mustChangePassword`
 * additional fields declared in `@/lib/auth` stay in sync automatically.
 */
export type DashboardSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

/**
 * The provider-side dashboard's single gate, called by
 * `src/app/dashboard/layout.tsx` and then re-called by the leaf pages beneath
 * it that need the session object itself.
 *
 * Three conditions must hold, each with its own destination (unlike the back
 * office, where every failure deliberately collapses to one redirect — nothing
 * here is confidential, and sending a client to `/account` rather than to
 * `/sign-in` is simply correct):
 *
 * 1. There is a session.
 * 2. The account is not stuck behind a forced password change. Checked for
 *    every role, before any role branching, so a company-registered driver
 *    cannot sidestep the reset by landing on a page that only guards drivers.
 * 3. The role is not CLIENT.
 *
 * `redirect()` throws, so every early exit is `never` and the returned session
 * is non-null by construction — which is what lets the pages under this layout
 * read `session.user` with no `!` assertion and no re-checking.
 *
 * Wrapped in React's `cache()` for the same reason `requireSystemUser` is: the
 * guard is intentionally called at two levels of the same render (the layout,
 * then the page), and each bare call costs a full session validation. `cache()`
 * dedupes them to one within a single request's render pass — it is
 * per-request memoization only, never shared across requests or users.
 */
export const requireDashboardSession = cache(
  async (): Promise<DashboardSession> => {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
      redirect(DASHBOARD_SIGN_IN_PATH);
    }

    // A driver registered by a company starts on a temporary password that
    // whoever relayed it has also seen, so the reset gates every role.
    if (session.user.mustChangePassword) {
      redirect(DASHBOARD_CHANGE_PASSWORD_PATH);
    }

    // Clients have nothing to do here — `/account` is theirs.
    if (session.user.role === "CLIENT") {
      redirect(CLIENT_HOME_PATH);
    }

    return session;
  },
);
