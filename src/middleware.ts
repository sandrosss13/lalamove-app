import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import {
  adminOrigin,
  type Audience,
  audienceForHost,
  clientOrigin,
  IS_ADMIN_HOST_ENABLED,
  IS_HOST_SPLIT_ENABLED,
  merchantOrigin,
} from "@/lib/host";
import {
  DEFAULT_LOCALE,
  routing,
  splitLocalePrefix,
  withLocalePrefix,
} from "@/i18n/routing";
import {
  IS_CLIENT_UNDER_CONSTRUCTION,
  isUnderConstructionExempt,
  looksLikeFileRequest,
  underConstructionRewritePath,
} from "@/lib/under-construction";
import {
  isIndexableDeployment,
  isIndexablePath,
  isMetadataAssetPath,
  requestHost,
  ROBOTS_NOINDEX,
} from "@/lib/seo/site";

/**
 * Locale negotiation: matches `/ka/**` and `/en/**`, redirects an unprefixed
 * path to the visitor's locale (the `NEXT_LOCALE` cookie, then Georgian) and
 * writes the cookie so the choice sticks. `Accept-Language` is deliberately
 * *not* consulted — see `withoutBrowserLanguage` below.
 *
 * It runs *after* the host gate below, never before. Both layers redirect, and
 * the host gate's decisions are the coarser of the two: bouncing to another
 * origin first means the locale is negotiated once, at the destination, instead
 * of being resolved on a host that is about to hand the request away anyway.
 */
const handleLocale = createIntlMiddleware(routing);

/**
 * Georgian is the default for every first-time visitor, whatever their browser
 * says. English is reached only by choosing it — the language toggle, or a
 * `/en/...` link — after which the `NEXT_LOCALE` cookie remembers the choice.
 *
 * next-intl resolves an unprefixed path as prefix → cookie → `Accept-Language`
 * → `defaultLocale`, and its only switch, `localeDetection: false`, turns off
 * the cookie *and* the header together. We want to drop just the header, so the
 * request is rebuilt with `Accept-Language` pinned to the default locale before
 * next-intl sees it: the cookie still wins when present, and when it is absent
 * the header now negotiates to Georgian.
 *
 * Only done for an unprefixed path. A prefixed one never negotiates (the prefix
 * is the answer), and it is the only kind next-intl forwards to the page — so
 * pages still receive the browser's real header, and the rewritten request only
 * ever feeds a redirect.
 */
function withoutBrowserLanguage(request: NextRequest): NextRequest {
  const headers = new Headers(request.headers);
  headers.set("accept-language", DEFAULT_LOCALE);
  return new NextRequest(request, { headers });
}

function intlMiddleware(request: NextRequest) {
  const { locale } = splitLocalePrefix(request.nextUrl.pathname);
  return handleLocale(locale ? request : withoutBrowserLanguage(request));
}

/**
 * Paths that only make sense on the merchant host, matched as a prefix (the
 * path itself or any subpath).
 */
const MERCHANT_ONLY_PREFIXES = ["/dashboard"];

/**
 * Where the merchant host's bare root sends a signed-in visitor (unprefixed;
 * the locale prefix is re-attached by the caller). See the root special case
 * in `middleware` below.
 */
const MERCHANT_HOME = "/dashboard";

/**
 * Where the merchant host's bare root sends a signed-out visitor: the driver
 * recruitment page, which is also the one merchant-host page search engines
 * index. A prospective driver arriving from search or a printed address should
 * meet "become a driver", not a sign-in form.
 */
const MERCHANT_SIGNED_OUT_HOME = "/sign-up";

/**
 * Paths that belong to the admin back office, matched as a prefix. `/admin`
 * covers the whole surface including its own sign-in page, which must stay
 * reachable on the admin host for staff to sign in there at all.
 */
const ADMIN_ONLY_PREFIXES = ["/admin"];

/**
 * Paths that only make sense on the client host, matched *exactly*.
 *
 * `/orders` is deliberately here rather than in `CLIENT_ONLY_PREFIXES`:
 * `/orders/[id]/track` is genuinely shared — a client watches their delivery
 * and the assigned driver reports position from the same page — so a prefix
 * match would break tracking on the merchant host.
 *
 * `/` stays listed so the admin-host and client-host logic keeps treating the
 * landing page as client-owned, but the merchant host never bounces it: its
 * bare root is special-cased to the dashboard before this list is consulted
 * (see `MERCHANT_HOME`).
 */
const CLIENT_ONLY_EXACT = ["/", "/home", "/orders"];

/**
 * Paths that only make sense on the client host, matched as a prefix (the
 * path itself or any subpath, e.g. `/account/profile`).
 *
 * `/checkout` is a prefix rather than an exact match because the whole subtree
 * is one client-only flow — `/checkout/[id]` and `/checkout/[id]/success` are
 * only ever reached by the client who booked the order, so none of it has the
 * shared-audience problem that keeps `/orders` in `CLIENT_ONLY_EXACT`.
 *
 * `/gadazidva` is the city landing pages (`src/lib/seo/cities.ts`): customer
 * marketing pages, so on the merchant host they bounce to the client host
 * rather than being served (and indexed) twice.
 */
const CLIENT_ONLY_PREFIXES = ["/account", "/checkout", "/gadazidva"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isMerchantOnly(pathname: string): boolean {
  return matchesPrefix(pathname, MERCHANT_ONLY_PREFIXES);
}

function isAdminOnly(pathname: string): boolean {
  return matchesPrefix(pathname, ADMIN_ONLY_PREFIXES);
}

/**
 * Paths this gate does not classify at all — neither by host nor by locale:
 *
 * - `/api/**` — the admin sign-in page posts to Better Auth's own
 *   `/api/auth/**` endpoints same-origin, so bouncing these to the client host
 *   would break admin sign-in outright (and any later `/api/admin/**` route
 *   with it).
 * - `/_next/**`, `/__next*` — Next's own asset, RSC-payload and dev-HMR
 *   traffic. The `config.matcher` below already excludes the static/image
 *   subsets, but not these.
 *
 * Originally this list existed only to exempt those paths from the "admin host
 * serves only `/admin`" redirect. It now carries a second, heavier job: these
 * are the paths that must never be locale-prefixed. `/api/**` in particular is
 * one flat namespace shared by both languages — route handlers resolve the
 * reader's locale from the `NEXT_LOCALE` cookie, not from their URL — so
 * letting the locale layer see them would have it redirect every fetch the app
 * makes to `/ka/api/...`, where nothing is mounted.
 *
 * Matched with `startsWith` rather than `matchesPrefix` because the dev-only
 * endpoints (`/__nextjs_original-stack-frame`, …) are not path segments.
 */
const PASSTHROUGH_PREFIXES = ["/api/", "/_next/", "/__next"];

function isPassthrough(pathname: string): boolean {
  return PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * The cookie next-intl's middleware writes to remember a reader's language.
 * `src/i18n/routing.ts` does not configure `localeCookie`, so this is the
 * library's default name. Read here only by the under-construction gate, which
 * answers an unprefixed path without handing it to next-intl and so has to
 * honour the remembered choice itself.
 */
const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Stamps `X-Robots-Tag: noindex, nofollow` on a response the indexing policy
 * (`src/lib/seo/site.ts`) does not allow — a non-public deployment, or a path
 * that is not indexable on this host. It is the backstop under every page's
 * own `<meta name="robots">`: it holds even where a page forgot to set one.
 *
 * Redirects are left alone. A crawler follows them and judges the destination,
 * which gets its own header on the next hop; a header on the 3xx itself says
 * nothing and would only make the probe output noisier.
 */
function withRobotsPolicy(
  response: NextResponse,
  host: string | null,
  audience: Audience,
  pathname: string,
  gated: boolean,
): NextResponse {
  if (response.headers.has("location")) {
    return response;
  }

  if (
    !isIndexableDeployment(host) ||
    !isIndexablePath(audience, pathname, gated)
  ) {
    response.headers.set("X-Robots-Tag", ROBOTS_NOINDEX);
  }

  return response;
}

function isClientOnly(pathname: string): boolean {
  return (
    CLIENT_ONLY_EXACT.includes(pathname) ||
    matchesPrefix(pathname, CLIENT_ONLY_PREFIXES)
  );
}

/**
 * Host gate for the merchant/client split and for the admin back office's own
 * host (see `src/lib/host.ts` for the full design rationale), plus locale
 * negotiation for the `/ka` and `/en` prefixes. Pure routing: it never inspects
 * role or session — every route's real authorization stays in its own server
 * component / API route handler, untouched by this file. The back office in
 * particular is gated by `requireSystemUser()` in
 * `src/app/[locale]/admin/layout.tsx`, not here.
 *
 * The two host splits are layered independently, each a no-op while its own env
 * var is unset (`NEXT_PUBLIC_MERCHANT_HOST` / `NEXT_PUBLIC_ADMIN_HOST`) — both
 * unset, the default, is a zero-behavior-change state.
 *
 * ORDER OF OPERATIONS, and it matters:
 *
 * 1. Passthrough traffic (`/api/**`, `/_next/**`) leaves immediately, seen by
 *    neither layer.
 * 2. The locale prefix is split off the path. Every classification below runs
 *    on the remainder, so `CLIENT_ONLY_EXACT`, `CLIENT_ONLY_PREFIXES`,
 *    `MERCHANT_ONLY_PREFIXES` and `ADMIN_ONLY_PREFIXES` are still written as
 *    plain unprefixed paths and still match `/ka/...` and `/en/...`.
 * 3. The host gate runs and may redirect to another origin, re-attaching the
 *    prefix so the reader keeps their language across the bounce.
 * 4. While `CLIENT_UNDER_CONSTRUCTION` is on (see
 *    `src/lib/under-construction.ts`), a page request that is staying on the
 *    client host is rewritten to the "coming soon" page instead of being
 *    served. This sits *after* step 3 on purpose: `/dashboard` and `/admin`
 *    asked for on the client host still bounce to the merchant and admin
 *    hosts, which are live, so a stale link to either self-heals rather than
 *    dead-ending on a placeholder. It sits *after* step 1 for the reason step 1
 *    exists — `/api/**` has to keep answering on the client origin (Better
 *    Auth's `baseURL`, and the driver mobile app's API base).
 * 5. Whatever stays on this host is handed to `intlMiddleware`, which serves
 *    the matched route or redirects an unprefixed path into a locale.
 *
 * Everything not classified below reaches the locale layer on both hosts —
 * notably `/sign-in`, `/sign-up`, `/change-password` and `/orders/[id]/track`.
 * `/api/*` (Better Auth's own `/api/auth/*` endpoints must be reachable from
 * both origins) leaves at step 1 and is never prefixed at all.
 *
 * Redirects (rather than rewrites or 404s) because two `page.tsx` files can't
 * resolve the same path, and because a stale bookmark or shared cross-host
 * link should self-heal: the landed page's own `redirect()` calls still fire
 * afterwards, so there is no loop risk from this gate.
 *
 * LOCAL DEV: the `dev` script in package.json passes `-H ::` and that is load
 * bearing, not decoration. Next relativises a middleware `Location` whose
 * origin equals the dev server's own — and it builds that origin from the
 * hostname the server was started with, NOT from the request's `Host` header
 * (`getResolveRoutes` in next/dist/server/lib/router-utils/resolve-routes.js).
 * Started plainly, that origin is `http://localhost:3000`, which is exactly
 * what `clientOrigin()` returns here, so every bounce from the admin or
 * merchant host back to the client host went out as a bare `Location: /`: the
 * browser never left the host it was on, this gate redirected it again, and the
 * page died with ERR_TOO_MANY_REDIRECTS. Binding to `::` makes the server's own
 * origin `http://[::]:3000`, which matches none of the three hosts, so the
 * origin survives and the redirect actually crosses. Nothing below can fix this
 * on its own — writing the `Location` header by hand does not help, since the
 * rewrite happens downstream of whatever the middleware returns.
 */
export function middleware(request: NextRequest) {
  // `x-forwarded-host` is what a proxy (Vercel) sets to the hostname the
  // browser actually asked for; `host` is the direct-connection case (local
  // dev). Same precedence as the sign-up guard in `src/lib/auth.ts`.
  //
  // Read before the `IS_HOST_SPLIT_ENABLED` bail-out below (which only gates
  // the merchant dimension) because the admin split is independent of it and
  // has to be evaluated either way.
  const host = requestHost(request.headers);
  const audience = audienceForHost(host);
  const { search } = request.nextUrl;

  // API, asset and RSC traffic leaves before either layer looks at it. Hoisted
  // out of the `audience === "ADMIN"` branch it used to live in: the check is
  // now about locales as much as hosts (see `PASSTHROUGH_PREFIXES`), and it has
  // to apply on all three hosts rather than one. Behaviour on the client and
  // merchant hosts is unchanged — none of these paths matched any of the
  // classifications below, so they already fell through to `next()`.
  if (isPassthrough(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Metadata files and generated images (`/robots.txt`, `/sitemap.xml`,
  // `/ka/opengraph-image`, …) are not pages: neither host gate, locale layer
  // nor pre-launch gate has anything to say about them. Without this the gate
  // would rewrite `/ka/opengraph-image` to the "coming soon" HTML and every
  // link preview would break. `robots.txt`/`sitemap.xml` are also excluded by
  // the matcher below; this is the in-code guarantee for the rest.
  if (isMetadataAssetPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Everything from here down is classified on the *unprefixed* path, which is
  // what lets the lists above stay written the way they always were:
  // `CLIENT_ONLY_EXACT` is still `["/", "/home", "/orders"]` and still matches
  // `/ka/home`. `locale` is null for a path that has not been through locale
  // negotiation yet — an external link, a bookmark from before this shipped —
  // and `intlMiddleware` is what redirects those.
  const { locale, pathname } = splitLocalePrefix(request.nextUrl.pathname);

  // Whether the pre-launch gate applies to this request. Only the client
  // audience is gated — see step 4 below for why `"BOTH"` is not.
  const gated = IS_CLIENT_UNDER_CONSTRUCTION && audience === "CLIENT";

  /** Every non-redirect response leaves through the indexing policy. */
  const robots = (response: NextResponse) =>
    withRobotsPolicy(response, host, audience, pathname, gated);

  /**
   * Re-attaches the prefix the request arrived with to a cross-host redirect,
   * so bouncing a reader between hosts never changes their language. Without
   * this, an English reader following `/en/dashboard` on the client host would
   * land on the merchant host at `/dashboard` and be re-negotiated back into
   * Georgian by its own middleware.
   */
  const crossHost = (origin: string) =>
    NextResponse.redirect(
      new URL(
        `${locale ? withLocalePrefix(locale, pathname) : pathname}${search}`,
        origin,
      ),
    );

  // The admin host serves the back office and nothing else: anything that
  // isn't `/admin/**` goes back to the client host, so a stray link never
  // renders the customer-facing app on an internal hostname. Only reachable
  // when `NEXT_PUBLIC_ADMIN_HOST` is set — `audienceForHost` cannot return
  // "ADMIN" otherwise.
  if (audience === "ADMIN") {
    if (isAdminOnly(pathname)) {
      return robots(intlMiddleware(request));
    }

    return crossHost(clientOrigin());
  }

  // Mirror image: `/admin` asked for on the client or merchant host while the
  // admin split is configured belongs on the admin host instead. Same shape as
  // the merchant-only-path redirect below.
  if (IS_ADMIN_HOST_ENABLED && isAdminOnly(pathname)) {
    const origin = adminOrigin();
    if (origin) {
      return crossHost(origin);
    }
  }

  if (!IS_HOST_SPLIT_ENABLED) {
    return robots(intlMiddleware(request));
  }

  if (audience === "CLIENT" && isMerchantOnly(pathname)) {
    const origin = merchantOrigin();
    if (origin) {
      return crossHost(origin);
    }
  }

  // The merchant host's bare root (`/`, `/ka`, `/en`) is its front door, not a
  // stray client link: it is the address drivers type and the one printed on
  // anything that points them at the driver site. It used to fall through to
  // the `isClientOnly` bounce below like every other client path, which sent
  // drivers to the client host's landing page — and with
  // `CLIENT_UNDER_CONSTRUCTION` on, that page is "coming soon", so the driver
  // site looked down. Instead the root stays on this host: a signed-in driver
  // goes to the dashboard, and a signed-out visitor — most likely a prospective
  // driver — goes to sign-up rather than being bounced dashboard -> sign-in.
  //
  // "Signed in" here is only the presence of Better Auth's session cookie
  // (`getSessionCookie` reads it without touching the database, so it is
  // Edge-safe). A stale or forged cookie just means the dashboard's own
  // server-side session check sends the visitor to sign-in, exactly as before;
  // this is a routing hint, never authorization.
  //
  // Same-host, so the request URL is reused rather than `merchantOrigin()`: the
  // reader stays on exactly the hostname they typed. The prefix and query
  // string carry through; an unprefixed `/` goes to an unprefixed `/dashboard`
  // and the locale layer negotiates it on the next hop (cookie, else Georgian),
  // exactly as for any other unprefixed path. Only the root is special-cased —
  // `/home`, `/orders`, `/account` and `/checkout` are genuinely client pages
  // and still take the cross-host bounce.
  if (audience === "MERCHANT" && pathname === "/") {
    const home = getSessionCookie(request)
      ? MERCHANT_HOME
      : MERCHANT_SIGNED_OUT_HOME;
    const target = request.nextUrl.clone();
    target.pathname = locale ? withLocalePrefix(locale, home) : home;
    return NextResponse.redirect(target);
  }

  if (audience === "MERCHANT" && isClientOnly(pathname)) {
    return crossHost(clientOrigin());
  }

  // Pre-launch gate (step 4 above). Only the client audience is gated: the
  // merchant and admin hosts never reach this line with `"CLIENT"`, and while
  // the merchant split is off `audienceForHost` returns `"BOTH"` — one shared
  // host that the merchant side lives on too — so the flag is deliberately
  // inert there rather than hiding driver sign-up along with the customer site.
  //
  // A rewrite, not a redirect: the visitor's URL is left exactly as typed, so
  // lifting the flag later needs no cleanup and nothing gets indexed under a
  // `/coming-soon` address. The locale prefix (or, for an unprefixed path, the
  // remembered cookie, else Georgian) carries through so the page answers in
  // the reader's language — see `underConstructionRewritePath`.
  //
  // The root (`/`, `/ka`, `/en`) is the one gated URL left indexable, so the
  // brand is findable before launch; every other gated URL is a duplicate of
  // it and carries the noindex header (the decision is `isIndexablePath`'s).
  //
  // The city landing pages are exempt and fall through to the locale layer
  // like any ungated request (an unprefixed one is redirected into its
  // locale first). Only known slugs: `/gadazidva/<unknown>` is still gated.
  if (
    gated &&
    !looksLikeFileRequest(pathname) &&
    !isUnderConstructionExempt(pathname)
  ) {
    const response = NextResponse.rewrite(
      new URL(
        underConstructionRewritePath(
          locale,
          request.cookies.get(LOCALE_COOKIE)?.value,
        ),
        request.url,
      ),
    );
    return robots(response);
  }

  // No host redirect applies, so the request is staying here: hand it to the
  // locale layer, which either serves the matched `/[locale]/**` route or
  // redirects an unprefixed path to the reader's language
  // (their cookie, else Georgian).
  return robots(intlMiddleware(request));
}

export const config = {
  // Skip Next's static asset paths so the gate doesn't run on every JS/CSS
  // chunk and image request. `.webmanifest` is here because the web manifest
  // (`src/app/manifest.ts`) is one unprefixed file on every host: run through
  // the locale layer it would be redirected to `/ka/manifest.webmanifest`,
  // where nothing is mounted. `.txt`/`.xml` likewise keep `/robots.txt` and
  // `/sitemap.xml` (`src/app/robots.ts`, `src/app/sitemap.ts`) out of both the
  // locale layer and the pre-launch gate. The brand icons under `/brand/` are
  // already covered by the svg/png extensions.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|txt|xml)$).*)",
  ],
};
