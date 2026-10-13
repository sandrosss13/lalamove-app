/**
 * The contract for the composable landing page, shared by three places that
 * would otherwise drift apart:
 *
 * - the admin form (`@/components/admin/content/home-page-section-form-dialog`),
 *   which builds a `content` object per section type;
 * - the `/api/admin/content/home-page-sections` routes, which validate whatever
 *   arrives before it becomes a `HomePageSection.content` JSON column;
 * - the public landing page, which reads those rows back and hands the parsed
 *   content to the components under `@/components/landing/`.
 *
 * `HomePageSection.type` and `.content` are a free-form `String` and `Json` in
 * the schema on purpose (adding a section is a content change, not a
 * migration), so this module is the only thing giving them a shape. It is
 * deliberately dependency-free — no Prisma, no `server-only` — because the
 * public landing sections are client components and import it directly.
 *
 * The default copy lives here rather than inside each landing component so
 * there is exactly one source for it: the components fall back to these values
 * when no `HomePageSection` row exists (the expected state until a human seeds
 * real content), and the admin form pre-fills a new section with the same copy
 * that is currently on the page.
 *
 * The defaults are authored in English and rendered in the visitor's language:
 * `localizeDefaultHomePageContent` swaps each string for its catalog message, so
 * `/ka` shows Georgian defaults without a single `KA` row existing.
 */

/**
 * Every section type the landing page knows how to render.
 *
 * Order is the page's own narrative order, which is also the order the admin
 * type picker offers — with the two chrome types and the retired
 * `category_tiles` pushed to the end, since none of them participate in the
 * `sortOrder` flow (see `HOME_PAGE_CHROME_SECTION_TYPES` and
 * `DEFAULT_HOME_PAGE_SECTION_ORDER`).
 */
export const HOME_PAGE_SECTION_TYPES = [
  "hero",
  "hero_carousel",
  "partner_marquee",
  "stats",
  "bento",
  "quote_calculator",
  "offers",
  "how_it_works",
  "vehicle_types",
  "driver_cta",
  "coverage",
  "faq",
  "closing_cta",
  "category_tiles",
  "nav",
  "footer",
] as const;

export type HomePageSectionType = (typeof HOME_PAGE_SECTION_TYPES)[number];

/** How each type is named in the admin UI. */
export const HOME_PAGE_SECTION_TYPE_LABELS: Record<
  HomePageSectionType,
  string
> = {
  hero: "Hero",
  hero_carousel: "Hero banner carousel",
  partner_marquee: "Partner logo marquee",
  stats: "Stats row",
  bento: "Feature grid (bento)",
  quote_calculator: "Quote calculator",
  offers: "Offers and news (banner cards)",
  how_it_works: "How it works",
  vehicle_types: "The fleet (vehicle types)",
  driver_cta: "Driver CTA",
  coverage: "City coverage",
  faq: "FAQ",
  closing_cta: "Closing CTA",
  category_tiles: "What we carry (category tiles — retired)",
  nav: "Navigation bar (chrome)",
  footer: "Footer (chrome)",
};

/**
 * `Banner.placement` keys the landing page reads. The column is free-form (see
 * the model doc), so these constants are the convention the admin banner form
 * and this page agree on.
 */
export const HOME_HERO_BANNER_PLACEMENT = "home_hero";
export const HOME_SECONDARY_BANNER_PLACEMENT = "home_secondary";

/**
 * Partner logos are `Banner` rows under their own placement rather than a new
 * Prisma model: `Banner` already models "an image with a placement, sort order,
 * locale and an active window", which is precisely what a logo strip needs.
 */
export const HOME_PARTNER_LOGO_BANNER_PLACEMENT = "home_partner_logo";

/**
 * The hero carousel renders at most this many slides. The design specifies six;
 * beyond that the pagination dots stop being usable and the auto-advance cycle
 * gets too long to ever be seen. Enforced in two places on purpose — the admin
 * banner form refuses a seventh active `home_hero` banner, and the carousel
 * itself slices, so a row inserted straight into the database cannot break the
 * public page.
 */
export const MAX_HERO_BANNERS = 6;

/**
 * The offers row renders at most this many `home_secondary` banner cards. Same
 * two-sided enforcement as `MAX_HERO_BANNERS`: the admin form refuses more, and
 * the loader slices, so a row inserted straight into the database cannot
 * overflow the grid.
 */
export const MAX_OFFER_BANNERS = 6;

/** The partner marquee renders at most this many `home_partner_logo` banners. */
export const MAX_PARTNER_LOGOS = 24;

/**
 * Bounds and default for the hero carousel's auto-advance, in seconds. Below
 * two seconds a slide cannot be read; above thirty the carousel reads as stuck.
 * The parser clamps into this range rather than rejecting, so a typo in the
 * admin form degrades to the nearest sensible value.
 */
export const HERO_INTERVAL_MIN = 2;
export const HERO_INTERVAL_MAX = 30;
export const HERO_INTERVAL_DEFAULT = 6;

/**
 * The section the v4 design pins directly under the hero carousel ("Book a
 * Delivery" card). The renderer places it there regardless of `sortOrder`, and
 * the admin list shows it as fixed rather than draggable.
 */
export const PINNED_UNDER_HERO =
  "quote_calculator" as const satisfies HomePageSectionType;

/**
 * Section types that are page chrome rather than page body. The composer pulls
 * these out of the section list *by type* and renders them at the top and
 * bottom of the page, instead of letting them fall wherever `sortOrder` puts
 * them — a footer that sorts into the middle of the page is not a layout anyone
 * wants to be able to author.
 */
export const HOME_PAGE_CHROME_SECTION_TYPES = ["nav", "footer"] as const;

export type HomePageChromeSectionType =
  (typeof HOME_PAGE_CHROME_SECTION_TYPES)[number];

/** Whether a section type is chrome, and so is not placed by `sortOrder`. */
export function isHomePageChromeSectionType(
  value: HomePageSectionType,
): value is HomePageChromeSectionType {
  return (HOME_PAGE_CHROME_SECTION_TYPES as readonly string[]).includes(value);
}

/**
 * The body sections a page with no `HomePageSection` rows renders, in order —
 * the v4 design's narrative (`design_handoff_georgia_homepage`, "Latest
 * version").
 *
 * The retired types — `hero`, `stats`, `bento`, `driver_cta` and
 * `category_tiles` — are deliberately absent: their content types and parsers
 * are kept so a row authored against an earlier design still renders instead
 * of vanishing, but v4 has no slot for them, so they are never added to a fresh
 * page or filled in by `withDefaultSections`. `nav` and `footer` are absent
 * because they are chrome.
 */
export const DEFAULT_HOME_PAGE_SECTION_ORDER = [
  "hero_carousel",
  "quote_calculator",
  "offers",
  "vehicle_types",
  "how_it_works",
  "coverage",
  "partner_marquee",
  "closing_cta",
  "faq",
] as const satisfies readonly HomePageSectionType[];

/**
 * Section types an earlier design rendered and v4 has no slot for. Their
 * parsers stay (a stored row still validates and round-trips through the admin
 * form), but the v4 bulk actions — "materialize defaults", "restore defaults"
 * and the seed script — switch any such row *off* rather than deleting it: the
 * copy someone wrote is kept, it just stops competing with the v4 sections that
 * replaced it (an active `hero` row would otherwise render alongside the
 * `hero_carousel`).
 */
export const RETIRED_HOME_PAGE_SECTION_TYPES = [
  "hero",
  "stats",
  "bento",
  "driver_cta",
  "category_tiles",
] as const satisfies readonly HomePageSectionType[];

/** Whether a stored `HomePageSection.type` string is a retired type. */
export function isRetiredHomePageSectionType(value: string): boolean {
  return (RETIRED_HOME_PAGE_SECTION_TYPES as readonly string[]).includes(value);
}

/**
 * The hero's editable copy.
 *
 * Extended for the redesign: the status chip above the headline is new and its
 * two fields are optional, so a hero row authored against the previous design
 * still parses and simply renders without a chip. `headlineHighlight` is the
 * reverse case — the old design's accented closing word, which the centred
 * redesign has no place for. It is kept, optional and unrendered, purely so an
 * existing row round-trips through the admin form without silently losing a
 * value someone typed.
 *
 * The three stat figures the old hero showed beside it were counted from the
 * live vehicle taxonomy rather than authored; the redesign moves that job to
 * the `stats` section, which *is* authored.
 */
export type HeroContent = {
  eyebrow: string;
  headline: string;
  subtext: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  /** Text inside the pulsing-dot status chip above the headline. */
  statusChipText?: string;
  /** The small mono tag that closes the chip, e.g. "New". */
  statusChipTag?: string;
  /** @deprecated Retired with the left-aligned hero. Kept so old rows survive. */
  headlineHighlight?: string;
};

/**
 * The hero carousel has no copy of its own — the slides are `Banner` rows at
 * placement `home_hero` (capped at `MAX_HERO_BANNERS`), and each slide's
 * caption is that banner's `title`, which is optional: a slide without one
 * shows no headline.
 *
 * Whether the carousel shows at all is the section row's own
 * `HomePageSection.isActive` column, not a field in here: adding a second,
 * content-level active flag would give the same section two switches that can
 * disagree. The one field that remains is the caption that stands in as the
 * page's (visually hidden) `h1` when the first slide has no title of its own.
 */
export type HeroCarouselContent = {
  fallbackCaption?: string;
  /**
   * Seconds between auto-advances, clamped to
   * `HERO_INTERVAL_MIN`..`HERO_INTERVAL_MAX`. Absent means
   * `HERO_INTERVAL_DEFAULT`.
   */
  intervalSec?: number;
};

/**
 * The marquee's only authored string. The logos themselves are `Banner` rows at
 * placement `home_partner_logo`, rendered from one source list drawn twice for
 * a seamless loop — never duplicated as assets.
 */
export type PartnerMarqueeContent = {
  eyebrow: string;
};

export type StatItem = {
  /** Kept a string, not a number: "24/7" and "100%" are values too. */
  value: string;
  label: string;
};

/** The four-tile figures strip. Four items is the design; the grid tolerates fewer. */
export type StatsContent = {
  items: StatItem[];
};

/**
 * The mock order panel pinned to the bottom of the bento grid's large accent
 * card. It is illustrative, not live data — but it is the one place on the page
 * where a fake value could be mistaken for a real one, so it is authored
 * content rather than a hardcoded fixture.
 */
export type BentoTrackingPanel = {
  orderLabel: string;
  etaLabel: string;
  /** 0–100. The only non-string field in the whole contract. */
  progressPercent: number;
  fromLabel: string;
  toLabel: string;
};

/** One small bento card. The link is optional — most cards do not carry one. */
export type BentoCard = {
  eyebrow: string;
  title: string;
  body: string;
  linkLabel?: string;
  linkHref?: string;
};

/**
 * The bento feature grid: one large accent-tinted card (row A left) carrying
 * the tracking panel, two stacked cards beside it (row A right), and three
 * cards across row B. Split into two arrays rather than one flat list because
 * the two rows have different card sizes and different grid tracks — a single
 * list would make the layout depend on counting.
 */
export type BentoContent = {
  eyebrow: string;
  heading: string;
  body: string;
  trackingPanel: BentoTrackingPanel;
  /** Row A, right column. Two cards. */
  sideCards: BentoCard[];
  /** Row B. Three cards. */
  rowCards: BentoCard[];
};

/**
 * Copy for the v4 "Book a Delivery" card pinned under the hero
 * (`landing-booking-card.tsx`; the type keeps its historical name). The card
 * renders `heading` and the CTA; `eyebrow` and `intro` are kept so rows
 * authored for the earlier quote calculator still parse.
 */
export type QuoteCalculatorContent = {
  eyebrow: string;
  heading: string;
  intro: string;
  /** v4 "Book a Delivery" card button. A matched pair, like every link here. */
  ctaLabel?: string;
  ctaHref?: string;
};

/**
 * Framing copy for the offers row. The cards themselves are `Banner` rows at
 * placement `home_secondary` (capped at `MAX_OFFER_BANNERS`), each carrying its
 * own `eyebrow` / `title` / `body` / `ctaLabel` / `linkUrl`. The "see all" link
 * is optional and shown only when both halves are present.
 */
export type OffersContent = {
  heading: string;
  linkLabel?: string;
  linkHref?: string;
};

/**
 * The category tiles' framing copy only. The tiles themselves are generated
 * from the cargo taxonomy and its pricing rules, so they are never authored.
 */
export type CategoryTilesContent = {
  eyebrow: string;
  heading: string;
  intro: string;
};

/** The business-account panel that closes the fleet section. */
export type VehicleTypesBusinessPanel = {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
};

/**
 * Framing copy for the fleet section. The vehicles come from the real
 * `VehicleTypeSpec` catalogue, grouped by their two real duty classes — the
 * design's nine placeholder types across three groups are not used. `intro` and
 * `businessPanel` are optional so a row authored against the previous shape,
 * which had only `eyebrow` and `heading`, still parses.
 */
/**
 * `mediumDutyLabel` / `heavyDutyLabel` are the editorial names for the two
 * `VehicleCategory` values, which the fleet section prints as its group
 * headings. They are content, not schema: the enum values (`MEDIUM_DUTY`,
 * `HEAVY_DUTY`) stay fixed and keep driving matching and pricing, while what a
 * visitor reads above each group is editable — the whole page is meant to be
 * rewritable from the back office without a deploy. Both optional so a row
 * written before they existed still parses; the renderer falls back to the
 * defaults below.
 */
export type VehicleTypesContent = {
  eyebrow: string;
  heading: string;
  intro?: string;
  mediumDutyLabel?: string;
  heavyDutyLabel?: string;
  businessPanel?: VehicleTypesBusinessPanel;
};

export type HowItWorksStep = {
  title: string;
  body: string;
};

/**
 * The numbered steps list. `aside` was required in the previous design and is
 * now optional, because the redesign's layout has no column for it — but it is
 * NOT removed, so an existing row keeps the paragraph someone wrote.
 */
export type HowItWorksContent = {
  eyebrow: string;
  heading: string;
  aside?: string;
  /** Steps in order; the displayed number is the position, not a field. */
  steps: HowItWorksStep[];
};

/**
 * The driver panel's copy.
 *
 * `headline`, `subtext` and `ctaLabel` keep their original names even though
 * the design calls them heading / body / primary CTA. Renaming them would make
 * every existing `driver_cta` row unparseable, and an unparseable row is a
 * section that silently disappears from the public page.
 *
 * The primary CTA still has no editable href, and that is deliberate: where a
 * driver signs up depends on whether the merchant/client host split is enabled
 * (`merchantOrigin()` in `@/lib/host`), which is deployment configuration, not
 * content. The *secondary* CTA is an ordinary content link and does carry one.
 */
export type DriverCtaContent = {
  eyebrow: string;
  /** Rendered line by line, so a newline is a deliberate line break. */
  headline: string;
  subtext: string;
  /** Primary CTA label. Its target is resolved from host config, not content. */
  ctaLabel: string;
  points: string[];
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  /** Public URL of the driver photograph filling the panel's right column. */
  imageUrl?: string;
};

/**
 * One coverage chip. `tier` is free text and purely editorial: there is no
 * service-tier data anywhere in the schema, so the design's "Same hour" /
 * "Scheduled" split cannot be derived and must be typed by a human who knows
 * the real answer.
 */
export type CoverageCity = {
  name: string;
  tier: string;
  /** v4 city card photo. Optional; the card renders without one. */
  imageUrl?: string;
  /** Where the city card links, e.g. its `/cities/<slug>` landing page. */
  href?: string;
};

export type CoverageContent = {
  eyebrow: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  cities: CoverageCity[];
};

export type FaqItem = {
  question: string;
  answer: string;
};

/**
 * The accordion and the paragraph beside it. The support link is a matched
 * pair: the renderer shows it only when both halves are present, so an
 * unfinished edit produces no link rather than a link to nowhere.
 */
export type FaqContent = {
  eyebrow: string;
  heading: string;
  intro: string;
  supportLinkLabel?: string;
  supportLinkHref?: string;
  items: FaqItem[];
};

/** The accent panel that closes the page above the footer. */
export type ClosingCtaContent = {
  heading: string;
  body: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  /** v4 app-download band store badges. Each renders only when present. */
  appStoreUrl?: string;
  playStoreUrl?: string;
};

export type NavLink = {
  label: string;
  href: string;
};

/**
 * The floating nav pill. Sign-in and sign-up are separate fields rather than
 * two more `links` entries because they render as the pill's trailing pair —
 * one plain link and one filled button — not as part of the wrapping link row.
 */
export type NavContent = {
  /**
   * The brand's accessible name. The pill draws the zomo lockup SVG, never
   * this text (the brand book forbids setting the wordmark in a font), so this
   * is what a screen reader announces for the logo link.
   */
  wordmark: string;
  links: NavLink[];
  signInLabel: string;
  signInHref: string;
  signUpLabel: string;
  signUpHref: string;
  /** v4 utility bar above the nav: a line of text plus a few small links. */
  utilityText?: string;
  utilityLinks?: NavLink[];
};

export type FooterColumn = {
  title: string;
  links: NavLink[];
};

/**
 * The four-column footer.
 *
 * `copyright` is the whole bottom-left line, and the renderer substitutes the
 * literal token `{year}` with the current year before printing it — so the line
 * stays fully editable without an editor having to remember to bump it every
 * January. The token is an ordinary character sequence to the parser; it gets
 * no special validation.
 */
export type FooterContent = {
  /** The logo's accessible name — the footer draws the lockup SVG, as the nav does. */
  brandName: string;
  brandBlurb: string;
  columns: FooterColumn[];
  copyright: string;
  legalLinks: NavLink[];
  /** v4 footer CTA button. A matched pair: shown only when both are present. */
  ctaLabel?: string;
  ctaHref?: string;
};

/** Maps each section type to the shape of its `content` column. */
export type HomePageSectionContentByType = {
  hero: HeroContent;
  hero_carousel: HeroCarouselContent;
  partner_marquee: PartnerMarqueeContent;
  stats: StatsContent;
  bento: BentoContent;
  quote_calculator: QuoteCalculatorContent;
  offers: OffersContent;
  how_it_works: HowItWorksContent;
  vehicle_types: VehicleTypesContent;
  driver_cta: DriverCtaContent;
  coverage: CoverageContent;
  faq: FaqContent;
  closing_cta: ClosingCtaContent;
  category_tiles: CategoryTilesContent;
  nav: NavContent;
  footer: FooterContent;
};

export type HomePageSectionContent =
  HomePageSectionContentByType[HomePageSectionType];

/**
 * A validated section: a discriminated union, so `switch (section.type)` in the
 * renderer narrows `content` to exactly the shape that type's component needs.
 */
export type HomePageSectionData = {
  [Type in HomePageSectionType]: {
    type: Type;
    content: HomePageSectionContentByType[Type];
  };
}[HomePageSectionType];

/** Whether a stored `HomePageSection.type` string is one this app renders. */
export function isHomePageSectionType(
  value: string,
): value is HomePageSectionType {
  return (HOME_PAGE_SECTION_TYPES as readonly string[]).includes(value);
}

/**
 * The copy currently on the public landing page, which is also what it falls
 * back to when a locale has no `HomePageSection` rows yet.
 */
export const DEFAULT_HOME_PAGE_CONTENT: HomePageSectionContentByType = {
  hero: {
    eyebrow: "Commercial freight & cargo",
    // TODO(content): the chip claims nationwide coverage without naming a city
    // count, because the real number is unconfirmed. See
    // `specs/georgia-homepage-redesign/action-required.md`.
    statusChipText: "Now moving freight across Georgia",
    statusChipTag: "New",
    headline: "Move any load, anywhere in Georgia.",
    subtext:
      "Vans to trailer trucks, priced before you book and tracked door to door. Set the route, pick the vehicle rated for the load, and a nearby driver takes it from there.",
    primaryCtaLabel: "Get started",
    primaryCtaHref: "/sign-up",
    secondaryCtaLabel: "Price a load",
    secondaryCtaHref: "#price-a-load",
  },
  hero_carousel: {
    fallbackCaption: "Freight moving across Georgia",
    intervalSec: HERO_INTERVAL_DEFAULT,
  },
  partner_marquee: {
    eyebrow: "Dispatching every day for",
  },
  stats: {
    items: [
      // TODO(content): 25 is the size of the `GeorgianCity` enum, not a
      // confirmed service footprint. See `action-required.md`.
      { value: "25", label: "Georgian cities served" },
      { value: "11", label: "Vehicle types, van to trailer" },
      // TODO(content): 24/7 matches the existing footer's claim; confirm it.
      { value: "24/7", label: "Dispatch and support" },
      { value: "100%", label: "Fares quoted before you book" },
    ],
  },
  bento: {
    eyebrow: "Live tracking",
    heading: "See the truck move, not a status label.",
    body: "Every accepted order gets its own tracking page: pickup and dropoff on a map, the driver's position as they report it, and a status that moves from accepted to in transit to completed.",
    trackingPanel: {
      orderLabel: "Order #A4821 · Box Truck",
      etaLabel: "19 min",
      progressPercent: 68,
      fromLabel: "Chavchavadze Ave, Vake",
      toLabel: "Tsereteli Ave, Didube",
    },
    sideCards: [
      {
        eyebrow: "Payload",
        title: "Rated for the load, not guessed",
        body: "Every vehicle type publishes its maximum payload and its cargo length, width and height, so you match the rating to what you are actually moving.",
      },
      {
        eyebrow: "For business",
        title: "Fleets and logistics companies",
        body: "Register a company, put your drivers and vehicles on one roster, and claim freight jobs from the dispatch queue.",
        linkLabel: "Register a company",
        linkHref: "/sign-up",
      },
    ],
    rowCards: [
      {
        eyebrow: "Helper",
        title: "A second pair of hands",
        body: "Add a helper to load and unload alongside the driver. It is a flat fee, already in the total and in the breakdown before you book.",
      },
      {
        eyebrow: "Intercity",
        title: "Tbilisi to Batumi, and back",
        body: "Price a run between any two cities we cover. The fare is worked out on the real driving distance and time, not a flat intercity band.",
      },
      {
        eyebrow: "Pricing",
        title: "Itemised before you book",
        body: "Base fare, distance, driving time and any helper fee, listed separately — and the same calculation runs again when you place the order.",
      },
    ],
  },
  quote_calculator: {
    eyebrow: "Price a load",
    // A booking prompt, not a price promise: the v4 card collects the route and
    // hands off to sign-up, it shows no fare.
    heading: "Book a delivery",
    intro:
      "Enter a pickup and a dropoff, pick a vehicle rated for the load, and we quote base fare, distance and driving time in lari. No account needed to see the number.",
    ctaLabel: "Book a delivery",
    ctaHref: "/sign-up",
  },
  offers: {
    // linkLabel/linkHref are intentionally omitted: there is no "all offers"
    // page yet, and the renderer shows the link only when both are present.
    heading: "Offers and news",
  },
  how_it_works: {
    eyebrow: "How it works",
    heading: "Four steps, no phone calls.",
    aside:
      "Built for the load that won't fit in a car boot — an office move, a pallet of stock, a machine that needs a tail lift.",
    steps: [
      {
        title: "Set the route",
        body: "Type the pickup and the dropoff — addresses autocomplete as you go — then tell us what you're sending: furniture, appliances, retail stock or construction materials.",
      },
      {
        title: "Pick a vehicle",
        body: "Cargo van for a few boxes, trailer truck for pallets. Every type lists its payload rating and cargo dimensions, so you can match the vehicle to the load.",
      },
      {
        title: "Lock the price",
        body: "We quote on real distance, driving time and whether you need a helper, itemised line by line. No auction, no surprise line items at the door.",
      },
      {
        title: "Track it to the door",
        body: "An independent driver or a logistics company takes the job and it goes live on your map. Follow the vehicle from loading to unload, and keep every order in your account.",
      },
    ],
  },
  vehicle_types: {
    eyebrow: "The fleet",
    heading: "Every size, one account.",
    intro:
      "Pick the vehicle the load actually needs. Eleven types across two duty classes, medium and heavy, each with its own payload rating and cargo dimensions.",
    mediumDutyLabel: "Medium duty",
    heavyDutyLabel: "Heavy duty",
    businessPanel: {
      title: "Business account",
      body: "Register your company, put your fleet and your drivers on one roster, and dispatch from a single hub. Applications are reviewed by our team before the account goes live.",
      ctaLabel: "Register a company",
      ctaHref: "/sign-up",
    },
  },
  driver_cta: {
    eyebrow: "For transport providers",
    headline: "Your truck.\nYour hours.\nYour jobs.",
    subtext:
      "Sign up as an independent driver or as a logistics company, register your vehicles, and start accepting freight jobs from shippers near you.",
    ctaLabel: "Become a driver",
    points: [
      "Take the loads that suit your vehicle, your payload rating and your day.",
      "Every job shows the route, the cargo and the payout before you accept.",
      "Driving your own truck or running a fleet — both sign up here.",
    ],
    secondaryCtaLabel: "What you need to sign up",
    secondaryCtaHref: "#faq",
    // imageUrl is intentionally absent: no driver photograph exists yet, and
    // the panel is designed to render without one. See `action-required.md`.
  },
  coverage: {
    eyebrow: "Coverage",
    // TODO(content): the heading deliberately names no city count — the real
    // service footprint is unconfirmed. See `action-required.md`.
    heading: "Every major city, one account.",
    body: "Set a pickup and a dropoff anywhere we operate and the fare is worked out on the real route between them — across town or across the country. Support in Georgian and English.",
    ctaLabel: "Price your route",
    ctaHref: "#price-a-load",
    // TODO(content): every `tier` below is editorial. There is no service-tier
    // data in the schema, so these are placeholders a human must confirm. Every
    // `name` is a real value of the `GeorgianCity` enum. See `action-required.md`.
    cities: [
      { name: "Tbilisi", tier: "Citywide" },
      { name: "Batumi", tier: "Citywide" },
      { name: "Kutaisi", tier: "Citywide" },
      { name: "Rustavi", tier: "Citywide" },
      { name: "Gori", tier: "Regional" },
      { name: "Zugdidi", tier: "Regional" },
      { name: "Telavi", tier: "Regional" },
      { name: "Poti", tier: "Regional" },
      { name: "Zestaponi", tier: "Regional" },
      { name: "Marneuli", tier: "Regional" },
      { name: "Akhaltsikhe", tier: "Regional" },
      { name: "Intercity", tier: "Nationwide" },
    ],
  },
  faq: {
    eyebrow: "Questions",
    heading: "Before you book",
    intro:
      "What sits behind the quote, how a vehicle is matched to the load, and what happens once a driver takes the job.",
    // TODO(content): supportLinkLabel/supportLinkHref are intentionally omitted
    // until a real support or contact destination exists — the renderer shows
    // the link only when both are present, so no dead link ships.
    items: [
      {
        question: "How is the price worked out?",
        answer:
          "We geocode both addresses and price the distance between them with the vehicle type's own rates: a base fare, a per-kilometre rate and a rate for the estimated time of the trip. A helper, if you ask for one, adds a flat fee on top. You get the total itemised, and the same calculation runs when you place the order — the estimate is not a separate marketing number.",
      },
      {
        question: "Which vehicle should I book?",
        answer:
          "Vehicles come in two duty classes, medium-duty and heavy-duty, and each cargo category only offers the classes that can take it. Furniture, appliances, retail stock and event equipment go either way; industrial supplies and construction materials are heavy-duty only. Every type lists its maximum payload, so you can match the rating to the load.",
      },
      {
        question: "What does adding a helper do?",
        answer:
          "A helper is a second pair of hands who rides along to load and unload with the driver. It is a flat fee on top of the distance and time components, so tick it before you price the job and it is already in the total and in the breakdown you see.",
      },
      {
        question: "Who actually moves my cargo?",
        answer:
          "An order starts out pending until a transport provider takes it. That is either an independent driver, who accepts it with one of the vehicles registered to their profile, or a logistics company, which claims the job and dispatches it to a driver on its own roster.",
      },
      {
        question: "Can I follow the delivery?",
        answer:
          "Yes. Once an order is accepted it gets its own tracking page: pickup and dropoff on a map, plus the driver's position as they report it, refreshed while you watch. The status moves from accepted to in transit to completed, and the order stays in your account afterwards.",
      },
      {
        question: "Can a company book and dispatch as a business?",
        answer:
          "Yes. A logistics company registers, adds its drivers and its vehicles to one roster, and claims jobs from the dispatch queue; the application is reviewed before the account goes live. Shippers book the same way whether they are an individual or a business.",
      },
    ],
  },
  closing_cta: {
    heading: "Your next load is a route away.",
    body: "Price it in the open, book it in a few steps, and follow the vehicle to the door. No card needed to get a quote.",
    primaryCtaLabel: "Create an account",
    primaryCtaHref: "/sign-up",
    secondaryCtaLabel: "Drive with us",
    // Resolved by `landing-link.tsx` to this deployment's driver application.
    secondaryCtaHref: "@driver-sign-up",
  },
  category_tiles: {
    eyebrow: "What we carry",
    heading: "Ship anything, across the city",
    intro:
      "Pick the category your load falls under and the vehicle rated to carry it comes with it. Figures below are a starting point for a short cross-town run — your price is calculated on the route you enter.",
  },
  nav: {
    // The official brand (see `logo and brandbook/design_handoff_zomo_rebrand`).
    // Rows seeded before the rebrand still hold the placeholder "Lalamove
    // Georgia"; `migrateLegacyBrandCopy` maps those on render.
    wordmark: "zomo",
    // v4 order. Anchors are the ids the landing sections render (`how`,
    // `vehicles`, `coverage`, `faq`); `@driver-sign-up` is resolved by
    // `landing-link.tsx` to this deployment's driver application.
    links: [
      { label: "How it works", href: "#how" },
      { label: "For drivers", href: "@driver-sign-up" },
      { label: "Vehicles", href: "#vehicles" },
      { label: "Coverage", href: "#coverage" },
      { label: "Help", href: "#faq" },
    ],
    signInLabel: "Sign in",
    signInHref: "/sign-in",
    signUpLabel: "Sign up",
    signUpHref: "/sign-up",
  },
  footer: {
    // Same brand name, and same legacy mapping, as `nav.wordmark`.
    brandName: "zomo",
    brandBlurb:
      "Commercial freight and cargo across Georgia — vans to trailer trucks, priced before you book.",
    columns: [
      {
        title: "Product",
        links: [
          { label: "How it works", href: "#how" },
          { label: "Vehicles", href: "#vehicles" },
          { label: "Price a load", href: "#price-a-load" },
          { label: "Coverage", href: "#coverage" },
        ],
      },
      {
        title: "Business",
        links: [
          { label: "Register a company", href: "/sign-up" },
          { label: "Fleet dashboard", href: "/dashboard" },
          { label: "Sign in", href: "/sign-in" },
        ],
      },
      {
        title: "Drivers",
        links: [
          { label: "Become a driver", href: "@driver-sign-up" },
          { label: "Driver sign-up", href: "/sign-up" },
          { label: "Driver hub", href: "/dashboard" },
        ],
      },
      {
        // TODO(content): `#` is this codebase's existing convention for a page
        // that does not exist yet (see the current `landing-footer.tsx`).
        // Replace with `/pages/<slug>` once the `StaticPage` rows exist.
        title: "Company",
        links: [
          { label: "About", href: "#" },
          { label: "Careers", href: "#" },
          { label: "Contact", href: "#" },
        ],
      },
    ],
    // `{year}` is substituted by the renderer with the current year.
    copyright: "© {year} zomo",
    // TODO(content): same `#` placeholder convention as the Company column.
    legalLinks: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Cookies", href: "#" },
    ],
    ctaLabel: "Send a delivery",
    ctaHref: "/sign-up",
  },
};

/**
 * Resolves one catalog key to its message in the reader's language, or
 * `undefined` when no catalog has it. Deliberately not `next-intl`'s `t`: the
 * same resolution has to run in a server component, in a client component and
 * in a bare `tsx` seed script, so it is expressed over a plain messages object
 * (see `createMessageLookup`).
 */
export type HomePageMessageLookup = (key: string) => string | undefined;

/**
 * The catalog key for every translatable string in `DEFAULT_HOME_PAGE_CONTENT`,
 * keyed by that English string.
 *
 * Keyed by the English rather than by a path such as `faq.items.1.answer`
 * because the defaults repeat themselves — "Price a load" is a hero CTA, an
 * eyebrow and a footer link — and one entry then covers every place a string
 * appears. The English stays the source: `DEFAULT_HOME_PAGE_CONTENT` above is
 * untouched, the `en` catalog holds the identical strings, and a string with no
 * entry here simply renders as written.
 *
 * Most keys were extracted from this file into `admin.homePageContent`; a few
 * strings were already catalogued elsewhere (`common.shared`, the city names in
 * `cities.georgianCities`) and are reused rather than duplicated.
 */
const DEFAULT_COPY_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  // hero
  "Commercial freight & cargo": "admin.homePageContent.commercialFreightCargo",
  "Now moving freight across Georgia":
    "admin.homePageContent.nowMovingFreightAcrossGeorgia",
  New: "admin.homePageContent.statusChipNew",
  "Move any load, anywhere in Georgia.":
    "admin.homePageContent.moveAnyLoadAnywhereInGeorgia",
  "Vans to trailer trucks, priced before you book and tracked door to door. Set the route, pick the vehicle rated for the load, and a nearby driver takes it from there.":
    "admin.homePageContent.vansToTrailerTrucksPricedBefore",
  "Get started": "admin.homePageContent.getStarted",
  "Price a load": "admin.homePageContent.priceALoad",
  // hero_carousel, partner_marquee
  "Freight moving across Georgia":
    "admin.homePageContent.freightMovingAcrossGeorgia",
  "Dispatching every day for": "admin.homePageContent.dispatchingEveryDayFor",
  // stats
  "Georgian cities served": "admin.homePageContent.georgianCitiesServed",
  "Vehicle types, van to trailer":
    "admin.homePageContent.vehicleTypesVanToTrailer",
  "Dispatch and support": "admin.homePageContent.dispatchAndSupport",
  "Fares quoted before you book":
    "admin.homePageContent.faresQuotedBeforeYouBook",
  // bento
  "Live tracking": "admin.homePageContent.liveTracking",
  "See the truck move, not a status label.":
    "admin.homePageContent.seeTheTruckMoveNotA",
  "Every accepted order gets its own tracking page: pickup and dropoff on a map, the driver's position as they report it, and a status that moves from accepted to in transit to completed.":
    "admin.homePageContent.everyAcceptedOrderGetsItsOwn",
  "Order #A4821 · Box Truck": "admin.homePageContent.mockOrderLabel",
  "19 min": "admin.homePageContent.mockEtaLabel",
  "Chavchavadze Ave, Vake": "admin.homePageContent.mockFromLabel",
  "Tsereteli Ave, Didube": "admin.homePageContent.mockToLabel",
  Payload: "common.shared.payload",
  "Rated for the load, not guessed":
    "admin.homePageContent.ratedForTheLoadNotGuessed",
  "Every vehicle type publishes its maximum payload and its cargo length, width and height, so you match the rating to what you are actually moving.":
    "admin.homePageContent.everyVehicleTypePublishesItsMaximum",
  "For business": "admin.homePageContent.forBusiness",
  "Fleets and logistics companies":
    "admin.homePageContent.fleetsAndLogisticsCompanies",
  "Register a company, put your drivers and vehicles on one roster, and claim freight jobs from the dispatch queue.":
    "admin.homePageContent.registerACompanyPutYourDrivers",
  "Register a company": "admin.homePageContent.registerACompany",
  Helper: "admin.homePageContent.helper",
  "A second pair of hands": "admin.homePageContent.aSecondPairOfHands",
  "Add a helper to load and unload alongside the driver. It is a flat fee, already in the total and in the breakdown before you book.":
    "admin.homePageContent.addAHelperToLoadAnd",
  Intercity: "admin.homePageContent.intercity",
  "Tbilisi to Batumi, and back": "admin.homePageContent.tbilisiToBatumiAndBack",
  "Price a run between any two cities we cover. The fare is worked out on the real driving distance and time, not a flat intercity band.":
    "admin.homePageContent.priceARunBetweenAnyTwo",
  Pricing: "admin.homePageContent.pricing",
  "Itemised before you book": "admin.homePageContent.itemisedBeforeYouBook",
  "Base fare, distance, driving time and any helper fee, listed separately — and the same calculation runs again when you place the order.":
    "admin.homePageContent.baseFareDistanceDrivingTimeAnd",
  // quote_calculator
  "Book a delivery": "admin.homePageContent.bookADelivery",
  "Enter a pickup and a dropoff, pick a vehicle rated for the load, and we quote base fare, distance and driving time in lari. No account needed to see the number.":
    "admin.homePageContent.enterAPickupAndADropoffPick",
  // offers
  "Offers and news": "admin.homePageContent.offersAndNews",
  // how_it_works
  "How it works": "admin.homePageContent.howItWorks",
  "Four steps, no phone calls.": "admin.homePageContent.fourStepsNoPhoneCalls",
  "Built for the load that won't fit in a car boot — an office move, a pallet of stock, a machine that needs a tail lift.":
    "admin.homePageContent.builtForTheLoadThatWontFit",
  "Set the route": "admin.homePageContent.setTheRoute",
  "Type the pickup and the dropoff — addresses autocomplete as you go — then tell us what you're sending: furniture, appliances, retail stock or construction materials.":
    "admin.homePageContent.typeThePickupAndTheDropoff",
  "Pick a vehicle": "admin.homePageContent.pickAVehicle",
  "Cargo van for a few boxes, trailer truck for pallets. Every type lists its payload rating and cargo dimensions, so you can match the vehicle to the load.":
    "admin.homePageContent.cargoVanForAFewBoxes",
  "Lock the price": "admin.homePageContent.lockThePrice",
  "We quote on real distance, driving time and whether you need a helper, itemised line by line. No auction, no surprise line items at the door.":
    "admin.homePageContent.weQuoteOnRealDistanceDriving",
  "Track it to the door": "admin.homePageContent.trackItToTheDoor",
  "An independent driver or a logistics company takes the job and it goes live on your map. Follow the vehicle from loading to unload, and keep every order in your account.":
    "admin.homePageContent.anIndependentDriverOrALogistics",
  // vehicle_types
  "The fleet": "admin.homePageContent.theFleet",
  "Every size, one account.": "admin.homePageContent.everySizeOneAccount",
  "Pick the vehicle the load actually needs. Eleven types across two duty classes, medium and heavy, each with its own payload rating and cargo dimensions.":
    "admin.homePageContent.pickTheVehicleTheLoadActuallyNeeds",
  "Medium duty": "admin.adminContentVehiclePhotos.mediumDuty",
  "Heavy duty": "admin.adminContentVehiclePhotos.heavyDuty",
  "Business account": "admin.homePageContent.businessAccount",
  "Register your company, put your fleet and your drivers on one roster, and dispatch from a single hub. Applications are reviewed by our team before the account goes live.":
    "admin.homePageContent.registerYourCompanyPutYourFleet",
  // driver_cta
  "For transport providers": "admin.homePageContent.forTransportProviders",
  "Your truck.\nYour hours.\nYour jobs.":
    "admin.homePageContent.yourTruckYourHoursYourJobs",
  "Sign up as an independent driver or as a logistics company, register your vehicles, and start accepting freight jobs from shippers near you.":
    "admin.homePageContent.signUpAsAnIndependentDriver",
  "Become a driver": "admin.homePageContent.becomeADriver",
  "Take the loads that suit your vehicle, your payload rating and your day.":
    "admin.homePageContent.takeTheLoadsThatSuitYourVehicle",
  "Every job shows the route, the cargo and the payout before you accept.":
    "admin.homePageContent.everyJobShowsTheRouteTheCargo",
  "Driving your own truck or running a fleet — both sign up here.":
    "admin.homePageContent.drivingYourOwnTruckOrRunningAFleet",
  "What you need to sign up": "admin.homePageContent.whatYouNeedToSignUp",
  // coverage — city names come from the shared city catalog, never restated
  Coverage: "admin.homePageContent.coverage",
  "Every major city, one account.":
    "admin.homePageContent.everyMajorCityOneAccount",
  "Set a pickup and a dropoff anywhere we operate and the fare is worked out on the real route between them — across town or across the country. Support in Georgian and English.":
    "admin.homePageContent.setAPickupAndADropoff",
  "Price your route": "admin.homePageContent.priceYourRoute",
  Tbilisi: "cities.georgianCities.tbilisi",
  Batumi: "cities.georgianCities.batumi",
  Kutaisi: "cities.georgianCities.kutaisi",
  Rustavi: "cities.georgianCities.rustavi",
  Gori: "cities.georgianCities.gori",
  Zugdidi: "cities.georgianCities.zugdidi",
  Telavi: "cities.georgianCities.telavi",
  Poti: "cities.georgianCities.poti",
  Zestaponi: "cities.georgianCities.zestaponi",
  Marneuli: "cities.georgianCities.marneuli",
  Akhaltsikhe: "cities.georgianCities.akhaltsikhe",
  Citywide: "admin.homePageContent.coverageTierCitywide",
  Regional: "admin.homePageContent.coverageTierRegional",
  Nationwide: "admin.homePageContent.coverageTierNationwide",
  // faq
  Questions: "common.shared.questions",
  "Before you book": "admin.homePageContent.beforeYouBook",
  "What sits behind the quote, how a vehicle is matched to the load, and what happens once a driver takes the job.":
    "admin.homePageContent.whatSitsBehindTheQuote",
  "How is the price worked out?":
    "admin.homePageContent.howIsThePriceWorkedOut",
  "We geocode both addresses and price the distance between them with the vehicle type's own rates: a base fare, a per-kilometre rate and a rate for the estimated time of the trip. A helper, if you ask for one, adds a flat fee on top. You get the total itemised, and the same calculation runs when you place the order — the estimate is not a separate marketing number.":
    "admin.homePageContent.weGeocodeBothAddressesAndPrice",
  "Which vehicle should I book?":
    "admin.homePageContent.whichVehicleShouldIBook",
  "Vehicles come in two duty classes, medium-duty and heavy-duty, and each cargo category only offers the classes that can take it. Furniture, appliances, retail stock and event equipment go either way; industrial supplies and construction materials are heavy-duty only. Every type lists its maximum payload, so you can match the rating to the load.":
    "admin.homePageContent.vehiclesComeInTwoDutyClasses",
  "What does adding a helper do?":
    "admin.homePageContent.whatDoesAddingAHelperDo",
  "A helper is a second pair of hands who rides along to load and unload with the driver. It is a flat fee on top of the distance and time components, so tick it before you price the job and it is already in the total and in the breakdown you see.":
    "admin.homePageContent.aHelperIsASecondPair",
  "Who actually moves my cargo?":
    "admin.homePageContent.whoActuallyMovesMyCargo",
  "An order starts out pending until a transport provider takes it. That is either an independent driver, who accepts it with one of the vehicles registered to their profile, or a logistics company, which claims the job and dispatches it to a driver on its own roster.":
    "admin.homePageContent.anOrderStartsOutPendingUntil",
  "Can I follow the delivery?": "admin.homePageContent.canIFollowTheDelivery",
  "Yes. Once an order is accepted it gets its own tracking page: pickup and dropoff on a map, plus the driver's position as they report it, refreshed while you watch. The status moves from accepted to in transit to completed, and the order stays in your account afterwards.":
    "admin.homePageContent.yesOnceAnOrderIsAccepted",
  "Can a company book and dispatch as a business?":
    "admin.homePageContent.canACompanyBookAndDispatch",
  "Yes. A logistics company registers, adds its drivers and its vehicles to one roster, and claims jobs from the dispatch queue; the application is reviewed before the account goes live. Shippers book the same way whether they are an individual or a business.":
    "admin.homePageContent.yesALogisticsCompanyRegisters",
  // closing_cta
  "Your next load is a route away.":
    "admin.homePageContent.yourNextLoadIsARoute",
  "Price it in the open, book it in a few steps, and follow the vehicle to the door. No card needed to get a quote.":
    "admin.homePageContent.priceItInTheOpenBook",
  "Create an account": "auth.signInForm.createAnAccount",
  "Drive with us": "admin.homePageContent.driveWithUs",
  // category_tiles (retired, still renderable)
  "What we carry": "admin.homePageContent.whatWeCarry",
  "Ship anything, across the city":
    "admin.homePageContent.shipAnythingAcrossTheCity",
  "Pick the category your load falls under and the vehicle rated to carry it comes with it. Figures below are a starting point for a short cross-town run — your price is calculated on the route you enter.":
    "admin.homePageContent.pickTheCategoryYourLoadFallsUnder",
  // nav, footer
  Vehicles: "common.shared.vehicles",
  "For drivers": "admin.homePageContent.forDrivers",
  FAQ: "admin.homePageContent.faq",
  Help: "admin.homePageContent.help",
  "Send a delivery": "admin.homePageContent.sendADelivery",
  "Sign in": "common.shared.signIn",
  "Sign up": "common.shared.signUp",
  "Commercial freight and cargo across Georgia — vans to trailer trucks, priced before you book.":
    "admin.homePageContent.commercialFreightAndCargoAcrossGeorgia",
  Product: "admin.homePageContent.product",
  Business: "admin.homePageContent.business",
  "Fleet dashboard": "admin.homePageContent.fleetDashboard",
  Drivers: "common.shared.drivers",
  "Driver sign-up": "admin.homePageContent.driverSignUp",
  "Driver hub": "common.shared.driverHub",
  Company: "common.shared.company",
  About: "admin.homePageContent.about",
  Careers: "admin.homePageContent.careers",
  Contact: "common.shared.contact",
  Privacy: "admin.homePageContent.privacy",
  Terms: "admin.homePageContent.terms",
  Cookies: "admin.homePageContent.cookies",
};

/**
 * Brand strings from before the zomo rebrand, mapped to their replacements.
 *
 * "Lalamove Georgia" was the placeholder brand the original design handoff was
 * written for, and it is what `scripts/seed-home-page-content.ts` stored in
 * every `nav` / `footer` row seeded before the rebrand. Those rows are
 * authored content, so they are not rewritten in the database; the renderer
 * passes the brand fields through `migrateLegacyBrandCopy` instead, so an
 * untouched legacy row shows the new brand while anything an editor actually
 * changed is printed as written. Keep the old values here for as long as such
 * rows may exist.
 */
const LEGACY_BRAND_COPY: ReadonlyMap<string, string> = new Map([
  ["Lalamove Georgia", "zomo"],
  ["© {year} Lalamove Georgia", "© {year} zomo"],
]);

/** The current-brand equivalent of a legacy placeholder value, else `value`. */
export function migrateLegacyBrandCopy(value: string): string {
  return LEGACY_BRAND_COPY.get(value) ?? value;
}

/**
 * Default strings that are the same in every language, so have no catalog key.
 *
 * The brand is a mark, not a word (`src/messages/GLOSSARY.md`: "zomo" is
 * never translated as a standalone name), the copyright line is that mark plus
 * the renderer's `{year}` token, and the stat figures are numerals. Listed so a
 * coverage check over the defaults can tell a deliberate literal from a string
 * someone forgot to key. The legacy "Lalamove Georgia" pair stays listed so
 * rows stored before the rebrand still read as deliberate literals too.
 */
export const UNTRANSLATED_DEFAULT_COPY: ReadonlySet<string> = new Set([
  "zomo",
  "© {year} zomo",
  ...LEGACY_BRAND_COPY.keys(),
  "25",
  "11",
  "24/7",
  "100%",
]);

/** The catalog key a default string is translated through, if it has one. */
export function defaultCopyMessageKey(english: string): string | undefined {
  return Object.hasOwn(DEFAULT_COPY_MESSAGE_KEYS, english)
    ? DEFAULT_COPY_MESSAGE_KEYS[english]
    : undefined;
}

/**
 * The catalog keys the defaults need that `lookup` cannot resolve, sorted.
 *
 * Rendering tolerates a gap (the English default shows instead), but writing
 * rows must not: `scripts/seed-home-page-content.ts --locale ka` refuses to
 * store English in a row labelled Georgian, and names these keys instead.
 */
export function listUnresolvedDefaultCopyKeys(
  lookup: HomePageMessageLookup,
): string[] {
  const keys = new Set(Object.values(DEFAULT_COPY_MESSAGE_KEYS));

  return [...keys].filter((key) => lookup(key) === undefined).sort();
}

/**
 * Whether a content field holds a link target rather than copy. Hrefs are
 * locale-neutral (the locale prefix is added by `Link`, not by content), so they
 * are never looked up.
 */
function isHrefField(fieldName: string | undefined): boolean {
  return fieldName !== undefined && /Href$|^href$/.test(fieldName);
}

/**
 * Rebuilds a default content value with every translatable string swapped for
 * its localized message. Structure, numbers and hrefs are carried over
 * unchanged, so the result satisfies the same content type as its input.
 */
function localizeDefaultValue(
  value: unknown,
  lookup: HomePageMessageLookup,
  fieldName?: string,
): unknown {
  if (typeof value === "string") {
    if (isHrefField(fieldName)) {
      return value;
    }

    const key = defaultCopyMessageKey(value);
    // A missing message falls back to the English default rather than to a
    // key path: the English is real copy, the key path is not.
    return (key && lookup(key)) || value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => localizeDefaultValue(entry, lookup));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [
        name,
        localizeDefaultValue(entry, lookup, name),
      ]),
    );
  }

  return value;
}

/**
 * `DEFAULT_HOME_PAGE_CONTENT` in the reader's language.
 *
 * This is what the landing page falls back to for a section with no row in the
 * visitor's locale, and what `scripts/seed-home-page-content.ts --locale ka`
 * writes. With the `en` catalog it reproduces `DEFAULT_HOME_PAGE_CONTENT`
 * exactly — every key above resolves to the very string it is keyed by.
 */
export function localizeDefaultHomePageContent(
  lookup: HomePageMessageLookup,
): HomePageSectionContentByType {
  // The walk preserves shape by construction (it only ever replaces a string
  // with a string), which the type system cannot follow through `unknown`.
  return localizeDefaultValue(
    DEFAULT_HOME_PAGE_CONTENT,
    lookup,
  ) as HomePageSectionContentByType;
}

/**
 * A `HomePageMessageLookup` over a nested messages object — the shape
 * `next-intl`'s `getMessages()` / `useMessages()` return and the catalog
 * barrels under `src/messages/<locale>` export. Only string leaves resolve; a
 * key that stops at a namespace is `undefined`, not the namespace object.
 */
export function createMessageLookup(messages: unknown): HomePageMessageLookup {
  return (key) => {
    let node: unknown = messages;

    for (const segment of key.split(".")) {
      const record = asRecord(node);
      if (!record || !Object.hasOwn(record, segment)) {
        return undefined;
      }
      node = record[segment];
    }

    return typeof node === "string" && node.trim() !== "" ? node : undefined;
  };
}

/** A section as the landing page composes it: validated content plus a row id. */
export type HomePageSectionWithId = HomePageSectionData & { id: string };

/**
 * The full default composition for one set of content — every body section in
 * `DEFAULT_HOME_PAGE_SECTION_ORDER`, then the two chrome sections.
 *
 * Written out literally rather than mapped from the order constant so each
 * entry's `content` is checked against the shape its own `type` demands; the
 * order here is that constant's, and the two are meant to stay in step. The
 * retired types are absent for the same reason they are absent there.
 */
export function buildDefaultHomePageSections(
  content: HomePageSectionContentByType,
): HomePageSectionWithId[] {
  return [
    {
      id: "default-hero_carousel",
      type: "hero_carousel",
      content: content.hero_carousel,
    },
    {
      id: "default-quote_calculator",
      type: "quote_calculator",
      content: content.quote_calculator,
    },
    { id: "default-offers", type: "offers", content: content.offers },
    {
      id: "default-vehicle_types",
      type: "vehicle_types",
      content: content.vehicle_types,
    },
    {
      id: "default-how_it_works",
      type: "how_it_works",
      content: content.how_it_works,
    },
    { id: "default-coverage", type: "coverage", content: content.coverage },
    {
      id: "default-partner_marquee",
      type: "partner_marquee",
      content: content.partner_marquee,
    },
    {
      id: "default-closing_cta",
      type: "closing_cta",
      content: content.closing_cta,
    },
    { id: "default-faq", type: "faq", content: content.faq },
    { id: "default-nav", type: "nav", content: content.nav },
    { id: "default-footer", type: "footer", content: content.footer },
  ];
}

/**
 * Completes a partly-authored page: every default section whose type has no
 * row in `authoredTypes` is added, so a locale with only some sections authored
 * still renders the whole page instead of a handful of strips.
 *
 * `authoredTypes` must include types whose only rows are *inactive* — switching
 * a section off in the back office is a decision, and filling it back in with
 * the default would silently overrule it.
 *
 * A filled-in body section lands where the default order puts it: straight
 * after the last section already on the page that precedes it in
 * `DEFAULT_HOME_PAGE_SECTION_ORDER`, or first if none does. Authored sections
 * never move. Chrome is appended — the renderer finds it by type, so its
 * position is irrelevant.
 *
 * Only `type` is read, so that is the whole constraint: the public loader
 * passes validated sections, and the admin "materialize defaults" endpoint
 * passes raw rows (any `type` string) to work out where filled-in rows go.
 */
export function withDefaultSections<Section extends { type: string }>(
  sections: readonly Section[],
  defaults: readonly Section[],
  authoredTypes: ReadonlySet<string>,
): Section[] {
  const rank = new Map<string, number>(
    DEFAULT_HOME_PAGE_SECTION_ORDER.map((type, index) => [type, index]),
  );
  const composed = [...sections];

  // `defaults` arrive in the default order, so a section filled in on one
  // iteration is already in place to anchor the next.
  for (const fallback of defaults) {
    if (authoredTypes.has(fallback.type)) {
      continue;
    }

    const fallbackRank = rank.get(fallback.type);
    if (fallbackRank === undefined) {
      composed.push(fallback);
      continue;
    }

    let insertAt = 0;
    composed.forEach((section, index) => {
      const sectionRank = rank.get(section.type);
      if (sectionRank !== undefined && sectionRank < fallbackRank) {
        insertAt = index + 1;
      }
    });

    composed.splice(insertAt, 0, fallback);
  }

  return composed;
}

/** Either a validated value or the reason it was rejected. */
type Parsed<Value> = { data: Value } | { error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Reads a fixed set of required, non-empty string fields off a record.
 *
 * Every content shape here is (mostly) a bag of trimmed strings, so one helper
 * covers them instead of each parser repeating the same eight checks. The
 * `Record<Key, string>` it returns is structurally the content type the caller
 * declares, which is what keeps the parsers this short.
 */
function readStrings<Key extends string>(
  record: Record<string, unknown>,
  keys: readonly Key[],
  context: string,
): Parsed<Record<Key, string>> {
  const result = {} as Record<Key, string>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value !== "string" || value.trim() === "") {
      return {
        error: `${context}.${key} is required and must be a non-empty string.`,
      };
    }

    result[key] = value.trim();
  }

  return { data: result };
}

/**
 * Reads a set of optional string fields.
 *
 * An absent, `null` or blank value is simply left off the result rather than
 * rejected: these are fields added after rows already existed, and a row
 * written before a field was introduced is a normal row, not corrupt data. A
 * value that is present but not a string still fails, because that is a genuine
 * shape mismatch rather than an older schema.
 */
function readOptionalStrings<Key extends string>(
  record: Record<string, unknown>,
  keys: readonly Key[],
  context: string,
): Parsed<Partial<Record<Key, string>>> {
  const result: Partial<Record<Key, string>> = {};

  for (const key of keys) {
    const value = record[key];

    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value !== "string") {
      return { error: `${context}.${key} must be a string when present.` };
    }

    const trimmed = value.trim();
    if (trimmed !== "") {
      result[key] = trimmed;
    }
  }

  return { data: result };
}

/**
 * Reads a bounded number. The only numeric field in the contract is the mock
 * tracking panel's progress bar, and a percentage outside 0–100 would render as
 * a bar wider than its own track.
 *
 * A numeric string is accepted and coerced: an admin `<input type="number">`
 * serialises as a string unless every form is careful, and rejecting "68" while
 * accepting 68 is a footgun with no upside.
 */
function readPercent(
  record: Record<string, unknown>,
  key: string,
  context: string,
): Parsed<number> {
  const raw = record[key];
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { error: `${context}.${key} must be a number.` };
  }

  if (value < 0 || value > 100) {
    return { error: `${context}.${key} must be between 0 and 100.` };
  }

  return { data: Math.round(value) };
}

/**
 * Reads an optional integer and clamps it into `[min, max]`. Absent / `null` /
 * blank is left off the result (an older row); a numeric string is coerced for
 * the same reason as `readPercent`; anything non-numeric is a shape mismatch.
 */
function readOptionalClampedInteger(
  record: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  context: string,
): Parsed<number | undefined> {
  const raw = record[key];

  if (raw === undefined || raw === null) {
    return { data: undefined };
  }
  if (typeof raw === "string" && raw.trim() === "") {
    return { data: undefined };
  }

  const value = typeof raw === "string" ? Number(raw.trim()) : raw;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { error: `${context}.${key} must be a number when present.` };
  }

  return { data: Math.min(max, Math.max(min, Math.round(value))) };
}

/**
 * Reads an optional array of `{ label, href }` links. Absent / `null` is left
 * off the result, the same tolerance `readOptionalStrings` gives a scalar.
 */
function readOptionalLinkArray(
  record: Record<string, unknown>,
  key: string,
  context: string,
): Parsed<NavLink[] | undefined> {
  if (record[key] === undefined || record[key] === null) {
    return { data: undefined };
  }

  return readEntryArray(record, key, ["label", "href"], context);
}

/**
 * Reads an array of repeated sub-entries (FAQ items, how-it-works steps), each
 * validated with the same string rules as a top-level field.
 *
 * `optionalFields` is how an entry carries a field that is allowed to be
 * missing — a bento card's link, which most cards do not have. It defaults to
 * empty, so the call sites that predate it read exactly as they did.
 *
 * An empty array is allowed: a section with no items yet is a half-finished
 * edit, not corrupt data, and it renders as an empty list rather than breaking.
 */
function readEntryArray<Key extends string, Optional extends string = never>(
  record: Record<string, unknown>,
  key: string,
  fields: readonly Key[],
  context: string,
  optionalFields: readonly Optional[] = [],
): Parsed<(Record<Key, string> & Partial<Record<Optional, string>>)[]> {
  const value = record[key];

  if (!Array.isArray(value)) {
    return { error: `${context}.${key} must be an array.` };
  }

  const entries: (Record<Key, string> & Partial<Record<Optional, string>>)[] =
    [];

  for (const [index, entry] of value.entries()) {
    const entryRecord = asRecord(entry);
    const entryContext = `${context}.${key}[${index}]`;

    if (!entryRecord) {
      return { error: `${entryContext} must be an object.` };
    }

    const parsed = readStrings(entryRecord, fields, entryContext);

    if ("error" in parsed) {
      return { error: parsed.error };
    }

    const optional = readOptionalStrings(
      entryRecord,
      optionalFields,
      entryContext,
    );

    if ("error" in optional) {
      return { error: optional.error };
    }

    entries.push({ ...parsed.data, ...optional.data });
  }

  return { data: entries };
}

/** Reads an array of plain non-empty strings (the driver CTA's bullet list). */
function readStringArray(
  record: Record<string, unknown>,
  key: string,
  context: string,
): Parsed<string[]> {
  const value = record[key];

  if (!Array.isArray(value)) {
    return { error: `${context}.${key} must be an array.` };
  }

  const entries: string[] = [];

  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.trim() === "") {
      return {
        error: `${context}.${key}[${index}] must be a non-empty string.`,
      };
    }

    entries.push(entry.trim());
  }

  return { data: entries };
}

function parseHeroContent(value: unknown): Parsed<HeroContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "hero content must be an object." };
  }

  const text = readStrings(
    record,
    [
      "eyebrow",
      "headline",
      "subtext",
      "primaryCtaLabel",
      "primaryCtaHref",
      "secondaryCtaLabel",
      "secondaryCtaHref",
    ],
    "hero",
  );
  if ("error" in text) {
    return { error: text.error };
  }

  const optional = readOptionalStrings(
    record,
    ["statusChipText", "statusChipTag", "headlineHighlight"],
    "hero",
  );
  if ("error" in optional) {
    return { error: optional.error };
  }

  return { data: { ...text.data, ...optional.data } };
}

function parseHeroCarouselContent(value: unknown): Parsed<HeroCarouselContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "hero_carousel content must be an object." };
  }

  const text = readOptionalStrings(
    record,
    ["fallbackCaption"],
    "hero_carousel",
  );
  if ("error" in text) {
    return { error: text.error };
  }

  const interval = readOptionalClampedInteger(
    record,
    "intervalSec",
    HERO_INTERVAL_MIN,
    HERO_INTERVAL_MAX,
    "hero_carousel",
  );
  if ("error" in interval) {
    return { error: interval.error };
  }

  return {
    data: {
      ...text.data,
      ...(interval.data === undefined ? {} : { intervalSec: interval.data }),
    },
  };
}

function parsePartnerMarqueeContent(
  value: unknown,
): Parsed<PartnerMarqueeContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "partner_marquee content must be an object." };
  }

  return readStrings(record, ["eyebrow"], "partner_marquee");
}

function parseStatsContent(value: unknown): Parsed<StatsContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "stats content must be an object." };
  }

  const items = readEntryArray(record, "items", ["value", "label"], "stats");
  if ("error" in items) {
    return { error: items.error };
  }

  return { data: { items: items.data } };
}

/**
 * The bento card's mock panel. Required as a whole — it is part of the card's
 * layout, not an optional embellishment — but the `bento` type is new, so there
 * are no older rows to be tolerant of.
 */
function parseBentoTrackingPanel(
  value: unknown,
  context: string,
): Parsed<BentoTrackingPanel> {
  const record = asRecord(value);
  if (!record) {
    return { error: `${context} must be an object.` };
  }

  const text = readStrings(
    record,
    ["orderLabel", "etaLabel", "fromLabel", "toLabel"],
    context,
  );
  if ("error" in text) {
    return { error: text.error };
  }

  const progress = readPercent(record, "progressPercent", context);
  if ("error" in progress) {
    return { error: progress.error };
  }

  return { data: { ...text.data, progressPercent: progress.data } };
}

function parseBentoContent(value: unknown): Parsed<BentoContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "bento content must be an object." };
  }

  const text = readStrings(record, ["eyebrow", "heading", "body"], "bento");
  if ("error" in text) {
    return { error: text.error };
  }

  const trackingPanel = parseBentoTrackingPanel(
    record.trackingPanel,
    "bento.trackingPanel",
  );
  if ("error" in trackingPanel) {
    return { error: trackingPanel.error };
  }

  const sideCards = readEntryArray(
    record,
    "sideCards",
    ["eyebrow", "title", "body"],
    "bento",
    ["linkLabel", "linkHref"],
  );
  if ("error" in sideCards) {
    return { error: sideCards.error };
  }

  const rowCards = readEntryArray(
    record,
    "rowCards",
    ["eyebrow", "title", "body"],
    "bento",
    ["linkLabel", "linkHref"],
  );
  if ("error" in rowCards) {
    return { error: rowCards.error };
  }

  return {
    data: {
      ...text.data,
      trackingPanel: trackingPanel.data,
      sideCards: sideCards.data,
      rowCards: rowCards.data,
    },
  };
}

function parseQuoteCalculatorContent(
  value: unknown,
): Parsed<QuoteCalculatorContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "quote_calculator content must be an object." };
  }

  const text = readStrings(
    record,
    ["eyebrow", "heading", "intro"],
    "quote_calculator",
  );
  if ("error" in text) {
    return { error: text.error };
  }

  const optional = readOptionalStrings(
    record,
    ["ctaLabel", "ctaHref"],
    "quote_calculator",
  );
  if ("error" in optional) {
    return { error: optional.error };
  }

  return { data: { ...text.data, ...optional.data } };
}

function parseOffersContent(value: unknown): Parsed<OffersContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "offers content must be an object." };
  }

  const text = readStrings(record, ["heading"], "offers");
  if ("error" in text) {
    return { error: text.error };
  }

  const optional = readOptionalStrings(
    record,
    ["linkLabel", "linkHref"],
    "offers",
  );
  if ("error" in optional) {
    return { error: optional.error };
  }

  return { data: { ...text.data, ...optional.data } };
}

function parseCategoryTilesContent(
  value: unknown,
): Parsed<CategoryTilesContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "category_tiles content must be an object." };
  }

  return readStrings(record, ["eyebrow", "heading", "intro"], "category_tiles");
}

function parseVehicleTypesContent(value: unknown): Parsed<VehicleTypesContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "vehicle_types content must be an object." };
  }

  const text = readStrings(record, ["eyebrow", "heading"], "vehicle_types");
  if ("error" in text) {
    return { error: text.error };
  }

  const optional = readOptionalStrings(
    record,
    ["intro", "mediumDutyLabel", "heavyDutyLabel"],
    "vehicle_types",
  );
  if ("error" in optional) {
    return { error: optional.error };
  }

  const panelValue = record.businessPanel;

  // The panel is optional as a whole: a row from the previous shape has no key
  // at all, which is a normal row. A key that is present but not an object is a
  // genuine shape mismatch and still fails.
  if (panelValue === undefined || panelValue === null) {
    return { data: { ...text.data, ...optional.data } };
  }

  const panelRecord = asRecord(panelValue);
  if (!panelRecord) {
    return { error: "vehicle_types.businessPanel must be an object." };
  }

  const businessPanel = readStrings(
    panelRecord,
    ["title", "body", "ctaLabel", "ctaHref"],
    "vehicle_types.businessPanel",
  );
  if ("error" in businessPanel) {
    return { error: businessPanel.error };
  }

  return {
    data: { ...text.data, ...optional.data, businessPanel: businessPanel.data },
  };
}

function parseHowItWorksContent(value: unknown): Parsed<HowItWorksContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "how_it_works content must be an object." };
  }

  const text = readStrings(record, ["eyebrow", "heading"], "how_it_works");
  if ("error" in text) {
    return { error: text.error };
  }

  const optional = readOptionalStrings(record, ["aside"], "how_it_works");
  if ("error" in optional) {
    return { error: optional.error };
  }

  const steps = readEntryArray(
    record,
    "steps",
    ["title", "body"],
    "how_it_works",
  );
  if ("error" in steps) {
    return { error: steps.error };
  }

  return { data: { ...text.data, ...optional.data, steps: steps.data } };
}

function parseDriverCtaContent(value: unknown): Parsed<DriverCtaContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "driver_cta content must be an object." };
  }

  const text = readStrings(
    record,
    ["eyebrow", "headline", "subtext", "ctaLabel"],
    "driver_cta",
  );
  if ("error" in text) {
    return { error: text.error };
  }

  const optional = readOptionalStrings(
    record,
    ["secondaryCtaLabel", "secondaryCtaHref", "imageUrl"],
    "driver_cta",
  );
  if ("error" in optional) {
    return { error: optional.error };
  }

  const points = readStringArray(record, "points", "driver_cta");
  if ("error" in points) {
    return { error: points.error };
  }

  return { data: { ...text.data, ...optional.data, points: points.data } };
}

function parseCoverageContent(value: unknown): Parsed<CoverageContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "coverage content must be an object." };
  }

  const text = readStrings(
    record,
    ["eyebrow", "heading", "body", "ctaLabel", "ctaHref"],
    "coverage",
  );
  if ("error" in text) {
    return { error: text.error };
  }

  const cities = readEntryArray(
    record,
    "cities",
    ["name", "tier"],
    "coverage",
    ["imageUrl", "href"],
  );
  if ("error" in cities) {
    return { error: cities.error };
  }

  return { data: { ...text.data, cities: cities.data } };
}

function parseFaqContent(value: unknown): Parsed<FaqContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "faq content must be an object." };
  }

  const text = readStrings(record, ["eyebrow", "heading", "intro"], "faq");
  if ("error" in text) {
    return { error: text.error };
  }

  const optional = readOptionalStrings(
    record,
    ["supportLinkLabel", "supportLinkHref"],
    "faq",
  );
  if ("error" in optional) {
    return { error: optional.error };
  }

  const items = readEntryArray(record, "items", ["question", "answer"], "faq");
  if ("error" in items) {
    return { error: items.error };
  }

  return { data: { ...text.data, ...optional.data, items: items.data } };
}

function parseClosingCtaContent(value: unknown): Parsed<ClosingCtaContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "closing_cta content must be an object." };
  }

  const text = readStrings(
    record,
    [
      "heading",
      "body",
      "primaryCtaLabel",
      "primaryCtaHref",
      "secondaryCtaLabel",
      "secondaryCtaHref",
    ],
    "closing_cta",
  );
  if ("error" in text) {
    return { error: text.error };
  }

  const optional = readOptionalStrings(
    record,
    ["appStoreUrl", "playStoreUrl"],
    "closing_cta",
  );
  if ("error" in optional) {
    return { error: optional.error };
  }

  return { data: { ...text.data, ...optional.data } };
}

function parseNavContent(value: unknown): Parsed<NavContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "nav content must be an object." };
  }

  const text = readStrings(
    record,
    ["wordmark", "signInLabel", "signInHref", "signUpLabel", "signUpHref"],
    "nav",
  );
  if ("error" in text) {
    return { error: text.error };
  }

  const links = readEntryArray(record, "links", ["label", "href"], "nav");
  if ("error" in links) {
    return { error: links.error };
  }

  const optional = readOptionalStrings(record, ["utilityText"], "nav");
  if ("error" in optional) {
    return { error: optional.error };
  }

  const utilityLinks = readOptionalLinkArray(record, "utilityLinks", "nav");
  if ("error" in utilityLinks) {
    return { error: utilityLinks.error };
  }

  return {
    data: {
      ...text.data,
      ...optional.data,
      links: links.data,
      ...(utilityLinks.data === undefined
        ? {}
        : { utilityLinks: utilityLinks.data }),
    },
  };
}

/**
 * Footer columns are the only two-level array in the contract: a titled column
 * wrapping its own list of links. `readEntryArray` handles one level, so this
 * walks the outer list itself and delegates each column's links to it.
 *
 * A column with no links is allowed for the same reason an empty `items` array
 * is: it is a half-finished edit, and it renders as a heading with nothing
 * under it rather than rejecting the whole footer.
 */
function parseFooterColumns(
  record: Record<string, unknown>,
  context: string,
): Parsed<FooterColumn[]> {
  const value = record.columns;

  if (!Array.isArray(value)) {
    return { error: `${context}.columns must be an array.` };
  }

  const columns: FooterColumn[] = [];

  for (const [index, entry] of value.entries()) {
    const entryRecord = asRecord(entry);
    const entryContext = `${context}.columns[${index}]`;

    if (!entryRecord) {
      return { error: `${entryContext} must be an object.` };
    }

    const title = readStrings(entryRecord, ["title"], entryContext);
    if ("error" in title) {
      return { error: title.error };
    }

    const links = readEntryArray(
      entryRecord,
      "links",
      ["label", "href"],
      entryContext,
    );
    if ("error" in links) {
      return { error: links.error };
    }

    columns.push({ title: title.data.title, links: links.data });
  }

  return { data: columns };
}

function parseFooterContent(value: unknown): Parsed<FooterContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "footer content must be an object." };
  }

  const text = readStrings(
    record,
    ["brandName", "brandBlurb", "copyright"],
    "footer",
  );
  if ("error" in text) {
    return { error: text.error };
  }

  const columns = parseFooterColumns(record, "footer");
  if ("error" in columns) {
    return { error: columns.error };
  }

  const legalLinks = readEntryArray(
    record,
    "legalLinks",
    ["label", "href"],
    "footer",
  );
  if ("error" in legalLinks) {
    return { error: legalLinks.error };
  }

  const optional = readOptionalStrings(
    record,
    ["ctaLabel", "ctaHref"],
    "footer",
  );
  if ("error" in optional) {
    return { error: optional.error };
  }

  return {
    data: {
      ...text.data,
      ...optional.data,
      columns: columns.data,
      legalLinks: legalLinks.data,
    },
  };
}

/**
 * Validates a `(type, content)` pair, whether it came from a request body or
 * from the `Json` column of an existing row.
 *
 * Both sides need this: the API routes because a `Json` column will store
 * literally anything otherwise, and the public renderer because a row written
 * before a shape changed (or edited straight in the database) must not be able
 * to crash the landing page. Callers on the read side treat a rejection as
 * "skip this section", not as an error to surface to a visitor.
 */
export function parseHomePageSection(
  type: string,
  content: unknown,
): Parsed<HomePageSectionData> {
  if (!isHomePageSectionType(type)) {
    return {
      error: `type must be one of: ${HOME_PAGE_SECTION_TYPES.join(", ")}.`,
    };
  }

  // Each branch narrows `type` to a single literal, so the object built from it
  // lands on exactly one member of the `HomePageSectionData` union.
  switch (type) {
    case "hero": {
      const parsed = parseHeroContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "hero_carousel": {
      const parsed = parseHeroCarouselContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "partner_marquee": {
      const parsed = parsePartnerMarqueeContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "stats": {
      const parsed = parseStatsContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "bento": {
      const parsed = parseBentoContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "quote_calculator": {
      const parsed = parseQuoteCalculatorContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "offers": {
      const parsed = parseOffersContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "how_it_works": {
      const parsed = parseHowItWorksContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "vehicle_types": {
      const parsed = parseVehicleTypesContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "driver_cta": {
      const parsed = parseDriverCtaContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "coverage": {
      const parsed = parseCoverageContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "faq": {
      const parsed = parseFaqContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "closing_cta": {
      const parsed = parseClosingCtaContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "category_tiles": {
      const parsed = parseCategoryTilesContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "nav": {
      const parsed = parseNavContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "footer": {
      const parsed = parseFooterContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
  }
}
