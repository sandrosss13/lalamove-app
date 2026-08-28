import { redirect } from "next/navigation";

import { OnboardingDraftProvider } from "@/components/driver-onboarding/onboarding-draft-context";
import { OnboardingWizardShell } from "@/components/driver-onboarding/onboarding-wizard-shell";
import { requireDashboardSession } from "@/lib/dashboard/auth";
import { prisma } from "@/lib/prisma";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The driver onboarding wizard's route.
 *
 * `layout.tsx` has already guaranteed a session that is not a CLIENT and not
 * behind a forced password change; this page adds the checks specific to
 * onboarding. It is a *defensive* guard — it protects a direct or bookmarked
 * visit by someone the wizard isn't for. What proactively sends an eligible
 * driver here from `/dashboard` is `task-20`, once the status screen exists too.
 *
 * Eligibility is exactly the independent-driver population from
 * `requirements.md`: no `companyId` (a fleet employee never sees this wizard —
 * that, not `accountType`, is the discriminator, since company-created drivers
 * are also always `INDIVIDUAL`), an Individual or Individual Entrepreneur
 * account type (BUSINESS driver sign-ups keep today's behaviour), and an
 * application that isn't already approved.
 *
 * A driver with no `DriverProfile` at all is bounced to `/dashboard` rather
 * than into the wizard: that is the interrupted-sign-up case, and
 * `DriverDashboard` already owns the "your driver profile isn't set up yet"
 * fallback for it. Two surfaces racing to explain the same broken state would
 * be worse than one.
 */
export default async function DriverOnboardingPage() {
  const session = await requireDashboardSession();

  if (session.user.role !== "DRIVER") {
    redirect("/dashboard");
  }

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      accountType: true,
      companyId: true,
      application: { select: { status: true } },
    },
  });

  const eligible =
    driverProfile !== null &&
    driverProfile.companyId === null &&
    (driverProfile.accountType === "INDIVIDUAL" ||
      driverProfile.accountType === "INDIVIDUAL_ENTREPRENEUR") &&
    driverProfile.application?.status !== "APPROVED";

  if (!eligible) {
    redirect("/dashboard");
  }

  return (
    <OnboardingDraftProvider>
      <OnboardingWizardShell />
    </OnboardingDraftProvider>
  );
}
