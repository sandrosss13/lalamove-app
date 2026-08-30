import { LandingBento } from "@/components/landing/landing-bento";
import { LandingCategoryTiles } from "@/components/landing/landing-category-tiles";
import { LandingClosingCta } from "@/components/landing/landing-closing-cta";
import { LandingCoverage } from "@/components/landing/landing-coverage";
import { LandingDriversPanel } from "@/components/landing/landing-drivers-panel";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingHeroCarousel } from "@/components/landing/landing-hero-carousel";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingNavPill } from "@/components/landing/landing-nav-pill";
import { LandingPartnerMarquee } from "@/components/landing/landing-partner-marquee";
import { LandingQuoteCalculator } from "@/components/landing/landing-quote-calculator";
import { LandingScrollReveal } from "@/components/landing/landing-scroll-reveal";
import { LandingStats } from "@/components/landing/landing-stats";
import { LandingVehicles } from "@/components/landing/landing-vehicles";
import {
  DEFAULT_HOME_PAGE_CONTENT,
  MAX_HERO_BANNERS,
  isHomePageChromeSectionType,
  type HomePageSectionData,
} from "@/lib/admin/home-page-content";

/** One composed section: a validated `HomePageSection` row, plus its row id. */
export type LandingSection = HomePageSectionData & { id: string };

/** The fields of an active `Banner` this page renders. */
export type LandingBanner = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
};

/**
 * What the page renders when the locale has no `HomePageSection` rows at all —
 * the redesign's section order, each entry on its own default copy.
 *
 * This is the state a fresh database is in, and the one it stays in until
 * someone composes the page under `/admin/content/home-page`, so it is the
 * normal path rather than an error path. It therefore has to cover the whole
 * page, chrome included — see `navContent` / `footerContent` below for the two
 * types that are not in this list.
 *
 * Written out literally rather than mapped from
 * `DEFAULT_HOME_PAGE_SECTION_ORDER` so each entry's `content` is checked
 * against the shape its own `type` demands; the order here is that constant's,
 * and the two are meant to stay in step. `category_tiles` is absent for the
 * same reason it is absent there — retired by the redesign, but still
 * renderable so a pre-existing row does not vanish or crash the page.
 */
const DEFAULT_LANDING_SECTIONS: LandingSection[] = [
  {
    id: "default-hero",
    type: "hero",
    content: DEFAULT_HOME_PAGE_CONTENT.hero,
  },
  {
    id: "default-hero_carousel",
    type: "hero_carousel",
    content: DEFAULT_HOME_PAGE_CONTENT.hero_carousel,
  },
  {
    id: "default-partner_marquee",
    type: "partner_marquee",
    content: DEFAULT_HOME_PAGE_CONTENT.partner_marquee,
  },
  {
    id: "default-stats",
    type: "stats",
    content: DEFAULT_HOME_PAGE_CONTENT.stats,
  },
  {
    id: "default-bento",
    type: "bento",
    content: DEFAULT_HOME_PAGE_CONTENT.bento,
  },
  {
    id: "default-quote_calculator",
    type: "quote_calculator",
    content: DEFAULT_HOME_PAGE_CONTENT.quote_calculator,
  },
  {
    id: "default-how_it_works",
    type: "how_it_works",
    content: DEFAULT_HOME_PAGE_CONTENT.how_it_works,
  },
  {
    id: "default-vehicle_types",
    type: "vehicle_types",
    content: DEFAULT_HOME_PAGE_CONTENT.vehicle_types,
  },
  {
    id: "default-driver_cta",
    type: "driver_cta",
    content: DEFAULT_HOME_PAGE_CONTENT.driver_cta,
  },
  {
    id: "default-coverage",
    type: "coverage",
    content: DEFAULT_HOME_PAGE_CONTENT.coverage,
  },
  {
    id: "default-faq",
    type: "faq",
    content: DEFAULT_HOME_PAGE_CONTENT.faq,
  },
  {
    id: "default-closing_cta",
    type: "closing_cta",
    content: DEFAULT_HOME_PAGE_CONTENT.closing_cta,
  },
];

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
 * `heroBanners` and `partnerBanners` are the two things a section can need that
 * its own `content` does not carry. They are passed as props rather than read
 * from a context or a module-level variable: this component is called from one
 * place, and the explicit arguments keep the data flow readable.
 */
function LandingSectionRenderer({
  section,
  heroBanners,
  partnerBanners,
}: {
  section: LandingSection;
  heroBanners: LandingBanner[];
  partnerBanners: LandingBanner[];
}) {
  switch (section.type) {
    case "hero":
      return <LandingHero content={section.content} />;
    case "hero_carousel":
      return (
        <LandingHeroCarousel banners={heroBanners} content={section.content} />
      );
    case "partner_marquee":
      return (
        <LandingPartnerMarquee
          logos={partnerBanners}
          content={section.content}
        />
      );
    case "stats":
      return <LandingStats content={section.content} />;
    case "bento":
      return <LandingBento content={section.content} />;
    case "quote_calculator":
      return <LandingQuoteCalculator content={section.content} />;
    case "how_it_works":
      return <LandingHowItWorks content={section.content} />;
    case "vehicle_types":
      return <LandingVehicles content={section.content} />;
    // The type key keeps its old name so existing rows and their admin form
    // still work; the component behind it is the redesign's drivers panel.
    case "driver_cta":
      return <LandingDriversPanel content={section.content} />;
    case "coverage":
      return <LandingCoverage content={section.content} />;
    case "faq":
      return <LandingFaq content={section.content} />;
    case "closing_cta":
      return <LandingClosingCta content={section.content} />;
    // Retired by the redesign and absent from the default composition, but kept
    // renderable: a row authored against the previous design must still render
    // rather than take the marketing page down.
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
 * Marketing page shown at `/` to visitors without a session, and at `/home` to
 * everyone.
 *
 * It brings all of its own chrome: the fixed glass nav pill at the top and the
 * footer at the bottom. Two data attributes on the wrapper are what tie it to
 * `globals.css`:
 *
 * - `data-landing-page` — always present. It is what owns the page background
 *   (`body:has([data-landing-page])`), scopes the landing focus ring and the
 *   reduced-motion block, and is the root the scroll-reveal observer looks for.
 * - `data-hide-site-header` — present unless `showSiteHeader` says otherwise.
 *   It hides the root layout's global `<header>`, and it is load-bearing: the
 *   nav pill is `position: fixed` at `top: 14px`, so a second, light-themed
 *   header underneath it does not read as clutter, it reads as broken.
 *
 * The body is composed from `HomePageSection` rows edited under
 * `/admin/content/home-page`: `sections` arrives already filtered to one
 * locale, to active rows, and sorted by `sortOrder`. Passing nothing (or an
 * empty list, which is what a database nobody has authored content in yields)
 * falls back to `DEFAULT_LANDING_SECTIONS`, so the public page never renders
 * blank while it waits for content — and a partly-authored page renders its
 * authored rows without losing the chrome.
 */
export function LandingPage({
  sections,
  heroBanners = [],
  partnerBanners = [],
  showSiteHeader = false,
}: {
  sections?: LandingSection[];
  /** Active banners placed at `home_hero` — the hero carousel's slides. */
  heroBanners?: LandingBanner[];
  /** Active banners placed at `home_partner_logo` — the marquee's logos. */
  partnerBanners?: LandingBanner[];
  /**
   * Keep the root layout's global site header (account nav, sign out) visible
   * above this page, rather than hiding it.
   *
   * `/`'s signed-out visitor is the default case: there is no account nav to
   * show, so the global header is pure clutter over the floating pill. `/home`
   * passes `true` when a session exists, so a signed-in user previewing the
   * marketing page still has a way back to their account.
   *
   * The nav pill renders either way. It carries the theme toggle and every
   * section anchor on the page, which a signed-in previewer needs just as much
   * as a visitor does — and unlike the old header it replaced, none of it is
   * dead once signed in. So this is a deliberate two-bar state rather than an
   * either/or: `globals.css` keys off this same attribute to drop the fixed
   * pill below the global header (`--landing-nav-pill-top`), so the two stack
   * rather than overlap.
   */
  showSiteHeader?: boolean;
}) {
  const composedSections =
    sections && sections.length > 0 ? sections : DEFAULT_LANDING_SECTIONS;

  /*
    Chrome, not content: the nav and footer render at fixed positions no matter
    where their row sits in `sortOrder`, so they are pulled out *by type* and
    skipped by the ordered loop below. A footer that sorts between the stats and
    the bento grid is not a layout anyone wants to be able to author. Their
    `sortOrder` is meaningless and the admin form says so.

    Duplicate rows are not worth handling: `find` takes the first, which is the
    lowest `sortOrder`. Each falls back to its default copy independently, so a
    page with an authored nav and no footer row still gets both.
  */
  const navSection = composedSections.find((section) => section.type === "nav");
  const footerSection = composedSections.find(
    (section) => section.type === "footer",
  );

  // The second discriminant check is what narrows `content` to the shape each
  // component takes — `find`'s predicate does not carry that information back.
  const navContent =
    navSection?.type === "nav"
      ? navSection.content
      : DEFAULT_HOME_PAGE_CONTENT.nav;
  const footerContent =
    footerSection?.type === "footer"
      ? footerSection.content
      : DEFAULT_HOME_PAGE_CONTENT.footer;

  const orderedSections = composedSections.filter(
    (section) => !isHomePageChromeSectionType(section.type),
  );

  // Capped at render as well as on write: the admin form refuses a seventh
  // active `home_hero` banner, but a scheduled display window or a direct
  // database edit can still produce more, and the carousel's dots are generated
  // from the slide count.
  const carouselBanners = heroBanners.slice(0, MAX_HERO_BANNERS);

  return (
    <div
      data-landing-page=""
      data-hide-site-header={showSiteHeader ? undefined : ""}
      className="min-h-screen bg-ink font-body text-paper antialiased"
    >
      <LandingScrollReveal />
      <LandingNavPill content={navContent} />
      {/*
        The nav pill is fixed, so it takes no space in the flow and whatever
        renders first would slide underneath it. The design's clearance
        (`clamp(120px, 14vw, 190px)`) is applied to `main`'s first rendered
        child rather than to `main` itself, so it lands on the section's own box
        — the hero's spotlight gradient is positioned against that box, and
        padding on `main` would push the section down without moving the
        gradient with it.

        Targeting the first *child* rather than hard-coding the hero is what
        keeps this correct for a CMS page that leads with something else, or one
        whose leading section (an empty carousel or marquee) renders nothing at
        all. The hero carries the same value itself; this rule wins on
        specificity and sets it to the same thing.
      */}
      <main className="[&>*:first-child]:pt-[clamp(120px,14vw,190px)]">
        {orderedSections.map((section) => (
          <LandingSectionRenderer
            key={section.id}
            section={section}
            heroBanners={carouselBanners}
            partnerBanners={partnerBanners}
          />
        ))}
      </main>
      <LandingFooter content={footerContent} />
    </div>
  );
}
