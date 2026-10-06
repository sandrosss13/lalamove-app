import {
  DEFAULT_LOCALE,
  LOCALES,
  withLocalePrefix,
  type AppLocale,
} from "@/i18n/routing";
import {
  adminOrigin,
  clientOrigin,
  merchantOrigin,
  type Audience,
} from "@/lib/host";

/**
 * Absolute URLs for metadata: canonicals, `hreflang` alternates, sitemap
 * entries and JSON-LD `@id`s.
 *
 * Server-side by intent — `clientOrigin()` reads `BETTER_AUTH_URL`, which has no
 * `NEXT_PUBLIC_` prefix and is `undefined` in the browser. It deliberately does
 * not `import "server-only"`: that package throws outside the `react-server`
 * condition, which would make these pure string helpers unimportable from the
 * Playwright specs that exercise them.
 *
 * Every URL is built on an explicit origin rather than on the request host, so
 * a page's canonical never depends on which hostname happened to serve it — a
 * `*.vercel.app` preview of `/ka` still names `https://zomo.ge/ka` as the
 * original — and so the pages calling this can stay statically rendered.
 */

/**
 * The public origin an audience is served from.
 *
 * MERCHANT and ADMIN fall back to the client origin when their host split is
 * disabled: with no dedicated subdomain, the main host *is* where those pages
 * live. `BOTH` is that same split-disabled case seen from the other side.
 */
export function siteOrigin(audience: Audience): string {
  switch (audience) {
    case "MERCHANT":
      return merchantOrigin() ?? clientOrigin();
    case "ADMIN":
      return adminOrigin() ?? clientOrigin();
    default:
      return clientOrigin();
  }
}

/**
 * `origin` + `path` under `locale`'s prefix. `path` is unprefixed and starts
 * with `/`; `/` maps to the bare prefix (`https://zomo.ge/ka`, no trailing
 * slash), which is the one form `withLocalePrefix` and the middleware agree on.
 */
export function localeUrl(
  origin: string,
  locale: AppLocale,
  path: string,
): string {
  return `${origin}${withLocalePrefix(locale, path)}`;
}

/** The shape Next's `Metadata["alternates"]` and sitemap entries both accept. */
export type LocaleAlternates = {
  canonical: string;
  languages: Record<string, string>;
};

/**
 * Canonical URL for `locale` plus an `hreflang` entry for every language the
 * page exists in, and `x-default` pointing at the Georgian version — Georgian is
 * the platform's default language, so it is what a searcher whose language
 * matches neither entry should land on.
 *
 * `locales` narrows the set for content that is not translated everywhere (a
 * static page published in one language only): advertising an alternate that
 * 404s is worse than advertising none. When Georgian is not in that set,
 * `x-default` falls back to the first locale that is.
 */
export function alternatesFor(
  origin: string,
  path: string,
  locale: AppLocale,
  locales: readonly AppLocale[] = LOCALES,
): LocaleAlternates {
  const languages: Record<string, string> = {};

  for (const option of locales) {
    languages[option] = localeUrl(origin, option, path);
  }

  const defaultLocale = locales.includes(DEFAULT_LOCALE)
    ? DEFAULT_LOCALE
    : (locales[0] ?? locale);
  languages["x-default"] = localeUrl(origin, defaultLocale, path);

  return { canonical: localeUrl(origin, locale, path), languages };
}

/**
 * Open Graph locale tags (`og:locale`) for the app's locales. Open Graph wants
 * `language_TERRITORY`, not the bare BCP 47 tag the URL carries.
 */
export const OPEN_GRAPH_LOCALE: Record<AppLocale, string> = {
  ka: "ka_GE",
  en: "en_US",
};
