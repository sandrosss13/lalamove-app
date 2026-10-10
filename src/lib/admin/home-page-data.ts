// Reads the `HomePageSection` and `Banner` tables through Prisma, so it can
// never be part of a browser bundle. The landing page's entry point (`/`) is a
// server component precisely so it can call this and hand the result down to
// the client component that branches on the session.
import "server-only";

import type { ContentLocale } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getMessages } from "next-intl/server";

import type {
  LandingBanner,
  LandingSection,
} from "@/components/landing/landing-page";
import { toContentLocale, type AppLocale } from "@/i18n/routing";
import {
  HOME_HERO_BANNER_PLACEMENT,
  HOME_PARTNER_LOGO_BANNER_PLACEMENT,
  HOME_SECONDARY_BANNER_PLACEMENT,
  MAX_HERO_BANNERS,
  MAX_OFFER_BANNERS,
  MAX_PARTNER_LOGOS,
  buildDefaultHomePageSections,
  createMessageLookup,
  isHomePageSectionType,
  isRetiredHomePageSectionType,
  localizeDefaultHomePageContent,
  parseHomePageSection,
  withDefaultSections,
  type HomePageSectionContentByType,
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
  /**
   * The v4 offers row's cards: the same `home_secondary` rows as
   * `secondaryBanners`, capped at `MAX_OFFER_BANNERS`.
   */
  offerBanners: LandingBanner[];
};

/** Everything `LandingPage` needs to compose itself for one locale. */
export type HomePageContent = HomePageBanners & {
  sections: LandingSection[];
};

/** What one locale's `HomePageSection` rows say about the page. */
type AuthoredHomePageSections = {
  /** Active, valid rows in `sortOrder`, ready to render. */
  sections: LandingSection[];
  /**
   * Every type the locale has made a decision about: an active row that
   * parsed, or an inactive row (a section someone switched off). A type absent
   * from this set has never been authored and gets its default.
   */
  authoredTypes: Set<string>;
};

/**
 * `DEFAULT_HOME_PAGE_CONTENT` in `locale`'s language, translated through the
 * same catalogs the rest of the page reads.
 *
 * `getMessages` rather than `getTranslations`: the defaults are looked up by
 * key from a table, and a plain messages object lets the one lookup
 * (`createMessageLookup`) serve this, the client fallback in `LandingPage` and
 * the seed script alike. The messages already carry the English layer beneath
 * Georgian (`@/i18n/messages`), and a string with no message at all keeps its
 * English default — so a missing translation degrades to English, never to a
 * key path.
 */
export async function getDefaultHomePageContent(
  locale: AppLocale,
): Promise<HomePageSectionContentByType> {
  const messages = await getMessages({ locale });

  return localizeDefaultHomePageContent(createMessageLookup(messages));
}

/**
 * The locale's section rows, each validated against the shape its `type`
 * declares.
 *
 * Inactive rows are read too, but only for their type: they never render, and
 * they are what stops `withDefaultSections` from filling a deliberately hidden
 * section back in. One query either way, filtered here rather than twice in SQL.
 *
 * A row that fails validation is skipped rather than thrown on. `content` is a
 * `Json` column, so a row written before a shape changed — or edited straight
 * in the database — is possible, and one bad section must not take the whole
 * marketing page down. Its type is left out of `authoredTypes`, so the page
 * shows that section's default rather than a hole.
 *
 * Rows of a retired type (`RETIRED_HOME_PAGE_SECTION_TYPES`) are dropped
 * whatever their `isActive`: v4 has no slot for them, and an old active `hero`
 * row would otherwise render alongside the `hero_carousel` that replaced it.
 * The bulk admin actions switch such rows off, but the public page must not
 * depend on someone having run them. The admin listing reads the table
 * directly, so it still shows these rows in its Retired group.
 */
async function loadAuthoredHomePageSections(
  locale: ContentLocale,
): Promise<AuthoredHomePageSections> {
  const rows = await prisma.homePageSection.findMany({
    where: { locale },
    // `createdAt` breaks ties so two sections sharing a `sortOrder` keep a
    // stable order between renders instead of swapping around.
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, type: true, content: true, isActive: true },
  });

  const sections: LandingSection[] = [];
  const authoredTypes = new Set<string>();

  for (const row of rows) {
    if (isRetiredHomePageSectionType(row.type)) {
      continue;
    }

    if (!row.isActive) {
      if (isHomePageSectionType(row.type)) {
        authoredTypes.add(row.type);
      }
      continue;
    }

    const parsed = parseHomePageSection(row.type, row.content);

    if ("error" in parsed) {
      console.warn(
        `Skipping home page section ${row.id} (${row.type}): ${parsed.error}`,
      );
      continue;
    }

    authoredTypes.add(parsed.data.type);
    sections.push({ id: row.id, ...parsed.data });
  }

  return { sections, authoredTypes };
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
      eyebrow: true,
      body: true,
      ctaLabel: true,
      placement: true,
    },
  });

  const secondaryBanners = rows.filter(
    (row) => row.placement === HOME_SECONDARY_BANNER_PLACEMENT,
  );

  // Every list is capped here as well as at the admin API, so a row inserted
  // straight into the database (or an over-full placement left from before a
  // cap existed) can never overflow a component on the public page.
  return {
    heroBanners: rows
      .filter((row) => row.placement === HOME_HERO_BANNER_PLACEMENT)
      .slice(0, MAX_HERO_BANNERS),
    partnerBanners: rows
      .filter((row) => row.placement === HOME_PARTNER_LOGO_BANNER_PLACEMENT)
      .slice(0, MAX_PARTNER_LOGOS),
    secondaryBanners,
    offerBanners: secondaryBanners.slice(0, MAX_OFFER_BANNERS),
  };
}

/**
 * Everything the landing page composes itself from, for one locale.
 *
 * The page is always whole: each section type the locale has no row for is
 * filled with its default copy in that locale's language, so a database nobody
 * has authored content in renders the full default page, and a partly
 * translated one renders its authored rows with the rest filled in around them.
 *
 * Sections, banners and the localized defaults are independent, so they
 * overlap rather than queue. Both `/` and `/home` render the same marketing page
 * and so go through here: there is one implementation of "what content is on
 * the landing page", not one per route.
 */
export async function loadHomePageContent(
  locale: AppLocale,
): Promise<HomePageContent> {
  const contentLocale = toContentLocale(locale);

  const [{ sections, authoredTypes }, banners, defaults] = await Promise.all([
    loadAuthoredHomePageSections(contentLocale),
    loadHomePageBanners(contentLocale),
    getDefaultHomePageContent(locale),
  ]);

  return {
    sections: withDefaultSections(
      sections,
      buildDefaultHomePageSections(defaults),
      authoredTypes,
    ),
    ...banners,
  };
}

/**
 * Drops the cached landing page so a back-office edit shows on the next visit
 * instead of after the 60-second ISR window.
 *
 * The landing composition renders at two routes, both under the `[locale]`
 * segment: `/[locale]` (ISR, `revalidate = 60`) and `/[locale]/home`
 * (`force-dynamic`, listed anyway so it stays correct if that route ever
 * becomes cached). Passing the route *pattern* with `"page"` revalidates every
 * locale's document at once — deliberately not per-locale: edits are rare, a
 * regeneration costs one render per locale, and it spares every caller from
 * mapping `ContentLocale` back to a URL segment.
 *
 * Called by every mutating `HomePageSection` and `Banner` admin route after its
 * write commits.
 */
export function revalidateHomePage(): void {
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/home", "page");
}
