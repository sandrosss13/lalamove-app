"use client";

import { useTranslations } from "next-intl";

import {
  HOME_CONTAINER,
  HOME_SECTION_SPACING,
} from "@/components/landing/landing-home-styles";
import { LandingLink, hasLink } from "@/components/landing/landing-link";
import { type ClosingCtaContent } from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";

const STORE_BADGE =
  "flex min-w-[160px] flex-col rounded-xl bg-home-btn-bg px-[22px] py-[11px] text-home-btn-fg transition-opacity hover:opacity-90";

/**
 * The v4 app-download band (the `closing_cta` section): a brand-orange panel
 * with the heading and body on the left and the store badges on the right.
 *
 * Each badge renders only when its store URL is authored — there is no app
 * listing to link to until one is set. With neither set, the band keeps the
 * section's authored primary/secondary buttons instead, so it still offers an
 * action rather than closing the page on a dead end.
 */
export function LandingAppBand({ content }: { content: ClosingCtaContent }) {
  const t = useTranslations("landing.landingAppBand");
  const appStoreUrl = content.appStoreUrl?.trim();
  const playStoreUrl = content.playStoreUrl?.trim();
  const hasStoreBadges = Boolean(appStoreUrl || playStoreUrl);

  return (
    <section className={cn(HOME_CONTAINER, HOME_SECTION_SPACING)}>
      <div
        data-reveal
        className="flex flex-wrap items-center justify-between gap-7 rounded-3xl bg-home-accent p-[clamp(28px,4vw,52px)] text-home-night"
      >
        <div className="flex-[1_1_380px]">
          <h2 className="m-0 mb-2.5 max-w-[20ch] text-[clamp(24px,3vw,38px)] leading-[1.05] font-semibold tracking-[-0.04em] text-balance">
            {content.heading}
          </h2>
          <p className="m-0 max-w-[46ch] text-[15.5px] leading-[1.55] text-home-night/78">
            {content.body}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {hasStoreBadges ? (
            <>
              {appStoreUrl ? (
                <LandingLink href={appStoreUrl} className={STORE_BADGE}>
                  <span className="text-[11px] text-home-btn-fg/60">
                    {t("appStoreKicker")}
                  </span>
                  <span className="text-[16px] font-semibold tracking-[-0.01em]">
                    App Store
                  </span>
                </LandingLink>
              ) : null}
              {playStoreUrl ? (
                <LandingLink href={playStoreUrl} className={STORE_BADGE}>
                  <span className="text-[11px] text-home-btn-fg/60">
                    {t("playStoreKicker")}
                  </span>
                  <span className="text-[16px] font-semibold tracking-[-0.01em]">
                    Google Play
                  </span>
                </LandingLink>
              ) : null}
            </>
          ) : (
            <>
              {hasLink(content.primaryCtaLabel, content.primaryCtaHref) ? (
                <LandingLink
                  href={content.primaryCtaHref}
                  className="inline-flex items-center rounded-full bg-home-night px-[22px] py-3 text-[15px] font-semibold text-home-on-night transition-opacity hover:opacity-90"
                >
                  {content.primaryCtaLabel}
                </LandingLink>
              ) : null}
              {hasLink(content.secondaryCtaLabel, content.secondaryCtaHref) ? (
                <LandingLink
                  href={content.secondaryCtaHref}
                  className="inline-flex items-center rounded-full border border-home-night/30 px-[22px] py-3 text-[15px] font-semibold text-home-night transition-colors hover:bg-home-night/8"
                >
                  {content.secondaryCtaLabel}
                </LandingLink>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
