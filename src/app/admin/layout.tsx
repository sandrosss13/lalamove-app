import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import {
  ADMIN_CHANGE_PASSWORD_PATH,
  requireSystemUser,
} from "@/lib/admin/auth";

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
 *
 * `/admin/change-password` is outside it for exactly the same reason: the
 * forced-password-change redirect below is what sends staff there, so the page
 * it targets cannot be a child of the layout that targets it.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, systemUserProfile } = await requireSystemUser();

  // A back-office account created through `POST /api/admin/users/system` starts
  // on a temporary password that a `SUPER_ADMIN` read off the screen once and
  // relayed out-of-band — so until it is replaced, whoever else saw it can sign
  // in as this staff member. The flag is set at creation but was previously
  // only ever read by `/dashboard`, which is merchant-only and therefore on no
  // path a staff member ever takes: they sign in at `/admin/sign-in` and land
  // here. Enforcing it in this layout covers the whole back office at once, for
  // the same reason the authorization gate lives here.
  //
  // `mustChangePassword` rides on the session user via the additionalField
  // declared in `@/lib/auth`, and Better Auth re-reads the user row per
  // `getSession` call (no cookie cache is configured), so the `after` hook that
  // clears the flag is visible on the very next request — which is what stops
  // the redirect below from surviving a successful password change.
  if (session.user.mustChangePassword) {
    redirect(ADMIN_CHANGE_PASSWORD_PATH);
  }

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
