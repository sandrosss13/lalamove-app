import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import {
  DEFAULT_LOCALE,
  isAppLocale,
  splitLocalePrefix,
  type AppLocale,
} from "@/i18n/routing";

/**
 * The cookie `next-intl`'s middleware writes when it negotiates a locale, and
 * that the language switcher updates. Named here rather than imported because
 * `next-intl` does not export the constant.
 */
const LOCALE_COOKIE = "NEXT_LOCALE";

/** The value of one cookie in a raw `Cookie` header, or `undefined`. */
function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");

    if (key === name) {
      return rest.join("=");
    }
  }

  return undefined;
}

/**
 * The reader's locale, from a request's headers alone — for code outside the
 * `[locale]` route tree that holds a `Headers` object but may not be inside a
 * Next request scope (Better Auth hooks receive `ctx.request`).
 *
 * An API route is not under `/[locale]`, so `getLocale()` has no route segment
 * to read and would fall back to the default whatever the reader chose. The
 * signals it does have, in order of how deliberately the reader set them:
 *
 * 1. The `NEXT_LOCALE` cookie — the middleware sets it on every localized page
 *    view, and the language switcher rewrites it.
 * 2. The `Referer`'s `/ka` or `/en` prefix — the page that issued the fetch.
 *    Covers a first request before the cookie exists.
 * 3. `DEFAULT_LOCALE` (Georgian).
 *
 * Every value is validated with `isAppLocale`: both are client-controlled, and
 * an unvalidated one would reach `loadMessages` as a path fragment.
 */
export function resolveLocaleFromHeaders(requestHeaders: Headers): AppLocale {
  const cookieLocale = readCookie(requestHeaders.get("cookie"), LOCALE_COOKIE);

  if (isAppLocale(cookieLocale)) {
    return cookieLocale;
  }

  const referer = requestHeaders.get("referer");

  if (referer) {
    try {
      const { locale } = splitLocalePrefix(new URL(referer).pathname);

      if (locale) {
        return locale;
      }
    } catch {
      // A malformed Referer is not worth failing the request over; fall through.
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * The reader's locale for code running in a Next request scope outside the
 * `[locale]` route tree — API route handlers above all. See
 * `resolveLocaleFromHeaders` for the precedence.
 */
export async function getRequestLocale(): Promise<AppLocale> {
  return resolveLocaleFromHeaders(await headers());
}

/**
 * `getTranslations` bound to the request locale from `getRequestLocale`, for
 * API routes and other code outside `[locale]`:
 *
 * ```ts
 * const t = await getRequestTranslations("errors.ordersAccept");
 * return NextResponse.json({ error: t("onlyDriversCanAcceptDeliveries") }, …);
 * ```
 */
export async function getRequestTranslations(namespace?: string) {
  const locale = await getRequestLocale();

  return getTranslations({ locale, namespace });
}

/**
 * The translator `getRequestTranslations()` returns with no namespace, keyed by
 * full dotted paths (`"errors.orders.scheduledatIsRequired"`). For the sync
 * body parsers an API route threads it into.
 */
export type RequestTranslator = Awaited<
  ReturnType<typeof getRequestTranslations>
>;
