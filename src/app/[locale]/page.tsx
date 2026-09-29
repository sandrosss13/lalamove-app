import { HomeEntry } from "@/components/home/home-entry";
import { resolveContentLocale, type LocaleRouteParams } from "@/i18n/server";
import { loadHomePageContent } from "@/lib/admin/home-page-data";

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
 * With no rows authored for the locale, both lists come back empty and
 * `LandingPage` falls back to its built-in default composition — the same copy
 * the page rendered before it was made editable.
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
  const locale = await resolveContentLocale(params);

  const { sections, heroBanners, partnerBanners } =
    await loadHomePageContent(locale);

  return (
    <HomeEntry
      sections={sections}
      heroBanners={heroBanners}
      partnerBanners={partnerBanners}
    />
  );
}
