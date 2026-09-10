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
   * link was last drawn. Every entry named here must therefore ALSO be
   * enforced server-side: the screen's own `page.tsx` resolves the account and
   * `redirect("/dashboard/today")`s, and where an API backs the screen the
   * route handler refuses on the same terms. Today `/dashboard/drivers` and
   * `/dashboard/employees` each guard on `kind !== "BUSINESS"`, and
   * `/dashboard/loads` guards the roster case while `GET /api/loads` 403s it.
   * The link list is the convenience; the page guard is the boundary.
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
 * In the design's sidebar order. Drivers and Employees come last because they
 * are the two that disappear for anything but a BUSINESS persona — dropping
 * them leaves the remaining six in an unchanged order.
 *
 * A ROSTER driver additionally loses Load Board and Wallet, which are *not*
 * last and cannot be moved there: the design puts Wallet second and the board
 * third, and reordering the rail per persona would shuffle links under a
 * returning user rather than simply removing two. Filtering by `hiddenFor`
 * preserves the relative order of whatever survives, which is the property
 * that makes per-persona rails feel like the same product.
 */
export const HUB_NAV: readonly HubNavItem[] = [
  {
    id: "today",
    label: "Today",
    href: "/dashboard/today",
    hiddenFor: [],
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
    // Between Earnings/Wallet and Jobs deliberately: the design frames the
    // board as where a driver *gets* work, which reads next to what they are
    // paid and before the history of what they have already run.
    //
    // `title`/`subtitle` are transcribed from the design's header copy and are
    // both genuinely static — unlike four of the other entries, neither is a
    // runtime value — so the Loads screen registers no `useHubSubtitle()`
    // override and these literals are the whole story.
    id: "loads",
    label: "Load Board",
    href: "/dashboard/loads",
    // Withheld from a ROSTER driver. Per
    // `specs/driver-load-board/requirements.md`'s Assumptions, an employed
    // driver receives work through their company's dispatch rather than the
    // open market, so the board is not theirs to browse. Its own server-side
    // guard (`src/app/dashboard/(hub)/loads/page.tsx`) redirects them even if
    // they hand-type the URL, and `GET /api/loads` 403s them; this list only
    // controls the sidebar link.
    hiddenFor: ["ROSTER"],
    title: "Load Board",
    subtitle: "Bookings open to drivers",
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
 * somebody else's roster. Getting this backwards would hide the Load Board —
 * and now the Wallet too — from the one account shape both exist to serve.
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
