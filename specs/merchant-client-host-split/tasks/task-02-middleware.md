# Task 02: Host-gating middleware

## Status

pending

## Wave

2

## Description

Creates `src/middleware.ts` (no middleware file exists in this repo today), the piece that actually enforces the host split at the routing layer: it redirects merchant-only paths away from the client host and client-only paths away from the merchant host, preserving pathname and query string. It is a pure host gate — it never inspects the user's role or session, only the request's `Host`/`X-Forwarded-Host` header — because every route's actual authorization already happens in its own server component or API route handler, and those stay untouched.

## Dependencies

**Depends on:** task-01-host-detection-and-auth-config.md
**Blocks:** None

**Context from dependencies:** task-01 creates `src/lib/host.ts`, exporting `IS_HOST_SPLIT_ENABLED: boolean`, `audienceForHost(host: string | null | undefined): "CLIENT" | "MERCHANT" | "BOTH"`, `merchantOrigin(): string | null`, and `clientOrigin(): string`. These are static, deployment-level values (not per-request) safe to call anywhere server-side, including Edge middleware. When `IS_HOST_SPLIT_ENABLED` is `false` (the default, until a later task sets `NEXT_PUBLIC_MERCHANT_HOST`), `audienceForHost` always returns `"BOTH"` — this task's middleware must no-op in that case so the current `*.vercel.app` deployment is completely unaffected.

## Files to Create

- `src/middleware.ts` — the host-gating middleware.

## Files to Modify

None.

## Technical Details

### Route classification (from the approved plan — do not deviate)

**Merchant-only** (redirect away from `CLIENT` audience, to `merchantOrigin()`):
- `/dashboard` and any subpath (`pathname === "/dashboard" || pathname.startsWith("/dashboard/")`)

**Client-only** (redirect away from `MERCHANT` audience, to `clientOrigin()`):
- Exactly `/`, exactly `/home`, **exactly** `/orders` (not `startsWith` — `/orders/[id]/track` is genuinely shared between clients and drivers tracking their own delivery, and must NOT be caught by this rule)
- `/account` and any subpath (`pathname === "/account" || pathname.startsWith("/account/")`)

**Everything else passes through unchanged on both hosts**, in particular: all of `/api/*` (including `/api/auth/*` — Better Auth's own endpoints must be reachable from both hosts), `/sign-in`, `/sign-up`, `/change-password`, `/orders/[id]/track`.

### Why redirects, not rewrites or 404s

Rewrites are rejected: two `page.tsx` files can't resolve the same path in Next.js, so a rewrite-based approach would need a fully duplicated page tree under something like `/merchant/*`, plus a second mechanism to hide it on the client host — much more machinery for no benefit here. 404s are rejected: they're dead ends for a stale bookmark or shared link; a redirect self-heals instead. Because the app's own page-level `redirect()` calls (e.g. `dashboard/page.tsx` redirecting a CLIENT session to `/account`) still fire correctly after a cross-host hop lands, there's no redirect-loop risk from this design — e.g. a stray CLIENT session somehow hitting `/dashboard` on the merchant host: this middleware sends them to `merchantOrigin()`'s `/dashboard`... no, the reverse: a CLIENT on the *client* host hitting a *merchant-only* path never happens without the split already having steered them elsewhere; the actual regression-guard case is a `MERCHANT` audience (driver/company) landing on `/account` on the merchant host by an old link — this middleware 307s them to `clientOrigin()/account`, where they have no client-host session, so that page's own auth check shows a normal signed-out state. No loop, no special-casing needed elsewhere.

### Implementation

```ts
import { NextResponse, type NextRequest } from "next/server";

import { IS_HOST_SPLIT_ENABLED, audienceForHost, merchantOrigin, clientOrigin } from "@/lib/host";

const MERCHANT_ONLY_PREFIXES = ["/dashboard"];
const CLIENT_ONLY_EXACT = ["/", "/home", "/orders"];
const CLIENT_ONLY_PREFIXES = ["/account"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isMerchantOnly(pathname: string): boolean {
  return matchesPrefix(pathname, MERCHANT_ONLY_PREFIXES);
}

function isClientOnly(pathname: string): boolean {
  return CLIENT_ONLY_EXACT.includes(pathname) || matchesPrefix(pathname, CLIENT_ONLY_PREFIXES);
}

/**
 * Host gate for the merchant/client split (see `src/lib/host.ts` for the
 * full design rationale). Pure routing: never inspects role or session —
 * every route's real authorization stays in its own server
 * component/API route, untouched by this file. No-ops entirely when the
 * split is disabled (`NEXT_PUBLIC_MERCHANT_HOST` unset), which is the
 * default and must stay a zero-behavior-change state.
 */
export function middleware(request: NextRequest) {
  if (!IS_HOST_SPLIT_ENABLED) {
    return NextResponse.next();
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const audience = audienceForHost(host);
  const { pathname, search } = request.nextUrl;

  if (audience === "CLIENT" && isMerchantOnly(pathname)) {
    const origin = merchantOrigin();
    if (origin) {
      return NextResponse.redirect(new URL(`${pathname}${search}`, origin));
    }
  }

  if (audience === "MERCHANT" && isClientOnly(pathname)) {
    return NextResponse.redirect(new URL(`${pathname}${search}`, clientOrigin()));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
```

`NextResponse.redirect(new URL(path, origin))` builds an absolute cross-origin URL; `NextResponse.redirect` defaults to a 307 (temporary redirect) status, which is correct here — this is a routing artifact of the host split, not a permanent URL change search engines should cache.

`config.matcher` excludes Next's static asset paths so the middleware doesn't execute on every JS/CSS chunk and image request — without it, middleware runs on literally every request including `_next/static/*`.

## Acceptance Criteria

- [ ] `src/middleware.ts` exists with the route tables and logic above.
- [ ] With `NEXT_PUBLIC_MERCHANT_HOST` unset, every request passes through unchanged (verify via `pnpm dev`: the app behaves exactly as it did before this task).
- [ ] `pnpm lint && pnpm typecheck` pass.

## Notes

Full cross-host redirect verification (merchant `/` → client `/`, client `/dashboard` → merchant `/dashboard`, etc.) requires `NEXT_PUBLIC_MERCHANT_HOST` to be set, which task-08 handles — that task's acceptance criteria include the end-to-end manual test matrix covering this middleware's behavior once every Wave 2 task has landed.
