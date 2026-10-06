import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { HomeEntry } from "@/components/home/home-entry";
import { resolveRouteLocale, type LocaleRouteParams } from "@/i18n/server";
import { loadHomePageContent } from "@/lib/admin/home-page-data";
import { clientOrigin } from "@/lib/host";
import { JsonLd, siteJsonLdGraph } from "@/lib/seo/json-ld";
import { alternatesFor } from "@/lib/seo/urls";

/**
 * Content edits go live within a minute rather than at the next deploy.
 *
 * Deliberately not `force-dynamic`: this is the site's front door and its
 * highest-traffic route, so it should not pay for a database round trip on
 * every request when the marketing copy changes a few times a month. A bounded
 * staleness window is the trade the back office is designed around — `/home`
 * stays `force-dynamic` and is the route staff use to check an edit
 * immediately.
 *
 * This value does real work now. It used to be inert: the route read its locale
 * from a `?locale=` query parameter, and `searchParams` is a dynamic API, so
 * Next rendered the page on demand and the window never applied. The locale is
 * a route segment today, which is static, so the ISR window this constant
 * always intended is finally the one in force — one cached document per
 * language.
 */
export const revalidate = 60;

/**
 * The landing page's search snippet. The title is absolute — it already leads
 * with the brand, so the layout's `"%s | zomo"` template would only repeat it —
 * and the canonical is the bare locale root on the client origin, the same URL
 * the coming-soon page names while the gate is on, so launch does not move it.
 */
export async function generateMetadata({
  params,
}: {
  params: LocaleRouteParams;
}): Promise<Metadata> {
  const locale = await resolveRouteLocale(params);
  const t = await getTranslations({ locale, namespace: "common.seo" });

  return {
    title: { absolute: t("home.title") },
    description: t("home.description"),
    alternates: alternatesFor(clientOrigin(), "/", locale),
  };
}

/**
 * `/` — what a visitor lands on.
 *
 * Signed out, this is the marketing landing page composed from the
 * `HomePageSection` and `Banner` rows staff edit under `/admin/content`;
 * signed in, it is the client booking form or a pointer to the provider
 * dashboard. That branch depends on a client-side session, so it lives in
 * `HomeEntry`; this component's only job is to read the content the signed-out
 * branch needs, which requires the server.
 *
 * The content is loaded unconditionally, before the session is known. That
 * costs two indexed reads on a signed-in render, which is the price of keeping
 * the existing session handling untouched — and it is what makes the landing
 * page's HTML server-rendered for crawlers rather than assembled after
 * hydration.
 *
 * Every section type the locale has no row for comes back filled with its
 * default copy, translated into the route's language — so `/ka` with no `KA`
 * rows is the whole default page in Georgian, and a partly authored locale
 * still renders every section. Banners have no default: with none authored, the
 * carousel and the marquee render nothing.
 *
 * Nothing here is read per-session. The booking form used to be handed the
 * client's payment options from this component, which cost a session read on
 * every render of the site's front door. It no longer collects payment at all —
 * booking redirects to the order's own checkout page, and that page loads the
 * options for itself — so this route is back to reading marketing content and
 * nothing else. That is what gives `revalidate` above something to do now that
 * the `searchParams` stopgap is gone, and what keeps a per-client response out
 * of any shared cache by never producing one.
 */
export default async function Home({ params }: { params: LocaleRouteParams }) {
  const locale = await resolveRouteLocale(params);

  const [{ sections, heroBanners, partnerBanners }, jsonLd] = await Promise.all(
    [loadHomePageContent(locale), siteJsonLdGraph(clientOrigin(), locale)],
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <HomeEntry
        sections={sections}
        heroBanners={heroBanners}
        partnerBanners={partnerBanners}
      />
    </>
  );
}
