import { redirect } from "next/navigation";

import { requireDashboardSession } from "@/lib/dashboard/auth";
import { prisma } from "@/lib/prisma";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * Where everything this page routes comes to rest: the board, which the hub
 * labels "Dashboard" and puts first in the rail.
 *
 * One destination for all four cases — a driver with a profile, a company past
 * the fleet gate, an admin, and the driver whose `DriverProfile` row does not
 * exist yet — because the open market is the first thing a provider wants after
 * signing in, and because the board is the only hub screen no persona is
 * bounced off. A driver and a company used to split here, the latter landing on
 * `/dashboard/today`; Today is a fleet owner's screen in the rail now but not
 * anyone's landing screen, so the split has nothing left to express.
 */
const HUB_HOME = "/dashboard/loads";

/**
 * The provider-side entry point: where an independent driver, a
 * company-affiliated driver, and a logistics company each land after signing
 * in, and where each is routed onward.
 *
 * Authentication, the forced-password-change gate and the CLIENT bounce all
 * live in `layout.tsx` now, so this page is the role branch plus one routing
 * decision per provider kind: an independent driver who still owes us an
 * onboarding application is sent to the driver wizard, and a company that still
 * owes us a fleet application is sent to the fleet wizard, rather than either
 * being shown a dashboard they cannot yet use. The guard call below is the same
 * cached one the layout already made, so it costs no second session validation —
 * it is here only to hand back the non-null session object.
 *
 * Past those two gates everyone lands on the same screen: the board the hub
 * labels "Dashboard", at `/dashboard/loads`.
 * This routing deliberately stays *in this page* rather than moving into a
 * layout: a layout wraps its children, and the two onboarding redirects target
 * `/dashboard/onboarding` and `/dashboard/fleet-onboarding`, which are children
 * of `src/app/dashboard/layout.tsx` — a guard that redirects to a page it also
 * wraps is an infinite redirect. The hub's own chrome lives one level
 * down, in the `(hub)` route group, precisely so it frames the seven hub
 * screens without ever framing the two wizards.
 */
export default async function DashboardPage() {
  const session = await requireDashboardSession();

  if (session.user.role === "COMPANY") {
    const company = await prisma.logisticsCompany.findUnique({
      where: { userId: session.user.id },
      select: {
        activatedAt: true,
        application: { select: { status: true } },
      },
    });

    // The counterpart to `/dashboard/fleet-onboarding`'s own defensive guard,
    // but not its exact mirror: this decides whether to *send* a company into
    // the fleet wizard, that one decides whether a company who navigated there
    // under their own steam may *see* it. The two agree everywhere except on an
    // activated company, whom this must never redirect and that page
    // deliberately still admits so the "Your fleet is live." screen stays
    // reachable on a reload. Keep the shared conditions below in sync with it.
    //
    // `activatedAt === null` is what keeps grandfathered companies out. Every
    // pre-existing `LogisticsCompany` was backfilled with an activation
    // timestamp by the business-fleet-onboarding migration, and an
    // admin-created company has no `BusinessApplication` row at all — so
    // `application?.status` alone reads `undefined`, would satisfy
    // `!== "APPROVED"`, and would drag a company that never owed us an
    // application into a wizard with no way back out. `activatedAt` is the
    // schema's documented source of truth for "is this company activated"; the
    // application status stays alongside it to cover the mid-onboarding company
    // whose row exists but is not approved yet.
    //
    // A COMPANY session with no `LogisticsCompany` row at all fails the first
    // condition and falls through to the hub, whose `(hub)/layout.tsx` owns the
    // "your profile isn't set up yet" fallback for that interrupted sign-up
    // (`resolveHubAccount()` returns `null` for exactly this user). The
    // wizard's step 1 assumes a company row exists, so this must never redirect
    // ahead of that fallback.
    //
    // One redirect covers no-application, DRAFT, PENDING and ACTION_REQUIRED
    // alike: `/dashboard/fleet-onboarding` is the single route, and its shell
    // renders the wizard for a DRAFT and task-15's status screen for anything
    // past it.
    const shouldOnboard =
      company !== null &&
      company.activatedAt === null &&
      company.application?.status !== "APPROVED";

    if (shouldOnboard) {
      redirect("/dashboard/fleet-onboarding");
    }

    redirect(HUB_HOME);
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
    // falls through to the hub, whose `(hub)/layout.tsx` owns the "your driver
    // profile isn't set up yet" fallback for that interrupted sign-up
    // (`resolveHubAccount()` returns `null` for exactly this user). The
    // wizard's step 1 assumes a profile row exists, so this must never redirect
    // ahead of that fallback.
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

  // Every remaining case — a driver past the onboarding gate, the driver whose
  // `DriverProfile` row was never created, and the ADMIN the layout does not
  // bounce — lands on the board.
  //
  // The board is every driver's home whatever their `companyId` says: a driver
  // employed on a company's roster claims from the same open market as an
  // owner-driver — dispatch is how work also reaches them, not the only way it
  // may — so the persona split this branch used to apply is gone, along with
  // the board's own redirect in `(hub)/loads/page.tsx` and the `403` that
  // `GET /api/loads` paired with it. `companyId` is selected above for the
  // onboarding test and is deliberately not consulted here.
  //
  // The profile-less driver is safe on this route and no longer needs the
  // separate destination it used to get. `resolveHubAccount()` returns `null`
  // for them, and `(hub)/layout.tsx` answers a `null` account by rendering its
  // "your driver profile isn't set up yet" fallback *instead of* its children —
  // on every hub route, this one included — so `loads/page.tsx`'s own `return
  // null` for the same case is never reached and there is no blank board to
  // land on.
  redirect(HUB_HOME);
}
