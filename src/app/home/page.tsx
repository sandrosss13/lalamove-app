import { LandingPage } from "@/components/landing/landing-page";

// Lets a signed-in user view the marketing landing page without signing out —
// "/" shows their booking form or driver dashboard once authenticated.
export default function HomePage() {
  return <LandingPage />;
}
