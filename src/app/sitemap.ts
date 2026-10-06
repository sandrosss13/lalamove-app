import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import {
  DEFAULT_LOCALE,
  LOCALES,
  type AppLocale,
  withLocalePrefix,
} from "@/i18n/routing";
import { audienceForHost, clientOrigin, merchantOrigin } from "@/lib/host";
import { prisma } from "@/lib/prisma";
import { CITY_LANDING_SLUGS, cityLandingPath } from "@/lib/seo/cities";
import { isIndexableDeployment, requestHost } from "@/lib/seo/site";
import { IS_CLIENT_UNDER_CONSTRUCTION } from "@/lib/under-construction";

/**
 * `/sitemap.xml`, one per host — exactly the URLs `isIndexablePath` in
 * `src/lib/seo/site.ts` allows there, each with its `hreflang` alternates.
 * Built per request from the `Host` header (all hosts share one deployment),
 * which makes this route dynamic.
 *
 * - Client host: the landing page and every city landing page in both
 *   languages, plus — once the pre-launch gate is off — every published static
 *   page. The city pages are exempt from the gate, so they are listed (with no
 *   database read) either way.
 * - Merchant host: driver sign-up in both languages.
 * - Admin host, unknown hosts, non-public deployments: empty.
 */

type SitemapEntry = MetadataRoute.Sitemap[number];

/** Static pages live at `/{locale}/pages/{slug}`. */
const STATIC_PAGES_SEGMENT = "/pages";

/**
 * One entry per locale for a path that exists in `locales`, each listing all of
 * them (plus `x-default`, the Georgian URL — Georgian is what an unprefixed
 * visitor gets) as alternates, which is how Google expects hreflang clusters in
 * a sitemap.
 */
function localizedEntries(
  origin: string,
  path: string,
  locales: readonly AppLocale[],
  extra: Partial<SitemapEntry> = {},
): MetadataRoute.Sitemap {
  const urlFor = (locale: AppLocale) =>
    new URL(withLocalePrefix(locale, path), origin).toString();

  const languages: Record<string, string> = {};
  for (const locale of locales) {
    languages[locale] = urlFor(locale);
  }
  const fallback = locales.includes(DEFAULT_LOCALE)
    ? DEFAULT_LOCALE
    : locales[0];
  if (fallback) {
    languages["x-default"] = urlFor(fallback);
  }

  return locales.map((locale) => ({
    url: urlFor(locale),
    alternates: { languages },
    ...extra,
  }));
}

const APP_LOCALE_BY_CONTENT_LOCALE: Record<string, AppLocale> = {
  KA: "ka",
  EN: "en",
};

/**
 * Published static pages, grouped by slug so each page's alternates list only
 * the languages it is actually published in. A database failure degrades to
 * the landing pages alone rather than failing the whole sitemap.
 */
async function staticPageEntries(
  origin: string,
): Promise<MetadataRoute.Sitemap> {
  let rows: { slug: string; locale: string; updatedAt: Date }[];
  try {
    rows = await prisma.staticPage.findMany({
      where: { isPublished: true },
      select: { slug: true, locale: true, updatedAt: true },
      orderBy: { slug: "asc" },
    });
  } catch (error) {
    console.error("[sitemap] could not load static pages", error);
    return [];
  }

  const bySlug = new Map<
    string,
    { locales: AppLocale[]; lastModified: Date }
  >();
  for (const row of rows) {
    const locale = APP_LOCALE_BY_CONTENT_LOCALE[row.locale];
    if (!locale) {
      continue;
    }
    const group = bySlug.get(row.slug) ?? {
      locales: [],
      lastModified: row.updatedAt,
    };
    group.locales.push(locale);
    if (row.updatedAt > group.lastModified) {
      group.lastModified = row.updatedAt;
    }
    bySlug.set(row.slug, group);
  }

  return [...bySlug].flatMap(([slug, { locales, lastModified }]) =>
    localizedEntries(
      origin,
      `${STATIC_PAGES_SEGMENT}/${encodeURIComponent(slug)}`,
      // Keep the app's locale order regardless of row order.
      LOCALES.filter((locale) => locales.includes(locale)),
      { lastModified },
    ),
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = requestHost(await headers());

  if (!isIndexableDeployment(host)) {
    return [];
  }

  const audience = audienceForHost(host);
  switch (audience) {
    case "CLIENT":
    case "BOTH": {
      const origin = clientOrigin();
      const pages = [
        ...localizedEntries(origin, "/", LOCALES),
        ...CITY_LANDING_SLUGS.flatMap((slug) =>
          localizedEntries(origin, cityLandingPath(slug), LOCALES),
        ),
      ];
      // Same rule as the middleware: the gate applies to the client audience
      // only, and while it is on every page but the root and the (exempt) city
      // pages is a duplicate of the "coming soon" page.
      const gated = IS_CLIENT_UNDER_CONSTRUCTION && audience === "CLIENT";
      return gated ? pages : [...pages, ...(await staticPageEntries(origin))];
    }
    case "MERCHANT": {
      const origin = merchantOrigin();
      return origin ? localizedEntries(origin, "/sign-up", LOCALES) : [];
    }
    case "ADMIN":
      return [];
  }
}
