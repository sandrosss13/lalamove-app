import { redirect } from "next/navigation";

import { CompanyDashboard } from "@/components/dashboard/company-dashboard";
import { DriverDashboard } from "@/components/dashboard/driver-dashboard";
import { requireDashboardSession } from "@/lib/dashboard/auth";
import { prisma } from "@/lib/prisma";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The provider-side home: where an independent driver, a company-affiliated
 * driver, and a logistics company each manage their own account.
 *
 * Authentication, the forced-password-change gate and the CLIENT bounce all
 * live in `layout.tsx` now, so this page is the role branch plus one routing
 * decision: an independent driver who still owes us an onboarding application
 * is sent to the wizard rather than shown a dashboard they cannot yet use. The
 * guard call below is the same cached one the layout already made, so it costs
 * no second session validation — it is here only to hand back the non-null
 * session object.
 */
export default async function DashboardPage() {
  const session = await requireDashboardSession();

  if (session.user.role === "COMPANY") {
    return <CompanyDashboard userId={session.user.id} />;
  }

  // `UserRole` is CLIENT, DRIVER, COMPANY or ADMIN. The layout has already sent
  // clients to `/account` and COMPANY was handled above, so what is left is a
  // driver — or an ADMIN, which the layout does not bounce. The onboarding
  // routing below therefore tests the role explicitly rather than treating "not
  // CLIENT, not COMPANY" as a synonym for DRIVER: an admin has no
  // `DriverProfile` today, but that is a fact about the data, not a guarantee
  // enforced anywhere on this path.
  if (session.user.role === "DRIVER") {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        accountType: true,
        activatedAt: true,
        companyId: true,
        application: { select: { status: true } },
      },
    });

    // The counterpart to `/dashboard/onboarding`'s own defensive guard, but not
    // its exact mirror: this decides whether to *send* a driver into the wizard,
    // that one decides whether a driver who navigated there under their own
    // steam may *see* it. The two agree everywhere except on an approved driver,
    // whom this must never redirect and that page deliberately still admits so
    // the "you are cleared to drive" screen stays reachable on a reload. Keep
    // the shared conditions below in sync with it.
    //
    // `activatedAt === null` is what keeps grandfathered drivers out. Every
    // pre-existing profile was backfilled with an activation timestamp by the
    // migration, and an already-activated independent driver has no
    // `DriverApplication` row at all (it is created lazily on the first wizard
    // visit) — so `application?.status` alone reads `undefined`, would satisfy
    // `!== "APPROVED"`, and would drag a driver who never owed us an
    // application into a wizard with no way back out. `activatedAt` is the
    // schema's documented source of truth for "is this driver activated"; the
    // application status stays alongside it to cover the mid-onboarding driver
    // whose row exists but is not approved yet.
    //
    // A driver with no `DriverProfile` at all fails the first condition and
    // falls through to `DriverDashboard`, which owns the "your driver profile
    // isn't set up yet" fallback for that interrupted sign-up. The wizard's
    // step 1 assumes a profile row exists, so this must never redirect ahead of
    // that fallback.
    const shouldOnboard =
      driverProfile !== null &&
      driverProfile.companyId === null &&
      (driverProfile.accountType === "INDIVIDUAL" ||
        driverProfile.accountType === "INDIVIDUAL_ENTREPRENEUR") &&
      driverProfile.activatedAt === null &&
      driverProfile.application?.status !== "APPROVED";

    if (shouldOnboard) {
      redirect("/dashboard/onboarding");
    }
  }

  return (
    <DriverDashboard userId={session.user.id} userName={session.user.name} />
  );
}
