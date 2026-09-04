"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { useSignOut } from "@/components/auth/use-sign-out";
import { cn } from "@/lib/utils";

/**
 * The settings rail's nav.
 *
 * Deliberately just these two: "Profile" is this page, and "Orders" is the
 * client's real order list at `/orders`. Nothing else in this app has a
 * per-client settings surface behind it — there is no notification-preference
 * model, no per-user locale, and the business-vs-individual split is a branch
 * of the one profile form below, not a separate destination — so inventing rows
 * for them would only promise screens that don't exist.
 */
const NAV_ITEMS = [
  { href: "/account", label: "Profile" },
  { href: "/orders", label: "Orders" },
] as const;

const SECTION_LABEL_CLASSES =
  "text-[0.6875rem] font-semibold tracking-[0.1em] text-muted uppercase";

/**
 * Whether `pathname` is inside the route `href` points at — an exact match, or
 * a descendant of it (`/orders/abc/track` keeps "Orders" highlighted).
 */
function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Left rail of the client account settings screen: the section nav, plus a way
 * out pinned to the bottom of the rail on desktop.
 *
 * A client component because signing out is a browser-side Better Auth call.
 * This sits *below* the global site header (see `src/app/layout.tsx`) and
 * replaces none of it — the wordmark, the client nav and the header's own sign
 * out stay exactly where they were.
 */
export function AccountSidebar() {
  const pathname = usePathname();
  // Shared with every other sign-out control in the app; `useSignOut` owns both
  // the destination and the in-flight `signingOut` flag this rail's button
  // renders from.
  const { signOut, signingOut } = useSignOut();

  return (
    <aside className="lg:sticky lg:top-8 lg:h-[calc(100vh-6rem)] lg:w-56 lg:shrink-0">
      <div className="flex h-full flex-col">
        <p className={SECTION_LABEL_CLASSES}>Account</p>

        <nav aria-label="Account settings" className="mt-3 flex flex-col">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "border-l-2 py-2 pl-3.5 text-sm font-medium transition-colors",
                  active
                    ? "border-accent text-accent"
                    : "border-line text-muted hover:text-paper",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* `mt-auto` only once the rail has a height to push against — on
            mobile it is a plain block that follows the nav. */}
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className="mt-8 inline-flex items-center gap-2 self-start text-sm font-medium text-muted transition-colors hover:text-accent disabled:opacity-50 lg:mt-auto"
        >
          <LogOut aria-hidden="true" className="size-4" />
          {signingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </aside>
  );
}
