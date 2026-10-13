"use client";

import {
  HOME_ACCENT_LINK,
  HOME_CONTAINER,
  HOME_SECTION_HEADING,
  HOME_SECTION_INTRO,
  HOME_SECTION_SPACING,
} from "@/components/landing/landing-home-styles";
import { LandingLink, hasLink } from "@/components/landing/landing-link";
import {
  type CoverageCity,
  type CoverageContent,
} from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";

const CITY_CARD =
  "relative block h-[260px] overflow-hidden rounded-[1.25rem] bg-home-city text-home-on-night";

/** The photo (or its stand-in), scrim and caption of one city card. */
function CityCardBody({ city }: { city: CoverageCity }) {
  return (
    <>
      {city.imageUrl ? (
        // Plain <img>: CMS photo URLs can point at any host.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={city.imageUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        // No photo authored: a quiet brand-tinted ground instead of an empty
        // box, so a row mixing photographed and unphotographed cities still
        // reads as one set.
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,rgba(245,130,32,0.22),transparent_60%)]"
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(8,9,10,0.82),rgba(8,9,10,0)_58%)]"
      />
      <div className="pointer-events-none absolute right-5 bottom-[18px] left-5">
        <h3 className="m-0 text-[22px] font-semibold tracking-[-0.03em]">
          {city.name}
        </h3>
        {city.tier ? (
          <p className="m-0 mt-1.5 font-price text-[11px] tracking-[0.12em] text-home-accent uppercase">
            {city.tier}
          </p>
        ) : null}
      </div>
    </>
  );
}

/**
 * "Top cities" (the `coverage` section): heading, intro and link, then a photo
 * card per authored city — name and tier over a bottom scrim. A city with an
 * `href` (e.g. its `/cities/<slug>` page) is a link; one without is not.
 * Renders nothing when no cities are authored.
 */
export function LandingTopCities({ content }: { content: CoverageContent }) {
  if (content.cities.length === 0) {
    return null;
  }

  return (
    <section
      id="coverage"
      className={cn(HOME_CONTAINER, HOME_SECTION_SPACING, "scroll-mt-28")}
    >
      <div
        data-reveal
        className="mb-6 flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h2 className={cn(HOME_SECTION_HEADING, "mb-2")}>
            {content.heading}
          </h2>
          {content.body ? (
            <p className={cn(HOME_SECTION_INTRO, "max-w-[56ch]")}>
              {content.body}
            </p>
          ) : null}
        </div>
        {hasLink(content.ctaLabel, content.ctaHref) ? (
          <LandingLink href={content.ctaHref} className={HOME_ACCENT_LINK}>
            {content.ctaLabel} →
          </LandingLink>
        ) : null}
      </div>
      <ul
        data-reveal
        className="m-0 grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]"
      >
        {content.cities.map((city, index) => (
          <li key={`${index}-${city.name}`}>
            {city.href?.trim() ? (
              <LandingLink
                href={city.href}
                className={cn(
                  CITY_CARD,
                  "transition-transform hover:-translate-y-0.5",
                )}
              >
                <CityCardBody city={city} />
              </LandingLink>
            ) : (
              <div className={CITY_CARD}>
                <CityCardBody city={city} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
