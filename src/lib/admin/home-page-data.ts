// Reads the `HomePageSection` and `Banner` tables through Prisma, so it can
// never be part of a browser bundle. The landing page's entry point (`/`) is a
// server component precisely so it can call this and hand the result down to
// the client component that branches on the session.
import "server-only";

import type { ContentLocale } from "@prisma/client";

import type {
  LandingBanner,
  LandingSection,
} from "@/components/landing/landing-page";
import {
  HOME_HERO_BANNER_PLACEMENT,
  HOME_PARTNER_LOGO_BANNER_PLACEMENT,
  HOME_SECONDARY_BANNER_PLACEMENT,
  parseHomePageSection,
} from "@/lib/admin/home-page-content";
import { prisma } from "@/lib/prisma";

/** Every landing placement, so all three banner lists come out of one query. */
const HOME_BANNER_PLACEMENTS = [
  HOME_HERO_BANNER_PLACEMENT,
  HOME_PARTNER_LOGO_BANNER_PLACEMENT,
  HOME_SECONDARY_BANNER_PLACEMENT,
];

/** The banner placements the landing page loads, split by placement. */
export type HomePageBanners = {
  /** The hero carousel's slides. */
  heroBanners: LandingBanner[];
  /** The partner logo marquee's logos. */
  partnerBanners: LandingBanner[];
  /**
   * Kept loaded, but no longer rendered: the redesign replaced the vertical
   * banner stack that read this placement with the hero carousel. The
   * placement, its admin form and this list all stay so existing rows are not
   * orphaned and a future section can pick them up without a schema change.
   */
  secondaryBanners: LandingBanner[];
};

/** Everything `LandingPage` needs to compose itself for one locale. */
export type HomePageContent = HomePageBanners & {
  sections: LandingSection[];
};

/**
 * The active, locale-matched sections in `sortOrder`, each validated against
 * the shape its `type` declares.
 *
 * A row that fails validation is skipped rather than thrown on. `content` is a
 * `Json` column, so a row written before a shape changed — or edited straight
 * in the database — is possible, and one bad section must not take the whole
 * marketing page down. An empty result is not a failure: it is what a database
 * nobody has authored content in returns, and `LandingPage` answers it with its
 * built-in default composition.
 */
export async function loadHomePageSections(
  locale: ContentLocale,
): Promise<LandingSection[]> {
  const rows = await prisma.homePageSection.findMany({
    where: { locale, isActive: true },
    // `createdAt` breaks ties so two sections sharing a `sortOrder` keep a
    // stable order between renders instead of swapping around.
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const sections: LandingSection[] = [];

  for (const row of rows) {
    const parsed = parseHomePageSection(row.type, row.content);

    if ("error" in parsed) {
      console.warn(
        `Skipping home page section ${row.id} (${row.type}): ${parsed.error}`,
      );
      continue;
    }

    sections.push({ id: row.id, ...parsed.data });
  }

  return sections;
}

/**
 * Active banners for the landing page's placements, split by placement.
 *
 * "Active" is both the `isActive` switch and the optional display window: a
 * banner scheduled for next month, or one that ended last week, is off the page
 * without anyone having to remember to switch it.
 */
export async function loadHomePageBanners(
  locale: ContentLocale,
): Promise<HomePageBanners> {
  const now = new Date();

  const rows = await prisma.banner.findMany({
    where: {
      locale,
      isActive: true,
      placement: { in: HOME_BANNER_PLACEMENTS },
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      imageUrl: true,
      linkUrl: true,
      placement: true,
    },
  });

  return {
    heroBanners: rows.filter(
      (row) => row.placement === HOME_HERO_BANNER_PLACEMENT,
    ),
    partnerBanners: rows.filter(
      (row) => row.placement === HOME_PARTNER_LOGO_BANNER_PLACEMENT,
    ),
    secondaryBanners: rows.filter(
      (row) => row.placement === HOME_SECONDARY_BANNER_PLACEMENT,
    ),
  };
}

/**
 * Everything the landing page composes itself from, for one locale.
 *
 * Sections and banners are independent queries, so they overlap rather than
 * queue. Both `/` and `/home` render the same marketing page and so go through
 * here: there is one implementation of "what content is on the landing page",
 * not one per route.
 */
export async function loadHomePageContent(
  locale: ContentLocale,
): Promise<HomePageContent> {
  const [sections, banners] = await Promise.all([
    loadHomePageSections(locale),
    loadHomePageBanners(locale),
  ]);

  return { sections, ...banners };
}
