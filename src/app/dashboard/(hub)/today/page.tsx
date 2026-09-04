import type { Metadata } from "next";

import { TodayScreen } from "@/components/driver-hub/screens/today-screen";
import { formatTodaySubtitle } from "@/components/driver-hub/screens/today-format";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import { getHubToday } from "@/lib/dashboard/hub/today";

// The screen reads the session and Prisma, so it can never be statically
// rendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Today · Driver Hub",
};

/**
 * What the driver earned today, the job in progress, where demand is, and what
 * needs action — the landing screen after sign-in.
 *
 * Open to both account kinds: `getHubToday()` already resolved the scope
 * difference (a fleet sees the orders it holds, a driver the orders assigned to
 * them), so there is no business-only redirect here.
 *
 * `resolveHubAccount()` is React-`cache()`d and `(hub)/layout.tsx` above already
 * called it, so this is a memo hit within the same request rather than a second
 * session validation and query. A `null` account cannot reach here at all — the
 * layout renders its own "profile isn't set up yet" fallback instead of these
 * children — which is what makes the early return below the narrowing rather
 * than defensive theatre.
 *
 * ## Why the subhead is formatted here
 *
 * The header's subhead is "Saturday 30 August · Tbilisi": today's date plus the
 * account's own city. Deriving it in the client screen would mean calling
 * `new Date()` on both sides of hydration — two different instants, which
 * straddle midnight often enough to matter and produce a mismatched subhead
 * when they do. Formatting it once here, from the server's `new Date()`, and
 * handing the screen a finished string removes the second clock entirely: the
 * markup React renders on the server and the markup it hydrates on the client
 * are built from the same characters.
 *
 * The formatter itself is UTC- and locale-pinned (see `today-format.ts`), which
 * also keeps the date honest: every "today" boundary in `getHubToday()` is a
 * UTC day, so the subhead names the same day the money on the card covers.
 */
export default async function TodayPage() {
  const account = await resolveHubAccount();

  if (account === null) {
    return null;
  }

  const data = await getHubToday(account);

  return (
    <TodayScreen
      data={data}
      subtitle={formatTodaySubtitle(new Date(), account.city)}
    />
  );
}
