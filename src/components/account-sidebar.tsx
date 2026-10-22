"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { useSignOut } from "@/components/auth/use-sign-out";
import { cn } from "@/lib/utils";

/**
 * The settings rail's nav.
 *
 * Deliberately just these four, in this order: "Profile" is `/account`,
 * "Orders" is the client's real order list at `/orders`, "Addresses" is
 * the address book at `/account/saved-addresses` (filled by the after-booking
 * prompt or by hand), and "Wallet" is the client's saved cards at
 * `/account/wallet` (moved in from the global header, where it used to be a
 * top-level item); "Log out" is the list's last row, directly under "Wallet".
 * Nothing else in this app has a per-client settings surface behind it — there is no notification-preference model, no per-user
 * locale, and the business-vs-individual split is a branch of the one profile
 * form, not a separate destination — so inventing rows for them would only
 * promise screens that don't exist.
 *
 * `exact` marks a row whose own subpaths belong to its siblings: everything
 * under `/account/` is another account section, so "Profile" must not stay lit
 * on `/account/wallet`.
 */
const NAV_ITEMS = [
  // `labelKey` is a full key from the catalog root, translated at render.
  { href: "/account", labelKey: "common.shared.profile", exact: true },
  { href: "/orders", labelKey: "common.shared.orders", exact: false },
  {
    href: "/account/saved-addresses",
    labelKey: "savedAddresses.page.title",
    exact: false,
  },
  { href: "/account/wallet", labelKey: "common.shared.wallet", exact: false },
] as const;

const SECTION_LABEL_CLASSES =
  "text-[0.6875rem] font-semibold tracking-[0.1em] text-muted uppercase";

/**
 * Whether `pathname` is inside the route `href` points at — an exact match, or
 * (unless `exact`) a descendant of it (`/orders/abc/track` keeps "Orders"
 * highlighted).
 */
function isNavItemActive(
  pathname: string,
  href: string,
  exact: boolean,
): boolean {
  return pathname === href || (!exact && pathname.startsWith(`${href}/`));
}

/**
 * Left rail of the client account settings screen: the section nav, ending in
 * the way out.
 *
 * A client component because signing out is a browser-side Better Auth call.
 * This sits *below* the global site header (see `src/app/layout.tsx`), which
 * offers a client no sign out of its own — this row is the client's sign out.
 */
export function AccountSidebar() {
  const t = useTranslations("common.shared");
  const tRoot = useTranslations();
  const tSidebar = useTranslations("account.accountSidebar");
  const pathname = usePathname();
  // Shared with every other sign-out control in the app; `useSignOut` owns both
  // the destination and the in-flight `signingOut` flag this rail's button
  // renders from.
  const { signOut, signingOut } = useSignOut();

  return (
    <aside className="lg:sticky lg:top-8 lg:w-56 lg:shrink-0">
      <div className="flex flex-col">
        <p className={SECTION_LABEL_CLASSES}>{t("account")}</p>

        <nav aria-label={t("accountSettings")} className="mt-3 flex flex-col">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href, item.exact);

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
                {tRoot(item.labelKey)}
              </Link>
            );
          })}

          {/* The list's last row, styled as one, rather than pinned to the
              foot of the rail: right under "Wallet" is where it is looked
              for. A button, not a link — signing out is an action. */}
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="inline-flex items-center gap-2 border-l-2 border-line py-2 pl-3.5 text-left text-sm font-medium text-muted transition-colors hover:text-paper disabled:opacity-50"
          >
            <LogOut aria-hidden="true" className="size-4" />
            {signingOut ? tSidebar("loggingOut") : tSidebar("logOut")}
          </button>
        </nav>
      </div>
    </aside>
  );
}
