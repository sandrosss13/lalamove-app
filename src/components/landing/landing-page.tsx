import { useMessages } from "next-intl";

import { LandingAppBand } from "@/components/landing/landing-app-band";
import { LandingBento } from "@/components/landing/landing-bento";
import { LandingBookingCard } from "@/components/landing/landing-booking-card";
import { LandingCategoryTiles } from "@/components/landing/landing-category-tiles";
import { LandingDriversPanel } from "@/components/landing/landing-drivers-panel";
import { LandingFaqAccordion } from "@/components/landing/landing-faq-accordion";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingHeroCarousel } from "@/components/landing/landing-hero-carousel";
import { LandingOffers } from "@/components/landing/landing-offers";
import { LandingPartnerMarquee } from "@/components/landing/landing-partner-marquee";
import { LandingScrollReveal } from "@/components/landing/landing-scroll-reveal";
import { LandingSiteFooter } from "@/components/landing/landing-site-footer";
import { LandingSiteHeader } from "@/components/landing/landing-site-header";
import { LandingStats } from "@/components/landing/landing-stats";
import { LandingStepsPanel } from "@/components/landing/landing-steps-panel";
import { LandingTopCities } from "@/components/landing/landing-top-cities";
import { LandingVehicleCatalog } from "@/components/landing/landing-vehicle-catalog";
import {
  MAX_HERO_BANNERS,
  MAX_OFFER_BANNERS,
  PINNED_UNDER_HERO,
  buildDefaultHomePageSections,
  createMessageLookup,
  isHomePageChromeSectionType,
  localizeDefaultHomePageContent,
  type HomePageSectionContentByType,
  type HomePageSectionWithId,
} from "@/lib/admin/home-page-content";

/** One composed section: a validated `HomePageSection` row, plus its row id. */
export type LandingSection = HomePageSectionWithId;

/** The fields of an active `Banner` this page renders. */
export type LandingBanner = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  /** Card copy, used by the offers row; `null` for image-only placements. */
  eyebrow: string | null;
  body: string | null;
  ctaLabel: string | null;
};

/**
 * Renders one composed section with the landing component that owns its design.
 *
 * The `switch` narrows `section.content` to exactly the shape each component
 * takes, which is the whole point of `HomePageSectionData` being a
 * discriminated union: a row whose type and content disagree cannot compile.
 *
 * It is **exhaustive and has no `default:` arm**, deliberately. Adding a
 * section type to the contract is meant to be a compile error here, so a new
 * type cannot ship as a silently blank strip of page.
 *
 * The banner lists and `overlapsHero` are the things a section can need that
 * its own `content` does not carry. They are passed as props rather than read
 * from a context: this component is called from one place, and explicit
 * arguments keep the data flow readable.
 *
 * The v4 design has its own component for most types; the city landing pages
 * keep rendering the v3 ones (`LandingCoverage`, `LandingFaq`, …), which is
 * why those were left in place rather than restyled.
 */
function LandingSectionRenderer({
  section,
  heroBanners,
  partnerBanners,
  offerBanners,
  overlapsHero,
}: {
  section: LandingSection;
  heroBanners: LandingBanner[];
  partnerBanners: LandingBanner[];
  offerBanners: LandingBanner[];
  overlapsHero: boolean;
}) {
  switch (section.type) {
    case "hero_carousel":
      return (
        <LandingHeroCarousel banners={heroBanners} content={section.content} />
      );
    case "quote_calculator":
      return (
        <LandingBookingCard
          content={section.content}
          overlapsHero={overlapsHero}
        />
      );
    case "offers":
      return <LandingOffers content={section.content} offers={offerBanners} />;
    case "vehicle_types":
      return <LandingVehicleCatalog content={section.content} />;
    case "how_it_works":
      return <LandingStepsPanel content={section.content} />;
    case "coverage":
      return <LandingTopCities content={section.content} />;
    case "partner_marquee":
      return (
        <LandingPartnerMarquee
          logos={partnerBanners}
          content={section.content}
        />
      );
    case "closing_cta":
      return <LandingAppBand content={section.content} />;
    case "faq":
      return <LandingFaqAccordion content={section.content} />;
    // Retired by v4 and absent from the default composition, but kept
    // renderable: a row authored against an earlier design must still render
    // rather than take the marketing page down. They keep their v3 look.
    case "hero":
      return <LandingHero content={section.content} />;
    case "stats":
      return <LandingStats content={section.content} />;
    case "bento":
      return <LandingBento content={section.content} />;
    // The type key keeps its old name so existing rows still work; the
    // component behind it is the v3 drivers panel.
    case "driver_cta":
      return <LandingDriversPanel content={section.content} />;
    case "category_tiles":
      return <LandingCategoryTiles content={section.content} />;
    // Chrome, handled outside the ordered loop (see `LandingPage`). These cases
    // exist so the switch stays exhaustive without a `default:` arm; the loop
    // never actually hands either type to this component.
    case "nav":
    case "footer":
      return null;
  }
}

/**
 * Moves the `PINNED_UNDER_HERO` section (the booking card) to directly after
 * the hero carousel, whatever its `sortOrder`. With no carousel row it leads
 * the page instead, which is where it would sit under an absent hero.
 */
function pinUnderHero(sections: LandingSection[]): LandingSection[] {
  const pinned = sections.find((section) => section.type === PINNED_UNDER_HERO);
  if (!pinned) return sections;

  const rest = sections.filter((section) => section !== pinned);
  const heroIndex = rest.findIndex(
    (section) => section.type === "hero_carousel",
  );
  rest.splice(heroIndex + 1, 0, pinned);
  return rest;
}

/**
 * Marketing page shown at `/` to visitors without a session, and at `/home` to
 * everyone.
 *
 * The `Home-Georgia-v4` design. It brings all of its own chrome: the utility
 * bar and sticky header at the top and the footer at the bottom. Three data
 * attributes on the wrapper tie it to `globals.css`:
 *
 * - `data-landing-page` — scopes the landing focus ring and the reduced-motion
 *   block, and is the root the scroll-reveal observer looks for.
 * - `data-home-page` — paints the canvas behind the page with the v4 ground.
 * - `data-hide-site-header` — present unless `showSiteHeader` says otherwise.
 *   It hides the root layout's global `<header>`, which would otherwise stack
 *   a second navbar above this page's own.
 *
 * Exactly one header renders either way: with `showSiteHeader` the page keeps
 * the global header and drops its own utility bar and sticky header; without
 * it, the page shows its own and hides the global one.
 *
 * The body is composed from `HomePageSection` rows edited under
 * `/admin/content/home-page`: `sections` arrives already filtered to one
 * locale, to active rows, sorted by `sortOrder`, and with every section the
 * locale never authored filled in with its localized default
 * (`loadHomePageContent`). Passing nothing falls back to the whole default
 * composition in the reader's language, so the page never renders blank or in
 * the wrong language — and a missing nav or footer falls back on its own, so a
 * partly-authored page never loses its chrome.
 */
export function LandingPage({
  sections,
  heroBanners = [],
  partnerBanners = [],
  offerBanners = [],
  showSiteHeader = false,
}: {
  sections?: LandingSection[];
  /** Active banners placed at `home_hero` — the hero carousel's slides. */
  heroBanners?: LandingBanner[];
  /** Active banners placed at `home_partner_logo` — the marquee's logos. */
  partnerBanners?: LandingBanner[];
  /** Active banners placed at `home_secondary` — the offers row's cards. */
  offerBanners?: LandingBanner[];
  /**
   * Keep the root layout's global site header (account nav, sign out) visible
   * above this page *instead of* the page's own utility bar and sticky header.
   *
   * `/`'s signed-out visitor is the default case: there is no account nav to
   * show, so the global header is pure clutter and the v4 header stands in for
   * it. `/home` passes `true` when a session exists, so a signed-in user
   * previewing the marketing page gets the app's own header — and only that
   * one, since rendering both stacks two navbars with the same account links.
   */
  showSiteHeader?: boolean;
}) {
  const messages = useMessages();

  // Built only when something is actually missing: both routes hand this page
  // a composition the loader has already completed per section, so on the
  // normal path none of this runs.
  let localizedDefaults: HomePageSectionContentByType | undefined;
  const defaults = () =>
    (localizedDefaults ??= localizeDefaultHomePageContent(
      createMessageLookup(messages),
    ));

  // No sections at all means a caller that passed nothing — the routes never
  // do (see `loadHomePageContent`), but the page must still render whole, and
  // in the reader's language rather than the English the defaults are written
  // in.
  const composedSections =
    sections && sections.length > 0
      ? sections
      : buildDefaultHomePageSections(defaults());

  /*
    Chrome, not content: the nav and footer render at fixed positions no matter
    where their row sits in `sortOrder`, so they are pulled out *by type* and
    skipped by the ordered loop below. A footer that sorts between the stats and
    the bento grid is not a layout anyone wants to be able to author. Their
    `sortOrder` is meaningless and the admin form says so.

    Duplicate rows are not worth handling: `find` takes the first, which is the
    lowest `sortOrder`. Each falls back to its localized default independently —
    including a nav or footer row someone switched off, since the page has no
    way out without them — so a page with an authored nav and no footer row
    still gets both.
  */
  const navSection = composedSections.find((section) => section.type === "nav");
  const footerSection = composedSections.find(
    (section) => section.type === "footer",
  );

  // The second discriminant check is what narrows `content` to the shape each
  // component takes — `find`'s predicate does not carry that information back.
  const navContent =
    navSection?.type === "nav" ? navSection.content : defaults().nav;
  const footerContent =
    footerSection?.type === "footer"
      ? footerSection.content
      : defaults().footer;

  const orderedSections = pinUnderHero(
    composedSections.filter(
      (section) => !isHomePageChromeSectionType(section.type),
    ),
  );

  // Capped at render as well as on write: the admin form refuses more, but a
  // scheduled display window or a direct database edit can still produce
  // extra rows, and the carousel's dots and the offers grid follow the count.
  const carouselBanners = heroBanners.slice(0, MAX_HERO_BANNERS);
  const offerCards = offerBanners.slice(0, MAX_OFFER_BANNERS);

  // The booking card is pulled up over the hero's bottom edge only when the
  // carousel actually renders above it — an empty carousel renders nothing.
  const heroRenders =
    carouselBanners.length > 0 &&
    orderedSections.some((section) => section.type === "hero_carousel");

  return (
    <div
      data-landing-page=""
      data-home-page=""
      data-hide-site-header={showSiteHeader ? undefined : ""}
      className="flex min-h-screen flex-col overflow-x-clip bg-home-page font-body text-home-ink antialiased"
    >
      <LandingScrollReveal />
      {showSiteHeader ? null : <LandingSiteHeader content={navContent} />}
      <main className="flex-1">
        {orderedSections.map((section) => (
          <LandingSectionRenderer
            key={section.id}
            section={section}
            heroBanners={carouselBanners}
            partnerBanners={partnerBanners}
            offerBanners={offerCards}
            overlapsHero={heroRenders && section.type === PINNED_UNDER_HERO}
          />
        ))}
      </main>
      <LandingSiteFooter content={footerContent} />
    </div>
  );
}
