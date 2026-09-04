import Link from "next/link";

import {
  DEFAULT_HOME_PAGE_CONTENT,
  type ClosingCtaContent,
} from "@/lib/admin/home-page-content";

/**
 * The accent panel that closes the page above the footer.
 *
 * `content` comes from the matching `HomePageSection` row when one exists, and
 * falls back to the copy the page ships with when the locale has no rows yet.
 * The section carries no anchor id: nothing in the nav links to it.
 */
export function LandingClosingCta({
  content = DEFAULT_HOME_PAGE_CONTENT.closing_cta,
}: {
  content?: ClosingCtaContent;
}) {
  return (
    <section className="px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]">
      <div className="mx-auto w-full max-w-[1200px]">
        <div
          data-reveal
          className="flex flex-col items-center gap-6 rounded-[2rem] border border-line-accent-strong bg-[image:var(--landing-gradient-cta-panel)] px-[clamp(26px,4vw,64px)] py-[clamp(40px,6vw,88px)] text-center"
        >
          <h2 className="max-w-[20ch] font-display text-[clamp(30px,5.2vw,72px)] leading-[.96] font-semibold tracking-[-.05em] text-balance text-paper">
            {content.heading}
          </h2>
          <p className="max-w-[44ch] font-display text-[16.5px] leading-[1.6] text-pretty text-subtle">
            {content.body}
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={content.primaryCtaHref}
              className="inline-flex items-center rounded-full bg-accent px-7 py-3.5 text-[15px] font-semibold text-on-accent shadow-cta transition-transform hover:-translate-y-0.5"
            >
              {content.primaryCtaLabel}
            </Link>
            <Link
              href={content.secondaryCtaHref}
              className="inline-flex items-center rounded-full border border-line-strong bg-surface px-7 py-3.5 text-[15px] font-semibold text-paper transition-colors hover:border-accent/40"
            >
              {content.secondaryCtaLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
