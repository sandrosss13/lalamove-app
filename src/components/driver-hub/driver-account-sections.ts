/**
 * The account screen's rail, as data.
 *
 * Modelled on `driver-hub-nav.ts` — the same shape, the same `hiddenFor`
 * persona rule, and the same warning attached to it — because the account rail
 * is the hub's nav problem one level down: a list of destinations, one of which
 * is withheld from a persona, read by both a client rail and a server page that
 * must not disagree about which sections exist.
 *
 * Not merged into `HUB_NAV`: that list is the *sidebar's* eight screens, each
 * with a route and a sticky-header title, and adding five query-string
 * subsections of one screen to it would put five extra links in the hub's left
 * rail. `/dashboard/account` still owes `HUB_NAV` an entry of its own for the
 * sticky header's sake — see the note in `src/app/dashboard/(hub)/account/page.tsx`.
 *
 * The sections are query-string states of a single route rather than five
 * routes. One `page.tsx` resolves one account and one settings payload and then
 * picks a panel, where five sibling routes would each repeat that resolution;
 * and the design draws one screen whose right-hand side swaps, not five pages.
 */

import type { HubPersona } from "@/lib/dashboard/hub/account";

/** Stable identifiers for the five panels. */
export type DriverAccountSectionId =
  "profile" | "payout" | "notifications" | "language" | "support";

/**
 * A message key, written from the catalog root (`"common.shared.profile"`), and
 * resolved where it is rendered with `useTranslations()` / `getTranslations()`
 * called without a namespace. Keys rather than English because this module is
 * plain data shared by a client rail and a server page — neither can have it
 * translated for them here, and the copy must follow the active locale.
 */
export type DriverAccountMessageKey = string;

/** One rail row, and the header copy for the panel behind it. */
export type DriverAccountSection = {
  id: DriverAccountSectionId;
  /** Rail label — the design's own wording — as a message key. */
  labelKey: DriverAccountMessageKey;
  /**
   * The personas this section is withheld from. Empty means everyone sees it.
   *
   * **Cosmetic on its own**, exactly as `HubNavItem.hiddenFor` is: dropping a
   * rail row does nothing about a hand-typed `?section=`. The boundary is
   * `page.tsx`, which redirects a persona that asks for a section named here.
   */
  hiddenFor: readonly HubPersona[];
  /** The panel's `<h1>`, as a message key. */
  titleKey: DriverAccountMessageKey;
  /** The lede under it, as a message key. */
  descriptionKey: DriverAccountMessageKey;
};

/** The query-string key the rail links with and the page reads. */
export const DRIVER_ACCOUNT_SECTION_PARAM = "section";

/**
 * The section a bare `/dashboard/account` opens on. Visible to every persona,
 * which is what makes it a safe fallback for a request this account may not
 * have.
 */
export const DEFAULT_DRIVER_ACCOUNT_SECTION: DriverAccountSectionId = "profile";

/**
 * In the design's rail order (`Driver Header.dc.html`): Profile, Payout & bank
 * details, Notifications, Language, Support. "Log out" is in that list too but
 * is not a section — it is an action, and it lives in the rail component as a
 * button for the same reason `account-sidebar.tsx` keeps it out of its own
 * `NAV_ITEMS`.
 */
export const DRIVER_ACCOUNT_SECTIONS: readonly DriverAccountSection[] = [
  {
    id: "profile",
    labelKey: "common.shared.profile",
    hiddenFor: [],
    titleKey: "common.shared.profile",
    descriptionKey: "driverHub.driverAccountSections.theDetailsAClientSeesWhen",
  },
  {
    id: "payout",
    labelKey: "driverHub.driverAccountSections.payoutBankDetails",
    // Withheld from a ROSTER driver: an employed driver's fares are settled to
    // their employer, so they have no payout account of their own and no
    // payout schedule of their own. Showing them one — even an empty one —
    // would assert that money is on its way to them from us, which is the
    // single most expensive thing this screen could get wrong.
    //
    // This used to be half of a pair with the hub's Wallet, withheld from the
    // same persona on the same reasoning. That half is gone — the Wallet was
    // merged into Performance, which every persona sees — and this one
    // deliberately stayed. `driver-account-payout-panel.tsx` carries the whole
    // of that argument; change the two together or not at all.
    hiddenFor: ["ROSTER"],
    titleKey: "driverHub.driverAccountSections.payoutBankDetails",
    descriptionKey:
      "driverHub.driverAccountSections.whereYourFaresAreSettledAnd",
  },
  {
    id: "notifications",
    labelKey: "common.shared.notifications",
    hiddenFor: [],
    titleKey: "common.shared.notifications",
    descriptionKey:
      "driverHub.driverAccountSections.whichJobPayoutAndAccountEvents",
  },
  {
    id: "language",
    labelKey: "common.shared.language",
    hiddenFor: [],
    titleKey: "common.shared.language",
    descriptionKey:
      "driverHub.driverAccountSections.theLanguageThisDashboardAndYour",
  },
  {
    id: "support",
    labelKey: "common.shared.support",
    hiddenFor: [],
    titleKey: "common.shared.support",
    descriptionKey: "driverHub.driverAccountSections.gettingAPersonToLookAt",
  },
];

/** The sections this account sees, in rail order. */
export function driverAccountSectionsFor(
  persona: HubPersona,
): DriverAccountSection[] {
  return DRIVER_ACCOUNT_SECTIONS.filter(
    (section) => !section.hiddenFor.includes(persona),
  );
}

/**
 * The section entry for an id. Total by construction — every
 * `DriverAccountSectionId` has a row above — so callers get a value rather than
 * an `undefined` they would have to invent copy for.
 */
export function driverAccountSection(
  id: DriverAccountSectionId,
): DriverAccountSection {
  const section = DRIVER_ACCOUNT_SECTIONS.find((entry) => entry.id === id);

  // Unreachable: `DriverAccountSectionId` is the union of the ids above, and
  // TypeScript will not let a caller pass anything else. The throw exists so
  // the return type is not widened to `| undefined` for every call site.
  if (section === undefined) {
    throw new Error(`Unknown driver account section: ${id}`);
  }

  return section;
}

/**
 * Resolves the `?section=` parameter for this persona.
 *
 * Three outcomes, and the caller needs to tell them apart:
 *
 * - **absent or empty** → the default section. A bare `/dashboard/account` is
 *   the rail's first row, not an error.
 * - **a section this persona may see** → that section.
 * - **anything else** — an unknown value, a repeated parameter, or a section
 *   `hiddenFor` this persona — → `null`, meaning the URL asked for something
 *   this account does not have. The page answers that with a redirect rather
 *   than by quietly rendering a different panel under the requested URL.
 */
export function parseDriverAccountSection(
  value: string | string[] | undefined,
  persona: HubPersona,
): DriverAccountSectionId | null {
  if (value === undefined || value === "") {
    return DEFAULT_DRIVER_ACCOUNT_SECTION;
  }

  // `?section=a&section=b` arrives as an array. There is no sensible way to
  // honour two requests at once, so it joins the invalid case.
  if (typeof value !== "string") {
    return null;
  }

  const match = DRIVER_ACCOUNT_SECTIONS.find((entry) => entry.id === value);

  if (match === undefined || match.hiddenFor.includes(persona)) {
    return null;
  }

  return match.id;
}
