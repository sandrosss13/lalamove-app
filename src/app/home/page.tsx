import { headers } from "next/headers";

import { LandingPage } from "@/components/landing/landing-page";
import { auth } from "@/lib/auth";
import {
  loadHomePageContent,
  resolveHomePageLocale,
} from "@/lib/admin/home-page-data";

// Reads content rows per request, so the page cannot be prerendered: an edit in
// the back office has to be visible on the next load, not at the next deploy.
// `/` serves the same composition on a 60-second revalidate; this is the route
// staff use to see an edit immediately, and to preview a locale.
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
 * `showSiteHeader` is why this route checks for a session at all otherwise:
 * a signed-in visitor keeps the global header (their account nav, sign out)
 * above the marketing content, since this page's own header has no idea
 * they're signed in and would otherwise leave them with no way back.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const locale = resolveHomePageLocale(query.locale);

  const [{ sections, heroBanners, secondaryBanners }, session] =
    await Promise.all([
      loadHomePageContent(locale),
      auth.api.getSession({ headers: await headers() }),
    ]);

  return (
    <LandingPage
      sections={sections}
      heroBanners={heroBanners}
      secondaryBanners={secondaryBanners}
      showSiteHeader={session !== null}
    />
  );
}
