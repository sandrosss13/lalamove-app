import type { Metadata } from "next";

import { PerformanceScreen } from "@/components/driver-hub/screens/performance-screen";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import { getHubPerformance } from "@/lib/dashboard/hub/performance";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Performance · Driver Hub",
};

/**
 * Acceptance, completion, cancellations, rating and jobs per day for the
 * current Monday–Sunday Tbilisi week, against the online hours that produced
 * them.
 *
 * Open to all three personas — `INDEPENDENT`, `ROSTER` and `BUSINESS`. A fleet's
 * numbers are its orders' numbers, and `getHubPerformance()` resolves both the
 * tenancy scope and the persona shape itself: a business account additionally
 * gets the per-driver breakdown, which reaches the screen inside `data.fleet`.
 * So there is no redirect here.
 *
 * `resolveHubAccount()` is React-`cache()`d and `(hub)/layout.tsx` above already
 * called it, so this is a memo hit within the same request rather than a second
 * session validation. A `null` account cannot reach here at all — the layout
 * renders its own "profile isn't set up yet" fallback instead of these children
 * — so the early return is the narrowing TypeScript still needs, not a guard
 * against a state this route can be in.
 */
export default async function PerformancePage() {
  const account = await resolveHubAccount();

  if (account === null) {
    return null;
  }

  const data = await getHubPerformance(account);

  return <PerformanceScreen data={data} />;
}
