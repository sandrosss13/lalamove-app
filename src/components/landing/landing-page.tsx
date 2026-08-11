import { LandingCategoryTiles } from "@/components/landing/landing-category-tiles";
import { LandingDriverCta } from "@/components/landing/landing-driver-cta";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingTicker } from "@/components/landing/landing-ticker";
import { LandingVehicles } from "@/components/landing/landing-vehicles";

/**
 * Marketing page shown at `/` to visitors without a session. It brings its own
 * header and footer; the `data-landing-page` attribute is what `globals.css`
 * hooks into to hide the global site header and own the page background.
 *
 * Section order mirrors the header's nav and the story it tells: price a load
 * (hero), see the fleet scroll by (ticker), what the platform carries (category
 * tiles), how a booking actually goes (how it works), the fleet in detail
 * (vehicles), then objections (FAQ) before the driver CTA and footer close the
 * page on the dark "bookend" panel.
 */
export function LandingPage() {
  return (
    <div
      data-landing-page=""
      className="min-h-screen bg-ink font-body text-paper antialiased"
    >
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingTicker />
        <LandingCategoryTiles />
        <LandingHowItWorks />
        <LandingVehicles />
        <LandingFaq />
        <LandingDriverCta />
      </main>
      <LandingFooter />
    </div>
  );
}
