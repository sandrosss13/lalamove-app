import { LandingDriverCta } from "@/components/landing/landing-driver-cta";
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
        <LandingHowItWorks />
        <LandingVehicles />
        <LandingDriverCta />
      </main>
      <LandingFooter />
    </div>
  );
}
