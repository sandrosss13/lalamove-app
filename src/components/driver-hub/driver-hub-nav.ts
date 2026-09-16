/**
 * The complete information architecture of the driver hub.
 *
 * Two consumers read this file — the sidebar (`driver-hub-sidebar.tsx`) draws
 * the links, and the sticky header (`driver-hub-header.tsx`) looks up the
 * current route's page title and subhead. Declaring both here means the header
 * copy sits next to the link it belongs to instead of being restated in seven
 * `page.tsx` files, and a later screen registers itself by adding its own route
 * rather than by editing a file five other tasks are also touching.
 *
 * Modelled on `src/components/admin/admin-nav.ts`, including the point about
 * filtering below.
 */

import type { HubAccount, HubPersona } from "@/lib/dashboard/hub/account";

/** One sidebar link, and the header copy for the screen behind it. */
export type HubNavItem = {
  /** Stable identifier, so a layout can ask for its own entry by name. */
  id: HubNavItemId;
  /** Sidebar label. */
  label: string;
  href: string;
  /**
   * The personas this entry is withheld from. Empty means everyone sees it.
   *
   * One persona-keyed list rather than the two-boolean pair it replaces
   * (a business-only flag and an employed-driver flag, both subsumed by the
   * persona axis). That pair was genuinely two axes and could not be collapsed
   * into one flag: a roster driver and an independent driver are both
   * `kind: "INDIVIDUAL"`, so "business only" and "not for an employed driver"
   * were different questions asked of different fields. Keying on
   * `HubPersona` — the axis that actually distinguishes all three account
   * shapes — makes them the same question, and makes the next rule a list
   * entry rather than a third boolean and a third clause in the filter below.
   *
   * **This is a *cosmetic* filter.** Hiding a link does nothing about a
   * hand-typed URL, a bookmark, or an account whose shape changed since the
   * link was last drawn. Every entry named here that is *withheld* must
   * therefore ALSO be enforced server-side: the screen's own `page.tsx`
   * resolves the account and `redirect("/dashboard/loads")`s, and where an API
   * backs the screen the route handler refuses on the same terms. So
   * `/dashboard/drivers` and `/dashboard/employees` each guard on
   * `kind !== "BUSINESS"`, and `/dashboard/earnings` guards the roster case
   * while `GET /api/dashboard/hub/earnings/export` 403s it. The link list is
   * the convenience; the page guard is the boundary.
   *
   * `today` is the one entry listed here with no matching guard, and
   * deliberately so: it is hidden from the two driver personas because it is
   * not *their* home screen, not because its contents are withheld from them.
   * `getHubToday()` scopes itself to whoever asks and reads correctly for all
   * three personas, so a driver who reaches `/dashboard/today` from a bookmark
   * sees their own day rather than somebody else's — there is nothing here for
   * a server-side gate to protect.
   */
  hiddenFor: readonly HubPersona[];
  /** The 20px page title in the sticky header. */
  title: string;
  /**
   * The 13px muted subhead under the title — the design's copy for this
   * screen, used as the *fallback*.
   *
   * Four of these subheads are derived in the design (Today's date, Earnings'
   * selected range, and the roster counts on Jobs, Vehicles, Drivers and
   * Employees), so those screens pass their own computed string to the header
   * and this literal is only what renders before their data resolves. The
   * strings are transcribed from the prototype's `pageSub` map so the wording
   * and separator style stay the design's, not ours.
   */
  subtitle: string;
};

/** Stable identifiers for the eight screens. */
export type HubNavItemId =
  | "today"
  | "earnings"
  | "loads"
  | "jobs"
  | "performance"
  | "vehicles"
  | "drivers"
  | "employees";

/**
 * In rail order, which is the design's with one entry lifted to the front:
 * Dashboard — the load board — comes first because it is where every account
 * lands after signing in, and a rail whose first link is not the screen the
 * router just chose reads as though the user arrived in the wrong place.
 *
 * Today follows it and is BUSINESS-only. A fleet owner's day genuinely is a
 * summary of what dispatch is doing, so the screen keeps its rail entry and its
 * route; a driver has no use for a second home above the board they actually
 * work from, so it is withheld from both individual personas — hidden, not
 * deleted, and reachable at `/dashboard/today` for anyone who has it. Drivers
 * and Employees come last for the mirror-image reason: they are BUSINESS-only
 * too, and keeping them at the end means dropping them leaves everything above
 * in an unchanged order.
 *
 * What each persona is left with: an INDEPENDENT driver gets Dashboard, Wallet,
 * My orders, Performance and Vehicles; a ROSTER driver the same rail without
 * the Wallet, which sits second rather than last and is simply removed in place
 * rather than shuffled to the bottom; a BUSINESS account gets all eight.
 * Filtering by `hiddenFor` never reorders what it keeps, which is the property
 * that makes three rails feel like one product.
 */
export const HUB_NAV: readonly HubNavItem[] = [
  {
    // First in the rail, and the entry point the whole hub is routed at:
    // `src/app/dashboard/page.tsx` sends a driver, a company and an admin here
    // alike, and the three persona gates below it bounce to here as well. The
    // design puts the board between Wallet and My orders, framing it as where a
    // driver *gets* work; that framing is unchanged, but a link the router
    // always lands on cannot sit third in the list of links to it.
    //
    // `title`/`subtitle` are transcribed from the design's header copy and are
    // both genuinely static — unlike four of the other entries, neither is a
    // runtime value — so the Loads screen registers no `useHubSubtitle()`
    // override and these literals are the whole story.
    id: "loads",
    // "Dashboard" rather than the design's "Load Board": the board is now where
    // *every* driver lands after signing in, so the rail names it for the place
    // it occupies rather than for the one screen it holds. A label change and
    // nothing more — the id, the route and the files behind them all still say
    // `loads`, which is what the rest of this feature is called throughout.
    label: "Dashboard",
    href: "/dashboard/loads",
    // Shown to every persona. It used to be withheld from a ROSTER driver, on
    // the reading of `specs/driver-load-board/requirements.md`'s Assumptions
    // that an employed driver receives work through their company's dispatch
    // rather than the open market — but dispatch is one way work reaches them,
    // not a fence around the market, and a roster driver browsing and claiming
    // an open booking is now supported end to end. The two server-side gates
    // that backed the old rule (the redirect in
    // `src/app/dashboard/(hub)/loads/page.tsx` and the `GET /api/loads` 403)
    // are gone with it, so nothing is left for this list to mirror.
    hiddenFor: [],
    title: "Dashboard",
    subtitle: "Bookings open to drivers",
  },
  {
    id: "today",
    label: "Today",
    href: "/dashboard/today",
    // A fleet owner's screen only. Today opens on a day's takings, the job in
    // progress and where demand is — a dispatcher's morning read, and one a
    // BUSINESS account has a rail link to for that reason. For a driver it is a
    // second home screen stacked above the board they came to work from, so it
    // is dropped from their rail rather than from the app: the route, the
    // screen and `lib/dashboard/hub/today.ts` all stay, and all still read
    // correctly for a driver who arrives with a bookmark. This is the one
    // `hiddenFor` list with no server-side guard behind it, which the type's
    // own comment above explains.
    hiddenFor: ["INDEPENDENT", "ROSTER"],
    title: "Today",
    subtitle: "Saturday 29 August · Tbilisi",
  },
  {
    // Labelled "Wallet" rather than "Earnings" per the header-alignment
    // handoff (`UI:UX/Registered Driver account (New)/Driver dashboard header
    // alignment/`), which names a driver's payouts destination "Wallet". It
    // points at the hub's existing earnings screen and NOT at the client route
    // `/wallet`, which is the *client's saved payment cards* — a driver
    // receives payouts, they do not store cards to pay with. The `title` stays
    // "Earnings & payouts": that is the screen's own heading and the handoff
    // renames the nav label, not the page.
    id: "earnings",
    label: "Wallet",
    href: "/dashboard/earnings",
    // Withheld from a ROSTER driver, and new in this feature. The screen sums
    // `driverPayout` over the orders assigned to the signed-in driver and
    // labels the total as *their* earnings — but an employed driver's fares
    // are paid to their employer, so for them the screen asserts something
    // false about whose money it is. Planning chose to hide it outright rather
    // than relabel it as a non-currency work summary: the failure direction
    // worth engineering against is showing an employee a currency figure that
    // is not theirs.
    hiddenFor: ["ROSTER"],
    title: "Earnings & payouts",
    subtitle: "24 – 30 August 2026 · next payout Friday 4 September",
  },
  {
    // "My orders" rather than "Jobs" per the same header-alignment handoff.
    // Points at the hub's job history and NOT at the client route `/orders`,
    // which hard-rejects any non-CLIENT role (`src/app/orders/page.tsx`) and
    // would simply bounce a driver.
    id: "jobs",
    label: "My orders",
    href: "/dashboard/jobs",
    hiddenFor: [],
    title: "Job history",
    subtitle: "182 jobs in the last 30 days",
  },
  {
    id: "performance",
    label: "Performance",
    href: "/dashboard/performance",
    hiddenFor: [],
    title: "Performance",
    // The one subhead that is genuinely static — it describes the window the
    // screen always uses, not a value inside it.
    //
    // Not the artboard's "Rolling 7-day window": `lib/dashboard/hub/
    // performance.ts` anchors every figure on this screen to the current
    // Tbilisi week, Monday through Sunday, and explains why a trailing seven
    // days was rejected (Thursday's jobs bar would sit under Monday's hours
    // bar). The prototype's literal would contradict the screen's own "This
    // week, 25–31 Aug" paragraph a few hundred pixels below it.
    subtitle: "This Tbilisi week, Monday to Sunday",
  },
  {
    id: "vehicles",
    label: "Vehicles",
    href: "/dashboard/vehicles",
    hiddenFor: [],
    title: "Vehicles",
    subtitle: "7 vehicles registered · 4 on the road, 1 unassigned",
  },
  {
    id: "drivers",
    label: "Drivers",
    href: "/dashboard/drivers",
    // Business-only, spelled as the two personas it is withheld from rather
    // than as a "BUSINESS only" flag — one rule shape across all eight entries
    // is worth more than the two characters the inverse would save. The
    // boundary is `drivers/page.tsx`'s own `kind !== "BUSINESS"` guard, which
    // this does not replace.
    hiddenFor: ["INDEPENDENT", "ROSTER"],
    title: "Drivers",
    subtitle: "7 registered drivers · 4 online in Tbilisi now",
  },
  {
    id: "employees",
    label: "Employees",
    href: "/dashboard/employees",
    hiddenFor: ["INDEPENDENT", "ROSTER"],
    title: "Employees & roles",
    subtitle: "Gizo Cargo LLC · 6 people, 4 roles · 1 invite pending",
  },
];

/**
 * The links this account sees: every entry whose `hiddenFor` list does not name
 * this account's persona.
 *
 * It takes the persona and nothing else. The roster test — `kind ===
 * "INDIVIDUAL" && companyId !== null` — used to be evaluated right here,
 * because a roster driver and an independent driver are both
 * `kind: "INDIVIDUAL"` and `kind` alone cannot see the difference. That test
 * has not been dropped; it has moved into `resolveHubAccount()`, which derives
 * `persona` once per request and is now the single place in the codebase where
 * the conjunction is written. The reasoning behind it is still load-bearing and
 * is worth repeating at every site that depends on it:
 *
 * **`companyId` alone is not the roster test.** A BUSINESS account's
 * `companyId` names *its own* company and that account must keep every link;
 * only `kind === "INDIVIDUAL" && companyId !== null` is an employed driver on
 * somebody else's roster. Getting this backwards would hide the Wallet from a
 * fleet owner — the one account shape whose payouts it exists to show.
 *
 * Cosmetic only — see `hiddenFor` above. The account itself comes from the
 * session (`resolveHubAccount()`), never from a client-side toggle: the
 * prototype's Business/Individual switcher is a prototype affordance and the
 * real header shows a static account-type chip instead.
 */
export function hubNavForAccount(
  account: Pick<HubAccount, "persona">,
): HubNavItem[] {
  return HUB_NAV.filter((item) => !item.hiddenFor.includes(account.persona));
}

/**
 * The entry a pathname belongs to, for marking the sidebar link active and for
 * reading the header's title and subhead.
 *
 * Matches on a path *prefix* so a future detail route (`/dashboard/jobs/TB4821`)
 * still resolves to Jobs, and picks the longest match so a nested screen would
 * win over its parent. Returns `undefined` for a path outside the hub — the
 * onboarding routes live under `/dashboard` too, and they render their own
 * chrome rather than this header.
 */
export function hubNavItemForPath(pathname: string): HubNavItem | undefined {
  // Trailing slashes reach here from links written either way; normalising
  // once keeps the two comparisons below to a single form each.
  const path = pathname.replace(/\/+$/, "");

  let match: HubNavItem | undefined;

  for (const item of HUB_NAV) {
    if (path !== item.href && !path.startsWith(`${item.href}/`)) {
      continue;
    }

    if (!match || item.href.length > match.href.length) {
      match = item;
    }
  }

  return match;
}
