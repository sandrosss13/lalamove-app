import { AdminChangePasswordForm } from "@/components/admin/admin-change-password-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireSystemUser } from "@/lib/admin/auth";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * Forced password change for back-office staff, reached when
 * `src/app/admin/layout.tsx` finds `mustChangePassword` on the session — i.e.
 * an account created by `POST /api/admin/users/system` whose owner is still
 * using the temporary password they were given out-of-band.
 *
 * Like `../sign-in/page.tsx` this sits in the `(admin-sign-in)` route group
 * rather than under `src/app/admin/`, and for a strictly stronger version of
 * the same reason: that layout's guard is what redirects *here*, so a page
 * inside its subtree would redirect to itself forever. The route group is
 * invisible in the URL, so the path is still `/admin/change-password` — which
 * means `ADMIN_ONLY_PREFIXES` in `src/middleware.ts` already matches it as a
 * `/admin/**` path and it stays reachable on the admin host, where `/change-
 * password` (the client-facing page) is not. Do not "tidy" this into
 * `src/app/admin/change-password/` — it would loop.
 *
 * `requireSystemUser()` is called directly rather than reimplemented: it
 * enforces exactly the three conditions this page needs — a session, `role ===
 * "ADMIN"`, and an existing *active* `SystemUserProfile` — so a signed-out
 * visitor, a customer and a deactivated staff member all get the same redirect
 * to `/admin/sign-in` they would get anywhere else in the back office. Crucially
 * it does *not* itself look at `mustChangePassword`; that check lives only in
 * the admin layout, which is what makes it safe to call from the page the
 * layout redirects to. `cache()` on the guard also means the extra call costs
 * nothing when it runs twice in one render pass.
 *
 * Note this page is deliberately reachable with the flag already `false`: an
 * admin choosing to change their password voluntarily is a legitimate use, and
 * bouncing them to `/admin` would be a redirect for no reason.
 */
export default async function AdminChangePasswordPage() {
  await requireSystemUser();

  /*
    The wrapper exists only to anchor the theme toggle. `AdminChangePasswordForm`
    carries `data-admin-surface`, which hides the global site header and the
    app's only other `ThemeToggle` with it — so like `../sign-in/page.tsx` this
    screen has to mount its own or it cannot switch themes at all.

    It goes here rather than in the form because that component lives under
    `src/components/admin` and is shared styling with the rest of the back
    office; the toggle is a property of these two standalone, header-less pages,
    not of the form. The form's own root is `min-h-screen`, so a `relative`
    wrapper takes exactly that height and `absolute` positions against the full
    page — same corner, same mechanics and same tab position (last, after the
    password fields) as the staff sign-in page, which is the screen staff
    arrive here from.

    No `className` on the toggle: both pages are drawn from shadcn tokens, which
    is what the shared defaults already use.
  */
  return (
    <div className="relative">
      <AdminChangePasswordForm />
      <div className="absolute top-5 right-5">
        <ThemeToggle />
      </div>
    </div>
  );
}
