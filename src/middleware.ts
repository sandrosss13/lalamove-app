import { NextResponse, type NextRequest } from "next/server";

import {
  adminOrigin,
  audienceForHost,
  clientOrigin,
  IS_ADMIN_HOST_ENABLED,
  IS_HOST_SPLIT_ENABLED,
  merchantOrigin,
} from "@/lib/host";

/**
 * Paths that only make sense on the merchant host, matched as a prefix (the
 * path itself or any subpath).
 */
const MERCHANT_ONLY_PREFIXES = ["/dashboard"];

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
 */
const CLIENT_ONLY_PREFIXES = ["/account", "/checkout"];

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
 * Paths that must keep working on the admin host even though they live outside
 * `/admin`, and so are exempt from the "admin host serves only `/admin`"
 * redirect below:
 *
 * - `/api/**` — the admin sign-in page posts to Better Auth's own
 *   `/api/auth/**` endpoints same-origin, so bouncing these to the client host
 *   would break admin sign-in outright (and any later `/api/admin/**` route
 *   with it).
 * - `/_next/**`, `/__next*` — Next's own asset, RSC-payload and dev-HMR
 *   traffic. The `config.matcher` below already excludes the static/image
 *   subsets, but not these.
 *
 * Matched with `startsWith` rather than `matchesPrefix` because the dev-only
 * endpoints (`/__nextjs_original-stack-frame`, …) are not path segments.
 */
const ADMIN_HOST_PASSTHROUGH_PREFIXES = ["/api/", "/_next/", "/__next"];

function isAdminHostPassthrough(pathname: string): boolean {
  return ADMIN_HOST_PASSTHROUGH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

function isClientOnly(pathname: string): boolean {
  return (
    CLIENT_ONLY_EXACT.includes(pathname) ||
    matchesPrefix(pathname, CLIENT_ONLY_PREFIXES)
  );
}

/**
 * Host gate for the merchant/client split and for the admin back office's own
 * host (see `src/lib/host.ts` for the full design rationale). Pure routing: it
 * never inspects role or session — every route's real authorization stays in
 * its own server component / API route handler, untouched by this file. The
 * back office in particular is gated by `requireSystemUser()` in
 * `src/app/admin/layout.tsx`, not here.
 *
 * The two splits are layered independently, each a no-op while its own env var
 * is unset (`NEXT_PUBLIC_MERCHANT_HOST` / `NEXT_PUBLIC_ADMIN_HOST`) — both
 * unset, the default, is a zero-behavior-change state.
 *
 * Everything not classified below passes through on both hosts — notably all
 * of `/api/*` (Better Auth's own `/api/auth/*` endpoints must be reachable
 * from both origins), `/sign-in`, `/sign-up`, `/change-password` and
 * `/orders/[id]/track`.
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
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const audience = audienceForHost(host);
  const { pathname, search } = request.nextUrl;

  // The admin host serves the back office and nothing else: anything that
  // isn't `/admin/**` or infrastructure traffic goes back to the client host,
  // so a stray link never renders the customer-facing app on an internal
  // hostname. Only reachable when `NEXT_PUBLIC_ADMIN_HOST` is set —
  // `audienceForHost` cannot return "ADMIN" otherwise.
  if (audience === "ADMIN") {
    if (isAdminOnly(pathname) || isAdminHostPassthrough(pathname)) {
      return NextResponse.next();
    }

    return NextResponse.redirect(
      new URL(`${pathname}${search}`, clientOrigin()),
    );
  }

  // Mirror image: `/admin` asked for on the client or merchant host while the
  // admin split is configured belongs on the admin host instead. Same shape as
  // the merchant-only-path redirect below.
  if (IS_ADMIN_HOST_ENABLED && isAdminOnly(pathname)) {
    const origin = adminOrigin();
    if (origin) {
      return NextResponse.redirect(new URL(`${pathname}${search}`, origin));
    }
  }

  if (!IS_HOST_SPLIT_ENABLED) {
    return NextResponse.next();
  }

  if (audience === "CLIENT" && isMerchantOnly(pathname)) {
    const origin = merchantOrigin();
    if (origin) {
      return NextResponse.redirect(new URL(`${pathname}${search}`, origin));
    }
  }

  if (audience === "MERCHANT" && isClientOnly(pathname)) {
    return NextResponse.redirect(
      new URL(`${pathname}${search}`, clientOrigin()),
    );
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next's static asset paths so the gate doesn't run on every JS/CSS
  // chunk and image request.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
