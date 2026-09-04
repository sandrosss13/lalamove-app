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

/** Stable identifiers for the seven screens. */
export type HubNavItemId =
  | "today"
  | "earnings"
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
    title: "Today",
    subtitle: "Saturday 29 August · Tbilisi",
  },
  {
    id: "earnings",
    label: "Earnings",
    href: "/dashboard/earnings",
    businessOnly: false,
    title: "Earnings & payouts",
    subtitle: "24 – 30 August 2026 · next payout Friday 4 September",
  },
  {
    id: "jobs",
    label: "Jobs",
    href: "/dashboard/jobs",
    businessOnly: false,
    title: "Job history",
    subtitle: "182 jobs in the last 30 days",
  },
  {
    id: "performance",
    label: "Performance",
    href: "/dashboard/performance",
    businessOnly: false,
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
    title: "Vehicles",
    subtitle: "7 vehicles registered · 4 on the road, 1 unassigned",
  },
  {
    id: "drivers",
    label: "Drivers",
    href: "/dashboard/drivers",
    businessOnly: true,
    title: "Drivers",
    subtitle: "7 registered drivers · 4 online in Tbilisi now",
  },
  {
    id: "employees",
    label: "Employees",
    href: "/dashboard/employees",
    businessOnly: true,
    title: "Employees & roles",
    subtitle: "Gizo Cargo LLC · 6 people, 4 roles · 1 invite pending",
  },
];

/**
 * The links an account of this kind sees: all seven for a business, the five
 * shared ones for an individual driver.
 *
 * Cosmetic only — see `businessOnly` above. The account kind itself comes from
 * the session (`resolveHubAccount()`), never from a client-side toggle: the
 * prototype's Business/Individual switcher is a prototype affordance and the
 * real header shows a static account-type chip instead.
 */
export function hubNavForKind(kind: "BUSINESS" | "INDIVIDUAL"): HubNavItem[] {
  return HUB_NAV.filter((item) => kind === "BUSINESS" || !item.businessOnly);
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
