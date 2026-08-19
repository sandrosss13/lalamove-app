/**
 * Host-based audience split (merchant/client, plus the admin back office).
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
 * The internal back office adds a second, fully independent split of exactly
 * the same shape: `NEXT_PUBLIC_ADMIN_HOST` names the `admin.` host that serves
 * `/admin/**` and nothing else. It is read, validated and consumed the same
 * way, but on its own axis — either split can be enabled without the other,
 * and leaving `NEXT_PUBLIC_ADMIN_HOST` unset keeps `/admin` reachable
 * path-based on the main host, which is the zero-config default.
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
 * middleware without opting into per-request dynamic rendering.
 *
 * `merchantOrigin()` is additionally safe to call from a client component: it
 * resolves its own protocol correctly in both contexts (`window.location.
 * protocol` in the browser, `CLIENT_PROTOCOL` on the server), and the host
 * itself comes from `NEXT_PUBLIC_MERCHANT_HOST`, which is inlined into the
 * browser bundle.
 *
 * `clientOrigin()` must NOT be called from a client component:
 * `BETTER_AUTH_URL` is a server-only env var with no `NEXT_PUBLIC_` prefix, so
 * it is `undefined` in the browser bundle and `clientOrigin()` would silently
 * fall back to `http://localhost:3000` there — a failure that is invisible in
 * local dev, where that fallback happens to be correct. A client component
 * that needs a same-host destination for a merchant/driver user should link to
 * `/dashboard` (relative — always correct, since a merchant session only ever
 * exists on the merchant host); one that genuinely needs the client origin
 * should receive it as a prop from a server component that called
 * `clientOrigin()` itself.
 */

/**
 * Which audience a host serves. `"BOTH"` only ever occurs while the merchant
 * split is disabled, where every path is open to every role exactly as it was
 * before that feature existed.
 *
 * `"ADMIN"` is an orthogonal dimension: it is decided by its own env var
 * (`NEXT_PUBLIC_ADMIN_HOST`) and can be returned whether the merchant split is
 * on or off, so it never displaces `"BOTH"` for the other three roles.
 */
export type Audience = "CLIENT" | "MERCHANT" | "ADMIN" | "BOTH";

/**
 * Read once at module load. `NEXT_PUBLIC_` env vars are inlined at build
 * time, so this is a static value in both the server and browser bundles.
 * An empty or whitespace-only value is treated as unset.
 *
 * Lowercased at read time: hostnames are case-insensitive (RFC 4343) and
 * browsers send `Host`/`Origin` already lowercased, but Better Auth matches
 * `trustedOrigins` with an exact string compare against `new URL(...).origin`
 * (see `matchesOriginPattern`). A mixed-case env value would therefore build a
 * `trustedOrigins` entry that never matches a real request, 403ing every
 * `POST /api/auth/*` from the merchant host with `INVALID_ORIGIN` — the exact
 * failure MERCHANT_TRUSTED_ORIGINS exists to prevent — while host
 * *classification* kept working, making it very hard to diagnose.
 */
const RAW_MERCHANT_HOST =
  process.env.NEXT_PUBLIC_MERCHANT_HOST?.trim().toLowerCase() || null;

/**
 * The admin back office's own hostname, read and normalised exactly like
 * `RAW_MERCHANT_HOST` above (same trim/lowercase reasoning — see that comment).
 *
 * Deliberately a *separate* tri-state var rather than a mode of the merchant
 * one: the two splits are independent, so the back office can be moved onto
 * its own subdomain without also committing to a merchant subdomain, and
 * vice versa. Unset (the default) keeps `/admin` reachable path-based on
 * whatever host serves it today, with zero configuration.
 */
const RAW_ADMIN_HOST =
  process.env.NEXT_PUBLIC_ADMIN_HOST?.trim().toLowerCase() || null;

/**
 * Resolves the client host's origin from `BETTER_AUTH_URL`, falling back to
 * the local-dev default if the env var is missing or malformed — the same
 * fallback Better Auth itself effectively uses when `baseURL` is omitted.
 */
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
// The client host's protocol, used as the merchant host's protocol too since
// both hosts share one deployment. Hoisted so `merchantOrigin()` doesn't
// re-parse a constant URL on every call.
const CLIENT_PROTOCOL = new URL(CLIENT_ORIGIN).protocol;

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

/**
 * The merchant host's exact hostname, or `null` when the split is disabled
 * or misconfigured.
 */
export const MERCHANT_HOST = MISCONFIGURED ? null : RAW_MERCHANT_HOST;

/** Whether the merchant/client split is active at all. */
export const IS_HOST_SPLIT_ENABLED = MERCHANT_HOST !== null;

// Same fail-safe as MISCONFIGURED above, widened to both other hosts: an admin
// host equal to the client host would 307-redirect every non-/admin path to
// itself forever, and one equal to the merchant host would make a single
// hostname claim two mutually exclusive audiences (whichever check ran first
// would win, silently). Disable the admin split instead of shipping either.
const ADMIN_MISCONFIGURED =
  RAW_ADMIN_HOST !== null &&
  (RAW_ADMIN_HOST === CLIENT_HOST.toLowerCase() ||
    (RAW_MERCHANT_HOST !== null && RAW_ADMIN_HOST === RAW_MERCHANT_HOST));

if (ADMIN_MISCONFIGURED) {
  console.error(
    `[host] NEXT_PUBLIC_ADMIN_HOST ("${RAW_ADMIN_HOST}") collides with the ` +
      `client host derived from BETTER_AUTH_URL ("${CLIENT_HOST}") or with ` +
      "NEXT_PUBLIC_MERCHANT_HOST. Disabling the admin host split to avoid a " +
      "redirect loop / ambiguous audience — fix one of these values.",
  );
}

/**
 * The admin host's exact hostname, or `null` when the admin split is disabled
 * or misconfigured.
 */
export const ADMIN_HOST = ADMIN_MISCONFIGURED ? null : RAW_ADMIN_HOST;

/**
 * Whether the admin host split is active. Independent of
 * `IS_HOST_SPLIT_ENABLED` — either split can be on while the other is off.
 */
export const IS_ADMIN_HOST_ENABLED = ADMIN_HOST !== null;

/**
 * Classifies an incoming request's host. `"BOTH"` when the merchant split is
 * disabled (today's behavior — every audience is allowed). Any hostname
 * that isn't an exact match for `MERCHANT_HOST` falls back to `"CLIENT"`,
 * never `"MERCHANT"` — the least-privileged, public-facing surface is the
 * safe default for an unrecognized host.
 */
export function audienceForHost(host: string | null | undefined): Audience {
  // Checked first and outside the `IS_HOST_SPLIT_ENABLED` bail-out below,
  // which only gates the merchant dimension: the admin split has its own env
  // var and must classify correctly whether or not the merchant split is on.
  if (host && ADMIN_HOST && host.toLowerCase() === ADMIN_HOST) {
    return "ADMIN";
  }

  if (!IS_HOST_SPLIT_ENABLED) {
    return "BOTH";
  }

  if (
    host &&
    MERCHANT_HOST &&
    host.toLowerCase() === MERCHANT_HOST.toLowerCase()
  ) {
    return "MERCHANT";
  }

  return "CLIENT";
}

/**
 * The client host's origin (scheme + host), e.g. `"http://localhost:3000"`.
 * Server-side only — see the module doc comment above.
 */
export function clientOrigin(): string {
  return CLIENT_ORIGIN;
}

/**
 * The merchant host's origin, or `null` when the split is disabled.
 * Reuses the current page's / client origin's scheme (both hosts share the
 * same deployment and therefore the same protocol in practice). Safe to call
 * from both server and client components — see the module doc comment above.
 */
export function merchantOrigin(): string | null {
  if (!MERCHANT_HOST) {
    return null;
  }

  // In the browser, `window.location.protocol` is the one reliable source
  // for the real deployment scheme — `BETTER_AUTH_URL` (which CLIENT_PROTOCOL
  // is derived from) has no `NEXT_PUBLIC_` prefix and is `undefined` client-
  // side, silently defaulting to "http:" there regardless of the actual
  // deployment. This was a real bug: two landing-page components with no
  // `"use client"` directive of their own still ended up bundled into the
  // browser (transitively, via `src/app/page.tsx` being `"use client"`), so
  // this function must be genuinely safe to call from either context, not
  // just documented as server-only.
  const protocol =
    typeof window !== "undefined" ? window.location.protocol : CLIENT_PROTOCOL;

  return `${protocol}//${MERCHANT_HOST}`;
}

/**
 * `trustedOrigins` entries for the merchant host, both schemes (so one
 * value works for `http://merchant.localhost:3000` in dev and
 * `https://merchant.example.com` in prod without a protocol-sniffing
 * branch). Empty when the split is disabled — appending this to the
 * existing `trustedOrigins` array is then a no-op.
 */
export const MERCHANT_TRUSTED_ORIGINS: string[] = MERCHANT_HOST
  ? [`http://${MERCHANT_HOST}`, `https://${MERCHANT_HOST}`]
  : [];

/**
 * The admin host's origin, or `null` when the admin split is disabled.
 * Mirrors `merchantOrigin()` exactly, including its client-side protocol
 * resolution — see that function's comment for why `window.location.protocol`
 * is the only reliable source in the browser.
 */
export function adminOrigin(): string | null {
  if (!ADMIN_HOST) {
    return null;
  }

  const protocol =
    typeof window !== "undefined" ? window.location.protocol : CLIENT_PROTOCOL;

  return `${protocol}//${ADMIN_HOST}`;
}

/**
 * `trustedOrigins` entries for the admin host, both schemes — mirrors
 * `MERCHANT_TRUSTED_ORIGINS` for the same reason: the admin subdomain is a
 * distinct origin, so without these every `POST /api/auth/*` from the admin
 * sign-in page would be rejected with `INVALID_ORIGIN`. Empty (and therefore
 * a no-op when spread) while the admin split is disabled.
 */
export const ADMIN_TRUSTED_ORIGINS: string[] = ADMIN_HOST
  ? [`http://${ADMIN_HOST}`, `https://${ADMIN_HOST}`]
  : [];
