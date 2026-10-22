"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { ZomoLockupThemed } from "@/components/brand/zomo-logo";
import { useSession } from "@/lib/auth-client";

/**
 * Header widget reflecting the current session: the signed-in user's way into
 * their own area, or sign-in / sign-up links when there is no session.
 *
 * No sign out here for any role: clients sign out from the last row of the
 * account rail (`AccountSidebar`), drivers and companies from the hub, staff
 * from the back-office shell.
 */
export function AuthStatus() {
  const t = useTranslations("common.shared");
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <span className="text-sm opacity-50">…</span>;
  }

  if (session) {
    // Clients live on /account; drivers and logistics companies manage their
    // fleet, roster and bookings on /dashboard.
    const isClient = session.user.role === "CLIENT";

    return (
      <div className="flex items-center gap-2 whitespace-nowrap text-sm sm:gap-3">
        {/*
          A client's own route to the marketing page is the wordmark now (see
          `HeaderBrandLink`), not a link here — this used to duplicate that.
        */}
        <Link
          href={isClient ? "/account" : "/dashboard"}
          className="font-medium hover:opacity-70"
        >
          {isClient ? t("myAccount") : t("dashboard")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-sm sm:gap-3">
      <Link href="/sign-in" className="font-medium hover:opacity-70">
        {t("signIn")}
      </Link>
      <Link href="/sign-up" className="font-medium hover:opacity-70">
        {t("signUp")}
      </Link>
    </div>
  );
}

/**
 * The header logo (the zomo lockup), plus — for a signed-in client only — the client's
 * primary nav (Place order / My orders), immediately to its right. The wallet
 * (saved payment cards) is not a top-level item: it is a section of My account,
 * `/account/wallet`, reached from the account rail.
 *
 * The wordmark's destination depends on who's looking at it:
 * - A signed-in CLIENT goes to `/home`, the always-marketing route — `/`
 *   shows their booking form once authenticated, so the wordmark is their only
 *   way back to the marketing page without signing out. This is also why
 *   `AuthStatus` no longer has its own "Home page" link: this is that link now.
 * - A signed-in DRIVER/COMPANY goes to `/dashboard`. A plain `/` would be
 *   wrong for them on the merchant host: `/` is client-only under the
 *   merchant/client host split (see `src/middleware.ts`), so clicking it would
 *   get redirected to the client host, where their merchant-host session
 *   cookie doesn't apply — looking like an unexpected sign-out.
 * - Signed out, `/` already renders the same marketing content `/home` does,
 *   so it keeps that simpler, canonical destination.
 */
export function HeaderBrandLink() {
  const t = useTranslations("common.shared");
  const tAuthStatus = useTranslations("common.authStatus");
  const { data: session } = useSession();
  const isMerchantUser =
    session?.user.role === "DRIVER" || session?.user.role === "COMPANY";
  const isClient = session?.user.role === "CLIENT";

  const brandHref = isMerchantUser ? "/dashboard" : isClient ? "/home" : "/";

  return (
    <div className="flex items-center gap-5 max-sm:contents">
      {/* The lockup is the link's whole content, so the SVG carries the
          accessible name ("zomo"). Themed: this header follows `html.dark`. */}
      <Link href={brandHref} className="flex items-center hover:opacity-80">
        <ZomoLockupThemed className="h-6" label={t("brandName")} />
      </Link>

      {isClient ? (
        <nav className="flex items-center gap-4 whitespace-nowrap text-sm max-sm:order-last max-sm:w-full">
          <Link href="/" className="font-medium hover:opacity-70">
            {tAuthStatus("placeOrder")}
          </Link>
          <Link href="/orders" className="font-medium hover:opacity-70">
            {t("myOrders")}
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
