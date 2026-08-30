import { Fragment } from "react";
import Link from "next/link";

import { merchantOrigin } from "@/lib/host";
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type DriverCtaContent,
} from "@/lib/admin/home-page-content";

const PILL_CLASSES =
  "inline-flex items-center rounded-full px-6 py-3 text-[15px] font-semibold";

/**
 * The For Drivers panel: copy and CTAs on the left, a full-bleed courier
 * photograph on the right.
 *
 * `content` comes from the matching `HomePageSection` row when one exists, and
 * falls back to the copy the page has today when the locale has no rows yet.
 *
 * The sign-up destination is deliberately not editable — see below.
 */
export function LandingDriversPanel({
  content = DEFAULT_HOME_PAGE_CONTENT.driver_cta,
}: {
  content?: DriverCtaContent;
}) {
  // The landing page is client-host-only, and `/sign-up` there only offers
  // CLIENT registration — so a driver has to be sent across to the merchant
  // host. When the split is disabled, this stays a plain relative `/sign-up`.
  const origin = merchantOrigin();
  const driverSignUpHref = origin ? `${origin}/sign-up` : "/sign-up";

  // Both halves of the secondary link are optional in the contract, and a pill
  // with a label but no target (or the reverse) is not worth rendering.
  const secondaryCta =
    content.secondaryCtaLabel && content.secondaryCtaHref
      ? { label: content.secondaryCtaLabel, href: content.secondaryCtaHref }
      : null;

  return (
    <section
      id="drivers"
      className="scroll-mt-28 px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]"
    >
      <div className="mx-auto w-full max-w-[1200px]">
        <div
          data-reveal
          className="flex flex-wrap overflow-hidden rounded-[2rem] border border-line-strong bg-surface"
        >
          <div className="flex flex-[1_1_320px] flex-col gap-5 p-[clamp(28px,3.2vw,44px)]">
            <p className="font-price text-[11px] tracking-[.18em] text-accent uppercase">
              {content.eyebrow}
            </p>
            <h2 className="max-w-[18ch] font-display text-[clamp(26px,3.4vw,46px)] leading-[1.03] font-semibold tracking-[-.04em] text-balance text-paper">
              {/* The headline is authored as multi-line text, and each newline is
                  a deliberate break in a display heading — so the lines are
                  rendered with <br /> between them rather than collapsed. */}
              {content.headline.split("\n").map((line, index) => (
                <Fragment key={index}>
                  {index > 0 ? <br /> : null}
                  {line}
                </Fragment>
              ))}
            </h2>
            <p className="text-[16px] leading-[1.6] text-pretty text-subtle">
              {content.subtext}
            </p>

            <ul className="flex flex-col gap-3">
              {content.points.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 text-[15px] leading-[1.55] text-subtle"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                  {point}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-3">
              <Link
                href={driverSignUpHref}
                className={`${PILL_CLASSES} bg-accent text-on-accent transition-transform hover:-translate-y-0.5`}
              >
                {content.ctaLabel}
              </Link>
              {secondaryCta ? (
                <Link
                  href={secondaryCta.href}
                  className={`${PILL_CLASSES} border border-line-strong bg-surface text-paper transition-colors hover:border-accent/40`}
                >
                  {secondaryCta.label}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="relative min-h-[340px] flex-[1_1_320px]">
            {content.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={content.imageUrl}
                // Decorative: the headline beside it already carries the
                // meaning, and the contract has no field for an alternative
                // text a content manager could write.
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              // No courier photograph has been supplied yet, so the column is a
              // built-from-tokens panel rather than an empty hole. Both the
              // gradient and the grid resolve per theme. They are two elements
              // because each one owns `background-image`, so a single element
              // could only carry whichever utility CSS happened to order last.
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[image:var(--landing-gradient-accent-card)]"
              >
                <div className="landing-grid h-full w-full text-paper" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
