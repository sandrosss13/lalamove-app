import { getTranslations } from "next-intl/server";

import type { AppLocale } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/brand";

import { localeUrl } from "./urls";

/**
 * schema.org structured data for the client host's front door.
 *
 * Deliberately limited to what is true today and verifiable from the site
 * itself: the organisation, the website, and the two services it sells. No
 * `LocalBusiness` (there is no public street address or opening hours to give
 * it), no `JobPosting` (driver sign-up is not a vacancy with a salary and a
 * closing date, and Google penalises job markup that is not one), and no
 * `sameAs` (there are no official social profiles to link yet).
 */

/** A JSON-LD node. Kept loose on purpose — schema.org is open-ended. */
export type JsonLdNode = Record<string, unknown>;

const SCHEMA_CONTEXT = "https://schema.org";

/** The square app icon: the logo search engines may show beside the brand. */
const LOGO_PATH = "/brand/app-icon-customer-512.png";

/**
 * Stable node identifiers, so the nodes in a `@graph` can reference each other
 * (`provider`, `publisher`) instead of repeating the organisation inline.
 */
function organizationId(origin: string): string {
  return `${origin}/#organization`;
}

function websiteId(origin: string): string {
  return `${origin}/#website`;
}

/** Tbilisi and Georgia — the two areas every service is offered in. */
const AREA_SERVED: JsonLdNode[] = [
  { "@type": "City", name: "Tbilisi" },
  { "@type": "Country", name: "Georgia" },
];

export function organizationJsonLd(
  origin: string,
  description: string,
): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": organizationId(origin),
    name: BRAND_NAME,
    url: origin,
    logo: `${origin}${LOGO_PATH}`,
    description,
    areaServed: AREA_SERVED,
  };
}

export function websiteJsonLd(origin: string, locale: AppLocale): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": websiteId(origin),
    name: BRAND_NAME,
    url: localeUrl(origin, locale, "/"),
    inLanguage: locale,
    publisher: { "@id": organizationId(origin) },
  };
}

/** One `Service` node per entry, all provided by the organisation. */
export function servicesJsonLd(
  origin: string,
  services: ReadonlyArray<{
    serviceType: string;
    name: string;
    description: string;
  }>,
): JsonLdNode[] {
  return services.map((service) => ({
    "@type": "Service",
    serviceType: service.serviceType,
    name: service.name,
    description: service.description,
    provider: { "@id": organizationId(origin) },
    areaServed: AREA_SERVED,
  }));
}

/**
 * The full graph for the client host's landing page (and the coming-soon page
 * that stands in for it), in the route's language.
 *
 * `serviceType` stays English in both locales: it is a machine-facing category
 * label, while `name` and `description` are what a searcher reads.
 */
export async function siteJsonLdGraph(
  origin: string,
  locale: AppLocale,
): Promise<JsonLdNode> {
  const t = await getTranslations({ locale, namespace: "common.seo" });

  return {
    "@context": SCHEMA_CONTEXT,
    "@graph": [
      organizationJsonLd(origin, t("home.description")),
      websiteJsonLd(origin, locale),
      ...servicesJsonLd(origin, [
        {
          serviceType: "Cargo delivery",
          name: t("services.cargo.name"),
          description: t("services.cargo.description"),
        },
        {
          serviceType: "House moving",
          name: t("services.moving.name"),
          description: t("services.moving.description"),
        },
      ]),
    ],
  };
}

/**
 * Serialises `data` into a `<script type="application/ld+json">`.
 *
 * `<` is escaped as `<` — still the same character to a JSON parser, but
 * it means no string inside the data (a page title, a translated description)
 * can ever spell `</script>` and break out of the element. `JSON.stringify`
 * alone does not do this, and it is the one escape that matters inside a
 * script tag.
 */
export function JsonLd({ data }: { data: JsonLdNode }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
