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
 * `requirements.md`: the DRIVER role (checked explicitly below — an ADMIN
 * session is bounced by neither `layout.tsx` nor any branch above), no
 * `companyId` (a fleet employee never sees this wizard — that, not
 * `accountType`, is the discriminator, since company-created drivers are also
 * always `INDIVIDUAL`), an Individual or Individual Entrepreneur account type
 * (BUSINESS driver sign-ups keep today's behaviour), and either not yet
 * activated or holding an approved application.
 *
 * That last clause is deliberate: this page is where the "you are cleared to
 * drive" confirmation lives, so a driver who reloads it after approval has to
 * reach it rather than be bounced. See the comment on `eligible` below.
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
      activatedAt: true,
      companyId: true,
      application: { select: { status: true } },
    },
  });

  // `activatedAt === null` is the condition that keeps grandfathered drivers
  // out of the wizard: the migration backfilled an activation timestamp onto
  // every pre-existing profile, so a driver who never owed us an application is
  // bounced here rather than dropped into a wizard with no way back out.
  // `activatedAt` is the schema's documented source of truth for "is this driver
  // activated".
  //
  // The `APPROVED` arm is what makes the approved confirmation screen reachable,
  // and it is why this guard parts company with `/dashboard`'s `shouldOnboard`.
  // The two answer different questions: `shouldOnboard` decides whether to
  // *send* a driver into the wizard, and must never send an approved one; this
  // guard only decides whether a driver who came here under their own steam may
  // see the page. For an approved driver the answer is yes — the shell renders
  // `ApplicationStatusScreen` for any `status !== "DRAFT"`, so this page is
  // their "you are cleared to drive" confirmation, and its own "Go online and
  // take orders" CTA is the exit to `/dashboard`. Bouncing them would make that
  // screen unreachable for the driver who reloads or navigates back after being
  // approved, which is the whole point of it.
  //
  // Testing the application status is not redundant with `activatedAt`: approval
  // writes `status: "APPROVED"` and `activatedAt` in one transaction (see
  // `api/admin/driver-applications/[id]/approve`), so an approved driver always
  // has an activation timestamp and the first arm alone would still redirect
  // every one of them. It is also narrower than dropping the `activatedAt` term
  // would be — a grandfathered driver has no `DriverApplication` row at all, so
  // `application?.status` reads `undefined`, fails this arm too, and stays out.
  const eligible =
    driverProfile !== null &&
    driverProfile.companyId === null &&
    (driverProfile.accountType === "INDIVIDUAL" ||
      driverProfile.accountType === "INDIVIDUAL_ENTREPRENEUR") &&
    (driverProfile.activatedAt === null ||
      driverProfile.application?.status === "APPROVED");

  if (!eligible) {
    redirect("/dashboard");
  }

  return (
    <OnboardingDraftProvider>
      <OnboardingWizardShell />
    </OnboardingDraftProvider>
  );
}
