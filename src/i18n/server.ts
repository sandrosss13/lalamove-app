import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getLocale, setRequestLocale } from "next-intl/server";

import type { ContentLocale } from "@prisma/client";

import {
  DEFAULT_LOCALE,
  isAppLocale,
  routing,
  toContentLocale,
  withLocalePrefix,
  type AppLocale,
} from "@/i18n/routing";

/** The `params` shape every page and layout under `src/app/[locale]` receives. */
export type LocaleRouteParams = Promise<{ locale: string }>;

/**
 * Validates a route's `[locale]` segment and opts the page into static
 * rendering.
 *
 * Two things happen here that a page must not skip:
 *
 * 1. **Validation.** The segment is URL input, so it arrives as `string`. The
 *    root layout already 404s an unknown locale, but a page cannot rely on that
 *    for its *types* — and a cast would be a lie the compiler could not catch
 *    if the layout's guard ever moved.
 * 2. **`setRequestLocale`.** Without it, the first `useTranslations` in a page's
 *    subtree opts that route out of static rendering. Several routes here have
 *    an `export const revalidate` that depends on staying static, so this is
 *    load bearing rather than an optimisation.
 *
 * Call it in every server page under `src/app/[locale]` — including ones that
 * do not render text themselves, since their children may.
 */
export async function resolveRouteLocale(
  params: LocaleRouteParams,
): Promise<AppLocale> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return locale;
}

/**
 * The same, for a page whose work is a query against one of the locale-keyed
 * content tables (`HomePageSection`, `Banner`, `StaticPage`, `MessagingTemplate`,
 * `TranslationEntry`) rather than a message lookup.
 *
 * This replaces the `?locale=` query parameter that
 * `src/lib/admin/home-page-data.ts` and `/pages/[slug]` each read as a documented
 * stopgap "until a real locale mechanism (path prefix or cookie) exists". The
 * prefix is that mechanism, and it is a better one than the stopgap in a way
 * worth naming: `searchParams` is a dynamic API, so reading it forced those
 * routes to render on demand and quietly neutered the landing page's
 * `revalidate = 60`. A route segment is static, so that ISR window now works.
 */
export async function resolveContentLocale(
  params: LocaleRouteParams,
): Promise<ContentLocale> {
  return toContentLocale(await resolveRouteLocale(params));
}

/**
 * Prefixes an internal path with the reader's active locale.
 *
 * Every internal redirect in this app is written as an unprefixed path, and
 * this is what attaches the language to it:
 *
 * ```ts
 * redirect(await localeHref("/sign-in")); // → /ka/sign-in
 * ```
 *
 * **Use it on every `redirect()` whose destination is a page in this app.** A
 * bare `redirect("/sign-in")` sends the browser to an unprefixed path that the
 * middleware then has to bounce into a locale: two extra round trips on an auth
 * gate, which is already the slowest moment in a session.
 *
 * Why this rather than the `redirect` from `@/i18n/navigation`, which does the
 * same job in one call: that wrapper is not declared to return `never`, and
 * `await`ing it would not narrow either. Next's own `redirect` *is* `never`, so
 * keeping it as the outer call preserves control-flow narrowing — the thing
 * that makes `if (!session) redirect("/sign-in")` typecheck the rest of the
 * function. Thirty-odd call sites depend on that.
 */
export async function localeHref(href: string): Promise<string> {
  const locale = await getLocale();

  // `getLocale()` is typed as the general `Locale` string, not this app's union.
  // It can only ever be one of ours — the request config resolves it from
  // `routing.locales` — but the guard is cheap and turns an impossible value
  // into Georgian rather than into a `/undefined/...` URL.
  return withLocalePrefix(isAppLocale(locale) ? locale : DEFAULT_LOCALE, href);
}
