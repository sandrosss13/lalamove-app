// Type-only, so the generated Prisma client is erased at compile time and never
// reaches the edge middleware or the browser bundle that import this module.
import type { ContentLocale } from "@prisma/client";

import { defineRouting } from "next-intl/routing";

/**
 * The platform's locales, in preference order.
 *
 * Georgian is first and is the default: this is a Georgian delivery platform —
 * the cities in `src/lib/georgian-cities.ts` are Georgian, prices are in lari —
 * and English is the opt-in second language rather than the other way round.
 *
 * These are BCP 47 tags (lowercase), which is what the URL carries and what
 * `<html lang>` needs. The database speaks a different dialect of the same
 * idea: `ContentLocale` in `prisma/schema.prisma` is the SCREAMING enum
 * `"KA" | "EN"`. `toContentLocale` below is the only sanctioned bridge between
 * the two, so the mapping lives in exactly one place.
 */
export const LOCALES = ["ka", "en"] as const;

export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "ka";

/**
 * Human-readable names for the language switcher, each written in its own
 * language (the convention every multilingual site follows — someone looking
 * for English should not have to read Georgian to find it, and vice versa).
 */
export const LOCALE_LABELS: Record<AppLocale, string> = {
  ka: "ქართული",
  en: "English",
};

/**
 * `localePrefix: "always"` — both locales are prefixed, so every URL states
 * its language: `/ka/home` and `/en/home`, never a bare `/home`.
 *
 * The alternative ("as-needed", Georgian at bare paths) would give the primary
 * audience cleaner URLs, but it makes the unprefixed path ambiguous for the
 * host gate in `src/middleware.ts` — `/orders` would be both "the Georgian
 * orders page" and "a path that has not been through locale negotiation yet" —
 * and it makes every `generateStaticParams` result asymmetric. Prefixing both
 * keeps one rule with no exceptions.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});

/**
 * Splits a locale prefix off a pathname.
 *
 * Returns the locale (or `null` when the path carries none) and the remainder,
 * always normalised to start with `/` so callers never have to special-case the
 * bare-prefix form:
 *
 * ```
 * "/ka/home"       → { locale: "ka",  pathname: "/home" }
 * "/ka"            → { locale: "ka",  pathname: "/" }
 * "/en/orders/42"  → { locale: "en",  pathname: "/orders/42" }
 * "/home"          → { locale: null,  pathname: "/home" }
 * "/"              → { locale: null,  pathname: "/" }
 * ```
 *
 * This is what lets `src/middleware.ts` keep its host gate written against
 * unprefixed paths (`CLIENT_ONLY_EXACT` is still `["/", "/home", "/orders"]`):
 * the gate runs on `pathname` here, not on the incoming URL.
 *
 * Deliberately a pure function in a module with no server-only imports, so the
 * edge middleware and `tests/locale-routing.spec.ts` can both use it.
 */
export function splitLocalePrefix(pathname: string): {
  locale: AppLocale | null;
  pathname: string;
} {
  // `"/ka/home".split("/")` → `["", "ka", "home"]`, so the candidate segment is
  // at index 1 and the remainder is everything from index 2 on.
  const segments = pathname.split("/");
  const candidate = segments[1];

  if (!isAppLocale(candidate)) {
    return { locale: null, pathname };
  }

  const rest = segments.slice(2).join("/");

  return { locale: candidate, pathname: rest === "" ? "/" : `/${rest}` };
}

/**
 * The inverse of `splitLocalePrefix`: puts `pathname` under `locale`.
 *
 * `/` maps to the bare prefix (`/ka`, not `/ka/`) because a trailing slash
 * would make the landing page reachable at two URLs, which is exactly the kind
 * of duplicate a crawler penalises.
 */
export function withLocalePrefix(locale: AppLocale, pathname: string): string {
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

/** Narrowing guard for an untrusted value — a URL segment, a cookie, a query. */
export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Bridges a URL/`<html lang>` locale to the `ContentLocale` enum the content
 * tables are keyed by (`Banner`, `StaticPage`, `TranslationEntry`,
 * `MessagingTemplate`, `HomePageSection`).
 *
 * Written as an exhaustive `Record` rather than `locale.toUpperCase()` so that
 * adding a locale to `LOCALES` fails the build here — a cast would silently
 * produce a `ContentLocale` that has no matching enum value in the database and
 * fail at query time instead.
 */
const CONTENT_LOCALE_BY_APP_LOCALE: Record<AppLocale, ContentLocale> = {
  ka: "KA",
  en: "EN",
};

export function toContentLocale(locale: AppLocale): ContentLocale {
  return CONTENT_LOCALE_BY_APP_LOCALE[locale];
}
