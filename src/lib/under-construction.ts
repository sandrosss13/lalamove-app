/**
 * Pre-launch "under construction" gate for the client host.
 *
 * Production has to be deployed — and the merchant host, the admin back office
 * and every `/api/**` route have to be live on it (drivers sign up through the
 * merchant host and the driver mobile app calls the API against the client
 * origin, since that is Better Auth's `baseURL`) — before the customer-facing
 * site is ready to be seen. This module is the switch that lets the client
 * host's *pages* show a single "coming soon" screen while everything else on
 * the same deployment keeps working.
 *
 * Consumed by `src/middleware.ts`, which rewrites (never redirects — the URL
 * the visitor typed stays in the address bar, so lifting the flag needs no
 * cleanup of bookmarks or search results) every page request on the client
 * host to `UNDER_CONSTRUCTION_PATH`.
 *
 * Design: one server-only env var, `CLIENT_UNDER_CONSTRUCTION`, read the same
 * tri-state way as the host vars in `src/lib/host.ts` — unset, blank or any
 * value other than `"true"` is off. Off is the default and must be
 * byte-identical to how the app behaved before this module existed; the flag
 * is meant to be set in Vercel's Production environment only, so Preview,
 * staging and local dev are untouched unless someone opts in deliberately.
 *
 * Deliberately *not* `NEXT_PUBLIC_`: nothing in the browser needs to know, and
 * keeping it out of the client bundle means flipping it cannot leave a stale
 * copy in cached JavaScript.
 *
 * Like `src/lib/host.ts`, this module must stay importable from the Edge
 * middleware and from `tests/` without a server: no Node built-ins, no
 * server-only imports, no side effects beyond the one env read below.
 */

import { DEFAULT_LOCALE, isAppLocale, withLocalePrefix } from "@/i18n/routing";
import { isCityLandingPath } from "@/lib/seo/cities";

/**
 * The one value that turns the gate on. Compared case-insensitively after
 * trimming, so `"TRUE"` or `" true "` pasted into a dashboard still works, but
 * nothing looser (`"1"`, `"yes"`) does — a typo has to fail *off*, which is the
 * safe direction for a switch that hides the whole public site.
 */
const ENABLED_VALUE = "true";

/** Parses the raw env value. Exported for the specs; read once below. */
export function parseUnderConstructionFlag(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === ENABLED_VALUE;
}

/**
 * Read once at module load, like every other env-derived constant the
 * middleware consults. Changing it in the Vercel dashboard therefore needs a
 * redeploy to take effect.
 */
export const IS_CLIENT_UNDER_CONSTRUCTION = parseUnderConstructionFlag(
  process.env.CLIENT_UNDER_CONSTRUCTION,
);

/**
 * The route the gate rewrites to, *unprefixed* — `src/app/[locale]/coming-soon`.
 * It is an ordinary page and so is also reachable directly on every host;
 * that is harmless (it says nothing the gate does not already say) and it is
 * what lets the page be previewed on staging before the flag is turned on.
 */
export const UNDER_CONSTRUCTION_PATH = "/coming-soon";

/**
 * Pages that stay live on the client host while the gate is on — served as
 * themselves instead of being rewritten to the "coming soon" page.
 *
 * Today that is exactly the city landing pages (`src/lib/seo/cities.ts`):
 * their copy describes the service without promising it can be booked yet, so
 * they read correctly before and after launch, and they need time in the index
 * to rank by the day the gate lifts. Only known slugs are exempt — an unknown
 * `/gadazidva/<x>` is gated like any other path.
 *
 * `pathname` is *unprefixed* (what `splitLocalePrefix` leaves).
 */
export function isUnderConstructionExempt(pathname: string): boolean {
  return isCityLandingPath(pathname);
}

/*
 * Gated responses carry `X-Robots-Tag: noindex, nofollow` — except the root
 * (`/`, `/ka`, `/en`), which is deliberately indexable while the gate is on so
 * the brand can be found before launch, and the exempt city pages above, which
 * are not gated at all. That decision lives with the rest of
 * the indexing policy in `src/lib/seo/site.ts` (`isIndexablePath`), and the
 * middleware applies it to the rewrite: attached there rather than to the page,
 * it cannot be lost if the page's metadata is ever edited.
 */

/**
 * A final path segment with a file extension: `/robots.txt`, `/site.webmanifest`,
 * `/.well-known/assetlinks.json`. Never an App Router page in this project (no
 * route segment contains a dot), so these are left alone rather than answered
 * with an HTML page under a `.txt` or `.json` URL. The middleware's `matcher`
 * already skips images; this covers every other kind of file — notably the
 * `/.well-known/**` association files the driver mobile app may come to need.
 */
const FILE_EXTENSION_PATTERN = /\/[^/]*\.[a-z0-9]+$/i;

export function looksLikeFileRequest(pathname: string): boolean {
  return FILE_EXTENSION_PATTERN.test(pathname);
}

/**
 * Where a gated request is rewritten to, with its language settled.
 *
 * - A prefixed request keeps its own prefix: `/en/orders` → `/en/coming-soon`.
 * - An unprefixed one (`/`, an old bookmark) uses the `NEXT_LOCALE` cookie when
 *   it holds a supported locale, and Georgian otherwise. That is the same
 *   policy the locale layer in `src/middleware.ts` applies — cookie, then the
 *   default, with `Accept-Language` deliberately ignored — so the gate never
 *   answers in a different language than the real site would have. It is
 *   resolved here rather than by letting next-intl redirect first so that the
 *   bare domain answers `200` at `/` instead of bouncing to `/ka`.
 */
export function underConstructionRewritePath(
  routeLocale: string | null,
  cookieLocale: string | undefined,
): string {
  const locale = isAppLocale(routeLocale)
    ? routeLocale
    : isAppLocale(cookieLocale)
      ? cookieLocale
      : DEFAULT_LOCALE;

  return withLocalePrefix(locale, UNDER_CONSTRUCTION_PATH);
}
