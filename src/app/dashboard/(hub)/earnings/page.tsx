import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EarningsScreen } from "@/components/driver-hub/screens/earnings-screen";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import {
  HUB_EARNINGS_PRESETS,
  getHubEarnings,
  resolveHubEarningsRange,
} from "@/lib/dashboard/hub/earnings";

// The screen reads the session and Prisma, so it can never be statically
// rendered. It also reads `searchParams`, which is dynamic in its own right —
// and being explicitly dynamic is what lets the filter bar call
// `useSearchParams()` without a Suspense boundary around it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Earnings & payouts · Driver Hub",
};

/**
 * Where a driver who has no wallet of their own is sent instead — the board,
 * which the hub labels "Dashboard" and puts first in their rail.
 *
 * The one hub screen that bounces nobody: `(hub)/loads/page.tsx` carries no
 * guard of its own, and a ROSTER driver is explicitly welcome on it, so this
 * redirect comes to rest rather than starting a second hop. It is also where
 * `src/app/dashboard/page.tsx` sent them after sign-in, so the bounce returns
 * them to the screen they came from.
 */
const HUB_HOME = "/dashboard/loads";

/**
 * Gross earnings over a chosen range, the daily/weekly chart, the fare
 * breakdown and payout history.
 *
 * Open to an independent driver and to a fleet — `getHubEarnings()` resolves
 * the scope difference (a fleet sees the orders it holds, a driver the orders
 * assigned to them) — but **not** to a roster driver, who is redirected below
 * for the reason the guard spells out. `GET
 * /api/dashboard/hub/earnings/export` refuses the same persona with a `403`,
 * so the screen and its download are withheld together.
 *
 * `resolveHubAccount()` is React-`cache()`d and `(hub)/layout.tsx` above already
 * called it, so this is a memo hit within the same request rather than a second
 * session validation and query. A `null` account cannot reach here at all — the
 * layout renders its own "profile isn't set up yet" fallback instead of these
 * children — which is what makes the early return below the narrowing rather
 * than defensive theatre.
 *
 * ## Why the range comes from the URL
 *
 * `searchParams` is the single source of the window every figure on this screen
 * covers: the filter bar pushes new params, Next re-renders this page on the
 * server, and the tiles, the chart and the breakdown come back recomputed. That
 * makes a range shareable and bookmarkable, makes Back step through the ranges
 * a driver looked at, and means the screen holds no copy of a range that could
 * disagree with the numbers on it.
 *
 * `resolveHubEarningsRange` is total — a hand-typed, inverted or absurdly long
 * range is corrected rather than rejected — so there is no error path here, and
 * `getHubEarnings` re-normalises the pair on its own side before it queries.
 */
export default async function EarningsPage({
  searchParams,
}: {
  // A Promise since Next 15: request-scoped data is awaited in the component
  // that needs it rather than making the whole tree dynamic implicitly.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await resolveHubAccount();

  if (account === null) {
    return null;
  }

  // The roster-driver gate, server-side — the hidden "Wallet" link in the
  // sidebar is cosmetic and does nothing about a hand-typed URL.
  //
  // This screen sums `driverPayout` over the orders whose `driverId` is this
  // user and labels the total "Gross earnings". For an employed driver that
  // money was settled to their *employer* — the company claimed the order and
  // was paid for it; `driverId` only records who drove. Showing it here asserts
  // something false about an employee's own income, which is why the screen is
  // withheld outright rather than relabelled; an employee who wants to know
  // what they drove has My orders, which reads correctly for all three
  // personas. `GET /api/dashboard/hub/earnings/export` refuses the same persona
  // with a 403 for the same reason, so this redirect is one half of a pair
  // rather than the whole gate.
  //
  // The test is `persona`, not `companyId`. A BUSINESS account has a non-null
  // `companyId` too — its own company's — and is entitled to this screen;
  // `resolveHubAccount()` already conjoined `kind` and `companyId` into the one
  // field, so no caller has to remember to.
  if (account.persona === "ROSTER") {
    redirect(HUB_HOME);
  }

  const params = await searchParams;
  const range = resolveHubEarningsRange(params);
  const data = await getHubEarnings(account, range);

  // The preset list crosses as a prop rather than being imported by the filter
  // bar: `earnings.ts` is `server-only`, so a client component importing the
  // value (rather than the type) would drag Prisma into the browser bundle and
  // fail the build. This page is the boundary that may read both sides.
  return <EarningsScreen data={data} presets={HUB_EARNINGS_PRESETS} />;
}
