import { Fragment } from "react";
import Link from "next/link";

import { merchantOrigin } from "@/lib/host";
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type DriverCtaContent,
} from "@/lib/admin/home-page-content";

/**
 * `content` comes from the matching `HomePageSection` row when one exists, and
 * falls back to the copy the page has today when the locale has no rows yet.
 *
 * The sign-up destination is deliberately not editable — see below.
 */
export function LandingDriverCta({
  content = DEFAULT_HOME_PAGE_CONTENT.driver_cta,
}: {
  content?: DriverCtaContent;
}) {
  // The landing page is client-host-only, and `/sign-up` there only offers
  // CLIENT registration — so a driver has to be sent across to the merchant
  // host. When the split is disabled, this stays a plain relative `/sign-up`.
  const origin = merchantOrigin();
  const driverSignUpHref = origin ? `${origin}/sign-up` : "/sign-up";

  return (
    <section
      id="drive"
      className="relative isolate scroll-mt-16 overflow-hidden bg-ink-strong"
    >
      {/* The skew lives on the backdrop, not the content, so nothing clips or
          reflows at narrow widths. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-8 -inset-x-8 -skew-y-2 bg-accent"
      />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-[0.24em] text-ink-strong/70 uppercase">
            {content.eyebrow}
          </p>
          <h2 className="mt-4 font-display text-[clamp(2rem,5vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-ink-strong">
            {/* The headline is authored as multi-line text, and each newline is
                a deliberate break in a two-line display heading — so the lines
                are rendered with <br /> between them rather than collapsed. */}
            {content.headline.split("\n").map((line, index) => (
              <Fragment key={index}>
                {index > 0 ? <br /> : null}
                {line}
              </Fragment>
            ))}
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-ink-strong/80">
            {content.subtext}
          </p>

          <Link
            href={driverSignUpHref}
            className="group mt-9 inline-flex items-center gap-2.5 rounded-lg bg-ink-strong px-6 py-3.5 text-[0.9375rem] leading-none font-semibold text-on-strong transition-transform hover:-translate-y-0.5"
          >
            {content.ctaLabel}
            <span
              aria-hidden="true"
              className="transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </div>

        <ul className="flex flex-col gap-4">
          {content.points.map((point) => (
            <li
              key={point}
              className="flex gap-4 border-t border-ink-strong/20 pt-4 text-sm leading-relaxed text-ink-strong"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink-strong"
              />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
