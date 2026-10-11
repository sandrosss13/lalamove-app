import { headers } from "next/headers";

import { LandingPage } from "@/components/landing/landing-page";
import { resolveRouteLocale, type LocaleRouteParams } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { loadHomePageContent } from "@/lib/admin/home-page-data";

// Reads content rows per request, so the page cannot be prerendered: an edit in
// the back office has to be visible on the next load, not at the next deploy.
// `/` serves the same composition on a 60-second revalidate; this is the route
// staff use to see an edit immediately. Previewing the other locale is now just
// the other URL — `/ka/home` and `/en/home` — rather than a query parameter.
export const dynamic = "force-dynamic";

/**
 * `/home` — the marketing landing page, composed from the `HomePageSection`
 * rows staff edit under `/admin/content/home-page`.
 *
 * Lets a signed-in user view the marketing landing page without signing out —
 * `/` shows their booking form or provider prompt once authenticated. Both
 * routes read the same content through `@/lib/admin/home-page-data`, so what
 * this route previews is what the front door serves.
 *
 * `showSiteHeader` is why this route checks for a session at all: a
 * signed-in visitor gets the global header (their account nav, sign out) in
 * place of the landing page's own utility bar and header, so the app's
 * navigation stays where it is on every other signed-in page and the two never
 * stack. A signed-out visitor gets the landing header and no global one.
 */
export default async function HomePage({
  params,
}: {
  params: LocaleRouteParams;
}) {
  const locale = await resolveRouteLocale(params);

  const [{ sections, heroBanners, partnerBanners, offerBanners }, session] =
    await Promise.all([
      loadHomePageContent(locale),
      auth.api.getSession({ headers: await headers() }),
    ]);

  return (
    <LandingPage
      sections={sections}
      heroBanners={heroBanners}
      partnerBanners={partnerBanners}
      offerBanners={offerBanners}
      showSiteHeader={session !== null}
    />
  );
}
