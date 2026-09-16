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
 * What the account earned today, the job in progress, where demand is, and what
 * needs action — a fleet owner's morning read.
 *
 * Open to every persona, and one of the two hub screens that is. Unlike
 * `/dashboard/earnings` (redirected for a roster driver) and
 * `/dashboard/drivers` and `/dashboard/employees` (business only), there is no
 * guard here at all, and that is deliberate: `driver-hub-nav.ts` withholds the
 * rail link from both driver personas because Today is not *their* home screen
 * — the board is, and `src/app/dashboard/page.tsx` routes every account there —
 * but the page reads correctly for all three, so a driver who arrives with a
 * bookmark sees their own day rather than a refusal. A hidden link is not a
 * withheld screen; `driver-hub-nav.ts`'s `hiddenFor` doc says the same from the
 * other end.
 *
 * That leaves the page with nothing persona-specific to do. `getHubToday()`
 * resolves the *scope* difference internally through `hubOrderScope()` (a fleet
 * sees the orders it holds, a driver the orders assigned to them), and the
 * *shape* difference travels to the screen on `data.persona`, which is echoed
 * from `HubAccount.persona` rather than re-derived here.
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
 * The formatter itself is zone- and locale-pinned to `HUB_TIME_ZONE`
 * ("Asia/Tbilisi", see `today-format.ts`), which also keeps the date honest:
 * every "today" boundary in `getHubToday()` is a Tbilisi day, so the subhead
 * names the same day the money on the card covers. Both halves used to be UTC,
 * and the mismatch that produced is why they are not any more — `today.ts`'s
 * header records the move.
 *
 * ## The city in the subhead, and what it is not
 *
 * `account.city` is `LogisticsCompany.city` for a BUSINESS account — the
 * company's *registered* city, not a summary of where its vans actually worked
 * today. A fleet operating out of Tbilisi, Kutaisi and Batumi still reads
 * "· Tbilisi" here, and the money on the card beneath it covers all three. That
 * is a known, accepted limitation: per-city fleet breakdowns were considered
 * during planning and deliberately deferred, because the rollups this feature
 * does add are per-driver and per-vehicle, and a fourth dimension with no screen
 * designed for it would be a table nobody asked for.
 * `Order.pickupCity`/`dropoffCity` exist and are indexed, so the breakdown is
 * derivable whenever a design for it is.
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
