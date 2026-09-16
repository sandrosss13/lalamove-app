/**
 * The complete information architecture of the driver hub.
 *
 * Two consumers read this file — the sidebar (`driver-hub-sidebar.tsx`) draws
 * the links, and the sticky header (`driver-hub-header.tsx`) looks up the
 * current route's page title and subhead. Declaring both here means the header
 * copy sits next to the link it belongs to instead of being restated in six
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
   * `kind !== "BUSINESS"`. The link list is the convenience; the page guard is
   * the boundary.
   *
   * That rule now holds without exception, which it did not use to. The two
   * entries that bent it are both gone from the hub: Today, hidden from the
   * driver personas with no guard behind it because its contents were never
   * withheld from them, and the Wallet, withheld from a roster driver and
   * since folded into Performance — which every persona sees.
   */
  hiddenFor: readonly HubPersona[];
  /** The 20px page title in the sticky header. */
  title: string;
  /**
   * The 13px muted subhead under the title — the design's copy for this
   * screen, used as the *fallback*.
   *
   * Five of the six are derived at runtime — Performance's selected range and
   * the roster counts on Jobs, Vehicles, Drivers and Employees — so those
   * screens pass their own computed string to the header through
   * `useHubSubtitle()` and this literal is only what renders before their data
   * resolves. Dashboard is the one entry whose subhead really is a constant.
   * The strings are transcribed from the prototype's `pageSub` map so the
   * wording and separator style stay the design's, not ours.
   */
  subtitle: string;
};

/** Stable identifiers for the six screens. */
export type HubNavItemId =
  "loads" | "jobs" | "performance" | "vehicles" | "drivers" | "employees";

/**
 * In rail order, which is the design's with one entry lifted to the front:
 * Dashboard — the load board — comes first because it is where every account
 * lands after signing in, and a rail whose first link is not the screen the
 * router just chose reads as though the user arrived in the wrong place.
 *
 * Drivers and Employees come last, and for the mirror-image reason: they are
 * the only BUSINESS-only entries left, so keeping them at the end means
 * dropping them leaves everything above in an unchanged order.
 *
 * What each persona is left with: an INDEPENDENT and a ROSTER driver get the
 * same four links — Dashboard, My orders, Performance and Vehicles — and a
 * BUSINESS account gets those four plus Drivers and Employees. The two driver
 * personas no longer differ at all here: the Wallet was the one entry withheld
 * from an employed driver, and it has been folded into Performance, which
 * everyone sees. Filtering by `hiddenFor` never reorders what it keeps, which
 * is the property that makes three rails feel like one product.
 */
export const HUB_NAV: readonly HubNavItem[] = [
  {
    // First in the rail, and the entry point the whole hub is routed at:
    // `src/app/dashboard/page.tsx` sends a driver, a company and an admin here
    // alike, and the two persona gates below it bounce to here as well. The
    // design puts the board third, between the driver's wallet and My orders,
    // framing it as where a driver *gets* work; that framing is unchanged, but
    // a link the router always lands on cannot sit third in the list of links
    // to it.
    //
    // `title`/`subtitle` are transcribed from the design's header copy and are
    // both genuinely static — unlike the four entries whose subheads are
    // counts — so the Loads screen registers no `useHubSubtitle()` override and
    // these literals are the whole story.
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
    // "My orders" rather than "Jobs" per the header-alignment handoff
    // (`UI:UX/Registered Driver account (New)/Driver dashboard header
    // alignment/`). Points at the hub's job history and NOT at the client route
    // `/orders`, which hard-rejects any non-CLIENT role
    // (`src/app/orders/page.tsx`) and would simply bounce a driver.
    id: "jobs",
    label: "My orders",
    href: "/dashboard/jobs",
    hiddenFor: [],
    title: "Job history",
    subtitle: "182 jobs in the last 30 days",
  },
  {
    // The hub's one money-and-numbers screen, and every persona's: the Wallet
    // that used to sit above My orders was merged into it, so a driver reads
    // what they earned and how they are driving in one place rather than
    // across two screens that shared a week.
    id: "performance",
    label: "Performance",
    href: "/dashboard/performance",
    hiddenFor: [],
    title: "Performance",
    // The fallback only. The screen carries the Wallet's range selector now
    // that the two are one, and names the range it actually resolved through
    // `useHubSubtitle()`; this literal is what the header shows for the frame
    // before that lands, so it describes the *default* window rather than
    // asserting a fixed one.
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
    // than as a "BUSINESS only" flag — one rule shape across all six entries
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
 * somebody else's roster. No entry above is withheld from `ROSTER` alone any
 * more — the two driver personas see the same four links — so what getting this
 * backwards costs today is the other direction: a fleet owner misfiled as one
 * of their own employees loses Drivers and Employees, the two screens the
 * persona axis exists to protect.
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
