"use client";

import Link from "next/link";

import { LandingQuoteCalculator } from "@/components/landing/landing-quote-calculator";
import { useLandingVehicleTypes } from "@/components/landing/landing-vehicle-types";
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type HeroContent,
} from "@/lib/admin/home-page-content";

/** Placeholder for a counted stat, until the taxonomy it counts arrives. */
const EMPTY_STAT = "—";

/**
 * `content` comes from the matching `HomePageSection` row when one exists. It
 * is optional so the page still renders — with the copy it has today — before
 * any section has been authored for the locale.
 */
export function LandingHero({
  content = DEFAULT_HOME_PAGE_CONTENT.hero,
}: {
  content?: HeroContent;
}) {
  const { vehicleTypes } = useLandingVehicleTypes();

  // Counted from the seeded taxonomy rather than written into the copy, so the
  // headline numbers can't drift from the fleet section further down the page.
  const loaded = vehicleTypes.length > 0;
  const dutyClasses = new Set(
    vehicleTypes.map((vehicleType) => vehicleType.category),
  );

  const heroStats = [
    {
      value: loaded ? String(vehicleTypes.length) : EMPTY_STAT,
      label: "Vehicle types",
    },
    {
      value: loaded ? String(dutyClasses.size) : EMPTY_STAT,
      label: "Duty classes",
    },
    { value: "24/7", label: "Dispatch window" },
  ];

  return (
    <section className="relative overflow-hidden border-b border-line bg-ink">
      {/* Two stacked backdrops rather than one: the grid is tinted from
          `currentColor` so it has to sit on a text-colored element, while the
          warm wash is a fixed accent tint that must not pick that tint up. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.07] to-ink"
      />
      <div
        aria-hidden="true"
        className="landing-grid pointer-events-none absolute inset-0 text-paper opacity-60"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-32 h-[30rem] w-[30rem] rounded-full bg-accent/15 blur-[130px]"
      />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pt-14 pb-20 sm:px-8 lg:grid-cols-[1fr_26rem] lg:items-start lg:pt-20 lg:pb-24">
        <div className="lg:pt-6">
          <p className="animate-rise inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1.5 text-[0.6875rem] font-semibold tracking-[0.14em] text-accent uppercase">
            {content.eyebrow}
          </p>

          <h1 className="animate-rise [animation-delay:120ms] mt-6 max-w-[15ch] font-display text-[clamp(2.5rem,6vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-paper">
            {content.headline}{" "}
            <span className="relative inline-block text-accent">
              {content.headlineHighlight}
              <span
                aria-hidden="true"
                className="animate-wipe [animation-delay:900ms] absolute right-0 -bottom-0.5 left-0 h-[0.1875rem] origin-left rounded-full bg-accent/70"
              />
            </span>
          </h1>

          <p className="animate-rise [animation-delay:260ms] mt-6 max-w-[46ch] text-base leading-relaxed text-muted sm:text-lg">
            {content.subtext}
          </p>

          <div className="animate-rise [animation-delay:380ms] mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={content.primaryCtaHref}
              className="group inline-flex items-center gap-2.5 rounded-lg bg-accent px-6 py-3.5 text-[0.9375rem] leading-none font-semibold text-ink transition-transform hover:-translate-y-0.5"
            >
              {content.primaryCtaLabel}
              <span
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
            <Link
              href={content.secondaryCtaHref}
              className="inline-flex items-center rounded-lg border border-line px-6 py-3.5 text-[0.9375rem] leading-none font-semibold text-paper transition-colors hover:border-accent hover:text-accent"
            >
              {content.secondaryCtaLabel}
            </Link>
          </div>

          <dl className="animate-rise [animation-delay:460ms] mt-10 flex flex-wrap gap-x-10 gap-y-6 border-t border-line pt-7">
            {heroStats.map((stat) => (
              <div key={stat.label}>
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="block font-price text-[1.625rem] leading-none font-semibold tracking-[-0.02em] text-paper">
                    {stat.value}
                  </span>
                  <span className="mt-2 block text-[0.8125rem] text-muted">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* The anchor lives on the wrapper, not inside the calculator, so the
            category tiles elsewhere on the page can scroll the whole card into
            view clear of the sticky header. */}
        <div id="price-a-load" className="scroll-mt-24">
          <LandingQuoteCalculator />
        </div>
      </div>
    </section>
  );
}
