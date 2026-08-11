import { redirect } from "next/navigation";

import { ADMIN_NAV } from "@/components/admin/admin-nav";
import { hasAdminRole, requireSystemUser } from "@/lib/admin/auth";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * `/admin` itself has no content — it forwards to the first section the signed-in
 * staff member can actually open, so the back office is never a dead end and
 * never lands someone on a section their `adminRole` would immediately bounce
 * them out of. For a `SUPER_ADMIN` (and anyone with `ANALYTICS`) that first
 * section is Sales Analytics.
 *
 * Every `AdminRole` appears in at least one section of `ADMIN_NAV`, so the
 * `find` always resolves; the fallback exists for the type, not for a reachable
 * state.
 */
export default async function AdminIndexPage() {
  const { systemUserProfile } = await requireSystemUser();

  const firstVisible = ADMIN_NAV.find((section) =>
    hasAdminRole(systemUserProfile, section.adminRoles),
  );

  redirect(firstVisible?.href ?? "/admin/analytics");
}
