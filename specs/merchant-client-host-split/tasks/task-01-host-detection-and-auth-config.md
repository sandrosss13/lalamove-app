# Task 01: Host detection library + Better Auth config

## Status

complete

## Wave

1

## Description

This is the foundation every other task in this spec depends on. It creates the single source of truth for "which host is the merchant host, and what does that mean for this request" (`src/lib/host.ts`), and wires two consequences of that into Better Auth (`src/lib/auth.ts`): the merchant origin must be trusted or every cross-host auth request 403s, and a server-side backstop must reject a sign-up whose role doesn't match the host it came from.

Both files are grouped into one task (rather than split across two parallel tasks) because `auth.ts`'s changes directly import and depend on `host.ts`'s exact exported API — splitting them would create a hidden coupling between two "parallel" tasks with no file overlap to catch it in review.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-02-middleware, task-03-sign-in-split, task-04-sign-up-split, task-05-change-password-redirect, task-06-nav-link-fixes, task-07-landing-driver-links, task-08-env-and-docs (all of Wave 2)

**Context from dependencies:** None — this is the first task.

## Files to Create

- `src/lib/host.ts` — host detection, the tri-state `NEXT_PUBLIC_MERCHANT_HOST` env var, and origin helpers. Edge-runtime-safe (imported by `src/middleware.ts` in task-02): no Node built-ins, no Prisma import, no `"use client"`/`"use server"` directive — a plain, side-effect-light module safe to import from Edge middleware, server components, and (for its `Audience` type and `MERCHANT_HOST`/`IS_HOST_SPLIT_ENABLED` constants only) client components.

## Files to Modify

- `src/lib/auth.ts` — add the merchant origin(s) to `trustedOrigins`, and add a `hooks.before` guard rejecting a sign-up whose role doesn't match the requesting host's audience.

## Technical Details

### Current state of `src/lib/auth.ts` (read in full before editing)

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware, isAPIError } from "better-auth/api";

import { prisma } from "@/lib/prisma";

const TRUSTED_ORIGINS = [
  "http://localhost:3000",
  "https://template-blush-pi.vercel.app",
  "https://lalamove-app-sandrosss13s-projects.vercel.app",
  "https://lalamove-app-git-main-sandrosss13s-projects.vercel.app",
  "https://lalamove-app-sandrosss13-sandrosss13s-projects.vercel.app",
];

const CHANGE_PASSWORD_PATH = "/change-password";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: TRUSTED_ORIGINS,
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: { type: "string", required: true, input: true, defaultValue: "CLIENT" },
      mustChangePassword: { type: "boolean", required: false, input: false, defaultValue: false },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== CHANGE_PASSWORD_PATH) return;
      if (isAPIError(ctx.context.returned)) return;
      const session = ctx.context.session;
      if (!session) return;
      await prisma.user.update({ where: { id: session.user.id }, data: { mustChangePassword: false } });
    }),
  },
});
```

There is exactly one existing `hooks.after` handler, no `hooks.before` today. Do not remove or restructure the `after` handler — add `before` alongside it in the same `hooks` object.

### `src/lib/host.ts` — full implementation

```ts
/**
 * Host-based merchant/client split.
 *
 * The app serves two audiences on two different hostnames: a "merchant" host
 * for DRIVER/COMPANY sign-in, sign-up and the ops dashboard, and every other
 * host (the "client" host — the app's main domain) for CLIENT sign-in,
 * sign-up and the booking/account experience. This module is the single
 * source of truth for which host is which, consumed by `src/middleware.ts`,
 * `src/lib/auth.ts`, and the sign-in/sign-up server components.
 *
 * Design: one tri-state env var, `NEXT_PUBLIC_MERCHANT_HOST`, holding the
 * merchant host's *exact* hostname (including port for local dev, e.g.
 * "merchant.localhost:3000"; no port for production, e.g.
 * "merchant.example.com").
 *
 * - Unset → the split is disabled entirely. This is deliberately the default
 *   and must produce byte-identical behavior to how the app worked before
 *   this feature existed — there is no registered domain yet, and the
 *   current `*.vercel.app` deployment has no subdomain to split against, so
 *   "unset" has to be a safe, fully-functional state, not a broken one.
 * - Set to an exact hostname → the split is on for that hostname only.
 *
 * A `startsWith("merchant.")`-style prefix heuristic was deliberately
 * rejected: no subdomain exists in production today, so a heuristic would
 * risk misclassifying a real deployment the moment any hostname happened to
 * match, and an exact string compare is a materially tighter boundary
 * against a spoofed `Host`/`X-Forwarded-Host` header than a prefix match.
 *
 * This is a browser-importable module (client components may read
 * `MERCHANT_HOST` / `IS_HOST_SPLIT_ENABLED` / the `Audience` type), an
 * Edge-middleware-importable module, and a server-component-importable
 * module — so it has no Node built-ins and no side effects beyond the
 * one-time misconfiguration check below.
 *
 * `clientOrigin()` and `merchantOrigin()` are static, deployment-level
 * values (derived from env vars fixed at build/boot time, not from any
 * per-request header) — they are safe to call from any server component or
 * middleware without opting into per-request dynamic rendering. Client
 * components must NOT call them directly: `BETTER_AUTH_URL` (which
 * `clientOrigin()` reads) is a server-only env var with no `NEXT_PUBLIC_`
 * prefix, so it is `undefined` in the browser bundle and `clientOrigin()`
 * would silently fall back to `http://localhost:3000` there. A client
 * component that needs a same-host destination for a merchant/driver user
 * should link to `/dashboard` (relative — always correct, since a merchant
 * session only ever exists on the merchant host); a client component that
 * needs to link users *toward* the merchant host (e.g. a driver-acquisition
 * CTA) should be written as a server component that calls `merchantOrigin()`
 * itself and passes the resulting string down as a prop, the same pattern
 * used in task-03/04/07 of this spec.
 */

export type Audience = "CLIENT" | "MERCHANT" | "BOTH";

const RAW_MERCHANT_HOST = process.env.NEXT_PUBLIC_MERCHANT_HOST?.trim() || null;

/** Resolves the client host's origin from `BETTER_AUTH_URL`, falling back to
 * the local-dev default if the env var is missing or malformed — the same
 * fallback Better Auth itself effectively uses when `baseURL` is omitted. */
function computeClientOrigin(): string {
  const raw = process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

const CLIENT_ORIGIN = computeClientOrigin();
const CLIENT_HOST = new URL(CLIENT_ORIGIN).host;

// Fail-safe: if NEXT_PUBLIC_MERCHANT_HOST is ever misconfigured to match the
// client host (e.g. someone points BETTER_AUTH_URL and the merchant host at
// the same value by mistake), every client-only path would 307-redirect to
// itself forever. Disable the split instead of shipping an infinite loop —
// wrong-but-broken is much worse than wrong-but-inert here.
const MISCONFIGURED =
  RAW_MERCHANT_HOST !== null &&
  RAW_MERCHANT_HOST.toLowerCase() === CLIENT_HOST.toLowerCase();

if (MISCONFIGURED) {
  console.error(
    `[host] NEXT_PUBLIC_MERCHANT_HOST ("${RAW_MERCHANT_HOST}") matches the ` +
      `client host derived from BETTER_AUTH_URL ("${CLIENT_HOST}"). Disabling ` +
      "the merchant/client host split to avoid a redirect loop — fix one of " +
      "these two values.",
  );
}

/** The merchant host's exact hostname, or `null` when the split is disabled
 * or misconfigured. */
export const MERCHANT_HOST = MISCONFIGURED ? null : RAW_MERCHANT_HOST;

/** Whether the merchant/client split is active at all. */
export const IS_HOST_SPLIT_ENABLED = MERCHANT_HOST !== null;

/**
 * Classifies an incoming request's host. `"BOTH"` when the split is
 * disabled (today's behavior — every audience is allowed). Any hostname
 * that isn't an exact match for `MERCHANT_HOST` falls back to `"CLIENT"`,
 * never `"MERCHANT"` — the least-privileged, public-facing surface is the
 * safe default for an unrecognized host.
 */
export function audienceForHost(host: string | null | undefined): Audience {
  if (!IS_HOST_SPLIT_ENABLED) {
    return "BOTH";
  }
  if (host && MERCHANT_HOST && host.toLowerCase() === MERCHANT_HOST.toLowerCase()) {
    return "MERCHANT";
  }
  return "CLIENT";
}

/** The client host's origin (scheme + host), e.g. `"http://localhost:3000"`.
 * Server-side only — see the module doc comment above. */
export function clientOrigin(): string {
  return CLIENT_ORIGIN;
}

/** The merchant host's origin, or `null` when the split is disabled.
 * Reuses the client origin's scheme (both hosts share the same deployment
 * and therefore the same protocol in practice). Server-side only — see the
 * module doc comment above. */
export function merchantOrigin(): string | null {
  if (!MERCHANT_HOST) return null;
  return `${new URL(CLIENT_ORIGIN).protocol}//${MERCHANT_HOST}`;
}

/** `trustedOrigins` entries for the merchant host, both schemes (so one
 * value works for `http://merchant.localhost:3000` in dev and
 * `https://merchant.example.com` in prod without a protocol-sniffing
 * branch). Empty when the split is disabled — appending this to the
 * existing `trustedOrigins` array is then a no-op. */
export const MERCHANT_TRUSTED_ORIGINS: string[] = MERCHANT_HOST
  ? [`http://${MERCHANT_HOST}`, `https://${MERCHANT_HOST}`]
  : [];
```

### `src/lib/auth.ts` changes

1. Add an import: `import { APIError } from "better-auth/api";` alongside the existing `createAuthMiddleware, isAPIError` import from the same module (combine into one import statement).
2. Add: `import { audienceForHost, IS_HOST_SPLIT_ENABLED, MERCHANT_TRUSTED_ORIGINS } from "@/lib/host";`
3. Change `trustedOrigins: TRUSTED_ORIGINS,` to `trustedOrigins: [...TRUSTED_ORIGINS, ...MERCHANT_TRUSTED_ORIGINS],`
4. Add a `SIGN_UP_EMAIL_PATH = "/sign-up/email"` constant near the existing `CHANGE_PASSWORD_PATH` constant (Better Auth's internal endpoint path for `signUpEmail`, in the same style `ctx.path` is already compared against for `/change-password`).
5. Add a `before` handler inside the existing `hooks` object, alongside (not replacing) `after`:

```ts
hooks: {
  /**
   * Server-side backstop for the merchant/client host split: reject a
   * sign-up whose role doesn't belong on the requesting host. The
   * client-side form (see task-03/task-04 of the
   * merchant-client-host-split spec) already only offers the
   * role-appropriate options per host, but `role` is `input: true` on the
   * `User` additionalField, so a hand-rolled `POST /api/auth/sign-up/email`
   * could otherwise still create a DRIVER account from the client host.
   *
   * Must no-op when `ctx.request` is absent: company-driven driver
   * registration (`src/app/api/logistics-company/drivers/register/route.ts`)
   * calls `auth.api.signUpEmail` directly without forwarding the incoming
   * request's headers — deliberately, so creating a driver doesn't clobber
   * the admin's own session — which means `ctx.request` is `undefined` for
   * that call. Without this bail-out, every company-created driver
   * registration would be rejected.
   */
  before: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== SIGN_UP_EMAIL_PATH) return;
    if (!IS_HOST_SPLIT_ENABLED) return;
    if (!ctx.request) return;

    const host =
      ctx.request.headers.get("x-forwarded-host") ??
      ctx.request.headers.get("host");
    const audience = audienceForHost(host);
    const role = (ctx.body as { role?: string } | undefined)?.role ?? "CLIENT";

    if (audience === "CLIENT" && role !== "CLIENT") {
      throw new APIError("FORBIDDEN", {
        message:
          "Driver and logistics company accounts must be created from the merchant sign-up page.",
      });
    }

    if (audience === "MERCHANT" && role === "CLIENT") {
      throw new APIError("FORBIDDEN", {
        message: "Client accounts must be created from the main sign-up page.",
      });
    }
  }),
  after: createAuthMiddleware(async (ctx) => {
    // ...unchanged, exactly as it is today...
  }),
},
```

Also extend the doc comment above `TRUSTED_ORIGINS` (the existing block explaining why several `*.vercel.app` aliases are listed) with one or two sentences noting that `MERCHANT_TRUSTED_ORIGINS` from `@/lib/host` is appended for the same reason — the merchant host is a distinct origin and would otherwise get `INVALID_ORIGIN` on every `POST /api/auth/*` call. Also add a short comment near the `betterAuth({...})` call (or near the `before` hook) stating explicitly that `advanced.crossSubDomainCookies` must never be enabled — doing so would share cookies across the two hosts and defeat the entire point of this split.

### Environment Variables

- `NEXT_PUBLIC_MERCHANT_HOST` — not set by this task (task-08 adds it to `.env`/`env.example`); this task only needs to read it via `process.env.NEXT_PUBLIC_MERCHANT_HOST`, which is safely `undefined` until task-08 runs, so `IS_HOST_SPLIT_ENABLED` correctly evaluates to `false` and every new code path here is inert until then.

## Acceptance Criteria

- [ ] `src/lib/host.ts` exists, exports exactly `Audience`, `MERCHANT_HOST`, `IS_HOST_SPLIT_ENABLED`, `audienceForHost`, `clientOrigin`, `merchantOrigin`, `MERCHANT_TRUSTED_ORIGINS`, matching the implementation above.
- [ ] With `NEXT_PUBLIC_MERCHANT_HOST` unset (the state of `.env`/`env.example` before task-08 runs), `IS_HOST_SPLIT_ENABLED === false`, `audienceForHost(anything) === "BOTH"`, `merchantOrigin() === null`, and `MERCHANT_TRUSTED_ORIGINS` is `[]` — so `trustedOrigins` in `auth.ts` is unchanged from today and the new `before` hook is a guaranteed no-op.
- [ ] `src/lib/auth.ts`'s existing `after` hook (the `mustChangePassword`-clearing logic) is untouched in behavior.
- [ ] `pnpm lint && pnpm typecheck` pass.

## Notes

Nothing in this task is observable end-to-end until task-08 sets `NEXT_PUBLIC_MERCHANT_HOST` — verification here is limited to lint/typecheck and reading the code against the acceptance criteria above. The manual browser test flow lives in task-08 once every dependent task has landed.
