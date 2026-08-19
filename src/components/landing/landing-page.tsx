import { Fragment } from "react";
import Link from "next/link";

import { LandingCategoryTiles } from "@/components/landing/landing-category-tiles";
import { LandingDriverCta } from "@/components/landing/landing-driver-cta";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingTicker } from "@/components/landing/landing-ticker";
import { LandingVehicles } from "@/components/landing/landing-vehicles";
import {
  DEFAULT_HOME_PAGE_CONTENT,
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
 * the section order the page has had all along, each on its own default copy.
 *
 * This is the state a fresh database is in, and the one it stays in until
 * someone composes the page under `/admin/content/home-page`, so it is the
 * normal path rather than an error path. Written out literally rather than
 * mapped from the type list so each entry's `content` is checked against the
 * shape its own `type` demands.
 */
const DEFAULT_LANDING_SECTIONS: LandingSection[] = [
  {
    id: "default-hero",
    type: "hero",
    content: DEFAULT_HOME_PAGE_CONTENT.hero,
  },
  {
    id: "default-category_tiles",
    type: "category_tiles",
    content: DEFAULT_HOME_PAGE_CONTENT.category_tiles,
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
    id: "default-faq",
    type: "faq",
    content: DEFAULT_HOME_PAGE_CONTENT.faq,
  },
  {
    id: "default-driver_cta",
    type: "driver_cta",
    content: DEFAULT_HOME_PAGE_CONTENT.driver_cta,
  },
];

/**
 * A banner placement's rows, or nothing at all when the placement is empty —
 * which is the usual case, and why this renders no framing of its own.
 */
function LandingBannerStrip({ banners }: { banners: LandingBanner[] }) {
  if (banners.length === 0) {
    return null;
  }

  return (
    <section className="border-b border-line bg-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 sm:px-8">
        {banners.map((banner) => {
          /*
            Plain <img> rather than next/image: the URL is typed in by a content
            editor and can point at any host, so it can't be pinned in
            `remotePatterns` at build time. Same call the admin banners table
            makes.
          */
          const image = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={banner.imageUrl}
              alt={banner.title}
              loading="lazy"
              className="w-full rounded-xl border border-line object-cover"
            />
          );

          return (
            <Fragment key={banner.id}>
              {banner.linkUrl ? (
                <Link
                  href={banner.linkUrl}
                  className="block transition-transform hover:-translate-y-0.5"
                >
                  {image}
                </Link>
              ) : (
                image
              )}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Renders one composed section with the landing component that owns its design.
 *
 * The `switch` narrows `section.content` to exactly the shape each component
 * takes, which is the whole point of `HomePageSectionData` being a
 * discriminated union: a row whose type and content disagree cannot compile.
 */
function LandingSectionRenderer({ section }: { section: LandingSection }) {
  switch (section.type) {
    case "hero":
      return <LandingHero content={section.content} />;
    case "category_tiles":
      return <LandingCategoryTiles content={section.content} />;
    case "vehicle_types":
      return <LandingVehicles content={section.content} />;
    case "how_it_works":
      return <LandingHowItWorks content={section.content} />;
    case "faq":
      return <LandingFaq content={section.content} />;
    case "driver_cta":
      return <LandingDriverCta content={section.content} />;
  }
}

/**
 * Marketing page shown at `/` to visitors without a session, and at `/home` to
 * everyone. It brings its own header and footer; the `data-landing-page`
 * attribute is what `globals.css` hooks into to hide the global site header and
 * own the page background.
 *
 * The body is composed from `HomePageSection` rows edited under
 * `/admin/content/home-page`: `sections` arrives already filtered to one
 * locale, to active rows, and sorted by `sortOrder`. Passing nothing (or an
 * empty list, which is what a database nobody has authored content in yields)
 * falls back to `DEFAULT_LANDING_SECTIONS` — the order and copy the page has
 * today — so the public page never renders blank while it waits for content.
 *
 * Section order mirrors the header's nav and the story it tells: price a load
 * (hero), see the fleet scroll by (ticker), what the platform carries (category
 * tiles), how a booking actually goes (how it works), the fleet in detail
 * (vehicles), then objections (FAQ) before the driver CTA and footer close the
 * page on the dark "bookend" panel.
 */
export function LandingPage({
  sections,
  heroBanners = [],
  secondaryBanners = [],
}: {
  sections?: LandingSection[];
  /** Active banners placed at `home_hero`. */
  heroBanners?: LandingBanner[];
  /** Active banners placed at `home_secondary`. */
  secondaryBanners?: LandingBanner[];
}) {
  const composedSections =
    sections && sections.length > 0 ? sections : DEFAULT_LANDING_SECTIONS;

  // The ticker is generated from the vehicle taxonomy and has no authored copy,
  // so it is not a section type staff can add or move. It stays pinned directly
  // under the hero, where it sits today, along with the hero banner placement;
  // with no hero section configured, both lead the page instead.
  const heroIndex = composedSections.findIndex(
    (section) => section.type === "hero",
  );

  // The secondary placement sits immediately above the driver CTA, so it lands
  // between the page's content and its closing panel rather than after it.
  const driverCtaIndex = composedSections.findIndex(
    (section) => section.type === "driver_cta",
  );

  const heroTrailer = (
    <>
      <LandingBannerStrip banners={heroBanners} />
      <LandingTicker />
    </>
  );

  return (
    <div
      data-landing-page=""
      className="min-h-screen bg-ink font-body text-paper antialiased"
    >
      <LandingHeader />
      <main>
        {heroIndex === -1 ? heroTrailer : null}

        {composedSections.map((section, index) => (
          <Fragment key={section.id}>
            {index === driverCtaIndex ? (
              <LandingBannerStrip banners={secondaryBanners} />
            ) : null}
            <LandingSectionRenderer section={section} />
            {index === heroIndex ? heroTrailer : null}
          </Fragment>
        ))}

        {driverCtaIndex === -1 ? (
          <LandingBannerStrip banners={secondaryBanners} />
        ) : null}
      </main>
      <LandingFooter />
    </div>
  );
}
