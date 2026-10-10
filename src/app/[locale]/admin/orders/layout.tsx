import { redirect } from "next/navigation";

import { localeHref } from "@/i18n/server";
import { adminNavSection } from "@/components/admin/admin-nav";
import { hasAdminRole, requireSystemUser } from "@/lib/admin/auth";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The role gate for the Orders section — both `/admin/orders` and every
 * `/admin/orders/[id]` beneath it.
 *
 * Orders has no tabs, so like Sales Analytics it sits outside the `(sections)`
 * group and does not use `AdminSectionLayout` (whose heading and tab strip
 * would be wrong on a detail page). It still enforces the very same rule:
 * the root admin layout has only established that the visitor is *some*
 * active staff member, and the sidebar hiding this link from other roles does
 * nothing about a typed URL. Denied staff go to `/admin`, which forwards them
 * to a section they can open, so this cannot ping-pong.
 *
 * `requireSystemUser` is `cache()`d per request, so repeating it here (and in
 * the pages, which need nothing from it) costs no extra query.
 */
export default async function AdminOrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { systemUserProfile } = await requireSystemUser();

  if (!hasAdminRole(systemUserProfile, adminNavSection("orders").adminRoles)) {
    redirect(await localeHref("/admin"));
  }

  return <div className="min-w-0">{children}</div>;
}
