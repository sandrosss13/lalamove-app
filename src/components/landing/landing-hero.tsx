import Link from "next/link";

import {
  DEFAULT_HOME_PAGE_CONTENT,
  type HeroContent,
} from "@/lib/admin/home-page-content";

/**
 * A hero CTA. The two buttons differ only in their skin, so the element choice
 * lives here once.
 *
 * `next/link` for an in-app path, a plain `<a>` for anything else — the rule
 * every landing component follows. `#price-a-load` and an absolute partner URL
 * are both valid CMS values and neither is a route this app can prefetch.
 */
function HeroCta({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className: string;
}) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }

  return (
    <a href={href} className={className}>
      {label}
    </a>
  );
}

/** Shared metrics for both CTAs; only the colours differ. */
const CTA_BASE =
  "inline-flex items-center justify-center rounded-full px-8 py-4 text-[15px] leading-none font-semibold transition-colors";

/**
 * The centred hero.
 *
 * A server component: everything here is static markup, the status dot pulses
 * in CSS, and the two things that used to need the browser are gone — the quote
 * calculator now has its own section below the hero
 * (`landing-quote-calculator.tsx`, unchanged), and the three figures that were
 * counted from the live vehicle taxonomy moved to the authored `stats` section.
 * The hero is above the fold, so shipping no JS for it is the point.
 *
 * Entrance animations are deliberately absent too: the page-wide `data-reveal`
 * observer owns that, and running both would double-animate the same elements.
 *
 * `content` comes from the matching `HomePageSection` row when one exists. It
 * is optional so the page still renders — with the copy it has today — before
 * any section has been authored for the locale.
 */
export function LandingHero({
  content = DEFAULT_HOME_PAGE_CONTENT.hero,
}: {
  content?: HeroContent;
}) {
  // Both chip fields post-date the original hero shape, so a row authored
  // against the previous design has neither. The chip is skipped whole rather
  // than rendered half-empty. (`headlineHighlight` is the mirror case: the
  // contract keeps it so old rows round-trip through the admin form, and
  // documents it as retired and unrendered — the centred headline has no
  // accented closing word.)
  const statusChipText = content.statusChipText;
  const statusChipTag = content.statusChipTag;

  return (
    <section className="relative overflow-hidden px-[clamp(20px,4vw,48px)] pt-[clamp(120px,14vw,190px)]">
      {/* The accent glow behind the headline. Sized and positioned exactly as
          the design specifies — wider than the container and pulled above the
          top edge, which is what makes it read as light falling onto the page
          rather than a blob. The gradient itself is a theme token, so the light
          theme gets its own softer version without a `dark:` variant here. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[-360px] left-1/2 -ml-[550px] h-[900px] w-[1100px] bg-[image:var(--landing-gradient-spotlight)]"
      />

      <div className="relative mx-auto max-w-[1200px] text-center">
        {statusChipText ? (
          <p className="mb-[clamp(26px,3vw,38px)] inline-flex items-center gap-[10px] rounded-full border border-line-strong bg-surface py-[7px] pr-[8px] pl-[14px] text-[13px] text-subtle">
            <span
              aria-hidden="true"
              className="h-[7px] w-[7px] flex-none rounded-full bg-accent animate-status-pulse"
            />
            {statusChipText}
            {statusChipTag ? (
              <span className="rounded-full bg-surface-raised px-[10px] py-[5px] font-price text-[11px] tracking-[0.1em] text-paper uppercase">
                {statusChipTag}
              </span>
            ) : null}
          </p>
        ) : null}

        <h1 className="mx-auto mb-[clamp(22px,2.6vw,30px)] max-w-[19ch] font-display text-[clamp(42px,7.4vw,104px)] leading-[0.94] font-semibold tracking-[-0.05em] text-balance text-paper">
          {content.headline}
        </h1>

        <p className="mx-auto mb-[clamp(30px,3.4vw,42px)] max-w-[52ch] text-[clamp(16px,1.7vw,21px)] leading-[1.55] text-pretty text-subtle">
          {content.subtext}
        </p>

        <div className="mb-[clamp(44px,5vw,68px)] flex flex-wrap justify-center gap-3">
          <HeroCta
            href={content.primaryCtaHref}
            label={content.primaryCtaLabel}
            className={`${CTA_BASE} bg-accent text-on-accent shadow-cta hover:bg-accent-hover`}
          />
          <HeroCta
            href={content.secondaryCtaHref}
            label={content.secondaryCtaLabel}
            className={`${CTA_BASE} border border-line-strong bg-surface-raised text-paper hover:bg-surface`}
          />
        </div>
      </div>
    </section>
  );
}
