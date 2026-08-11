import { AdminShell } from "@/components/admin/admin-shell";
import { requireSystemUser } from "@/lib/admin/auth";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The gate for the whole back office: everything under `src/app/admin/**` runs
 * inside this layout, so a route added by a later task is authorized by
 * default rather than by remembering to opt in.
 *
 * The one route that must stay outside it is the sign-in page itself — a guard
 * that redirects to a page it also wraps is an infinite redirect. It therefore
 * lives at `src/app/(admin-sign-in)/admin/sign-in/page.tsx`: a route group is
 * invisible in the URL (so the path is still `/admin/sign-in`) but it is a
 * different file-tree branch, and layouts nest by file tree, not by URL. Do not
 * "tidy" that page into `src/app/admin/sign-in/` — it would loop.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, systemUserProfile } = await requireSystemUser();

  return (
    <AdminShell
      systemUser={{
        name: session.user.name,
        adminRole: systemUserProfile.adminRole,
      }}
    >
      {children}
    </AdminShell>
  );
}
