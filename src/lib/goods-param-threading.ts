/**
 * Carrying a goods shortcut (`?goods=<code>`) from the landing page, through
 * sign-up / sign-in, to the booking form on `/`.
 *
 * The one rule this module exists to enforce: **only a shortcut code travels,
 * never a path.** A `?next=`-style parameter that names where to go after auth
 * is the classic open-redirect hole (`?next=//evil.com`), and this flow does not
 * need one — the post-auth destination is always one of the app's own constant
 * paths, and the only thing the visitor's URL may influence is which of the
 * fixed `GOODS_SHORTCUTS` codes is appended to it. A value that is not exactly
 * one of those codes is dropped, not cleaned up: there is no "nearly valid"
 * shortcut worth forwarding.
 *
 * Pure and dependency-light on purpose (no React, no Next), so the server pages
 * that parse the query string, the client forms that build every hop, and
 * `tests/goods-param-threading.spec.ts` all run the same code.
 */

import {
  isGoodsShortcutCode,
  type GoodsShortcutCode,
} from "@/lib/goods-shortcuts";

/** The query key the shortcut travels under, end to end. */
export const GOODS_PARAM = "goods";

/**
 * The one post-auth destination a shortcut is forwarded to. `/` is where the
 * signed-in client's booking form lives and where `HomeEntry` reads `?goods=`;
 * `/dashboard` (drivers, companies, the merchant host) has no use for it, so it
 * is never decorated.
 */
const GOODS_DESTINATION = "/";

/**
 * `?goods=` as a validated shortcut code, or `null`.
 *
 * Accepts the shapes both callers hand it: Next's `searchParams` entry (which is
 * an array when the key repeats) and `URLSearchParams.get` (which is `null` when
 * absent). A repeated key is treated as no answer, exactly as the auth pages
 * treat a repeated `role`. The comparison is exact — no trimming, no case
 * folding and, crucially, no further decoding: the framework has already
 * decoded the query string once, so `%2F%2Fevil.com` arrives here as
 * `//evil.com` (and is rejected), and `%252F` arrives as `%2F` (and is rejected).
 */
export function parseGoodsParam(
  raw: string | readonly string[] | null | undefined,
): GoodsShortcutCode | null {
  return typeof raw === "string" && isGoodsShortcutCode(raw) ? raw : null;
}

/**
 * Sets `goods` on a query being built, when there is a valid code to set.
 *
 * Re-validates even though the parameter is typed: a value cast into the type
 * (or arriving from untyped JavaScript) must still not reach a URL.
 */
export function appendGoodsParam(
  params: URLSearchParams,
  goods: string | null | undefined,
): void {
  const code = parseGoodsParam(goods);

  if (code !== null) {
    params.set(GOODS_PARAM, code);
  }
}

/**
 * `path` with `?goods=<code>` appended, for the app's own constant paths
 * (`/sign-up`, `/sign-in`, `/`).
 *
 * `path` is never user input — every caller passes a literal — but the guard
 * below makes that a property of this function rather than of its callers: a
 * protocol-relative (`//host`) or absolute (`https:`, `javascript:`) target is
 * returned untouched rather than decorated, so this helper can never be the
 * thing that turns a shortcut into an off-site link.
 */
export function withGoodsParam(
  path: string,
  goods: string | null | undefined,
): string {
  if (!isAppPath(path)) {
    return path;
  }

  const params = new URLSearchParams();
  appendGoodsParam(params, goods);
  const query = params.toString();

  if (query.length === 0) {
    return path;
  }

  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

/**
 * Where to send someone who has just signed in or signed up.
 *
 * `destination` is the flow's own choice (`/` for a client, `/dashboard` for
 * everyone else); the shortcut rides along only when that choice is `/`, the
 * one page that reads it.
 */
export function postAuthDestination(
  destination: string,
  goods: string | null | undefined,
): string {
  return destination === GOODS_DESTINATION
    ? withGoodsParam(destination, goods)
    : destination;
}

/** A same-origin, root-relative path: one leading slash, not two, no scheme. */
function isAppPath(path: string): boolean {
  return (
    path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")
  );
}
