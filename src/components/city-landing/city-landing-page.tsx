import { CityIntro } from "@/components/city-landing/city-intro";
import { type CityLandingContent } from "@/components/city-landing/city-landing-content";
import { CityLinks } from "@/components/city-landing/city-links";
import { LandingClosingCta } from "@/components/landing/landing-closing-cta";
import { LandingCoverage } from "@/components/landing/landing-coverage";
import { LandingDriversPanel } from "@/components/landing/landing-drivers-panel";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingNavPill } from "@/components/landing/landing-nav-pill";
import { LandingScrollReveal } from "@/components/landing/landing-scroll-reveal";
import { LandingVehicles } from "@/components/landing/landing-vehicles";

/**
 * A city landing page (`/{locale}/gadazidva/{city}`): the main landing page's
 * design, recomposed around one city's copy.
 *
 * The wrapper is the same as `LandingPage`'s, for the same reasons —
 * `data-landing-page` owns the background, focus ring and scroll-reveal root,
 * and `data-hide-site-header` hides the root layout's header under the fixed
 * nav pill. The composition is fixed rather than CMS-driven: these pages are
 * written for search, their copy lives in the `cityLanding` catalogs, and every
 * piece of it arrives already resolved in `content`.
 */
export function CityLandingPage({ content }: { content: CityLandingContent }) {
  return (
    <div
      data-landing-page=""
      data-hide-site-header=""
      className="min-h-screen bg-ink font-body text-paper antialiased"
    >
      <LandingScrollReveal />
      <LandingNavPill content={content.nav} />
      {/* The hero carries the nav pill's clearance itself, as on `/`. */}
      <main>
        <LandingHero content={content.hero} />
        <CityIntro content={content.intro} />
        <LandingCoverage content={content.coverage} />
        <LandingHowItWorks content={content.howItWorks} />
        <LandingVehicles content={content.vehicles} />
        <LandingDriversPanel content={content.drivers} />
        <LandingFaq content={content.faq} />
        <CityLinks content={content.otherCities} />
        <LandingClosingCta content={content.closing} />
      </main>
      <LandingFooter content={content.footer} />
    </div>
  );
}
