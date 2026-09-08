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

import type { HubAccount } from "@/lib/dashboard/hub/account";

/** One sidebar link, and the header copy for the screen behind it. */
export type HubNavItem = {
  /** Stable identifier, so a layout can ask for its own entry by name. */
  id: HubNavItemId;
  /** Sidebar label. */
  label: string;
  href: string;
  /**
   * Business-only screens. This is a *cosmetic* filter: hiding a link does
   * nothing about a hand-typed URL, so `/dashboard/drivers` and
   * `/dashboard/employees` must each also resolve the account kind
   * server-side and `redirect("/dashboard/today")` for an individual driver.
   * The link list is the convenience; the page guard is the boundary.
   */
  businessOnly: boolean;
  /**
   * Hidden for a DRIVER on a company's roster (`DriverProfile.companyId` set).
   *
   * Per `specs/driver-load-board/requirements.md`'s Assumptions: an employed
   * driver receives work through their company's dispatch, not the open
   * market, so the load board is not theirs to browse. The board's own
   * server-side guard (`src/app/dashboard/(hub)/loads/page.tsx`) redirects them
   * away even if they hand-type the URL, and `GET /api/loads` 403s them — this
   * field only controls the sidebar link, exactly the cosmetic-only
   * relationship `businessOnly` above already has to its own page guards.
   *
   * A separate axis from `businessOnly` because it cannot be expressed in
   * terms of it: a roster driver and an independent driver are both
   * `kind: "INDIVIDUAL"`, and the distinction lives on `companyId`.
   *
   * Only `loads` sets this today; every other entry is `false`.
   */
  rosterHidden: boolean;
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
 * are the two that disappear for an individual account — dropping them leaves
 * the remaining five in an unchanged order.
 */
export const HUB_NAV: readonly HubNavItem[] = [
  {
    id: "today",
    label: "Today",
    href: "/dashboard/today",
    businessOnly: false,
    rosterHidden: false,
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
    businessOnly: false,
    rosterHidden: false,
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
    businessOnly: false,
    rosterHidden: true,
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
    businessOnly: false,
    rosterHidden: false,
    title: "Job history",
    subtitle: "182 jobs in the last 30 days",
  },
  {
    id: "performance",
    label: "Performance",
    href: "/dashboard/performance",
    businessOnly: false,
    rosterHidden: false,
    title: "Performance",
    // The one subhead that is genuinely static — it describes the window the
    // screen always uses, not a value inside it.
    subtitle: "Rolling 7-day window",
  },
  {
    id: "vehicles",
    label: "Vehicles",
    href: "/dashboard/vehicles",
    businessOnly: false,
    rosterHidden: false,
    title: "Vehicles",
    subtitle: "7 vehicles registered · 4 on the road, 1 unassigned",
  },
  {
    id: "drivers",
    label: "Drivers",
    href: "/dashboard/drivers",
    businessOnly: true,
    rosterHidden: false,
    title: "Drivers",
    subtitle: "7 registered drivers · 4 online in Tbilisi now",
  },
  {
    id: "employees",
    label: "Employees",
    href: "/dashboard/employees",
    businessOnly: true,
    rosterHidden: false,
    title: "Employees & roles",
    subtitle: "Gizo Cargo LLC · 6 people, 4 roles · 1 invite pending",
  },
];

/**
 * The links this account sees: every entry filtered by `kind` as before, then
 * further filtered by `rosterHidden` for a driver employed on a company's
 * roster.
 *
 * Renamed from `hubNavForKind` (which took only `kind`) because a roster driver
 * and an independent driver are both `kind: "INDIVIDUAL"` — the distinction
 * this function now also has to make lives on `companyId`, which `kind` alone
 * cannot see.
 *
 * **`companyId` alone is not the roster test.** A BUSINESS account's
 * `companyId` names *its own* company and that account must keep every link;
 * only `kind === "INDIVIDUAL" && companyId !== null` is an employed driver on
 * somebody else's roster. Getting this backwards would hide the board from the
 * one account type it exists to serve.
 *
 * Cosmetic only — see `businessOnly` and `rosterHidden` above. The account
 * itself comes from the session (`resolveHubAccount()`), never from a
 * client-side toggle: the prototype's Business/Individual switcher is a
 * prototype affordance and the real header shows a static account-type chip
 * instead.
 */
export function hubNavForAccount(
  account: Pick<HubAccount, "kind" | "companyId">,
): HubNavItem[] {
  const isRosterDriver =
    account.kind === "INDIVIDUAL" && account.companyId !== null;

  return HUB_NAV.filter((item) => {
    if (account.kind !== "BUSINESS" && item.businessOnly) {
      return false;
    }

    if (isRosterDriver && item.rosterHidden) {
      return false;
    }

    return true;
  });
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
