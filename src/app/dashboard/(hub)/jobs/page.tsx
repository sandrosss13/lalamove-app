import type { Metadata } from "next";

import { JobsScreen } from "@/components/driver-hub/screens/jobs-screen";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import { getHubJobs } from "@/lib/dashboard/hub/jobs";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Job history · Driver Hub",
};

/**
 * Every job this account has run — completed, scheduled, in flight or
 * cancelled — with the selected one's timeline and fare breakdown beside it.
 *
 * Open to both account kinds: `getHubJobs()` resolves the scope difference
 * (a company sees the orders it holds, a driver the orders assigned to them),
 * so there is no business-only redirect here.
 *
 * `resolveHubAccount()` is React-`cache()`d and `(hub)/layout.tsx` above already
 * called it, so this is a memo hit within the same request rather than a second
 * session validation and query. A `null` account cannot reach here at all — the
 * layout renders its own "profile isn't set up yet" fallback instead of these
 * children — which is what makes the non-null assertion below unnecessary and
 * the early return honest rather than defensive theatre: TypeScript still sees
 * `HubAccount | null`, and this is the narrowing.
 *
 * The screen renders no `<SampleNote />`. Every value on it is a column on
 * `Order`; see the module comment on `src/lib/dashboard/hub/jobs.ts`.
 */
export default async function JobsPage() {
  const account = await resolveHubAccount();

  if (account === null) {
    return null;
  }

  const data = await getHubJobs(account);

  return (
    // "Now" is sampled here, once, rather than inside the screen. The screen
    // server-renders and then hydrates, and its relative day labels
    // ("Yesterday 18:20") need a reference instant: read from the clock it
    // would be sampled twice, and a render straddling Tbilisi midnight would
    // produce a different label on each side — a hydration mismatch. Passing
    // one instant down makes both passes agree by construction.
    <JobsScreen data={data} nowIso={new Date().toISOString()} />
  );
}
