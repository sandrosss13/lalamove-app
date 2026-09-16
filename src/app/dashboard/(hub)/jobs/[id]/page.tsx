import type { Metadata } from "next";
import { headers } from "next/headers";

import {
  JobSheetNotFound,
  JobSheetScreen,
} from "@/components/driver-hub/screens/job-sheet-screen";
import { auth } from "@/lib/auth";
import { getHubJobSheet } from "@/lib/dashboard/hub/job-sheet";

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
 * The session is fetched here rather than taken from `resolveHubAccount()`,
 * even though the layout above has already resolved one. The ownership test is
 * `Order.driverId === userId`, a **user** id — the account object exists to
 * describe a persona, a company and a driver profile, and reaching through it
 * for the one field this page needs would tie a security check to a shape that
 * has nothing to do with it. Better Auth caches the session for the request, so
 * this is not a second validation round trip.
 *
 * ## The not-found is deliberately uninformative
 *
 * A missing order, an order belonging to a different driver and an order with
 * no driver at all all render **the same page**, and `getHubJobSheet` returns
 * one undifferentiated `null` for all three so that this component could not
 * tell them apart even if it wanted to. Its wording and the reasoning for
 * departing from the handoff's copy table are on `JobSheetNotFound`. Do not add
 * a branch here that names the order, its reference, or why it was refused.
 *
 * A signed-out caller gets the same page too. It is unreachable in practice —
 * `src/app/dashboard/layout.tsx` is the session gate for everything under
 * `/dashboard` — but if it were ever reached, "sign in to see this" would
 * confirm that signing in is worth doing, which is one bit more than a
 * not-found should give away.
 *
 * ## Who this page is for
 *
 * The assigned driver, and only them. Not the client — this screen carries
 * `driverPayout`, and what the platform pays its carrier is not the client's
 * business — and not the logistics company holding the order either, whose
 * people need this information through a company-scoped surface with its own
 * tenancy clause. That rule lives in `getHubJobSheet`; this component supplies
 * the session's user id and renders whichever of the two answers comes back.
 *
 * There is no persona redirect, and `loads/page.tsx` no longer has one either:
 * the board is open to every driver, roster and independent alike. This screen
 * is narrower still — an order assigned to a driver is theirs to work however
 * it reached them, dispatched by their employer or claimed off the board — so
 * the ownership test is the whole gate.
 */
export default async function JobSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return <JobSheetNotFound />;
  }

  // Untrusted, and used only as an equality lookup on a unique column — never
  // interpolated into anything.
  const { id } = await params;
  const job = await getHubJobSheet(id, session.user.id);

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
  return <JobSheetScreen job={job} nowIso={new Date().toISOString()} />;
}
