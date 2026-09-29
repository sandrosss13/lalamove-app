import { requireDashboardSession } from "@/lib/dashboard/auth";

// Session access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The gate for the whole provider-side dashboard: everything under
 * `src/app/dashboard/**` runs inside this layout, so a route added by a later
 * task (starting with `/dashboard/onboarding`) is guarded by default rather
 * than by remembering to opt in — the same reason `src/app/admin/layout.tsx`
 * owns the back office's guard instead of each leaf page.
 *
 * The three checks in `requireDashboardSession` previously lived inline in
 * `page.tsx`, which is why a signed-out visitor used to see an inline "Please
 * sign in / Sign up" card there. They now redirect to `/sign-in` instead. That
 * is a deliberate behaviour change, not an oversight: a layout wraps *every*
 * child, so it cannot guard a sibling route while leaving the root page's own
 * inline UI untouched — and redirecting is what the rest of the app already
 * does with an unauthenticated visitor (see `sign-in-form.tsx`'s post-sign-in
 * routing).
 *
 * Leaf pages under here may therefore assume a session exists, belongs to a
 * DRIVER or COMPANY, and is not stuck behind a forced password change; they
 * call the same cached guard to get the session object itself, at no extra
 * cost.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDashboardSession();

  return <>{children}</>;
}
