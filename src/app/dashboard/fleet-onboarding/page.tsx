import { redirect } from "next/navigation";

import { FleetDraftProvider } from "@/components/fleet-onboarding/fleet-draft-context";
import { FleetWizardShell } from "@/components/fleet-onboarding/fleet-wizard-shell";
import { requireDashboardSession } from "@/lib/dashboard/auth";
import { prisma } from "@/lib/prisma";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The fleet onboarding wizard's route.
 *
 * `layout.tsx` has already guaranteed a session that is not a CLIENT and not
 * behind a forced password change; this page adds the checks specific to fleet
 * onboarding. `requireDashboardSession()` is called again here purely for the
 * session object — it is wrapped in React `cache()`, so the second call within
 * one render pass costs nothing.
 *
 * This guard is *defensive only* — it protects a direct or bookmarked visit by
 * someone the wizard isn't for. What proactively sends an eligible company here
 * from `/dashboard` is task-21, and must not be added in this task.
 *
 * A COMPANY user with no `LogisticsCompany` row redirects to `/dashboard`: that
 * is the interrupted-sign-up case, and `CompanyDashboard` already owns the
 * fallback for it. Two surfaces racing to explain one broken state is worse
 * than one.
 */
export default async function FleetOnboardingPage() {
  const session = await requireDashboardSession();

  // Defensive: the layout bounces CLIENT, but an ADMIN or DRIVER session
  // reaches this route otherwise.
  if (session.user.role !== "COMPANY") {
    redirect("/dashboard");
  }

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: {
      activatedAt: true,
      application: { select: { status: true } },
    },
  });

  // `activatedAt === null` is the "still owes us an application" term, and it is
  // what keeps grandfathered companies out of the wizard: the migration
  // backfilled an activation timestamp onto every pre-existing, admin-created
  // company, so a company that never owed an application is bounced here rather
  // than dropped into a wizard with no way back out.
  //
  // The `APPROVED` arm is what keeps the "Your fleet is live." screen
  // reachable. The shell renders `FleetApplicationStatusScreen` for any
  // `status !== "DRAFT"`, so for an approved company this page *is* the
  // confirmation screen, and that screen's own "Open the dispatch dashboard"
  // CTA is the exit. Approval writes `status: "APPROVED"` and `activatedAt` in
  // one transaction, so an approved company always has an activation timestamp
  // and the first term alone would redirect every one of them — making the
  // screen unreachable on reload, which is the whole point of it.
  //
  // It is also narrower than dropping the `activatedAt` term would be: a
  // grandfathered company has no `BusinessApplication` row at all, so
  // `application?.status` reads `undefined`, fails this arm too, and stays out.
  const eligible =
    company !== null &&
    (company.activatedAt === null ||
      company.application?.status === "APPROVED");

  if (!eligible) {
    redirect("/dashboard");
  }

  return (
    <FleetDraftProvider>
      <FleetWizardShell />
    </FleetDraftProvider>
  );
}
