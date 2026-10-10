import { useMessages } from "next-intl";

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
  MAX_HERO_BANNERS,
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
    // TODO(homepage-v4): the offers row (banner cards from `home_secondary`)
    // has no landing component yet; it renders nothing until one lands.
    case "offers":
      return null;
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
