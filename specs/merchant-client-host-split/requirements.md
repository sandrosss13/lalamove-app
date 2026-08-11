# Requirements: Merchant/Client Host Split

## Summary

Today one hostname serves everyone — clients booking deliveries and drivers/logistics companies running the ops dashboard all go through the same `/sign-in`, `/sign-up` and `/dashboard`. This feature separates the two audiences by hostname: a "merchant" subdomain (e.g. `merchant.example.com`) serves DRIVER and COMPANY sign-in, sign-up, and the full ops dashboard, while the main domain continues to serve CLIENT sign-in, sign-up, and the booking/account experience. Sessions are fully isolated between the two hosts — signing in on one never authenticates you on the other.

No real domain is registered in Vercel yet, so this is built as a generic, host-detection-driven mechanism (not hardcoded to a literal domain string), toggled by one environment variable, fully testable locally today via `merchant.localhost:3000`, and with zero behavioral change to the current `*.vercel.app` deployment until that variable is actually set. It stays a single Next.js app and a single Vercel deployment — the split is implemented via host-based middleware, not a second app or repo.

This was designed through two deep-dive research passes (one full investigation + proposal reading the actual Better Auth and Next.js internals in `node_modules` to verify cookie-isolation and origin-validation behavior, one independent review that caught and fixed two blocking gaps before implementation) and approved by the user as the plan at `/Users/ketikenia/.claude/plans/polymorphic-cuddling-snail.md`.

## Goals

- A `NEXT_PUBLIC_MERCHANT_HOST` env var that, when set to an exact hostname, turns on the split; when unset, the app behaves exactly as it does today (single host, full 3-way role pickers on sign-in/sign-up).
- Host-based middleware that redirects merchant-only paths (`/dashboard` and subpaths) away from the client host, and client-only paths (`/`, `/home`, `/orders`, `/account` and subpaths) away from the merchant host — preserving pathname and query string.
- `/sign-in` and `/sign-up` render audience-appropriate content: the client host never offers DRIVER/COMPANY registration or accepts a DRIVER/COMPANY credential; the merchant host never offers CLIENT registration or accepts a CLIENT credential (enforced client-side via a post-auth role check + `signOut()`, and server-side via a `hooks.before` guard on the sign-up endpoint).
- Genuinely shared pages (`/change-password`, `/orders/[id]/track`) continue to work correctly on both hosts, with any hardcoded post-success redirect made role-aware instead of pointing at a single fixed destination.
- `trustedOrigins` in `src/lib/auth.ts` is extended so the merchant host's Better Auth requests aren't rejected with `INVALID_ORIGIN`.
- Navigation links that are audience-specific (the driver-acquisition CTAs on the landing page, the header wordmark, the signed-in "Home page" link) route correctly regardless of which host they're rendered on or clicked from.
- Fully testable locally via `merchant.localhost:3000` vs `localhost:3000`, with no `next.config.ts` changes and no `/etc/hosts` edits required (Chrome/Edge/Firefox resolve `*.localhost` to loopback natively; Safari on macOS does not pre-Tahoe — documented, not fixed).

## Non-Goals

- Registering a real domain or touching Vercel DNS/domain settings. `NEXT_PUBLIC_MERCHANT_HOST` stays unset in Production until the user has a real domain; this feature only builds the mechanism.
- Setting `NEXT_PUBLIC_MERCHANT_HOST` in Vercel Preview or Development environments. Preview URLs have no stable subdomain structure to split against — previews keep today's full-picker, single-host behavior after this feature ships, verified only locally via `merchant.localhost:3000`.
- A second Next.js app, repo, or Vercel project. Single deployment, single database, host-based middleware only.
- Making Better Auth's `advanced.crossSubDomainCookies` option involved in any way — cookie isolation depends on it staying off.
- A dedicated merchant-host landing/marketing page. The merchant host's `/` simply redirects to the client host's `/` (no merchant home page is built).
- Any change to the 26 existing role-guarded `/api/*` route handlers, or to `src/app/dashboard/page.tsx`, `src/app/account/page.tsx`, `src/app/orders/page.tsx`, or `src/app/orders/[id]/track/page.tsx` — all already correct and untouched.
- Letting one `User` account hold more than one role. A person who is both a customer and a driver still needs two separate accounts — unchanged by this feature.

## Acceptance Criteria

- [ ] With `NEXT_PUBLIC_MERCHANT_HOST` unset, the app behaves identically to before this feature: `pnpm dev`, sign in/up with the full 3-way picker, everything works exactly as today.
- [ ] With `NEXT_PUBLIC_MERCHANT_HOST="merchant.localhost:3000"` set locally: the client host (`localhost:3000`) offers only CLIENT sign-up and only accepts CLIENT sign-in; the merchant host (`merchant.localhost:3000`) offers only DRIVER/COMPANY sign-up and only accepts DRIVER/COMPANY sign-in.
- [ ] A session created on one host is never valid on the other (host-only cookies; verified via devtools showing no `Domain` attribute on either cookie).
- [ ] `/dashboard` on the client host redirects (307) to the merchant host; `/`, `/home`, `/account`, and exactly `/orders` (not `/orders/[id]/track`) on the merchant host redirect (307) to the client host — path and query string preserved.
- [ ] A company registering a driver from the ops dashboard (`POST /api/logistics-company/drivers/register`, which calls `auth.api.signUpEmail` without forwarding headers) continues to work unaffected by the new sign-up guard.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` all pass after the change.

## Assumptions

- The project's package manager is `pnpm` (per `package.json` scripts).
- Better Auth 1.6.25's cookie behavior (host-only unless `advanced.crossSubDomainCookies.enabled`) and origin-check behavior (`INVALID_ORIGIN` 403 for any non-GET whose `Origin` isn't in `trustedOrigins`) are as verified by reading `node_modules/better-auth/dist/{cookies/index.mjs, api/middlewares/origin-check.mjs, auth/trusted-origins.mjs, api/dispatch.mjs, context/helpers.mjs}` during planning — these are implementation details of a third-party dependency and could change on a future upgrade.
- Next.js 15.5.22's dev server already allows `*.localhost` subdomains by default (verified by reading `node_modules/next/dist/server/lib/router-utils/block-cross-site.js`) — no `next.config.ts` change is needed, and adding an explicit `allowedDevOrigins` array would be actively counterproductive (flips a permissive default to a stricter allowlist mode).

## Technical Constraints

- Stack: Next.js 15.5 App Router, Prisma + Postgres, Better Auth 1.6.x (`prismaAdapter`), hand-rolled Tailwind (no component library). No test framework exists in this repo (`package.json` scripts are lint/typecheck/format/build only) — verification is manual, per `README.md`'s existing conventions and this spec's task files.
- Middleware must stay a pure **host** gate — it must never attempt to read the user's role (would require a network call to `/api/auth/get-session` per request, or trusting a stale `session.cookieCache`; neither is worth it). Every existing role guard (26 API routes, `dashboard/page.tsx`, `account/page.tsx`, `orders/page.tsx`) stays exactly as-is and remains the actual authorization boundary.
- `src/middleware.ts` (not `src/proxy.ts` — that rename is a Next 16 change, not applicable at 15.5.22).
- Do not add a second env var for the client host's origin — `src/lib/host.ts`'s `clientOrigin()` reuses the existing `BETTER_AUTH_URL`. Client-side components that need a same-host destination for a merchant/driver user should route to `/dashboard` (relative, always correct since a merchant session only ever exists on the merchant host) rather than building cross-origin links from the browser.
- Follow existing UI/API conventions: `"use client"` + local `useState` for submitting/error, JSON `fetch` with inline error text (never `alert()`), `router.refresh()` after a mutation, matching Tailwind class idioms already used in `sign-in/page.tsx` and `sign-up/page.tsx`.
