import Link from "next/link";

import {
  DEFAULT_HOME_PAGE_CONTENT,
  type CoverageContent,
} from "@/lib/admin/home-page-content";

/**
 * `content` comes from the matching `HomePageSection` row when one exists, and
 * falls back to the copy the page ships with when the locale has no rows yet.
 *
 * The city list and its tiers are editorial content, never derived data: there
 * is no service-tier field anywhere in the schema, so the design's
 * "Same hour" / "Scheduled" split cannot be computed from the `GeorgianCity`
 * enum and must be typed by a human who knows the real footprint.
 */
export function LandingCoverage({
  content = DEFAULT_HOME_PAGE_CONTENT.coverage,
}: {
  content?: CoverageContent;
}) {
  return (
    <section
      id="coverage"
      className="scroll-mt-28 px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap gap-[14px]">
        <div
          data-reveal
          className="flex flex-[1_1_340px] flex-col rounded-3xl border border-line-strong bg-[image:var(--landing-gradient-coverage-card)] p-[clamp(28px,3.2vw,44px)]"
        >
          <p className="font-price text-[11px] tracking-[.18em] text-accent uppercase">
            {content.eyebrow}
          </p>
          <h2 className="mt-4 max-w-[16ch] font-display text-[clamp(26px,3.4vw,44px)] leading-[1.04] font-semibold tracking-[-.04em] text-balance text-paper">
            {content.heading}
          </h2>
          {/* The bottom margin is the pill's minimum gap: flex-item margins do
              not collapse, so it survives the `mt-auto` below even when the
              copy is long enough to leave no free space to absorb. */}
          <p className="mt-5 mb-9 font-display text-[16px] leading-[1.6] text-pretty text-muted">
            {content.body}
          </p>

          {/* `mt-auto` pins the pill to the bottom of the card so it lines up
              with the chip grid's baseline; `self-start` keeps it hugging its
              label instead of stretching the column. */}
          <Link
            href={content.ctaHref}
            className="mt-auto inline-flex items-center self-start rounded-full bg-accent px-6 py-3 text-[15px] font-semibold text-on-accent transition-transform hover:-translate-y-0.5"
          >
            {content.ctaLabel}
          </Link>
        </div>

        {/* An empty city list renders the pitch card alone rather than an empty
            grid beside it. */}
        {content.cities.length > 0 ? (
          <ul
            data-reveal
            className="grid flex-[1_1_360px] content-start gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]"
          >
            {content.cities.map((city, index) => (
              // Position, not name: the list is static for the lifetime of the
              // render, and index keys are what the other CMS-fed landing
              // sections already use.
              <li
                key={index}
                className="rounded-2xl border border-line bg-surface px-5 py-[18px]"
              >
                <p className="font-display text-[16px] font-semibold text-paper">
                  {city.name}
                </p>
                {/* The tier is optional in practice — a content manager can
                    leave a chip untiered, and a blank line under the name would
                    read as a rendering fault. */}
                {city.tier ? (
                  <p className="mt-1 font-price text-[10.5px] tracking-[.1em] text-faint uppercase">
                    {city.tier}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
