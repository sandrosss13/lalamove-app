import { redirect } from "next/navigation";

import {
  adminNavSection,
  type AdminNavSectionId,
} from "@/components/admin/admin-nav";
import { AdminSectionTabs } from "@/components/admin/admin-section-tabs";
import { hasAdminRole, requireSystemUser } from "@/lib/admin/auth";

/**
 * The body of every section `layout.tsx`, so the five of them stay one line
 * each and the heading/tab markup is defined once.
 *
 * It re-runs `requireSystemUser()` rather than receiving the staff member from
 * the parent layout — App Router layouts can't pass props down — and uses the
 * result for two things:
 *
 * 1. Section-level authorization. The sidebar hides sections a role can't open,
 *    but a typed URL doesn't care, so the same `adminRoles` list is enforced
 *    here. Denied staff go to `/admin`, which forwards them to the first
 *    section they *can* open, so this can't ping-pong.
 * 2. Filtering the tabs, since an item may be narrower than its section (System
 *    Users is `SUPER_ADMIN`-only inside a section `USER_MANAGER` can open).
 *
 * This is a coarse gate on *viewing* a section. Each leaf page's own mutations
 * and API routes still have to call `hasAdminRole` themselves — that's where
 * the real boundary is.
 */
export async function AdminSectionLayout({
  sectionId,
  children,
}: {
  sectionId: AdminNavSectionId;
  children: React.ReactNode;
}) {
  const { systemUserProfile } = await requireSystemUser();
  const section = adminNavSection(sectionId);

  if (!hasAdminRole(systemUserProfile, section.adminRoles)) {
    redirect("/admin");
  }

  const items = section.items.filter((item) =>
    hasAdminRole(systemUserProfile, item.adminRoles),
  );

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold tracking-tight">{section.label}</h1>
      <AdminSectionTabs items={items} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
