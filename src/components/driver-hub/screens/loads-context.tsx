"use client";

import * as React from "react";

import type { HandlingTag } from "@/components/driver-hub/screens/loads-format";
import type { HubAccountKind } from "@/lib/dashboard/hub/account";

/**
 * The load board's one shared state container.
 *
 * Every surface on this screen — the desktop table (task-10), the detail
 * drawer (task-11), the claim dialogs (task-12), the mobile board (task-13),
 * the filter panel and the tab bar — reads from here and nothing else. None of
 * them takes props. That is what lets four agents implement the four Wave 4
 * files simultaneously without any two of them touching the same file, and it
 * is also what stops the same derivation (which rows are visible, how many
 * filters are on) from being computed twice and disagreeing.
 *
 * ## Why the board fetches from the browser instead of being server-rendered
 *
 * Every other hub screen resolves its data in `page.tsx` with a direct
 * `getHub*()` Prisma call. This one does not, for three reasons that are
 * specific to it:
 *
 * 1. Its visible list is a five-stage pipeline (tab → rejected toggle → city /
 *    weight / handling filters → sort) over data that changes under the
 *    driver's feet — another account claiming a row — and that has to be
 *    re-read after every mutation. A server component cannot re-run itself
 *    without a full navigation.
 * 2. Live claim updates (task-14, Wave 5) poll `GET /api/loads` from the
 *    browser regardless. Fetching it the same way on first mount means one code
 *    path builds the board's data instead of two that have to agree.
 * 3. Nothing in `src/app/` has a server component fetch its own API route; every
 *    internal `fetch()` in this codebase is from a `"use client"` component.
 *
 * The cost is a loading state on first paint, which `loads-screen.tsx` renders.
 *
 * ## Why `HubLoad` is redeclared here rather than imported
 *
 * `src/app/api/loads/route.ts` exports `LoadBoardItem` and `LoadBoardResponse`,
 * which are the authoritative contract — but that module opens with `import
 * "server-only"`, and reaching into it from a `"use client"` file to borrow a
 * type invites somebody to later import a *value* from the same path and break
 * the build in a way that is confusing to diagnose. So the shape is restated
 * below, deliberately field-for-field, and the fields this board does not use
 * are dropped rather than carried.
 *
 * **`HubLoad` is a subset of `LoadBoardItem`, never a superset.** If a Wave 4
 * surface needs a field that is not here, check `LoadBoardItem` first: the
 * field probably exists and simply was not copied. Adding one that the endpoint
 * does not return is the failure this note exists to prevent.
 */

/* -------------------------------------------------------------------------- */
/* The wire types                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One row of `GET /api/loads`, as the board consumes it.
 *
 * Mirrors `LoadBoardItem` in `src/app/api/loads/route.ts`. Every timestamp is
 * an ISO string, not a `Date` — this arrives as JSON and `JSON.parse` does not
 * revive dates.
 *
 * **There is no `price` field here and there must never be one.** `driverPayout`
 * and `ratePerKm` are the only money figures on this board; see the money rule
 * in `loads-format.ts`. The endpoint's select never reads the fare columns at
 * all, so the omission is enforced at the query rather than by this type.
 *
 * **There is also no `clientName`.** The board's task file describes one, and
 * the shipped endpoint does not return it: an unclaimed load's payload is
 * deliberately stripped of everything identifying the client, and the stop
 * contact fields below come back `null` on every row the account does not
 * already hold. A surface that wants to name the client can only do so for a
 * `"mine"` row, and only from the contact fields.
 */
export type HubLoad = {
  id: string;
  /** The human-readable `GE-48210` form. Rendered in `font-price` (mono). */
  reference: string;
  /**
   * `"available"` — open, claimable. `"claimed"` — taken by somebody else
   * within the last two minutes; the row stays on the board, greyed, so it does
   * not vanish out from under a driver who has it open. `"mine"` — this
   * account holds it.
   */
  status: "available" | "claimed" | "mine";
  cargoCategory: string;
  description: string | null;
  bodyType: string | null;
  helperCount: number;
  scheduledAt: string | null;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  /** Already a display label ("Tbilisi"), or null when it could not be resolved. */
  pickupCity: string | null;
  /** Already a display label ("Tbilisi"), or null when it could not be resolved. */
  dropoffCity: string | null;
  /** Null on every row this account does not already hold. */
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  pickupContactDetails: string | null;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  dropoffContactDetails: string | null;
  distanceKm: number;
  /**
   * How far the driver is from the pickup. Null whenever it cannot be measured
   * — a stale or absent driver location, an ungeocodable pickup, or a COMPANY
   * session, which has no single location of its own. Never used to filter.
   */
  pickupDistanceKm: number | null;
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  packagingDescription: string | null;
  itemQuantity: string | null;
  /**
   * Raw `CargoHandlingTag` values, in whatever order the booking form appended
   * them. Render them through `sortedHandlingTags()` — never in array order.
   */
  handlingTags: string[];
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryDeadline: string | null;
  /** The driver's 85% share, read from the stored column. Never `Order.price`. */
  driverPayout: number;
  /** `driverPayout` per kilometre; null when the trip has no distance. */
  ratePerKm: number | null;
  serviceLevel: string;
  /**
   * The vehicle class the client booked and paid for. A driver's claim must
   * name a vehicle of exactly this class — see `confirmClaim` below, which uses
   * it to pick one.
   */
  vehicleTypeSpecId: string;
  driverId: string | null;
  companyId: string | null;
  vehicleId: string | null;
  createdAt: string;
  /** The claim instant on a `"claimed"` row; "N min ago" is derived from it. */
  updatedAt: string;
};

/**
 * The envelope `GET /api/loads` returns, verbatim.
 *
 * Note the key names: `available` / `mine` / `rejected`, **not** the
 * `loads` / `rejectedLoads` pair this task's spec guessed at before the
 * endpoint shipped. `mine` is a separate array rather than a status filter over
 * one list, which is why the tab switch below selects an array instead of
 * filtering one.
 */
type LoadsApiResponse = {
  available: HubLoad[];
  mine: HubLoad[];
  rejected: HubLoad[];
  hiddenByCapacityCount: number;
};

/* -------------------------------------------------------------------------- */
/* Client state vocabulary                                                    */
/* -------------------------------------------------------------------------- */

export type LoadsTab = "available" | "mine";

/**
 * The sortable columns.
 *
 * `"payout"` is deliberately not called `"price"` — which is what the design's
 * own state table calls it. The key selects `HubLoad.driverPayout`, and
 * `price` is the one word on this feature that must never label anything a
 * driver sees or that a reviewer skims past. The *column header* Wave 4 renders
 * may still read "Price"; only this internal key changes.
 */
export type LoadsSortKey =
  "route" | "window" | "cargo" | "helpers" | "weight" | "payout";

export type LoadsSortDirection = "asc" | "desc";

/** The sentinel both city selects use for "no filter". */
export const ALL_CITIES = "All cities";

/** The weight slider's ceiling, and therefore its "no filter" value. */
export const MAX_WEIGHT_FILTER_KG = 1200;

/** The weight slider's floor and step, shared with the filter panel. */
export const MIN_WEIGHT_FILTER_KG = 100;
export const WEIGHT_FILTER_STEP_KG = 50;

/**
 * The one vehicle fact `confirmClaim` needs about the signed-in driver.
 *
 * Resolved server-side in `loads/page.tsx` and handed down, rather than fetched
 * here: it is a property of the *account*, not of the board, and `GET
 * /api/loads` describes loads only. Empty for a BUSINESS account, which claims
 * with its company identity and names a vehicle later at dispatch.
 */
export type LoadsClaimVehicle = {
  id: string;
  vehicleTypeSpecId: string;
};

/**
 * A claim that did not go through, in the shape the dialogs need to explain it.
 *
 * `code` is the machine-readable discriminator the two claim endpoints set on
 * the two failures a driver can act on — `"DRIVER_OFFLINE"` (403; the remedy is
 * "go online and retry") and `"ALREADY_CLAIMED"` (409, which is routed to
 * `lostLoad` instead of here). Everything else arrives as a bare `{ error }`
 * with `code: null`, and the message is all there is to show.
 */
export type LoadsClaimError = {
  message: string;
  code: string | null;
};

/* -------------------------------------------------------------------------- */
/* The context value                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Everything the board's surfaces may read or call.
 *
 * Wave 4 treats this as a read-only contract: task-10 through task-13 import
 * `useLoadsBoard()` and use what is here. If one of them needs something this
 * value does not expose, that is a change to *this* file and therefore a
 * conversation, not a local edit — two agents editing this file concurrently is
 * exactly the failure the wave split exists to prevent.
 */
export type LoadsBoardValue = {
  /* --- server state --------------------------------------------------- */
  isLoading: boolean;
  loadError: string | null;
  /** Re-reads `GET /api/loads`. Also what task-14's poll will call. */
  refetch: () => Promise<void>;
  hiddenByCapacityCount: number;

  /* --- tabs and filters ------------------------------------------------ */
  tab: LoadsTab;
  setTab: (tab: LoadsTab) => void;
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  fPickup: string;
  setFPickup: (city: string) => void;
  fDrop: string;
  setFDrop: (city: string) => void;
  fWeight: number;
  setFWeight: (weightKg: number) => void;
  fTags: HandlingTag[];
  toggleTag: (tag: HandlingTag) => void;
  resetFilters: () => void;
  /** Cities present on the rows currently in view, sorted, without duplicates. */
  pickupCityOptions: string[];
  dropCityOptions: string[];
  /** How many of the four filter controls are off their default. 0 hides the badge. */
  activeFilterCount: number;

  /* --- sorting ---------------------------------------------------------- */
  sortKey: LoadsSortKey;
  sortDir: LoadsSortDirection;
  /** Sorts by `key`, or flips the direction when `key` is already active. */
  setSort: (key: LoadsSortKey) => void;

  /* --- the rejected sub-view ------------------------------------------- */
  showRejected: boolean;
  setShowRejected: (show: boolean) => void;

  /* --- selection and dialogs ------------------------------------------- */
  selectedId: string | null;
  selectedLoad: HubLoad | null;
  selectLoad: (id: string | null) => void;
  dialogId: string | null;
  dialogLoad: HubLoad | null;
  openConfirm: (id: string) => void;
  closeConfirm: () => void;
  /**
   * The load this account just lost a race for. Carries `reference` rather than
   * only an id because the dialog names the load, and by the time this is set
   * the row may already be gone from `available`.
   */
  lostLoad: { id: string; reference: string } | null;
  closeLost: () => void;

  /* --- mutations -------------------------------------------------------- */
  confirmClaim: () => Promise<void>;
  /** True while a claim is in flight — disables the confirm button. */
  isClaiming: boolean;
  /** A claim that failed for a reason other than losing the race. */
  claimError: LoadsClaimError | null;
  dismissClaimError: () => void;
  reject: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  /** The load id whose reject/restore is in flight, or null. */
  pendingActionId: string | null;
  /** The last reject/restore failure, in plain words. */
  actionError: string | null;

  /* --- counts ----------------------------------------------------------- */
  /**
   * Tab-bar counts. Derived from the raw arrays, **not** from `visibleLoads` —
   * the counts must not shrink just because a filter is on, matching how the
   * Jobs screen's `counts.all` stays independent of its own visible-row count.
   */
  availableCount: number;
  mineCount: number;
  rejectedCount: number;

  /* --- the derived list every surface renders --------------------------- */
  visibleLoads: HubLoad[];
};

const LoadsBoardContext = React.createContext<LoadsBoardValue | null>(null);

/* -------------------------------------------------------------------------- */
/* Sorting                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The value each sort key reads, as either a string or a number, with `null`
 * meaning "this load cannot be ordered on this axis".
 *
 * Written as one function rather than six comparators so the null handling in
 * `compareLoads` is stated once. Every key that can be null is nullable on
 * `HubLoad` for a real reason — a legacy order with no declared weight, a
 * booking with no pickup window, a stop the geocoder could not place.
 */
function sortValueOf(load: HubLoad, key: LoadsSortKey): string | number | null {
  switch (key) {
    case "route":
      return load.pickupCity;
    case "window":
      return load.pickupWindowStart;
    case "cargo":
      return load.cargoCategory;
    case "helpers":
      return load.helperCount;
    case "weight":
      return load.cargoWeightKg;
    case "payout":
      return load.driverPayout;
  }
}

/**
 * Compare two loads on the active key and direction, **with nulls always last**
 * regardless of direction.
 *
 * The direction-independence is the point. Flipping a `desc` sort would
 * otherwise float every load with an unknown weight to the top of the table —
 * rows the driver knows least about occupying the position reserved for the
 * ones that matter most. "Unknown sorts to the bottom" is true of both
 * directions, which is what makes the column readable either way.
 *
 * ISO timestamps are compared as strings on purpose: they are fixed-width and
 * UTC-normalised (`Date.toISOString()`), so lexical order *is* chronological
 * order and there is no parse to get wrong.
 */
function compareLoads(
  a: HubLoad,
  b: HubLoad,
  key: LoadsSortKey,
  direction: LoadsSortDirection,
): number {
  const left = sortValueOf(a, key);
  const right = sortValueOf(b, key);

  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }

  const ordered =
    typeof left === "string" && typeof right === "string"
      ? left.localeCompare(right)
      : Number(left) - Number(right);

  return direction === "asc" ? ordered : -ordered;
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

export type LoadsProviderProps = {
  /**
   * Which claim endpoint `confirmClaim` calls. The two are genuinely different
   * operations, not one endpoint with a role check: a driver's accept names a
   * vehicle and assigns the order to them, a company's claim names no vehicle
   * at all and leaves the order in `CLAIMED` awaiting dispatch.
   */
  accountKind: HubAccountKind;
  /**
   * The signed-in driver's registered vehicles, id and class only. Empty for a
   * BUSINESS account.
   */
  claimVehicles: readonly LoadsClaimVehicle[];
  children: React.ReactNode;
};

export function LoadsProvider({
  accountKind,
  claimVehicles,
  children,
}: LoadsProviderProps) {
  /* --- server state ------------------------------------------------------ */

  const [available, setAvailable] = React.useState<HubLoad[]>([]);
  const [mine, setMine] = React.useState<HubLoad[]>([]);
  const [rejected, setRejected] = React.useState<HubLoad[]>([]);
  const [hiddenByCapacityCount, setHiddenByCapacityCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const refetch = React.useCallback(async () => {
    setLoadError(null);

    try {
      const response = await fetch("/api/loads");

      if (!response.ok) {
        // Every failure of this endpoint answers with `{ error }` — a 401, the
        // temporary-password 403, the wrong-role 403, the roster-driver 403 —
        // and each of those messages is written for a person to read, so it is
        // shown rather than replaced with a generic string. The status code is
        // the fallback for a body that is not the expected shape.
        const body = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;

        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `The load board is unavailable (HTTP ${response.status}).`,
        );
      }

      const data = (await response.json()) as LoadsApiResponse;

      setAvailable(data.available);
      setMine(data.mine);
      setRejected(data.rejected);
      setHiddenByCapacityCount(data.hiddenByCapacityCount);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Couldn't reach the load board.",
      );
    } finally {
      // In `finally` rather than in the success branch so a failed first fetch
      // still leaves the loading placeholder and shows the error, instead of
      // spinning forever.
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refetch();
  }, [refetch]);

  /* --- client state ------------------------------------------------------ */

  const [tab, setTabState] = React.useState<LoadsTab>("available");
  const [filtersOpen, setFiltersOpen] = React.useState(true);
  const [fPickup, setFPickup] = React.useState(ALL_CITIES);
  const [fDrop, setFDrop] = React.useState(ALL_CITIES);
  const [fWeight, setFWeight] = React.useState(MAX_WEIGHT_FILTER_KG);
  const [fTags, setFTags] = React.useState<HandlingTag[]>([]);

  // The default sort is payout, descending — per the approved design, and a
  // known tradeoff rather than an oversight. It puts the highest-paying load at
  // the top of every driver's board while a cheap, nearby job sits unclaimed at
  // the bottom: cherry-picking, encoded as the default view. Neither Uber nor
  // Lalamove sorts an open-job list by pay, for exactly this reason. It is
  // implemented as designed; flipping it to pickup proximity is a change to
  // these two lines and nothing else, and is tracked in
  // specs/driver-load-board/action-required.md ("Reconsider the default table
  // sort").
  const [sortKey, setSortKey] = React.useState<LoadsSortKey>("payout");
  const [sortDir, setSortDir] = React.useState<LoadsSortDirection>("desc");

  const [showRejected, setShowRejectedState] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dialogId, setDialogId] = React.useState<string | null>(null);
  const [lostLoad, setLostLoad] = React.useState<{
    id: string;
    reference: string;
  } | null>(null);
  const [isClaiming, setIsClaiming] = React.useState(false);
  const [claimError, setClaimError] = React.useState<LoadsClaimError | null>(
    null,
  );
  const [pendingActionId, setPendingActionId] = React.useState<string | null>(
    null,
  );
  const [actionError, setActionError] = React.useState<string | null>(null);

  /* --- the derived pipeline ---------------------------------------------- */

  /**
   * Stage 1 — which array the board is looking at.
   *
   * The rejected sub-view wins over the tab, because it is a different question
   * ("what have I hidden?") rather than a third tab. Otherwise the tab selects
   * an array directly: `available` already contains both open rows and the
   * transiently `"claimed"`-by-someone-else ones the design keeps on screen at
   * `opacity-60`, and `mine` is its own array. No status filtering is needed
   * here at all — the endpoint already partitioned them.
   */
  const baseLoads = React.useMemo(() => {
    if (showRejected) {
      return rejected;
    }

    return tab === "mine" ? mine : available;
  }, [available, mine, rejected, showRejected, tab]);

  /**
   * The two city dropdowns' options: only cities that actually appear on the
   * rows currently in view, sorted, `null`s dropped.
   *
   * Derived from `baseLoads` rather than from every array at once, per the
   * design's "options = 'All cities' + unique pickup cities" — a dropdown that
   * offers a city with zero rows behind it is a dead end. The tradeoff is that
   * switching tabs can strand a selected city that exists in neither list; the
   * filter then matches nothing and Reset recovers it, which is a visible,
   * self-explaining state rather than a silent one.
   *
   * A `null` city cannot be filtered on — there is no value to compare against
   * — so those rows are unreachable through this control and always pass it.
   */
  const pickupCityOptions = React.useMemo(
    () => uniqueSortedCities(baseLoads, "pickupCity"),
    [baseLoads],
  );

  const dropCityOptions = React.useMemo(
    () => uniqueSortedCities(baseLoads, "dropoffCity"),
    [baseLoads],
  );

  /**
   * Stages 2–5 — city, weight and handling filters, then the sort.
   *
   * The order is the design's and it matters for nothing but cost: filtering
   * before sorting means the comparator runs over the smaller set.
   */
  const visibleLoads = React.useMemo(() => {
    const filtered = baseLoads.filter((load) => {
      // Exact string equality, per the design. Both sides are already
      // `formatCity()`-humanised by the endpoint, so there is no casing or
      // enum-vs-label mismatch to guard against.
      if (fPickup !== ALL_CITIES && load.pickupCity !== fPickup) {
        return false;
      }

      if (fDrop !== ALL_CITIES && load.dropoffCity !== fDrop) {
        return false;
      }

      // An undeclared weight passes. Defensive rather than load-bearing: the
      // server-side fit filter resolves unknown dimensions to "does not fit"
      // and withholds those loads already, so in practice nothing reaches here
      // with a null weight. Excluding them instead would mean a slider at its
      // maximum — nominally "no filter" — silently removing rows.
      if (load.cargoWeightKg !== null && load.cargoWeightKg > fWeight) {
        return false;
      }

      // AND semantics, per the design: selecting Fragile *and* Hazmat asks for
      // loads that are both, not either. `every` over an empty selection is
      // vacuously true, which is the no-filter case.
      return fTags.every((tag) => load.handlingTags.includes(tag));
    });

    // `filter` already returned a fresh array, so sorting it in place cannot
    // mutate the state arrays this derives from.
    return filtered.sort((a, b) => compareLoads(a, b, sortKey, sortDir));
  }, [baseLoads, fDrop, fPickup, fTags, fWeight, sortDir, sortKey]);

  /**
   * How many of the four filter controls are off their default.
   *
   * Counts *controls*, not selections: three handling chips lit is one active
   * filter, not three, because the badge answers "how much of the board am I
   * hiding" and the panel below it answers "how". Maximum 4.
   */
  const activeFilterCount = React.useMemo(() => {
    let count = 0;

    if (fPickup !== ALL_CITIES) count += 1;
    if (fDrop !== ALL_CITIES) count += 1;
    if (fWeight !== MAX_WEIGHT_FILTER_KG) count += 1;
    if (fTags.length > 0) count += 1;

    return count;
  }, [fDrop, fPickup, fTags, fWeight]);

  /**
   * Tab-bar counts, over the raw arrays.
   *
   * `availableCount` counts only genuinely open rows, excluding the
   * `"claimed"`-by-someone-else ones that `available` also carries for the
   * two-minute grey-out window: the number beside "Available loads" is read as
   * "how much work is on offer", and a row somebody else already took is not.
   */
  const availableCount = React.useMemo(
    () => available.filter((load) => load.status === "available").length,
    [available],
  );

  // Bound to locals rather than read as `mine.length` inside the memo's
  // dependency array below: a member expression there is opaque to the
  // exhaustive-deps lint rule, which then asks for the whole array instead.
  const mineCount = mine.length;
  const rejectedCount = rejected.length;

  /* --- selection --------------------------------------------------------- */

  /**
   * The selected and dialog rows, resolved by id against every array rather
   * than against `visibleLoads`.
   *
   * Deliberate: a drawer open on a row that a filter change has just hidden
   * should stay open showing that row, not blank itself. The id is the state;
   * the row is a lookup.
   */
  const findLoad = React.useCallback(
    (id: string | null): HubLoad | null => {
      if (id === null) {
        return null;
      }

      return (
        available.find((load) => load.id === id) ??
        mine.find((load) => load.id === id) ??
        rejected.find((load) => load.id === id) ??
        null
      );
    },
    [available, mine, rejected],
  );

  const selectedLoad = findLoad(selectedId);
  const dialogLoad = findLoad(dialogId);

  /* --- setters that own a side effect ------------------------------------ */

  /**
   * Switching tabs or entering the rejected sub-view clears the selection.
   *
   * A drawer left open on a row from the list you just navigated away from is a
   * detail panel describing something that is no longer on screen — the one
   * case where keeping the selection (see `findLoad`) stops being helpful.
   */
  const setTab = React.useCallback((next: LoadsTab) => {
    setTabState(next);
    setSelectedId(null);
  }, []);

  const setShowRejected = React.useCallback((next: boolean) => {
    setShowRejectedState(next);
    setSelectedId(null);
  }, []);

  const toggleTag = React.useCallback((tag: HandlingTag) => {
    setFTags((current) =>
      current.includes(tag)
        ? current.filter((value) => value !== tag)
        : [...current, tag],
    );
  }, []);

  const resetFilters = React.useCallback(() => {
    setFPickup(ALL_CITIES);
    setFDrop(ALL_CITIES);
    setFWeight(MAX_WEIGHT_FILTER_KG);
    setFTags([]);
  }, []);

  /**
   * Clicking the active column sorts the other way; clicking a new one sorts by
   * it, descending.
   *
   * Descending rather than ascending for a newly chosen column because every
   * key here is one where "most" is the interesting end — the biggest payout,
   * the heaviest load, the most helpers, the latest window.
   */
  const setSort = React.useCallback(
    (key: LoadsSortKey) => {
      // Written against `sortKey` from the closure rather than as a nested
      // updater: an updater function must stay pure, and React may invoke it
      // twice, so calling `setSortDir` from inside `setSortKey`'s updater would
      // flip the direction an unpredictable number of times in StrictMode.
      if (key === sortKey) {
        setSortDir((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }

      setSortKey(key);
      setSortDir("desc");
    },
    [sortKey],
  );

  const selectLoad = React.useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const openConfirm = React.useCallback((id: string) => {
    setDialogId(id);
    // Any error from a previous attempt belongs to that attempt. Clearing it
    // here rather than on close means re-opening the dialog after a failure
    // shows the confirm state, not a stale complaint.
    setClaimError(null);
  }, []);

  const closeConfirm = React.useCallback(() => {
    setDialogId(null);
  }, []);

  const closeLost = React.useCallback(() => {
    setLostLoad(null);
  }, []);

  const dismissClaimError = React.useCallback(() => {
    setClaimError(null);
  }, []);

  /* --- mutations ---------------------------------------------------------- */

  /**
   * Claim the load the confirm dialog is open on.
   *
   * Two endpoints, because the two operations differ in what they record:
   *
   * - A **driver** calls `POST /api/orders/[id]/accept` with `{ vehicleId }`.
   *   The vehicle is required and its class must equal the order's — that is
   *   the commercial contract the client paid for, and the route refuses a
   *   mismatch — so the vehicle is chosen here by matching
   *   `HubLoad.vehicleTypeSpecId` against the driver's registered fleet. If the
   *   driver somehow has no vehicle of that class, the load should never have
   *   been on their board (the endpoint's own eligibility filter drops
   *   wrong-class loads), so this is reported as a state error rather than sent
   *   to the server to be refused.
   * - A **company** calls `POST /api/logistics-company/orders/[id]/claim` with
   *   no body at all. Which truck fulfils it is a dispatch decision made later;
   *   pinning one at claim time would only go stale while the order waits.
   *
   * Three outcomes, and each is a different piece of state:
   *
   * - Success → re-read the board, move to the "My loads" tab (the load is now
   *   there and nowhere else), close the dialog.
   * - `409` → this request lost the race. The dialog closes and `lostLoad` opens
   *   the dedicated "just claimed" dialog, named from the `reference` the
   *   endpoint returns for exactly this purpose.
   * - Anything else → `claimError`, carrying the endpoint's own message and its
   *   `code` where it set one. `"DRIVER_OFFLINE"` is the one worth branching on:
   *   it is recoverable, and the remedy is the availability toggle already in
   *   the header.
   */
  const confirmClaim = React.useCallback(async () => {
    const load = dialogLoad;

    if (load === null || isClaiming) {
      return;
    }

    setIsClaiming(true);
    setClaimError(null);

    try {
      let response: Response;

      if (accountKind === "BUSINESS") {
        response = await fetch(
          `/api/logistics-company/orders/${load.id}/claim`,
          { method: "POST" },
        );
      } else {
        const vehicle = claimVehicles.find(
          (candidate) => candidate.vehicleTypeSpecId === load.vehicleTypeSpecId,
        );

        if (vehicle === undefined) {
          setClaimError({
            message:
              "You have no registered vehicle of the type this delivery requires.",
            code: null,
          });
          return;
        }

        response = await fetch(`/api/orders/${load.id}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vehicleId: vehicle.id }),
        });
      }

      if (response.ok) {
        setDialogId(null);
        setTab("mine");
        await refetch();
        return;
      }

      const body = (await response.json().catch(() => null)) as {
        error?: unknown;
        code?: unknown;
        reference?: unknown;
      } | null;

      if (response.status === 409 && body?.code === "ALREADY_CLAIMED") {
        setDialogId(null);
        setLostLoad({
          id: load.id,
          // The endpoint returns the reference for this dialog; the row's own
          // copy is the fallback, and the two are the same immutable string.
          reference:
            typeof body.reference === "string"
              ? body.reference
              : load.reference,
        });
        // The row's state has changed for everyone, so the board is stale even
        // though this request failed.
        await refetch();
        return;
      }

      setClaimError({
        message:
          typeof body?.error === "string"
            ? body.error
            : `Couldn't claim this load (HTTP ${response.status}).`,
        code: typeof body?.code === "string" ? body.code : null,
      });
    } catch {
      setClaimError({
        message: "Couldn't reach the server. Check your connection and retry.",
        code: null,
      });
    } finally {
      setIsClaiming(false);
    }
  }, [accountKind, claimVehicles, dialogLoad, isClaiming, refetch, setTab]);

  /**
   * Hide a load from this account's board, or put a hidden one back.
   *
   * Both re-read the whole board on success rather than patching the local
   * arrays. A rejection moves a row between `available` and `rejected` *and*
   * changes `hiddenByCapacityCount`'s denominator, and hand-maintaining three
   * pieces of state that the server can hand back consistently in one request
   * is how they drift apart. Optimistic updates are a plausible refinement, not
   * a requirement here.
   *
   * Written as one implementation behind two names because the only difference
   * is the HTTP verb — `POST` hides, `DELETE` restores, same path.
   */
  const setRejection = React.useCallback(
    async (id: string, method: "POST" | "DELETE") => {
      if (pendingActionId !== null) {
        return;
      }

      setPendingActionId(id);
      setActionError(null);

      try {
        const response = await fetch(`/api/loads/${id}/reject`, { method });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: unknown;
          } | null;

          setActionError(
            typeof body?.error === "string"
              ? body.error
              : `That didn't go through (HTTP ${response.status}).`,
          );
          return;
        }

        // A rejected row leaves the list it was selected from; leaving the
        // drawer open on it would describe a row nothing shows any more.
        setSelectedId((current) => (current === id ? null : current));
        await refetch();
      } catch {
        setActionError(
          "Couldn't reach the server. Check your connection and retry.",
        );
      } finally {
        setPendingActionId(null);
      }
    },
    [pendingActionId, refetch],
  );

  const reject = React.useCallback(
    (id: string) => setRejection(id, "POST"),
    [setRejection],
  );

  const restore = React.useCallback(
    (id: string) => setRejection(id, "DELETE"),
    [setRejection],
  );

  /* --- the value ---------------------------------------------------------- */

  const value = React.useMemo<LoadsBoardValue>(
    () => ({
      isLoading,
      loadError,
      refetch,
      hiddenByCapacityCount,
      tab,
      setTab,
      filtersOpen,
      setFiltersOpen,
      fPickup,
      setFPickup,
      fDrop,
      setFDrop,
      fWeight,
      setFWeight,
      fTags,
      toggleTag,
      resetFilters,
      pickupCityOptions,
      dropCityOptions,
      activeFilterCount,
      sortKey,
      sortDir,
      setSort,
      showRejected,
      setShowRejected,
      selectedId,
      selectedLoad,
      selectLoad,
      dialogId,
      dialogLoad,
      openConfirm,
      closeConfirm,
      lostLoad,
      closeLost,
      confirmClaim,
      isClaiming,
      claimError,
      dismissClaimError,
      reject,
      restore,
      pendingActionId,
      actionError,
      availableCount,
      mineCount,
      rejectedCount,
      visibleLoads,
    }),
    [
      activeFilterCount,
      actionError,
      availableCount,
      claimError,
      closeConfirm,
      closeLost,
      confirmClaim,
      dialogId,
      dialogLoad,
      dismissClaimError,
      dropCityOptions,
      fDrop,
      fPickup,
      fTags,
      fWeight,
      filtersOpen,
      hiddenByCapacityCount,
      isClaiming,
      isLoading,
      loadError,
      lostLoad,
      mineCount,
      openConfirm,
      pendingActionId,
      pickupCityOptions,
      refetch,
      reject,
      rejectedCount,
      resetFilters,
      restore,
      selectLoad,
      selectedId,
      selectedLoad,
      setShowRejected,
      setSort,
      setTab,
      showRejected,
      sortDir,
      sortKey,
      tab,
      toggleTag,
      visibleLoads,
    ],
  );

  return (
    <LoadsBoardContext.Provider value={value}>
      {children}
    </LoadsBoardContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The board's only public entry point. Every surface calls this and takes no
 * props of its own.
 *
 * Throws outside the provider rather than returning a null-ish default: a
 * silently empty board is a bug that ships, and the four Wave 4 files are
 * mounted by exactly one screen.
 */
export function useLoadsBoard(): LoadsBoardValue {
  const context = React.useContext(LoadsBoardContext);

  if (context === null) {
    throw new Error(
      "useLoadsBoard must be used within <LoadsProvider> — see " +
        "src/components/driver-hub/screens/loads-screen.tsx.",
    );
  }

  return context;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The distinct, non-null values of one city field across a set of loads,
 * alphabetised with `localeCompare` so "Tbilisi" and "Telavi" order the way a
 * reader expects rather than by code point.
 */
function uniqueSortedCities(
  loads: readonly HubLoad[],
  key: "pickupCity" | "dropoffCity",
): string[] {
  const cities = new Set<string>();

  for (const load of loads) {
    const city = load[key];

    if (city !== null) {
      cities.add(city);
    }
  }

  return Array.from(cities).sort((a, b) => a.localeCompare(b));
}
