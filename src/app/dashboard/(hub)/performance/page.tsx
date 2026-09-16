import type { Metadata } from "next";

import { PerformanceScreen } from "@/components/driver-hub/screens/performance-screen";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import {
  HUB_EARNINGS_PRESETS,
  getHubEarnings,
  resolveHubEarningsRange,
} from "@/lib/dashboard/hub/earnings";
import { getHubPerformance } from "@/lib/dashboard/hub/performance";

// Session + Prisma access can't be statically rendered. This page also reads
// `searchParams`, which is dynamic in its own right — and being explicitly
// dynamic is what lets the earnings filter bar call `useSearchParams()` without
// a Suspense boundary around it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Performance · Driver Hub",
};

/**
 * Performance — the money first, then how the week is going.
 *
 * ## One screen, two loaders
 *
 * This route used to be half of a pair: `/dashboard/earnings` carried the
 * wallet (gross fares, the breakdown, payouts, the fleet revenue card, the
 * range filter and its Excel export) and `/dashboard/performance` carried the
 * rates and the jobs chart. They were merged by product decision, and
 * `/dashboard/earnings` was **deleted outright rather than redirected** — the
 * route is gone, its nav entry with it, and nothing in the hub links to it.
 *
 * The merge is a stack, not a rewrite: `getHubEarnings` and `getHubPerformance`
 * are unchanged and still answer independent questions over different windows,
 * so they run concurrently rather than one after the other — neither reads the
 * other's result, and a driver should not pay two serial round trips for one
 * screen. `earnings.ts` already runs its own pair of queries this way.
 *
 * Money leads. `PerformanceScreen` renders the earnings sections above the
 * performance ones for that reason, and the header subtitle is the earnings
 * range rather than the performance week; see that component.
 *
 * ## Open to all three personas, money included
 *
 * `INDEPENDENT`, `ROSTER` and `BUSINESS` all reach this screen and all see
 * every figure on it. There is no persona redirect here, and none may be
 * reintroduced.
 *
 * That is a reversal. A roster driver — an employee on somebody else's fleet —
 * used to be bounced off the earnings half on the ground that the fares they
 * drove were settled to their employer, so a currency figure headed with their
 * own name asserted something false about whose money it was. Product overruled
 * that: an employed driver is now shown what they drove and what it was worth,
 * on the same screen and in the same words as everyone else, and `GET
 * /api/dashboard/hub/earnings/export` dropped its matching `403` so the
 * download agrees with the screen. The reading the old gate worried about is
 * answered by context rather than by absence — the figures are what this
 * driver's jobs earned, which is the number an employee asks for when they
 * check their week against their payslip.
 *
 * Scope still differs by persona and is still resolved inside the loaders: a
 * fleet sees the orders its company holds, a driver (employed or not) sees the
 * orders assigned to them. Nothing about that changed.
 *
 * `resolveHubAccount()` is React-`cache()`d and `(hub)/layout.tsx` above already
 * called it, so this is a memo hit within the same request rather than a second
 * session validation. A `null` account cannot reach here at all — the layout
 * renders its own "profile isn't set up yet" fallback instead of these children
 * — so the early return is the narrowing TypeScript still needs, not a guard
 * against a state this route can be in.
 *
 * ## Why the earnings range comes from the URL
 *
 * `searchParams` is the single source of the window every *money* figure on
 * this screen covers: the filter bar pushes new params, Next re-renders this
 * page on the server, and the tiles, the chart and the breakdown come back
 * recomputed. That makes a range shareable and bookmarkable, makes Back step
 * through the ranges a driver looked at, and means the screen holds no copy of
 * a range that could disagree with the numbers on it.
 *
 * `resolveHubEarningsRange` is total — a hand-typed, inverted or absurdly long
 * range is corrected rather than rejected — so there is no error path here, and
 * `getHubEarnings` re-normalises the pair on its own side before it queries.
 *
 * The performance half deliberately does **not** follow that range. Its figures
 * are anchored to the current Tbilisi week because its chart is seven columns
 * labelled Mon…Sun and its deltas all read "vs last week"; pointing it at a
 * ninety-day custom range would leave a seven-bar chart claiming to cover it.
 * The two windows are stated separately on screen — the header subtitle names
 * the money range, and the performance section names its own week in the line
 * under its tiles.
 */
export default async function PerformancePage({
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

  const params = await searchParams;
  const range = resolveHubEarningsRange(params);

  const [earnings, performance] = await Promise.all([
    getHubEarnings(account, range),
    getHubPerformance(account),
  ]);

  // The preset list crosses as a prop rather than being imported by the filter
  // bar: `earnings.ts` is `server-only`, so a client component importing the
  // value (rather than the type) would drag Prisma into the browser bundle and
  // fail the build. This page is the boundary that may read both sides.
  return (
    <PerformanceScreen
      earnings={earnings}
      earningsPresets={HUB_EARNINGS_PRESETS}
      data={performance}
    />
  );
}
