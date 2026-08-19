import { LandingPage } from "@/components/landing/landing-page";
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
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const locale = resolveHomePageLocale(query.locale);

  const { sections, heroBanners, secondaryBanners } =
    await loadHomePageContent(locale);

  return (
    <LandingPage
      sections={sections}
      heroBanners={heroBanners}
      secondaryBanners={secondaryBanners}
    />
  );
}
