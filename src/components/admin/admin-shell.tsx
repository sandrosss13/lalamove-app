"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import type { AdminRole } from "@prisma/client";

import { ADMIN_NAV, type AdminNavSection } from "@/components/admin/admin-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { hasAdminRole } from "@/lib/admin/roles";
import { DATA_SCREEN_WIDTH_CLASSES } from "@/lib/layout";
import { cn } from "@/lib/utils";

/** Where a signed-out staff member lands. Mirrors `ADMIN_SIGN_IN_PATH`. */
const SIGN_IN_PATH = "/admin/sign-in";

/**
 * `AdminRole` rendered for humans. A lookup rather than a `replace(/_/g, " ")`
 * so the two acronym-ish values ("CRM", "Super Admin") read correctly.
 */
const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ANALYTICS: "Analytics",
  CONTENT_MANAGER: "Content Manager",
  FINANCE_MANAGER: "Finance Manager",
  USER_MANAGER: "User Manager",
  CRM_MANAGER: "CRM Manager",
  SUPPORT: "Support",
};

/**
 * Whether `pathname` is inside `section`. Prefix-matched against the section's
 * URL segment (`/admin/users`, …) rather than against its `href` (which points
 * at the first *tab*), so every tab in a section keeps the section highlighted.
 */
function isSectionActive(pathname: string, section: AdminNavSection): boolean {
  // First two segments of the href, i.e. "/admin/users" out of
  // "/admin/users/clients".
  const prefix = section.href.split("/").slice(0, 3).join("/");

  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

type AdminShellProps = {
  /** Signed-in staff member, as read by `requireSystemUser()` server-side. */
  systemUser: {
    name: string;
    adminRole: AdminRole;
  };
  children: React.ReactNode;
};

/**
 * The back office's frame: a fixed left rail of sections and a top bar with the
 * signed-in staff member and a way out. Every `/admin` page renders inside it.
 *
 * The nav is filtered by the staff member's `adminRole` purely so nobody stares
 * at links they cannot use — it is not the security boundary. `requireSystemUser`
 * gates the whole surface, and each section's own actions re-check
 * `hasAdminRole` server-side.
 *
 * `data-admin-surface` is the hook `globals.css` uses to hide the public site
 * header and pin this surface to a light scheme, the same way the landing page
 * and ops dashboard mark themselves.
 */
export function AdminShell({ systemUser, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const sections = ADMIN_NAV.filter((section) =>
    hasAdminRole(systemUser, section.adminRoles),
  );

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    // `push` + `refresh` rather than a bare push: the server components above
    // this one cached a session that no longer exists.
    router.push(SIGN_IN_PATH);
    router.refresh();
  }

  return (
    <div
      data-admin-surface
      className="flex min-h-screen bg-background font-body text-foreground"
    >
      <nav className="flex w-64 shrink-0 flex-col gap-1 border-r border-border bg-sidebar p-3">
        <Link
          href="/admin"
          className="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 hover:bg-muted"
        >
          <span className="text-sm font-semibold tracking-tight">
            Back Office
          </span>
          <span className="text-xs text-muted-foreground">Internal tools</span>
        </Link>

        <div className="mt-2 flex flex-col gap-0.5">
          {sections.map((section) => {
            const active = isSectionActive(pathname, section);
            const SectionIcon = section.icon;
            const items = section.items.filter((item) =>
              hasAdminRole(systemUser, item.adminRoles),
            );

            return (
              <div key={section.id} className="flex flex-col gap-0.5">
                <Link
                  href={section.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <SectionIcon className="size-4 shrink-0" />
                  {section.label}
                </Link>

                {/* Sub-links expand only for the section being viewed, so the
                    rail stays scannable instead of listing all 13 leaves. */}
                {active && items.length > 0 ? (
                  <div className="mb-1 ml-[1.6rem] flex flex-col gap-0.5 border-l border-border pl-3">
                    {items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={
                          pathname === item.href ? "page" : undefined
                        }
                        className={cn(
                          "rounded-md px-2 py-1.5 text-[0.8rem]",
                          pathname === item.href
                            ? "font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="truncate text-sm font-medium">
              {systemUser.name}
            </span>
            <Badge variant="secondary">
              {ADMIN_ROLE_LABELS[systemUser.adminRole]}
            </Badge>
          </div>

          {/*
            The back office's only theme switch, and it has to live here: the
            global site header carries one, but `globals.css` hides that header
            outright under `body:has([data-admin-surface]) > header` (the back
            office ships its own top bar and owns the viewport, so two navbars
            would stack). This shell wraps every route under `src/app/admin/`,
            so mounting it once here is the whole back office.

            Sized down to `h-7 w-7` from the toggle's own `h-9 w-9` default so
            it matches the `size="sm"` Sign out button beside it — tailwind-merge
            resolves the conflict in favour of the passed classes. Nothing else
            is overridden: the default look is drawn from shadcn tokens, which
            inside `[data-admin-surface]` are the neutral set, so it re-tints
            with the bar it sits in.
          */}
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle className="h-7 w-7" />

            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <LogOut data-icon="inline-start" />
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </header>

        {/*
          The back office was the one surface with no width cap at all, so on an
          ultra-wide display a user table or an analytics grid ran the full
          2000px+ of the monitor. It now shares the platform's data-screen
          width: fill what is there, stop at 1800px, centre in the rest. That
          makes admin *narrower* than it was on the widest screens, which is the
          point — a row whose first and last cells are a monitor apart is not
          readable. Prose and forms are excluded platform-wide; see
          `DATA_SCREEN_WIDTH_CLASSES`. `p-6` stays so content never runs into the
          window edge as the column widens.
        */}
        <main className={`${DATA_SCREEN_WIDTH_CLASSES} min-w-0 flex-1 p-6`}>
          {children}
        </main>
      </div>
    </div>
  );
}
