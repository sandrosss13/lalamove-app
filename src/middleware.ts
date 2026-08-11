import { NextResponse, type NextRequest } from "next/server";

import {
  audienceForHost,
  clientOrigin,
  IS_HOST_SPLIT_ENABLED,
  merchantOrigin,
} from "@/lib/host";

/**
 * Paths that only make sense on the merchant host, matched as a prefix (the
 * path itself or any subpath).
 */
const MERCHANT_ONLY_PREFIXES = ["/dashboard"];

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
 */
const CLIENT_ONLY_PREFIXES = ["/account"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isMerchantOnly(pathname: string): boolean {
  return matchesPrefix(pathname, MERCHANT_ONLY_PREFIXES);
}

function isClientOnly(pathname: string): boolean {
  return (
    CLIENT_ONLY_EXACT.includes(pathname) ||
    matchesPrefix(pathname, CLIENT_ONLY_PREFIXES)
  );
}

/**
 * Host gate for the merchant/client split (see `src/lib/host.ts` for the full
 * design rationale). Pure routing: it never inspects role or session — every
 * route's real authorization stays in its own server component / API route
 * handler, untouched by this file. No-ops entirely when the split is disabled
 * (`NEXT_PUBLIC_MERCHANT_HOST` unset), which is the default and must stay a
 * zero-behavior-change state.
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
 */
export function middleware(request: NextRequest) {
  if (!IS_HOST_SPLIT_ENABLED) {
    return NextResponse.next();
  }

  // `x-forwarded-host` is what a proxy (Vercel) sets to the hostname the
  // browser actually asked for; `host` is the direct-connection case (local
  // dev). Same precedence as the sign-up guard in `src/lib/auth.ts`.
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const audience = audienceForHost(host);
  const { pathname, search } = request.nextUrl;

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
