import type { AdminRole, SystemUserProfile } from "@prisma/client";

/**
 * The pure half of admin authorization, kept in its own module so both sides
 * of the RSC boundary can use it: `@/lib/admin/auth` (server-only — it pulls in
 * Better Auth and Prisma) re-exports it for server components and API routes,
 * while `admin-shell.tsx` imports it directly to decide which nav links to
 * render. Importing it from `auth.ts` in a client component would drag the
 * whole server auth stack into the browser bundle.
 *
 * Only the `AdminRole` *type* is imported, so nothing of Prisma survives
 * compilation here.
 */

/**
 * Whether a staff member may act on something restricted to `allowed`.
 *
 * `SUPER_ADMIN` passes unconditionally: it is the role that administers the
 * back office itself, and making that implicit means a later section can never
 * accidentally lock the super admin out of its own tooling by forgetting to
 * list it.
 *
 * Hiding a nav link with this is cosmetic. The same call has to be made again
 * server-side in every admin action and API route, since nothing stops a
 * direct request to a URL the sidebar never showed.
 */
export function hasAdminRole(
  profile: Pick<SystemUserProfile, "adminRole">,
  allowed: readonly AdminRole[],
): boolean {
  return (
    profile.adminRole === "SUPER_ADMIN" || allowed.includes(profile.adminRole)
  );
}
