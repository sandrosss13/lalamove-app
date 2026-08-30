# Task 02: CMS content contract — every new section type, shape, label and default copy

## Status

complete

## Wave

1

## Description

`src/lib/admin/home-page-content.ts` is the single shared contract for the composable
landing page: the admin form builds a `content` object against it, the
`/api/admin/content/home-page-sections` routes validate against it, and the public landing
components read it back. It currently covers six section types. The `Home-Georgia-v3`
redesign needs fourteen, plus a new `Banner` placement for partner logos.

This task extends that one file — and only that file — with every new section type, its
TypeScript content shape, its admin label, its hand-rolled `parse*` validator, and its
freight-adapted default copy. It is a wave-1 task on its own precisely because every
landing renderer (tasks 05–11), the composer (task-14), the admin forms (task-12) and the
seed (task-15) compile against it. Nothing else in wave 1 touches this file.

The default copy is the substantive half of the work. The design handoff is written for a
courier product ("book a courier in twelve seconds", "54s median match time", "6,400
courier partners", a public REST API) and this platform is a commercial freight
marketplace that implements none of that. Every default string below has already been
adapted; **write them verbatim** rather than inventing your own.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-05-nav-pill-and-footer.md, task-06-hero-and-carousel.md,
task-07-marquee-and-stats.md, task-08-bento-and-how-it-works.md,
task-09-vehicles-and-drivers.md, task-10-coverage-faq-closing-cta.md,
task-11-quote-calculator-restyle.md, task-12-admin-section-and-banner-forms.md

**Context from dependencies:** None — this is a wave-1 foundation task. What matters is
what it *produces*: tasks 05–11 each build one landing section and import that section's
content type and its entry in `DEFAULT_HOME_PAGE_CONTENT` from this file; task-12 builds
one admin sub-form per section type and reads `HOME_PAGE_SECTION_TYPES`,
`HOME_PAGE_SECTION_TYPE_LABELS` and the same defaults to pre-fill a new section; task-14
rewrites `LandingSectionRenderer`'s exhaustive switch over the union this file declares;
task-15 seeds `HomePageSection` rows from these defaults. If a field name here is wrong,
it is wrong in nine other files.

## Files to Create

None.

## Files to Modify

- `src/lib/admin/home-page-content.ts` — the only file this task edits. Adds eight new
  section types plus extensions to four existing ones, two new exported constants, an
  ordered default-section list, the chrome-type list, per-type content types, per-type
  parsers, and a fully rewritten `DEFAULT_HOME_PAGE_CONTENT`.

## Technical Details

### Read these first

- `src/lib/admin/home-page-content.ts` **in full** (539 lines). Match its doc-comment
  density, its `Parsed<Value> = { data } | { error }` convention, its `asRecord` /
  `readStrings` / `readEntryArray` / `readStringArray` helper style and its
  `DEFAULT_HOME_PAGE_CONTENT` voice exactly. There is **no validation library** in this
  repo and none may be added.
- `UI:UX/homepage/design_handoff_georgia_homepage/README.md` sections 1–13 — the per-section
  field inventory and the original (courier) copy.
- `UI:UX/homepage/design_handoff_georgia_homepage/Home-Georgia-v3.dc.html` lines 300–520 —
  the `FAQ`, `BANNERS`, `stats`, `bentoSmall`, `steps`, `driverPoints`, `cities` and
  `footerCols` arrays in the prototype's `renderVals()`.
- `src/components/landing/landing-page.tsx` lines 120–142 — `LandingSectionRenderer`, the
  exhaustive switch this task will make incomplete (see the warning at the end).

### Hard constraints

1. **This file is deliberately dependency-free.** No Prisma import, no `server-only`, no
   `next/*`, no new npm package. Client landing components import it directly. Do not add
   an import of any kind.
2. **`HomePageSection.type` and `.content` are a free-form `String` and `Json` in
   `prisma/schema.prisma`.** Adding a section type is a content change, not a migration.
   **Do not touch `prisma/schema.prisma` in this task.**
3. **Existing rows must keep parsing.** The CMS has never been populated in this
   deployment, but the contract's rule is that a row written before a field existed must
   not be rejected — a rejection on the read side means the section silently disappears
   from the public page. So: **every field added to an existing type is optional**, and no
   existing required field is renamed or removed. Two places where this is tempting and
   forbidden are called out inline below (`driver_cta.headline`/`subtext` and
   `how_it_works.aside`).
4. `DEFAULT_HOME_PAGE_CONTENT` is typed `HomePageSectionContentByType`, a total `Record`
   over the union — so **every new type must get a default entry** or the file will not
   compile. That is intentional.

### Step 1 — `HOME_PAGE_SECTION_TYPES`

Replace the existing six-entry list with the full fourteen, in this order. The array
order is the order the admin type-select renders in, so keep it narrative (page order),
with the legacy type and the two chrome types last.

```ts
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
```

### Step 2 — new exported constants

Add alongside the existing `HOME_HERO_BANNER_PLACEMENT` / `HOME_SECONDARY_BANNER_PLACEMENT`
(both of which stay exactly as they are):

```ts
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
 * The body sections a page with no `HomePageSection` rows renders, in order.
 *
 * `category_tiles` is deliberately absent: its content type and parser are kept
 * so a row authored against the previous design still renders instead of
 * vanishing, but the redesign has no slot for it, so it is never added to a
 * fresh page. `nav` and `footer` are absent because they are chrome.
 */
export const DEFAULT_HOME_PAGE_SECTION_ORDER = [
  "hero",
  "hero_carousel",
  "partner_marquee",
  "stats",
  "quote_calculator",
  "bento",
  "how_it_works",
  "vehicle_types",
  "driver_cta",
  "coverage",
  "faq",
  "closing_cta",
] as const satisfies readonly HomePageSectionType[];
```

> Note the ordering difference: `quote_calculator` sits **above** `bento` in
> `DEFAULT_HOME_PAGE_SECTION_ORDER` because the planning decision is that the working
> calculator lives "in its own section below the hero". In `HOME_PAGE_SECTION_TYPES` it
> follows `bento` only because that array's job is the admin picker. Do not "fix" one to
> match the other.

### Step 3 — `HOME_PAGE_SECTION_TYPE_LABELS`

The `Record<HomePageSectionType, string>` must stay total. Full replacement:

```ts
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
```

### Step 4 — content types

Add these next to the existing type declarations, each with a doc comment in the file's
existing register (say *why* the shape is what it is, not what the fields are called).

```ts
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
 * caption is that banner's `title`.
 *
 * Whether the carousel shows at all is the section row's own
 * `HomePageSection.isActive` column, not a field in here: adding a second,
 * content-level active flag would give the same section two switches that can
 * disagree. The one field that remains is the caption used when a banner has no
 * usable title of its own.
 */
export type HeroCarouselContent = {
  fallbackCaption?: string;
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
 * Framing copy for the quote calculator section. The widget itself is the
 * existing `LandingQuoteCalculator`, which owns its own labels and talks to
 * `/api/pricing/estimate`; nothing inside it is authored here.
 */
export type QuoteCalculatorContent = {
  eyebrow: string;
  heading: string;
  intro: string;
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
export type VehicleTypesContent = {
  eyebrow: string;
  heading: string;
  intro?: string;
  businessPanel?: VehicleTypesBusinessPanel;
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
  wordmark: string;
  links: NavLink[];
  signInLabel: string;
  signInHref: string;
  signUpLabel: string;
  signUpHref: string;
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
  brandName: string;
  brandBlurb: string;
  columns: FooterColumn[];
  copyright: string;
  legalLinks: NavLink[];
};
```

Then extend the two maps (`CategoryTilesContent` is unchanged and stays where it is):

```ts
export type HomePageSectionContentByType = {
  hero: HeroContent;
  hero_carousel: HeroCarouselContent;
  partner_marquee: PartnerMarqueeContent;
  stats: StatsContent;
  bento: BentoContent;
  quote_calculator: QuoteCalculatorContent;
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
```

`HomePageSectionContent`, `HomePageSectionData` and `isHomePageSectionType` need no edits —
they are derived from the two lists above.

### Step 5 — `DEFAULT_HOME_PAGE_CONTENT` (the heart of this task)

Write this **verbatim**. Every claim in it is either something the platform demonstrably
does, or a flagged placeholder. Do not restore any handoff phrasing that was cut.

**Removed from the handoff and not to be reintroduced anywhere:** "book a courier in
twelve seconds", "54s median match time", "matched in under a minute", "twenty stops on
one booking", "insured up to ₾5,000" / any insurance cover claim, "6,400 courier
partners", "half price on your first three", "weekly payouts every Wednesday", any public
REST API or "read the docs" link, Russian-language support (the `ContentLocale` enum is
`KA | EN` only), and **"Kwun Tong St"** — a Hong Kong street that must not survive into
the mock tracking panel. Georgian street and district names are used instead.

```ts
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
    heading: "Know the fare before you commit.",
    intro:
      "Enter a pickup and a dropoff, pick a vehicle rated for the load, and we quote base fare, distance and driving time in lari. No account needed to see the number.",
  },
  how_it_works: {
    eyebrow: "How it works",
    heading: "Four steps, no phone calls.",
    aside:
      "Built for the load that won't fit in a car boot — an office move, a pallet of stock, a machine that needs a tail lift.",
    steps: [
      {
        title: "Set the route",
        body: "Type the pickup and the dropoff — addresses autocomplete as you go — then tell us what you're moving: furniture, appliances, retail stock, or a full relocation.",
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
          "Vehicles come in two duty classes, medium-duty and heavy-duty, and each cargo category only offers the classes that can take it. Furniture, appliances, retail stock and event equipment go either way; a full relocation, industrial supplies and construction materials are heavy-duty only. Every type lists its maximum payload, so you can match the rating to the load.",
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
    secondaryCtaHref: "#drive",
  },
  category_tiles: {
    eyebrow: "What we carry",
    heading: "Ship anything, across the city",
    intro:
      "Pick the category your load falls under and the vehicle rated to carry it comes with it. Figures below are a starting point for a short cross-town run — your price is calculated on the route you enter.",
  },
  nav: {
    // TODO(content): the brand name is unconfirmed. The design handoff is
    // written for "Lalamove Georgia"; the code currently ships
    // "Lalamove/Clone". See `action-required.md`.
    wordmark: "Lalamove Georgia",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Vehicles", href: "#vehicles" },
      { label: "For drivers", href: "#drive" },
      { label: "Coverage", href: "#coverage" },
      { label: "FAQ", href: "#faq" },
    ],
    signInLabel: "Sign in",
    signInHref: "/sign-in",
    signUpLabel: "Sign up",
    signUpHref: "/sign-up",
  },
  footer: {
    // TODO(content): same unconfirmed brand name as `nav.wordmark`.
    brandName: "Lalamove Georgia",
    brandBlurb:
      "Commercial freight and cargo across Georgia — vans to trailer trucks, priced before you book.",
    columns: [
      {
        title: "Product",
        links: [
          { label: "How it works", href: "#how-it-works" },
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
          { label: "Become a driver", href: "#drive" },
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
    copyright: "© {year} Lalamove Georgia",
    // TODO(content): same `#` placeholder convention as the Company column.
    legalLinks: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Cookies", href: "#" },
    ],
  },
};
```

### Step 6 — parser helpers

Three new hand-rolled helpers, in the same register as the existing `readStrings` /
`readEntryArray` / `readStringArray`. **No validation library.**

```ts
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
```

Then widen the **existing** `readEntryArray` with a trailing optional parameter, so its
current three call sites (`how_it_works.steps`, `faq.items`, and now several more) are
untouched:

```ts
function readEntryArray<Key extends string, Optional extends string = never>(
  record: Record<string, unknown>,
  key: string,
  fields: readonly Key[],
  context: string,
  optionalFields: readonly Optional[] = [],
): Parsed<(Record<Key, string> & Partial<Record<Optional, string>>)[]> {
```

Inside the loop, after the existing `readStrings` call succeeds, run
`readOptionalStrings(entryRecord, optionalFields, `${context}.${key}[${index}]`)` and
merge both objects into the pushed entry. Keep the existing "an empty array is allowed"
behaviour and its comment — a half-finished edit renders as an empty list, it is not an
error.

### Step 7 — one `parse*` per type

One function per new type, each following the existing shape exactly: `asRecord` guard →
`readStrings` for the required strings → `readOptionalStrings` / `readEntryArray` /
`readStringArray` / `readPercent` for the rest → spread into `{ data: { ... } }`, bailing
with `{ error: … }` at the first failure. Field lists:

| Parser | Required strings | Optional strings | Arrays / other |
|---|---|---|---|
| `parseHeroContent` *(edit)* | `eyebrow`, `headline`, `subtext`, `primaryCtaLabel`, `primaryCtaHref`, `secondaryCtaLabel`, `secondaryCtaHref` | `statusChipText`, `statusChipTag`, `headlineHighlight` | — |
| `parseHeroCarouselContent` | — | `fallbackCaption` | — |
| `parsePartnerMarqueeContent` | `eyebrow` | — | — |
| `parseStatsContent` | — | — | `items` via `readEntryArray(record, "items", ["value", "label"], "stats")` |
| `parseBentoContent` | `eyebrow`, `heading`, `body` | — | `trackingPanel` (see below); `sideCards` and `rowCards` via `readEntryArray(record, "<key>", ["eyebrow", "title", "body"], "bento", ["linkLabel", "linkHref"])` |
| `parseQuoteCalculatorContent` | `eyebrow`, `heading`, `intro` | — | — |
| `parseHowItWorksContent` *(edit)* | `eyebrow`, `heading` | `aside` (was required) | `steps` — unchanged |
| `parseVehicleTypesContent` *(edit)* | `eyebrow`, `heading` | `intro` | `businessPanel` (see below) |
| `parseDriverCtaContent` *(edit)* | `eyebrow`, `headline`, `subtext`, `ctaLabel` | `secondaryCtaLabel`, `secondaryCtaHref`, `imageUrl` | `points` — unchanged |
| `parseCoverageContent` | `eyebrow`, `heading`, `body`, `ctaLabel`, `ctaHref` | — | `cities` via `readEntryArray(record, "cities", ["name", "tier"], "coverage")` |
| `parseFaqContent` *(edit)* | `eyebrow`, `heading`, `intro` | `supportLinkLabel`, `supportLinkHref` | `items` — unchanged |
| `parseClosingCtaContent` | `heading`, `body`, `primaryCtaLabel`, `primaryCtaHref`, `secondaryCtaLabel`, `secondaryCtaHref` | — | — |
| `parseNavContent` | `wordmark`, `signInLabel`, `signInHref`, `signUpLabel`, `signUpHref` | — | `links` via `readEntryArray(record, "links", ["label", "href"], "nav")` |
| `parseFooterContent` | `brandName`, `brandBlurb`, `copyright` | — | `columns` (see below); `legalLinks` via `readEntryArray(record, "legalLinks", ["label", "href"], "footer")` |
| `parseCategoryTilesContent` | unchanged | — | — |

Two shapes need bespoke handling because they nest:

```ts
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
```

```ts
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
```

The fleet section's `businessPanel` is optional as a whole: if `record.businessPanel` is
`undefined` or `null`, omit the key; otherwise `asRecord`-guard it and
`readStrings(panel, ["title", "body", "ctaLabel", "ctaHref"], "vehicle_types.businessPanel")`.
A present-but-not-an-object value is an error.

### Step 8 — `parseHomePageSection`

Add one `case` per new type to the existing switch, in the same
`"error" in parsed ? parsed : { data: { type, content: parsed.data } }` form. The switch
has no `default` on purpose — that is what makes the union's exhaustiveness a compile
error rather than a runtime surprise. Do not add one.

Leave the function's doc comment as it is; it already explains that a read-side rejection
means "skip this section", not "show the visitor an error".

## Acceptance Criteria

- [ ] `HOME_PAGE_SECTION_TYPES` contains all fifteen types in the order given, and
      `HOME_PAGE_SECTION_TYPE_LABELS` has an entry for every one.
- [ ] `HOME_PARTNER_LOGO_BANNER_PLACEMENT`, `MAX_HERO_BANNERS`,
      `HOME_PAGE_CHROME_SECTION_TYPES`, `isHomePageChromeSectionType` and
      `DEFAULT_HOME_PAGE_SECTION_ORDER` are exported from
      `src/lib/admin/home-page-content.ts`.
- [ ] `DEFAULT_HOME_PAGE_SECTION_ORDER` excludes `category_tiles`, `nav` and `footer`, and
      `category_tiles` still has a content type, a parser and a default entry so an
      existing row renders.
- [ ] `DEFAULT_HOME_PAGE_CONTENT` has an entry for every type, with the copy above
      reproduced verbatim.
- [ ] No default string contains: "twelve seconds", "54", "6,400", "twenty stops",
      "₾5,000", "insured", "half price", "REST API", "Kwun Tong", "Wednesday", or
      "Russian". `grep -niE 'twelve second|54s|6,400|twenty stops|5,000|insur|half price|rest api|kwun tong|wednesday|russian' src/lib/admin/home-page-content.ts` returns nothing.
- [ ] Every field added to a pre-existing type (`hero`, `how_it_works`, `vehicle_types`,
      `driver_cta`, `faq`) is optional, and no pre-existing required field was renamed or
      removed — a `content` object built from the *old* `DEFAULT_HOME_PAGE_CONTENT` still
      passes the new parser for its type.
- [ ] `parseHomePageSection` has a `case` for all fifteen types and still has no `default`.
- [ ] Every new parser is hand-rolled in the existing style; no validation library is
      added and `package.json` is untouched.
- [ ] The file still imports nothing — no Prisma, no `server-only`, no `next/*`.
- [ ] `prisma/schema.prisma` is unmodified.
- [ ] `pnpm check` passes (see the exhaustiveness warning below for the one permitted
      temporary measure).

## Notes

### The exhaustive switch will break, and that is expected

`LandingSectionRenderer` in `src/components/landing/landing-page.tsx` (line ~127) switches
over `HomePageSectionData` with no `default` branch. Adding nine union members makes it
non-exhaustive. Depending on how React 19's `ReactNode` resolves the implicit `undefined`
return, this shows up either as a type error or as a switch that silently renders nothing
for the new types.

**task-14 (`page composition`) owns that file and adds every case.** This task must not
build the new sections or rewrite the composer.

If — and only if — `pnpm check` fails because of it, add the smallest possible temporary
measure to `landing-page.tsx` to keep the repo green:

```tsx
    // TODO(task-14): temporary. task-02 added the redesign's section types
    // ahead of their components; task-14 replaces this with a real case per
    // type and deletes this branch.
    default:
      return null;
```

Then flag it explicitly in your completion summary as a stub task-14 must remove. Do not
add placeholder components, do not stub the new sections' markup, and do not touch any
other file.

### Why `hero_carousel` has almost no content

The brief for this section lists "an `isActive` toggle plus an optional fallback caption".
The toggle already exists — it is the `HomePageSection.isActive` boolean column that every
section row has, which the admin list page already exposes and the loader already filters
on. Duplicating it inside `content` would give one section two switches that can disagree,
and the row-level one would win. So the content shape carries only `fallbackCaption`, and
turning the carousel off is done the same way it is done for every other section.

The slides themselves are `Banner` rows at placement `home_hero`, capped at
`MAX_HERO_BANNERS`. Each slide's caption chip is that banner's `title`;
`fallbackCaption` covers a banner whose title is unusable as a caption.

### Why some fields deliberately keep their old names

`driver_cta` uses `headline` / `subtext` / `ctaLabel` where the design says heading / body
/ primary CTA, and `how_it_works` keeps `aside` even though the redesign has nowhere to
put it. Renaming a required field would make every row authored against the old shape fail
`parseHomePageSection`, and callers on the read side treat a failure as "skip this
section" — the section would vanish from the public page with no error anywhere. The cost
of a slightly stale field name is much lower than that.

Likewise, `driver_cta`'s **primary** CTA still has no `href` field. Where a driver signs up
depends on whether the merchant/client host split is enabled — `merchantOrigin()` in
`@/lib/host`, as `landing-footer.tsx` already demonstrates — which is deployment
configuration, not content. task-09 resolves that target the same way the footer does. The
secondary CTA is an ordinary content link and does carry an href. Do not "complete the
pair" by adding `primaryCtaHref`.

### The `{year}` token in `footer.copyright`

Making the copyright line a plain editable string would bake the year into the database.
Making it non-editable would break the "every string is editable" requirement. The token
resolves both: the content is one editable string, and task-05's footer renderer replaces
the literal `{year}` with `new Date().getFullYear()` before printing. The parser treats it
as ordinary text and validates nothing about it — a copyright line without the token is
perfectly valid and simply prints as typed.

### Placeholders that need a human

Four defaults are flagged `TODO(content)` and are tracked in
`specs/georgia-homepage-redesign/action-required.md`:

- **Brand name** (`nav.wordmark`, `footer.brandName`) — the handoff says "Lalamove
  Georgia"; the code currently ships "Lalamove/Clone". Unconfirmed.
- **City count / coverage footprint** (`hero.statusChipText`, `coverage.heading`,
  `stats.items[0]`) — the `GeorgianCity` enum has 25 values, the handoff claims 11, and
  neither is a confirmed service footprint. The copy above avoids asserting a number in
  prose and uses 25 only in the stat tile, where it is easy to correct.
- **Coverage tiers** (`coverage.cities[].tier`) — there is no service-tier data anywhere
  in the schema. "Citywide" / "Regional" / "Nationwide" are editorial placeholders. Every
  `name` is, at least, a real `GeorgianCity` enum value.
- **Stat values** (`stats.items`) — only "11 vehicle types" is derived from real seeded
  data (`prisma/seed.ts` seeds exactly eleven `VehicleTypeSpec` rows across two
  `VehicleCategory` values).

Leave the `TODO(content)` comments in the source. They are the audit trail for the
copy review step in `action-required.md`, and task-15 seeds these same values.
