"use client";

import { useCallback, useState } from "react";
import { useLocale } from "next-intl";

import { withLocalePrefix, type AppLocale } from "@/i18n/routing";
import { signOut } from "@/lib/auth-client";

/**
 * The one place the app signs a user out.
 *
 * Every surface that offers a sign-out control uses this rather than calling
 * `signOut()` and routing itself, so the behaviour cannot drift between the
 * site header, the account sidebar, the landing nav pill and the driver hub.
 *
 * Two decisions are baked in here:
 *
 * - **Where it lands.** The homepage, always — in the language the user was
 *   reading. A signed-out user has no account surface left to stand on, and
 *   every authenticated route above the control redirects to `/sign-in` on the
 *   next request anyway, so the marketing page is the one destination valid for
 *   every role. The prefix is applied here rather than left to the middleware:
 *   a bare `/` would be negotiated from the `NEXT_LOCALE` cookie, which is
 *   normally right but costs an extra redirect on the way out.
 * - **How it navigates.** A full document navigation (`window.location`), not
 *   `router.push()` + `router.refresh()`. Two reasons: the App Router's client
 *   cache holds server-rendered output produced *with* the session, and only a
 *   real navigation is guaranteed to drop all of it; and under the host split
 *   (`src/middleware.ts`) `/` asked for on the merchant host is a redirect to
 *   the client origin, which a client-side navigation cannot follow — a driver
 *   signing out of the hub would otherwise sit on a dead route.
 *
 * `signingOut` stays `true` after a successful call: the page is on its way
 * out, so the button should remain disabled rather than flicker back to its
 * idle label during the navigation. It is only reset if the sign-out itself
 * fails, which leaves the user signed in and the control usable again.
 */
export function useSignOut(): {
  signOut: () => Promise<void>;
  signingOut: boolean;
} {
  const [signingOut, setSigningOut] = useState(false);
  const locale = useLocale() as AppLocale;

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);

    try {
      await signOut();
    } catch {
      setSigningOut(false);
      return;
    }

    window.location.assign(withLocalePrefix(locale, "/"));
  }, [locale]);

  return { signOut: handleSignOut, signingOut };
}
