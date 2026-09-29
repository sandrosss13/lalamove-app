import type { Metadata } from "next";
import { headers } from "next/headers";

import {
  JobSheetNotFound,
  JobSheetScreen,
} from "@/components/driver-hub/screens/job-sheet-screen";
import { auth } from "@/lib/auth";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import { getHubJobSheet } from "@/lib/dashboard/hub/job-sheet";
import { resolveJobSheetScope } from "@/lib/dashboard/hub/job-sheet-access";

// Session + Prisma access can't be statically rendered. It is also the wrong
// thing to cache in the strongest sense: this page's whole job is to reflect a
// status two endpoints are actively changing, and a cached render is a driver
// looking at a "Start delivery" button for a delivery they already started.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Job sheet · Driver Hub",
};

/**
 * `/dashboard/jobs/[id]` — one delivery, as the driver assigned to it works
 * from it.
 *
 * ## The first dynamic segment in the hub
 *
 * There was no `[id]` anywhere under `src/app/dashboard/` before this: every
 * other detail view in the hub is in-page local state, which is why
 * `driver-hub-job-pill.tsx` had to point its rows at list screens and left a
 * note saying *"When job detail routes land, this is the one place that
 * changes."* This is that route.
 *
 * It sits inside the `(hub)` route group, so it inherits the sidebar, the
 * header and the page body's gutters for free, and `hubNavItemForPath`
 * prefix-matches it to the "My orders" entry with no change to `HUB_NAV` — the
 * prefix match was written for exactly this case. The one thing it does *not*
 * inherit correctly is the page title, which the screen overrides from below
 * through `useHubTitle`; see that hook for why the alternative (a ninth nav
 * entry) would have put a sidebar link on a route that needs an order id.
 *
 * ## Reading the order
 *
 * `auth.api.getSession` and then `getHubJobSheet`, following
 * `src/app/orders/[id]/track/page.tsx` — the pattern this page was told to
 * match. There is no `GET /api/orders/[id]` to call instead, and the load
 * board's endpoint is not an option either: it serialises status as only
 * `"available" | "claimed" | "mine"`, and telling `ACCEPTED` from `IN_TRANSIT`
 * is exactly what gates the two buttons.
 *
 * The tenancy test now runs on `resolveHubAccount()`, not on the session's user
 * id. This page used to read the session alone and argue for it: the test was
 * `Order.driverId === userId`, a **user** id, and reaching through an account
 * object that exists to describe a persona, a company and a driver profile for
 * the one field a security check needs was tying that check to a shape with
 * nothing to do with it. The argument inverts once a company may open this
 * page, because a company's claim on an order is `Order.companyId` and a
 * session carries no company id at all — the account object is now the only
 * thing that knows the fact the check is about. `resolveHubAccount()` is
 * React-`cache()`d and `(hub)/layout.tsx` has already called it, so this is a
 * memo hit rather than a second query.
 *
 * The session is still read first, and directly, for the signed-out case below.
 *
 * ## The not-found is deliberately uninformative
 *
 * A missing order, an order held by somebody else and an order nobody holds all
 * render **the same page**, and `getHubJobSheet` returns one undifferentiated
 * `null` for all three so that this component could not tell them apart even if
 * it wanted to. An incomplete account — no profile row yet, or a fleet with no
 * company — renders it too, for the same reason and with no message of its own.
 * The wording, and the reasoning for departing from the handoff's copy table,
 * are on `JobSheetNotFound`. Do not add a branch here that names the order, its
 * reference, or why it was refused.
 *
 * A signed-out caller gets the same page too, which is why the session is read
 * directly here **before** `resolveHubAccount()` rather than through it.
 * `resolveHubAccount()` calls `requireDashboardSession()`, which `redirect()`s a
 * signed-out caller to `/sign-in`; reaching it first would replace this page's
 * silence with a redirect that confirms the id is worth probing, which is the
 * one bit a not-found must not give away. Better Auth caches the session for the
 * request, so the check costs nothing and the redirect below it is never
 * reached. It is unreachable in practice anyway —
 * `src/app/dashboard/layout.tsx` is the session gate for everything under
 * `/dashboard` — but the ordering is what keeps it that way.
 *
 * ## Who this page is for
 *
 * The carrier holding the order: the driver it is assigned to, or the logistics
 * company that claimed it. Not the client — this screen carries `driverPayout`,
 * and what the platform pays its carrier is not the client's business.
 *
 * The company half is why this page exists in the shape it does. `GET
 * /api/loads` calls a load `"mine"` for a fleet account by `companyId`, and a
 * company-held order has `driverId: null` before dispatch and an *employee's*
 * user id after — never the owner's. The board therefore offered every fleet
 * account an "Open job sheet" link onto a not-found. The fix is one scope
 * resolved here and one tenancy rule applied in the loader, not a second
 * company-only screen: see `getHubJobSheet`.
 *
 * There is no persona redirect, and `loads/page.tsx` no longer has one either:
 * the board is open to every driver, roster and independent alike. A roster
 * driver is scoped as a driver and not as their employer — an employee sees the
 * job they were dispatched, not everything the fleet holds — so an order
 * assigned to a driver is theirs to work however it reached them, dispatched or
 * claimed off the board.
 */
export default async function JobSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Read before `resolveHubAccount()`, which would redirect this caller instead
  // of refusing them. See "the not-found is deliberately uninformative" above.
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return <JobSheetNotFound />;
  }

  const account = await resolveHubAccount();
  const scope = account === null ? null : resolveJobSheetScope(account);

  // An interrupted onboarding, answered exactly like a missing order: there is
  // no order this account can be shown, and saying which of the two it is would
  // be the only branch on this page that tells a caller anything.
  if (scope === null) {
    return <JobSheetNotFound />;
  }

  // Untrusted, and used only as an equality lookup on a unique column — never
  // interpolated into anything.
  const { id } = await params;
  const job = await getHubJobSheet(id, scope);

  if (job === null) {
    return <JobSheetNotFound />;
  }

  // "Now" is sampled here, once, rather than inside the screen. The screen
  // server-renders and then hydrates, and the future-dated check that decides
  // whether `Start delivery` is pressable needs a reference instant: read from
  // the clock it would be sampled twice, and a render straddling Tbilisi
  // midnight would disable the button on one pass and enable it on the other —
  // a hydration mismatch on the one control this page exists for. Passing one
  // instant down makes both passes agree by construction, exactly as
  // `jobs/page.tsx` does for its relative day labels.
  // `viewer` is the scope's discriminant and not a second derivation of it: the
  // screen chooses wording and whether to print the fleet block, and it must
  // never disagree with the loader about which audience it is answering.
  return (
    <JobSheetScreen
      job={job}
      nowIso={new Date().toISOString()}
      viewer={scope.kind === "COMPANY" ? "COMPANY" : "DRIVER"}
    />
  );
}
