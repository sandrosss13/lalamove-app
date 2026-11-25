import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { loadServiceLandingContent } from "@/components/service-landing/service-landing-content";
import { ServiceLandingPage } from "@/components/service-landing/service-landing-page";
import { resolveRouteLocale } from "@/i18n/server";
import type { AppLocale } from "@/i18n/routing";
import { clientOrigin } from "@/lib/host";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  JsonLd,
  landingServiceJsonLd,
  organizationJsonLd,
  websiteJsonLd,
  type JsonLdNode,
} from "@/lib/seo/json-ld";
import {
  SERVICE_LANDING_SLUGS,
  isServiceLandingSlug,
  serviceLandingPath,
  type ServiceLandingSlug,
} from "@/lib/seo/services";
import { alternatesFor, localeUrl } from "@/lib/seo/urls";
import { IS_CLIENT_UNDER_CONSTRUCTION } from "@/lib/under-construction";

type ServiceRouteParams = Promise<{ locale: string; service: string }>;

/**
 * Only the six known services exist. An unknown slug is a 404 once the site
 * is live; while the pre-launch gate is on, the middleware rewrites it to the
 * coming-soon page (noindex) before it ever reaches this route.
 */
export const dynamicParams = false;

/**
 * Called once per locale from the parent `[locale]` layout's params, so the
 * full set is every service in both languages — all statically rendered, with
 * no database read anywhere on the page.
 */
export function generateStaticParams() {
  return SERVICE_LANDING_SLUGS.map((service) => ({ service }));
}

/** The country every service is offered across, for `areaServed`. */
const COUNTRY_NAME: Record<AppLocale, string> = {
  ka: "საქართველო",
  en: "Georgia",
};

/**
 * Each service's schema.org `serviceType`: a machine-facing English category
 * label, the same in both locales (as on the city pages), so it lives here
 * rather than in the catalogs a reader's copy comes from.
 */
const SERVICE_TYPE: Record<ServiceLandingSlug, string> = {
  "binis-gadazidva": "Moving service",
  "avejis-gadazidva": "Furniture delivery",
  "teqnikis-gadazidva": "Appliance delivery",
  "opisis-gadazidva": "Office moving",
  "samsheneblo-masalebis-gadazidva": "Building materials delivery",
  mtvirtavebi: "Movers and loaders",
};

/** Validates both route segments; 404s on either being unknown. */
async function resolveServiceParams(
  params: ServiceRouteParams,
): Promise<{ locale: AppLocale; service: ServiceLandingSlug }> {
  const locale = await resolveRouteLocale(params);
  const { service } = await params;

  if (!isServiceLandingSlug(service)) {
    notFound();
  }

  return { locale, service };
}

/**
 * The title is relative on purpose — the layout's `"%s | zomo"` template
 * appends the brand, and the catalog titles are sized for that. `openGraph` is
 * not set, for the same reason as on the city pages: it would replace the
 * parent's wholesale and drop the file-based `opengraph-image`.
 */
export async function generateMetadata({
  params,
}: {
  params: ServiceRouteParams;
}): Promise<Metadata> {
  const { locale, service } = await resolveServiceParams(params);
  const t = await getTranslations({
    locale,
    namespace: `serviceLanding.services.${service}.meta`,
  });

  return {
    title: t("title"),
    description: t("description"),
    alternates: alternatesFor(
      clientOrigin(),
      serviceLandingPath(service),
      locale,
    ),
  };
}

/** Organisation and website (shared with `/`), plus this page's own nodes. */
async function serviceJsonLdGraph(
  locale: AppLocale,
  service: ServiceLandingSlug,
  faqItems: ReadonlyArray<{ question: string; answer: string }>,
): Promise<JsonLdNode> {
  const origin = clientOrigin();
  const pageUrl = localeUrl(origin, locale, serviceLandingPath(service));
  const [tSeo, t, tShared] = await Promise.all([
    getTranslations({ locale, namespace: "common.seo" }),
    getTranslations({ locale, namespace: "serviceLanding" }),
    getTranslations({ locale, namespace: "cityLanding.shared" }),
  ]);
  const keyword = t(`services.${service}.keyword`);

  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationJsonLd(origin, tSeo("home.description")),
      websiteJsonLd(origin, locale),
      landingServiceJsonLd(origin, pageUrl, {
        serviceType: SERVICE_TYPE[service],
        name: keyword,
        description: t(`services.${service}.meta.description`),
        countryName: COUNTRY_NAME[locale],
      }),
      breadcrumbJsonLd([
        {
          name: tShared("breadcrumbHome"),
          url: localeUrl(origin, locale, "/"),
        },
        { name: keyword, url: pageUrl },
      ]),
      faqPageJsonLd(pageUrl, faqItems),
    ],
  };
}

/**
 * `/{locale}/momsakhureba/{service}` — one page per kind of job ("house
 * moving", "furniture delivery", "movers"…) for search.
 *
 * Live and indexable even while `CLIENT_UNDER_CONSTRUCTION` is on (the
 * middleware exempts these paths from the gate), like the city pages; the
 * flag only switches the calls to action between driver sign-up and booking.
 */
export default async function ServiceLandingRoute({
  params,
}: {
  params: ServiceRouteParams;
}) {
  const { locale, service } = await resolveServiceParams(params);
  const content = await loadServiceLandingContent({
    locale,
    service,
    isGated: IS_CLIENT_UNDER_CONSTRUCTION,
  });
  // The FAQ markup is built from the very items the page renders, so the
  // structured data can never describe questions a reader cannot see.
  const jsonLd = await serviceJsonLdGraph(locale, service, content.faq.items);

  return (
    <>
      <JsonLd data={jsonLd} />
      <ServiceLandingPage content={content} />
    </>
  );
}
