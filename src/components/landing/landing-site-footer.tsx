"use client";

import { ZomoLockup } from "@/components/brand/zomo-logo";
import { HOME_CONTAINER } from "@/components/landing/landing-home-styles";
import { LandingLink, hasLink } from "@/components/landing/landing-link";
import {
  migrateLegacyBrandCopy,
  type FooterContent,
} from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";

/** Replaced with the current year in the authored copyright line. */
const YEAR_TOKEN = "{year}";

const FOOTER_LINK =
  "text-home-on-night/66 transition-colors hover:text-home-on-night";

/**
 * The v4 footer: near-black in both themes. A top row with the light lockup
 * (and the authored blurb) and the optional CTA button, the authored link
 * columns, then the copyright line and legal links.
 */
export function LandingSiteFooter({ content }: { content: FooterContent }) {
  const copyright = migrateLegacyBrandCopy(content.copyright).replaceAll(
    YEAR_TOKEN,
    String(new Date().getFullYear()),
  );

  return (
    <footer className="mt-auto bg-home-night text-home-on-night/60">
      <div className={cn(HOME_CONTAINER, "pt-[clamp(44px,5vw,72px)] pb-8")}>
        {/* One grid for the top row and the link columns, the top row spanning
            every track, so the columns resolve into equal tracks instead of
            orphaning the last one. */}
        <div className="grid gap-7 pb-10 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          <div className="col-span-full mb-2 flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-7">
            <div className="flex flex-col gap-3">
              <ZomoLockup
                variant="dark"
                className="h-8"
                label={migrateLegacyBrandCopy(content.brandName)}
              />
              {content.brandBlurb ? (
                <p className="m-0 max-w-[44ch] text-[14px] leading-relaxed text-home-on-night/50">
                  {content.brandBlurb}
                </p>
              ) : null}
            </div>
            {hasLink(content.ctaLabel, content.ctaHref) ? (
              <LandingLink
                href={content.ctaHref ?? ""}
                className="rounded-full bg-home-accent px-[22px] py-3 text-[14.5px] font-semibold text-home-night transition-colors hover:bg-home-accent-hover"
              >
                {content.ctaLabel}
              </LandingLink>
            ) : null}
          </div>

          {content.columns.map((column) => (
            <nav
              key={column.title}
              aria-label={column.title}
              className="min-w-0"
            >
              <h2 className="m-0 mb-4 font-price text-[10px] tracking-[0.18em] text-home-on-night/40 uppercase">
                {column.title}
              </h2>
              <ul className="m-0 flex list-none flex-col gap-[11px] p-0 text-[14px]">
                {column.links.map((link) => (
                  <li key={`${link.label}-${link.href}`}>
                    <LandingLink href={link.href} className={FOOTER_LINK}>
                      {link.label}
                    </LandingLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-wrap justify-between gap-4 border-t border-white/8 pt-[22px] font-price text-[11px] tracking-[0.08em] text-home-on-night/40">
          <p className="m-0">{copyright}</p>
          <ul className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0">
            {content.legalLinks.map((link, index) => (
              <li
                key={`${link.label}-${link.href}`}
                className="flex items-center gap-x-2"
              >
                {index > 0 ? <span aria-hidden="true">·</span> : null}
                <LandingLink
                  href={link.href}
                  className="transition-colors hover:text-home-on-night"
                >
                  {link.label}
                </LandingLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
