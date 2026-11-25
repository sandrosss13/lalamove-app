import { CityIntro } from "@/components/city-landing/city-intro";
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
import {
  SERVICE_CITY_LINKS_SECTION_ID,
  SERVICE_LINKS_SECTION_ID,
  type ServiceLandingContent,
} from "@/components/service-landing/service-landing-content";

/**
 * A service landing page (`/{locale}/momsakhureba/{service}`): the city
 * landing page's composition, recentred on one kind of job.
 *
 * Same wrapper and the same reused sections as `CityLandingPage` (see the
 * notes there), with two differences: the coverage section lists what the
 * service covers instead of districts, and there are two link lists — the
 * other services and every city page — where a city page has one.
 */
export function ServiceLandingPage({
  content,
}: {
  content: ServiceLandingContent;
}) {
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
        <LandingCoverage content={content.covers} />
        <LandingHowItWorks content={content.howItWorks} />
        <LandingVehicles content={content.vehicles} />
        <LandingDriversPanel content={content.drivers} />
        <LandingFaq content={content.faq} />
        <CityLinks
          id={SERVICE_LINKS_SECTION_ID}
          content={content.otherServices}
        />
        <CityLinks
          id={SERVICE_CITY_LINKS_SECTION_ID}
          content={content.cities}
        />
        <LandingClosingCta content={content.closing} />
      </main>
      <LandingFooter content={content.footer} />
    </div>
  );
}
