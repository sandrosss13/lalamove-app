import type { Metadata } from "next";

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
 * Gross earnings over a chosen range, the daily/weekly chart, the fare
 * breakdown and payout history.
 *
 * Open to both account kinds: `getHubEarnings()` resolves the scope difference
 * (a fleet sees the orders it holds, a driver the orders assigned to them), so
 * there is no business-only redirect here.
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

  const params = await searchParams;
  const range = resolveHubEarningsRange(params);
  const data = await getHubEarnings(account, range);

  // The preset list crosses as a prop rather than being imported by the filter
  // bar: `earnings.ts` is `server-only`, so a client component importing the
  // value (rather than the type) would drag Prisma into the browser bundle and
  // fail the build. This page is the boundary that may read both sides.
  return <EarningsScreen data={data} presets={HUB_EARNINGS_PRESETS} />;
}
