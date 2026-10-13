/**
 * Who may see and act on a **guest order** — one booked without an account.
 *
 * An account order is guarded by `clientId`: every client-facing query scopes
 * to `clientId: session.user.id`, and that clause is the tenancy boundary. A
 * guest order has `clientId: null`, so it needs a different proof of
 * ownership. That proof is a **bearer token**: 32 random bytes minted when the
 * order is created, handed to the guest twice —
 *
 * - as an httpOnly cookie, `zomo_guest_order_<orderId>`, so the browser that
 *   booked can carry on through photos, checkout and the success page without
 *   anything to type; and
 * - as the private link `/track/<token>` on the success page, so the guest can
 *   follow the delivery from any device after the cookie is gone.
 *
 * Only `sha256(token)` is stored (`Order.guestAccessTokenHash`). A database
 * leak, a log line or an admin screen showing the row therefore never yields a
 * working link. sha256 rather than a slow password hash because the token is
 * 256 bits of randomness, not something a person chose — there is nothing to
 * brute-force, and a slow hash would only slow the public track page down.
 *
 * Every where-clause built here pins `clientId: null` next to the hash. A
 * guest token can therefore never open an *account* order, even one that
 * somehow carried a hash, which keeps the two ownership models from ever
 * overlapping.
 *
 * Not `server-only` so the pure parts (hashing, where-clauses) can be unit
 * tested without a server; nothing here is imported by a client component, and
 * the cookie helpers only work inside a request anyway.
 */

import { createHash, randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";
import type { NextResponse } from "next/server";

/** Cookie name is this prefix plus the order id; its value is the raw token. */
export const GUEST_ORDER_COOKIE_PREFIX = "zomo_guest_order_";

/** How long the booking browser keeps access: long enough to see a scheduled
 *  delivery through, after which the `/track/<token>` link still works. */
const GUEST_ORDER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

/** Bytes of randomness in a token — 256 bits, unguessable by any margin. */
const TOKEN_BYTES = 32;

/**
 * The shape a token minted by `createGuestAccessToken` always has: 32 bytes in
 * unpadded base64url is exactly 43 characters of that alphabet. Anything else
 * cannot be a token, so it is refused before hashing — a garbage cookie or a
 * mangled link becomes "no access" without a database round-trip.
 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** True when `token` is shaped like a token this module mints. */
export function isGuestAccessTokenShape(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}

/** Mint a new token and the hash to store for it. The raw token must be handed
 *  to the guest (cookie, link) and then forgotten — it is never persisted. */
export function createGuestAccessToken(): { token: string; hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  return { token, hash: hashGuestAccessToken(token) };
}

/** sha256 hex of a token — the form `Order.guestAccessTokenHash` stores. */
export function hashGuestAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** The cookie name carrying the guest token for one order. */
export function guestOrderCookieName(orderId: string): string {
  return `${GUEST_ORDER_COOKIE_PREFIX}${orderId}`;
}

/**
 * Hand the guest's token to the browser that booked. httpOnly so no script on
 * the page can read it, `sameSite: lax` so following the tracking link from
 * another site still sends it, `secure` in production (local dev runs over
 * plain http on a LAN address, where a secure cookie would never be stored).
 * One cookie per order, so a guest who books twice keeps access to both.
 */
export function setGuestOrderCookie(
  response: NextResponse,
  orderId: string,
  token: string,
): void {
  response.cookies.set({
    name: guestOrderCookieName(orderId),
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_ORDER_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * The raw token the current request carries for `orderId`, or `null` when it
 * carries none (or one that cannot be a token). Reads `next/headers`, so it
 * works in server components and route handlers alike.
 */
export async function readGuestOrderToken(
  orderId: string,
): Promise<string | null> {
  // Imported on call rather than at the top of the module, so the pure
  // helpers above load in a plain Node test runner, where `next/headers` does
  // not resolve outside Next's own bundler.
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const value = store.get(guestOrderCookieName(orderId))?.value;

  return value && isGuestAccessTokenShape(value) ? value : null;
}

/** Who is asking about an order: its signed-in client, or a guest holding the
 *  order's token. */
export type OrderAccess =
  { kind: "client"; userId: string } | { kind: "guest"; token: string };

/**
 * Resolves who may act on `orderId`: a signed-in CLIENT session →
 * `{ kind: "client" }`; otherwise a guest cookie for that order →
 * `{ kind: "guest" }`; otherwise `null`.
 *
 * This only says *who is asking*, not that they own the order — the answer
 * goes into `orderAccessWhere`, and the query decides. A caller that gets no
 * row for client access and wants to honour a guest cookie as well (a client
 * who booked as a guest and signed in afterwards) should use
 * `loadAccessibleOrder`, which tries both.
 *
 * Pass the already-loaded session if you have one (or `null`).
 */
export async function resolveOrderAccess(
  orderId: string,
  session: { user: { id: string; role?: string | null } } | null,
): Promise<OrderAccess | null> {
  if (session?.user.role === "CLIENT") {
    return { kind: "client", userId: session.user.id };
  }

  const token = await readGuestOrderToken(orderId);

  return token ? { kind: "guest", token } : null;
}

/**
 * Prisma where-clause for the order `access` may see: `{ id, clientId }` for a
 * client, `{ id, clientId: null, guestAccessTokenHash }` for a guest. Use it
 * in `findFirst` / `updateMany` — "not yours" and "does not exist" then give
 * the same empty answer, which is the one worth giving either way.
 */
export function orderAccessWhere(
  orderId: string,
  access: OrderAccess,
): Prisma.OrderWhereInput {
  if (access.kind === "client") {
    return { id: orderId, clientId: access.userId };
  }

  return {
    id: orderId,
    clientId: null,
    guestAccessTokenHash: hashGuestAccessToken(access.token),
  };
}

/**
 * Lookup for the public `/track/[token]` page: the guest order whose token
 * this is. A malformed token still produces a valid clause — its hash simply
 * matches nothing — so callers need no separate shape check.
 */
export function guestTokenWhere(token: string): Prisma.OrderWhereInput {
  return {
    clientId: null,
    guestAccessTokenHash: hashGuestAccessToken(token),
  };
}
