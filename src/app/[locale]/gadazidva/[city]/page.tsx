import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CityLandingPage } from "@/components/city-landing/city-landing-page";
import { loadCityLandingContent } from "@/components/city-landing/city-landing-content";
import { resolveRouteLocale } from "@/i18n/server";
import type { AppLocale } from "@/i18n/routing";
import { clientOrigin } from "@/lib/host";
import {
  CITY_LANDING_SLUGS,
  cityLandingPath,
  isCityLandingSlug,
  type CityLandingSlug,
} from "@/lib/seo/cities";
import {
  breadcrumbJsonLd,
  cityServiceJsonLd,
  faqPageJsonLd,
  JsonLd,
  organizationJsonLd,
  websiteJsonLd,
  type JsonLdNode,
} from "@/lib/seo/json-ld";
import { alternatesFor, localeUrl } from "@/lib/seo/urls";
import { IS_CLIENT_UNDER_CONSTRUCTION } from "@/lib/under-construction";

type CityRouteParams = Promise<{ locale: string; city: string }>;

/**
 * Only the six known cities exist. An unknown slug is a 404 once the site is
 * live; while the pre-launch gate is on, the middleware rewrites it to the
 * coming-soon page (noindex) before it ever reaches this route.
 */
export const dynamicParams = false;

/**
 * Called once per locale from the parent `[locale]` layout's params, so the
 * full set is every city in both languages — all statically rendered, with no
 * database read anywhere on the page.
 */
export function generateStaticParams() {
  return CITY_LANDING_SLUGS.map((city) => ({ city }));
}

/**
 * The country the cities are placed in, for the `Service` node's
 * `areaServed`. A two-entry constant rather than a catalog message: it is
 * machine-facing structured data, not copy a reader sees.
 */
const COUNTRY_NAME: Record<AppLocale, string> = {
  ka: "საქართველო",
  en: "Georgia",
};

/** Validates both route segments; 404s on either being unknown. */
async function resolveCityParams(
  params: CityRouteParams,
): Promise<{ locale: AppLocale; city: CityLandingSlug }> {
  const locale = await resolveRouteLocale(params);
  const { city } = await params;

  if (!isCityLandingSlug(city)) {
    notFound();
  }

  return { locale, city };
}

/**
 * The title is relative on purpose — the layout's `"%s | zomo"` template
 * appends the brand, and the catalog titles are sized for that. `openGraph` is
 * not set: a segment's `openGraph` replaces its parent's wholesale and would
 * drop the file-based `opengraph-image` beside this page.
 */
export async function generateMetadata({
  params,
}: {
  params: CityRouteParams;
}): Promise<Metadata> {
  const { locale, city } = await resolveCityParams(params);
  const t = await getTranslations({
    locale,
    namespace: `cityLanding.cities.${city}.meta`,
  });

  return {
    title: t("title"),
    description: t("description"),
    alternates: alternatesFor(clientOrigin(), cityLandingPath(city), locale),
  };
}

/** Organisation and website (shared with `/`), plus this page's own nodes. */
async function cityJsonLdGraph(
  locale: AppLocale,
  city: CityLandingSlug,
  faqItems: ReadonlyArray<{ question: string; answer: string }>,
): Promise<JsonLdNode> {
  const origin = clientOrigin();
  const pageUrl = localeUrl(origin, locale, cityLandingPath(city));
  const [tSeo, t, tCities] = await Promise.all([
    getTranslations({ locale, namespace: "common.seo" }),
    getTranslations({ locale, namespace: "cityLanding" }),
    getTranslations({ locale, namespace: "cities.georgianCities" }),
  ]);
  const keyword = t(`cities.${city}.keyword`);

  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationJsonLd(origin, tSeo("home.description")),
      websiteJsonLd(origin, locale),
      cityServiceJsonLd(origin, pageUrl, {
        name: keyword,
        description: t(`cities.${city}.meta.description`),
        cityName: tCities(city),
        countryName: COUNTRY_NAME[locale],
      }),
      breadcrumbJsonLd([
        {
          name: t("shared.breadcrumbHome"),
          url: localeUrl(origin, locale, "/"),
        },
        { name: keyword, url: pageUrl },
      ]),
      faqPageJsonLd(pageUrl, faqItems),
    ],
  };
}

/**
 * `/{locale}/gadazidva/{city}` — "cargo delivery in <city>", one page per city
 * for search.
 *
 * Live and indexable even while `CLIENT_UNDER_CONSTRUCTION` is on (the
 * middleware exempts these paths from the gate). The flag only changes the
 * calls to action: before launch the page describes the service and offers the
 * driver sign-up; after launch it offers booking.
 */
export default async function CityLandingRoute({
  params,
}: {
  params: CityRouteParams;
}) {
  const { locale, city } = await resolveCityParams(params);
  const content = await loadCityLandingContent({
    locale,
    city,
    isGated: IS_CLIENT_UNDER_CONSTRUCTION,
  });
  // The FAQ markup is built from the very items the page renders, so the
  // structured data can never describe questions a reader cannot see.
  const jsonLd = await cityJsonLdGraph(locale, city, content.faq.items);

  return (
    <>
      <JsonLd data={jsonLd} />
      <CityLandingPage content={content} />
    </>
  );
}
