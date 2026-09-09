"use client";

import * as React from "react";

import type { HandlingTag } from "@/components/driver-hub/screens/loads-format";
import type { HubAccountKind } from "@/lib/dashboard/hub/account";
import {
  specCapability,
  type SpecCapacitySlice,
} from "@/lib/orders/booking-fit";
import {
  meetsBookedClass,
  offersBodyType,
} from "@/lib/orders/class-substitution";
import { capabilityOf, type VehicleCapability } from "@/lib/orders/vehicle-fit";

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
 * 2. Live claim updates poll `GET /api/loads` from the browser every
 *    `LOADS_POLL_INTERVAL_MS` regardless. Fetching it the same way on first
 *    mount means one code path builds the board's data instead of two that have
 *    to agree.
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
   *
   * `"claimed"` is the one value the client also writes for itself. The
   * endpoint's two-minute window is the primary mechanism, but a row can still
   * drop out of the response while a driver is looking at it — the window
   * lapses, or the order is cancelled outright — and `applyBoard` below then
   * synthesises the same greyed state for `CLAIMED_DWELL_MS` rather than
   * letting the row blink out. Both paths land on this one value, so every
   * surface has exactly one "somebody else has this" treatment to render.
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
   * The vehicle class the client booked and paid for — **a floor, not an
   * identity**.
   *
   * A driver's claim must name a vehicle that meets or beats this class on all
   * four capacity axes and offers `bodyType`; it does not have to be a vehicle
   * *of* this class, and requiring one was the bug
   * `src/lib/orders/class-substitution.ts` exists to describe. This id is
   * therefore never compared for equality with a vehicle's class: it is a key
   * into the class catalogue, looked up for the four capacity figures that make
   * up the floor. See `claimCandidatesFor` below.
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
/* Live updates                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How often the board re-reads `GET /api/loads` while the tab is visible.
 *
 * **Flagged for review in `specs/driver-load-board/action-required.md`** — read
 * that file's "Watch the live-update poll interval" item before tuning this.
 * Ten seconds is a considered default, not a settled constant: it wants
 * checking against real driver behaviour and against Supabase connection
 * limits, and the same item records Supabase Realtime as the documented upgrade
 * path if polling turns out to be too coarse or too expensive.
 *
 * Plain polling rather than Realtime for v1, despite `@supabase/supabase-js`
 * already being a dependency (used today only for signed uploads, in
 * `src/lib/supabase-browser-client.ts`). Realtime would need a Postgres
 * publication on `Order`, a channel lifecycle and a reconnect story the board
 * does not have; this needs none of that and is retuned or backed out by
 * changing one number. Twice as slow as `order-tracking-map.tsx`'s five-second
 * poll on purpose: that screen has one or two viewers per order, whereas every
 * eligible driver can have this board open at once, so the per-open-tab cost is
 * the figure that matters here.
 */
const LOADS_POLL_INTERVAL_MS = 10_000;

/**
 * How long a row that has dropped out of the response entirely is still shown,
 * greyed, as `"claimed"` before the board lets it go.
 *
 * This is a floor beneath the endpoint's own window, not a replacement for it.
 * `GET /api/loads` already keeps a freshly-claimed load in `available` with
 * `status: "claimed"` for `CLAIMED_VISIBILITY_WINDOW_MS` (two minutes — see
 * `src/app/api/loads/route.ts`, which asks the live-update work not to guess a
 * number incompatible with its own). That covers the ordinary case, and this
 * constant covers the ones it cannot: a row whose two minutes lapse while the
 * driver is still reading it, and an order that leaves the board for a reason
 * other than a claim — cancelled by the client, say — with no transitional
 * status to hand back at all.
 *
 * Twenty seconds because the point is only to turn a disappearance into a
 * visible transition. A row held past its dwell is one the driver has already
 * seen go grey; holding it longer would leave stale rows on a board whose whole
 * value is being current. Holding it *while it is open* is unbounded and
 * deliberate — see `applyBoard`.
 */
const CLAIMED_DWELL_MS = 20_000;

/**
 * How often the board re-measures "now" for its relative-time labels.
 *
 * A minute because that is the finest bucket `formatRelativeAgo` resolves —
 * "just now", then whole minutes, then hours — so a faster tick would re-render
 * every relative label on the board to print the identical string, and a slower
 * one would leave "4 min ago" standing while it became five.
 *
 * Independent of `LOADS_POLL_INTERVAL_MS` on purpose. The poll answers "has this
 * row changed"; this answers "how long ago was that", and a load's age goes on
 * increasing on a board the poll finds nothing new in. Tying the labels to the
 * fetch would freeze them for as long as the tab is hidden, which is exactly
 * when a driver comes back to a board wanting to know how stale it is.
 */
const CLOCK_TICK_MS = 60_000;

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
 *
 * `"fromYou"` orders by `pickupDistanceKm` — how far the pick-up is from the
 * driver right now, the table's own addition to the approved design. It is the
 * one nullable axis here, and `compareLoads` puts nulls last in **both**
 * directions: a driver asking for "closest first" must not get the rows whose
 * distance is unknown at the top of the list.
 */
export type LoadsSortKey =
  "route" | "fromYou" | "window" | "cargo" | "helpers" | "weight" | "payout";

export type LoadsSortDirection = "asc" | "desc";

/** The sentinel both city selects use for "no filter". */
export const ALL_CITIES = "All cities";

/** The weight slider's ceiling, and therefore its "no filter" value. */
export const MAX_WEIGHT_FILTER_KG = 1200;

/** The weight slider's floor and step, shared with the filter panel. */
export const MIN_WEIGHT_FILTER_KG = 100;
export const WEIGHT_FILTER_STEP_KG = 50;

/**
 * One of the signed-in driver's registered vehicles, in the shape the claim
 * rule and the confirm dialog's picker both need.
 *
 * Resolved server-side in `loads/page.tsx` and handed down, rather than fetched
 * here: it is a property of the *account*, not of the board, and `GET
 * /api/loads` describes loads only. Empty for a BUSINESS account, which claims
 * with its company identity and names a vehicle later at dispatch.
 *
 * **This used to be `{ id, vehicleTypeSpecId }` and nothing else**, because the
 * board picked a claim vehicle by comparing that id to the order's for equality.
 * The class id is gone entirely; what replaced it is everything
 * `capabilityOf(vehicle, vehicle.vehicleTypeSpec)` reads — the driver's own
 * declared figures, nullable per field, with the class catalogue behind them —
 * plus the class's `bodyTypes`, which no amount of capacity substitutes for.
 *
 * The field names deliberately mirror the Prisma selects in
 * `POST /api/orders/[id]/accept` and `GET /api/loads`, down to the nested
 * `vehicleTypeSpec`, so the same `capabilityOf` call reads identically on both
 * sides of the wire.
 */
export type LoadsClaimVehicle = {
  id: string;
  /** For the picker only. What a driver calls the truck; a cuid is not. */
  plateNumber: string;
  /**
   * The driver's own declared capacity, nullable per field — a specific truck
   * may be bigger or smaller than its class average, and a driver may have
   * declared some, all or none of these. `capabilityOf` resolves each one
   * against the spec below independently; never read them raw.
   */
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  vehicleTypeSpec: {
    /** For the picker only ("Minivan"). */
    label: string;
    maxPayloadKg: number;
    cargoLengthM: number;
    cargoWidthM: number;
    /**
     * **`0` is the open-bed sentinel, not a zero-height hold.** Only
     * `capabilityOf` translates it to `Infinity`; comparing this column
     * directly would make a flatbed the least capable vehicle on the platform
     * rather than the most. See `src/lib/orders/vehicle-fit.ts`.
     */
    cargoHeightM: number;
    /**
     * Which load spaces this vehicle's *class* offers, as raw `ChassisType`
     * strings. Typed `readonly string[]` rather than `ChassisType[]` because
     * that is what `offersBodyType` takes, and taking it keeps the generated
     * Prisma client out of this client bundle.
     */
    bodyTypes: readonly string[];
  };
};

/**
 * One row of the vehicle-class catalogue, as the board consumes it: an id and
 * the four capacity columns a booked class's floor is built from.
 *
 * `SpecCapacitySlice` is imported rather than restated so this type cannot drift
 * from what `specCapability` accepts — the same slice `POST /api/orders` and the
 * booking form already state their own selects against.
 *
 * The board needs this because `GET /api/loads` returns the booked class as a
 * bare id. Under exact-class matching the id was the whole comparison; under
 * substitution the comparison is against numbers, so the numbers have to arrive
 * from somewhere, and `loads/page.tsx` reads the catalogue for exactly that.
 */
export type LoadsVehicleClass = SpecCapacitySlice & { id: string };

/**
 * A vehicle the substitution rule has admitted for the load the confirm dialog
 * is open on, with the capability that admitted it.
 *
 * The capability travels with the vehicle rather than being re-derived by the
 * picker, for two reasons. It is the figure that actually qualified this vehicle
 * — showing anything else beside a radio button would be describing one decision
 * with another one's numbers — and it is the resolved capability, so an open bed
 * reads "open" through `formatDims` instead of a catalogue `0` that means the
 * opposite of what it says.
 */
export type LoadsClaimCandidate = {
  vehicle: LoadsClaimVehicle;
  capability: VehicleCapability;
};

/**
 * The one array every "this account has no vehicle for that load" answer
 * returns, so an empty candidate list keeps a stable identity across renders and
 * the memo below cannot invalidate consumers by handing back a fresh `[]`.
 */
const NO_CLAIM_CANDIDATES: readonly LoadsClaimCandidate[] = [];

/**
 * What a driver is told when none of their vehicles may take the load they
 * pressed Accept on.
 *
 * **It is one sentence covering both server refusals, and it borrows their
 * words on purpose.** `POST /api/orders/[id]/accept` refuses a claim with either
 * "This vehicle is smaller than the vehicle class this delivery was booked as.
 * Use a vehicle that matches or beats it on payload, length, width and height."
 * or "This vehicle doesn't offer the load space this delivery needs." Those are
 * answers *about one named vehicle*, which is the question that route is asked;
 * this message answers a different one — no vehicle of this account qualifies at
 * all — and it cannot name which axis failed, because different vehicles will
 * have failed on different ones. Phrasing it out of the two server sentences is
 * what stops a driver reading one explanation here and a contradictory one after
 * a retry.
 *
 * **What it no longer says is "type".** The old copy — "You have no registered
 * vehicle of the type this delivery requires" — was a true statement of the old
 * rule and is a false statement of the current one: a driver whose Minivan
 * beats an MPV booking on every axis has no vehicle of that *type* and is
 * nonetheless perfectly entitled to the load. Class membership is not what is
 * being asked about any more, so it is not what the refusal talks about.
 */
const NO_ELIGIBLE_VEHICLE_MESSAGE =
  "None of your vehicles can take this delivery. It needs one that matches or " +
  "beats the vehicle class this delivery was booked as on payload, length, " +
  "width and height, and offers the load space this delivery needs.";

/**
 * Which of this driver's vehicles may claim `load` — **the client's copy of the
 * server's rule, running the server's own functions on the server's own
 * inputs**.
 *
 * ## Why the client repeats the rule at all
 *
 * The obvious alternative is to send the driver's first vehicle and let
 * `POST /api/orders/[id]/accept` decide, since that route re-checks everything
 * and is the only authority on whether a claim stands. It was considered and
 * rejected: the confirm dialog exists precisely so that a driver commits once
 * and gets a load, and "Confirm and claim" answering with a refusal *after* they
 * have committed is the failure the dialog is there to prevent. Worse, a driver
 * with two vehicles would have their claim decided by array order — the first
 * vehicle refused while a second one sitting in the same list would have been
 * accepted — which is not a refusal a driver can act on or even understand.
 * Choosing correctly here means the request that leaves the browser is one the
 * server will accept.
 *
 * That is a courtesy, never a substitute. Nothing about this function weakens
 * anything: the route re-runs both predicates against freshly read rows, and a
 * caller that never opens this dialog is checked exactly as it always was. This
 * is about not blocking a legitimate claim before it is sent.
 *
 * ## Why it imports the shared helpers instead of writing the comparison out
 *
 * The bug this replaces was `claimVehicles.find((candidate) => candidate
 * .vehicleTypeSpecId === load.vehicleTypeSpecId)` — the client's private,
 * hand-written statement of a rule the server had since replaced everywhere.
 * Two expressions of "eligible" in two languages is how the board and the claim
 * route drifted apart before (see `GET /api/loads`'s doc comment), and the fix
 * both times is the same: one module, imported by both sides.
 * `meetsBookedClass`, `offersBodyType`, `specCapability` and `capabilityOf` are
 * all deliberately dependency-free — no `server-only`, no Prisma runtime import,
 * plain arithmetic over plain objects — which is what makes importing them from
 * a `"use client"` file possible, and their doc comments say to.
 *
 * ## Order
 *
 * Smallest qualifying payload first, ties broken on the plate so the list is
 * deterministic across renders and across polls. That order *is* the picker's
 * default (it takes the first), and it is the right default for the same reason
 * the server's floor is a floor: every candidate here already meets what the
 * client paid for, so the smallest one is the one that satisfies the booking
 * while leaving the driver's larger trucks free for work that needs them. It is
 * only a default — **which truck is actually available today is a fact only the
 * driver has**, which is why two or more candidates produce a picker rather than
 * a silent choice.
 *
 * A booked class missing from `floors` yields no candidates. That is unreachable
 * — `loads/page.tsx` ships the whole catalogue and `Order.vehicleTypeSpecId` is
 * a foreign key into it — and it fails closed deliberately: with no figures
 * there is no floor, and admitting everything is the one direction this rule
 * must never fail in. One un-claimable load, corrected by a reload, is the cost.
 */
function claimCandidatesFor(
  vehicles: readonly LoadsClaimVehicle[],
  load: HubLoad,
  floors: ReadonlyMap<string, VehicleCapability>,
): readonly LoadsClaimCandidate[] {
  const floor = floors.get(load.vehicleTypeSpecId);

  if (floor === undefined) {
    return NO_CLAIM_CANDIDATES;
  }

  const candidates = vehicles
    // Resolved once per vehicle and carried, rather than recomputed by the
    // filter, the sort and then the picker: `capabilityOf` is cheap, but three
    // independent calls are three chances for one of them to be given the wrong
    // spec and disagree with the other two.
    .map((vehicle) => ({
      vehicle,
      capability: capabilityOf(vehicle, vehicle.vehicleTypeSpec),
    }))
    .filter(
      (candidate) =>
        // Both tests, in the order the accept route applies them. Neither
        // subsumes the other: a hold twice the required size is still the wrong
        // hold if the client booked a refrigerated body and this class has none.
        offersBodyType(
          candidate.vehicle.vehicleTypeSpec.bodyTypes,
          load.bodyType,
        ) && meetsBookedClass(candidate.capability, floor),
    );

  // `filter` already returned a fresh array, so sorting it in place cannot
  // disturb the `claimVehicles` prop this derives from.
  return candidates.sort(
    (a, b) =>
      a.capability.payloadKg - b.capability.payloadKg ||
      a.vehicle.plateNumber.localeCompare(b.vehicle.plateNumber),
  );
}

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
  /* --- the account ------------------------------------------------------ */
  /**
   * Which kind of account is looking at the board.
   *
   * Resolved server-side by `resolveHubAccount()` and handed to the provider,
   * which needs it to pick a claim endpoint. It is re-exposed here because the
   * surfaces need the same fact for copy — the confirm dialog's "assign a
   * driver and vehicle afterwards" note is a company-only sentence — and the
   * alternative was each of them calling `useSession()` and re-deriving
   * `role === "COMPANY"`: the same fact by a longer route, arriving one render
   * late, with a first paint in which a company account sees the individual's
   * copy.
   */
  accountKind: HubAccountKind;

  /* --- server state --------------------------------------------------- */
  isLoading: boolean;
  loadError: string | null;
  /**
   * Re-reads `GET /api/loads` in the foreground: it clears `loadError` on the
   * way in and reports a failure through it on the way out, because a mutation
   * that has just changed the board is a moment where nothing on screen can be
   * trusted until the read settles.
   *
   * The background poll deliberately does **not** go through here — it reads
   * silently, so a dropped tick leaves the last-known-good board alone instead
   * of replacing it with `loads-screen.tsx`'s error state.
   */
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
  /**
   * Whether the four filter controls affect the list currently on screen.
   *
   * False on the `mine` tab and in the rejected sub-view, where `visibleLoads`
   * ignores them outright — see its own note for why. Exposed rather than left
   * implicit because the filter panel and its active-count badge are rendered
   * by surfaces that do not otherwise know the rule, and a panel that reports
   * "2 filters active" over a list it is not filtering is the same lie in the
   * other direction: **hide or disable the filter controls when this is
   * false**, rather than re-deriving `tab === "mine" || showRejected` locally.
   */
  filtersApply: boolean;

  /* --- sorting ---------------------------------------------------------- */
  sortKey: LoadsSortKey;
  sortDir: LoadsSortDirection;
  /** Sorts by `key`, or flips the direction when `key` is already active. */
  setSort: (key: LoadsSortKey) => void;

  /* --- the rejected sub-view ------------------------------------------- */
  showRejected: boolean;
  setShowRejected: (show: boolean) => void;
  /**
   * Whether this account has hidden a given load.
   *
   * A predicate rather than something a surface can infer, because **the row
   * cannot say**: `GET /api/loads` returns a rejected load with
   * `status: "available"` (a rejection changes what *this* account's board
   * shows, never the load's real server-side status), so the fact lives only in
   * the endpoint's third array. Every Wave 4 surface previously re-derived it
   * as `isRejected = showRejected`, which is true today only because entering
   * or leaving the sub-view clears the selection and the three arrays are
   * disjoint — a chain of two unrelated invariants holding up a per-row
   * decision. This carries the fact instead of re-deriving it.
   */
  isRejected: (id: string) => boolean;

  /* --- selection and dialogs ------------------------------------------- */
  selectedId: string | null;
  /**
   * The selected row, resolved **live** against the board on every render.
   *
   * Live on purpose, and the opposite of `dialogLoad` below. The drawer and the
   * mobile sheet are where a driver watches a load; a poll that flips it to
   * `"claimed"` has to reach them, so that an open panel shows "Claimed by
   * another driver" in place rather than emptying itself.
   */
  selectedLoad: HubLoad | null;
  selectLoad: (id: string | null) => void;
  dialogId: string | null;
  /**
   * The load the confirm dialog is open on — a **snapshot**, frozen at the
   * moment `openConfirm` was called, not a live lookup.
   *
   * This is the state, and `dialogId` is derived from it, so the two cannot
   * disagree about which load is being confirmed. A background poll updates the
   * board's arrays underneath an open dialog; it must not change the reference,
   * route, cargo or payout a driver is reading while deciding, nor the id
   * `confirmClaim` is about to submit. The race is settled by the endpoint on
   * submit — see `confirmClaim` — never by the client watching the board, so
   * there is nothing the fresher row could usefully tell this dialog.
   */
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
  /**
   * The driver's vehicles that may claim `dialogLoad`, smallest qualifying
   * payload first — the confirm dialog's picker, and the set `confirmClaim`
   * validates its argument against.
   *
   * Empty whenever no dialog is open, for a BUSINESS account (which names no
   * vehicle at all), and for a driver none of whose vehicles clears the booked
   * class. The last of those three is the only one the driver ever sees, as
   * `NO_ELIGIBLE_VEHICLE_MESSAGE` on Confirm.
   *
   * Exposed here rather than derived in the dialog because `confirmClaim` needs
   * the identical list: the picker offers a choice out of it and the mutation
   * resolves that choice against it, and two derivations of the same set is how
   * a driver ends up sending a vehicle the picker never offered.
   */
  claimCandidates: readonly LoadsClaimCandidate[];
  /**
   * Claim `dialogLoad`, with `vehicleId` naming which of `claimCandidates` the
   * driver chose.
   *
   * Optional and ignored on the BUSINESS path, which sends no vehicle. On the
   * driver path, omitting it (or passing an id that is no longer a candidate)
   * falls back to the first candidate — the same vehicle the picker defaults to
   * — so a caller with nothing to choose from behaves exactly as it did before
   * the picker existed.
   */
  confirmClaim: (vehicleId?: string | null) => Promise<void>;
  /** True while a claim is in flight — disables the confirm button. */
  isClaiming: boolean;
  /** A claim that failed for a reason other than losing the race. */
  claimError: LoadsClaimError | null;
  dismissClaimError: () => void;
  reject: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  /** The load id whose reject/restore is in flight, or null. */
  pendingActionId: string | null;
  /**
   * Whether the Accept control on `id`'s row should be live. **The board's one
   * answer to that question — every surface asks it here rather than deriving
   * its own from `pendingActionId`.**
   *
   * The two halves of the rule pull in opposite directions, which is why they
   * were worth stating once:
   *
   * - A reject or restore in flight on **another** row must not disable Accept.
   *   `setRejection` serialises the board's rejections, so `pendingActionId`
   *   being non-null is the ordinary state of the board for a second or two
   *   after any row's Reject is pressed — including rows the driver never
   *   touched. This is first-come-first-served work; a driver who cannot press
   *   Accept because an unrelated row is mid-reject loses the load to whoever
   *   had no request in flight, for nothing. Accept opens a dialog and touches
   *   no rejection state, so there is no state to protect by blocking it.
   * - A pending action on **this** row does disable it. That row is being
   *   rejected or restored right now: which list it belongs to is unsettled,
   *   `reject` clears the selection on success, and accepting the load a
   *   request is currently hiding is not a coherent thing to ask for.
   *
   * `pendingActionId` stays exposed for the Reject and Restore controls, which
   * genuinely are board-wide-exclusive — the container drops a second call
   * outright, so leaving the others enabled would offer presses that do nothing.
   */
  canAccept: (id: string) => boolean;
  /** The last reject/restore failure, in plain words. */
  actionError: string | null;

  /* --- the shared clock -------------------------------------------------- */
  /**
   * The instant every relative-time label on this board is measured against,
   * re-sampled once a minute.
   *
   * One clock for the whole board rather than one per surface. "Posted 14 min
   * ago" in a table row, "Claimed 4 min ago" in the drawer and the same two
   * lines on the mobile board are the same measurement, and three surfaces that
   * each sample their own `Date` drift apart by however far their timers happen
   * to be out of phase — visibly, when a drawer sits open beside the row it
   * describes. It also removes the only impure read on this screen: a component
   * that calls `new Date()` in its render body returns a different tree for the
   * same props, and its label never re-measures because nothing tells it to.
   *
   * ISO string rather than a `Date` or an epoch number because every formatter
   * in `loads-format.ts` takes `nowIso: string` — the same shape every timestamp
   * on `HubLoad` already arrives in — and because a string identity is stable
   * across renders that did not re-tick.
   */
  nowIso: string;

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
    case "fromYou":
      // Null whenever the distance could not be measured — a stale or absent
      // driver location, an ungeocodable pickup, or a COMPANY session. Those
      // rows sort last in both directions, which `compareLoads` handles
      // generically for every nullable key here.
      return load.pickupDistanceKm;
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
   * The signed-in driver's registered vehicles, with the capacity and body-type
   * facts the substitution rule reads. Empty for a BUSINESS account.
   */
  claimVehicles: readonly LoadsClaimVehicle[];
  /**
   * The vehicle-class catalogue, for looking a load's booked class up and
   * building the floor it sets. Empty for a BUSINESS account, which claims no
   * load against a floor.
   */
  vehicleClasses: readonly LoadsVehicleClass[];
  children: React.ReactNode;
};

export function LoadsProvider({
  accountKind,
  claimVehicles,
  vehicleClasses,
  children,
}: LoadsProviderProps) {
  /* --- server state ------------------------------------------------------ */

  const [available, setAvailable] = React.useState<HubLoad[]>([]);
  const [mine, setMine] = React.useState<HubLoad[]>([]);
  const [rejected, setRejected] = React.useState<HubLoad[]>([]);
  const [hiddenByCapacityCount, setHiddenByCapacityCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  /**
   * The three arrays exactly as `applyBoard` last wrote them.
   *
   * `applyBoard` is their only writer, so this mirror cannot drift — and having
   * it lets the merge run as one plain synchronous computation instead of inside
   * three `setState` updater callbacks. That is not tidiness: the merge keeps a
   * side ledger of when each vanished row was first missed, React is free to
   * invoke an updater callback more than once, and a ledger stamped from inside
   * one would be a purity violation waiting for StrictMode or a future
   * concurrent render to expose it.
   */
  const boardRef = React.useRef<{
    available: HubLoad[];
    mine: HubLoad[];
    rejected: HubLoad[];
  }>({ available: [], mine: [], rejected: [] });

  /**
   * When each row that has disappeared from the response was first missed.
   *
   * A ref rather than state: it decides what the *next* merge keeps and must
   * never itself cause a render. Pruned on every merge down to the rows still
   * being held, so a board left open all day cannot accumulate entries.
   */
  const claimedAtRef = React.useRef(new Map<string, number>());

  /**
   * `selectedId` and `dialogId`, mirrored where the merge can read them.
   *
   * The merge needs to know whether the driver currently has a row open, and it
   * runs from a fetch owned by an effect that must never restart: an interval
   * torn down and recreated on every selection change would restart its own
   * phase each time, so a driver clicking down a list could starve the board of
   * refreshes indefinitely. Reading the two ids through a ref keeps that
   * effect's dependency list free of them.
   *
   * **This ref is the merge's only contact with UI-owned state, and it is
   * read-only.** `tab`, `sortKey`/`sortDir`, the four filter fields,
   * `showRejected` and `lostLoad` are neither read nor written by a poll; they
   * change only through their own setters, driven by the driver.
   */
  const openTargetsRef = React.useRef<{
    selectedId: string | null;
    dialogId: string | null;
  }>({ selectedId: null, dialogId: null });

  /**
   * Which read is the current one. A response that arrives after a later read
   * has started has nothing useful to say about the board and is dropped —
   * including the aborted first read of a StrictMode double-mount, whose
   * rejection must not land as an error over a board that is already loading
   * again.
   */
  const readSequence = React.useRef(0);

  /**
   * How many foreground reads are in flight. A background poll defers to any of
   * them: it has nothing to add while a mutation's own re-read is already
   * fetching the very same thing, and the counter is what lets the loading flag
   * be cleared by the last one to finish rather than the first.
   */
  const foregroundReads = React.useRef(0);

  /**
   * Fold one response into the board **by load id**, never by replacing the
   * arrays wholesale.
   *
   * Three things fall out of merging rather than replacing, and each is a real
   * behaviour rather than an optimisation:
   *
   * 1. **A row whose fields are unchanged keeps its object identity**, and an
   *    array whose every row kept its identity keeps *its* identity too. So a
   *    poll that finds nothing new re-renders nothing: `baseLoads`,
   *    `visibleLoads`, the city options and the counts all memoise on those
   *    array identities and none of them recompute. On a quiet board — which is
   *    most of the time — a tick costs one fetch and no render at all.
   * 2. **A row that changes is replaced only in its own slot.** Combined with
   *    `key={load.id}` on the table row and the mobile card, React updates that
   *    row in place; nothing above it remounts, so the table's scroll offset and
   *    any row-local state survive.
   * 3. **A row that disappears is turned into a visible transition** rather than
   *    a hole in the list — see the dwell rule below.
   *
   * Nothing else in the container is touched. This writes the three arrays and
   * `hiddenByCapacityCount`, and reads `selectedId`/`dialogId` through a ref to
   * decide what to hold. Every other piece of state here belongs to the driver.
   */
  const applyBoard = React.useCallback((data: LoadsApiResponse) => {
    const now = Date.now();

    /**
     * "Vanished" means gone from the whole response, not from one array of it.
     *
     * A successful claim moves a row from `available` to `mine`, and a rejection
     * moves it to `rejected`. Both look like a disappearance from the array they
     * left, and holding either one on the open board as "claimed by another
     * driver" would be describing the driver's own action back to them, wrongly.
     */
    const presentIds = new Set<string>();
    for (const load of data.available) {
      presentIds.add(load.id);
    }
    for (const load of data.mine) {
      presentIds.add(load.id);
    }
    for (const load of data.rejected) {
      presentIds.add(load.id);
    }

    /** Rows the merge is holding past their disappearance, for the prune below. */
    const heldIds = new Set<string>();

    const isOpen = (id: string): boolean =>
      id === openTargetsRef.current.selectedId ||
      id === openTargetsRef.current.dialogId;

    /**
     * What to do with a row that has left `available`.
     *
     * Held as `"claimed"` while it is inside its dwell window **or** while the
     * driver has it open — whichever lasts longer. The open case is unbounded on
     * purpose: the design's own scenario is a load claimed by somebody else
     * while its drawer or sheet is up, and the required behaviour is that the
     * panel says so in place. That works because `selectedId` is untouched here
     * and the row is still in the array for `selectedLoad` to resolve against;
     * closing the panel is what finally lets the next poll drop it.
     */
    const holdClaimed = (load: HubLoad): HubLoad | null => {
      if (presentIds.has(load.id)) {
        return null;
      }

      const firstMissedAt = claimedAtRef.current.get(load.id) ?? now;
      claimedAtRef.current.set(load.id, firstMissedAt);

      if (now - firstMissedAt >= CLAIMED_DWELL_MS && !isOpen(load.id)) {
        return null;
      }

      heldIds.add(load.id);

      // Reuse the row unless its status actually has to change, so a held row
      // does not churn its identity on every tick it survives.
      return load.status === "claimed" ? load : { ...load, status: "claimed" };
    };

    /**
     * The same rule for `mine` and `rejected`, minus the dwell and minus the
     * status rewrite.
     *
     * A row leaves `mine` when the job stops being open work — it completes, or
     * it is cancelled — and leaves `rejected` when the rejection is lifted
     * elsewhere. Neither is "claimed by another driver", so neither gets that
     * treatment; but an open drawer describing one still must not blank itself
     * mid-read, so the row is held for exactly as long as it is open.
     */
    const holdWhileOpen = (load: HubLoad): HubLoad | null =>
      !presentIds.has(load.id) && isOpen(load.id) ? load : null;

    const next = {
      available: mergeLoadsById(
        boardRef.current.available,
        data.available,
        holdClaimed,
      ),
      mine: mergeLoadsById(boardRef.current.mine, data.mine, holdWhileOpen),
      rejected: mergeLoadsById(
        boardRef.current.rejected,
        data.rejected,
        holdWhileOpen,
      ),
    };

    // A row the board is no longer holding has no dwell left to remember, and a
    // row the server has started returning again starts its window afresh if it
    // ever vanishes a second time.
    for (const id of Array.from(claimedAtRef.current.keys())) {
      if (!heldIds.has(id)) {
        claimedAtRef.current.delete(id);
      }
    }

    boardRef.current = next;
    setAvailable(next.available);
    setMine(next.mine);
    setRejected(next.rejected);
    setHiddenByCapacityCount(data.hiddenByCapacityCount);
  }, []);

  /**
   * The one reader of `GET /api/loads`, in two modes.
   *
   * **Foreground** — what `refetch` exposes, and what the first read on mount
   * uses. It owns the screen's full-height states: `loadError` is cleared going
   * in and set on failure, and `isLoading` is resolved on the way out, because
   * on those two occasions nothing on screen can be trusted until the read
   * settles.
   *
   * **Silent** — every poll tick. Both of those would be actively wrong here:
   * `loads-screen.tsx` replaces the entire board with an error panel when
   * `loadError` is non-null, so one dropped tick on a flaky connection would
   * throw away a perfectly good board and the driver's place in it. A silent
   * failure therefore keeps the last known snapshot and waits for the next tick
   * — the same conclusion `order-tracking-map.tsx` reaches for its own poll, and
   * the same two-mode reader `onboarding-draft-context.tsx` already uses.
   */
  const readBoard = React.useCallback(
    async ({
      silent = false,
      signal,
    }: { silent?: boolean; signal?: AbortSignal } = {}): Promise<void> => {
      if (silent && foregroundReads.current > 0) {
        return;
      }

      const sequence = readSequence.current + 1;
      readSequence.current = sequence;

      if (!silent) {
        foregroundReads.current += 1;
        setLoadError(null);
      }

      try {
        const response = await fetch("/api/loads", { signal });

        if (sequence !== readSequence.current) {
          return;
        }

        if (!response.ok) {
          if (silent) {
            return;
          }

          // Every failure of this endpoint answers with `{ error }` — a 401, the
          // temporary-password 403, the wrong-role 403, the roster-driver 403 —
          // and each of those messages is written for a person to read, so it is
          // shown rather than replaced with a generic string. The status code is
          // the fallback for a body that is not the expected shape.
          const body = (await response.json().catch(() => null)) as {
            error?: unknown;
          } | null;

          setLoadError(
            typeof body?.error === "string"
              ? body.error
              : `The load board is unavailable (HTTP ${response.status}).`,
          );
          return;
        }

        const data = (await response.json()) as LoadsApiResponse;

        // Re-checked after the body is read: parsing is another await, and the
        // read that supersedes this one may only start during it.
        if (sequence !== readSequence.current) {
          return;
        }

        applyBoard(data);
        // A successful read supersedes an earlier failure, including one a
        // silent tick has quietly recovered from — leaving the error panel up
        // over data that has since arrived would strand the driver on it.
        setLoadError(null);
      } catch {
        if (silent || sequence !== readSequence.current) {
          return;
        }

        setLoadError("Couldn't reach the load board.");
      } finally {
        if (!silent) {
          foregroundReads.current -= 1;

          // The last foreground read to finish is the one that hands the board
          // back, whether or not its own answer was the one used. In `finally`
          // rather than in the success branch so a failed first read still shows
          // the error instead of spinning forever.
          if (foregroundReads.current === 0) {
            setIsLoading(false);
          }
        }
      }
    },
    [applyBoard],
  );

  const refetch = React.useCallback(
    (): Promise<void> => readBoard(),
    [readBoard],
  );

  /**
   * The live-update loop: one read on mount, then one every
   * `LOADS_POLL_INTERVAL_MS` for as long as the tab is in front.
   *
   * The `AbortController` + `setInterval` shape is `order-tracking-map.tsx`'s,
   * extended with the visibility handling that component does not need. A
   * tracking session is one person watching one delivery from open to close; the
   * load board is what a driver leaves open between jobs, on a phone, and a
   * backgrounded tab that keeps issuing a request every ten seconds spends the
   * driver's battery and the platform's connections on answers nobody is
   * looking at. Skipping the tick while hidden and reading once on the way back
   * to visible costs nothing and means a driver who returns to the tab sees a
   * current board immediately rather than up to ten seconds of a stale one.
   *
   * Its dependency list is `[readBoard]`, which never changes identity, so this
   * interval is created once and keeps a fixed cadence for the life of the
   * board — see `openTargetsRef` for why that matters.
   */
  React.useEffect(() => {
    const controller = new AbortController();

    // Foreground: this is the read the loading placeholder is waiting on.
    void readBoard({ signal: controller.signal });

    const timer = window.setInterval(() => {
      // Covers a backgrounded tab, another window in front of this one, and a
      // locked phone alike.
      if (document.visibilityState === "hidden") {
        return;
      }

      void readBoard({ silent: true, signal: controller.signal });
    }, LOADS_POLL_INTERVAL_MS);

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void readBoard({ silent: true, signal: controller.signal });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [readBoard]);

  /* --- the shared clock --------------------------------------------------- */

  /**
   * "Now", re-sampled every `CLOCK_TICK_MS` — see `LoadsBoardValue.nowIso` for
   * why the board owns one instant instead of each surface sampling its own.
   *
   * The initial value comes from a lazy initialiser, so it is read once per
   * mount rather than on every render of this provider. The board is fetched in
   * the browser and shows a loading placeholder until the first read settles, so
   * there is no server-rendered relative label for this to disagree with.
   */
  const [nowIso, setNowIso] = React.useState(() => new Date().toISOString());

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNowIso(new Date().toISOString());
    }, CLOCK_TICK_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

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

  /**
   * The confirm dialog's target, held as the row itself rather than as an id.
   *
   * **The snapshot is the state, and `dialogId` below is derived from it** —
   * not the other way round. Storing the id and looking the row up on every
   * render is the shape this deliberately avoids: `available` gets a fresh row
   * object whenever a poll finds a change, so a live lookup would let a
   * background tick alter the reference, route, cargo summary or payout a driver
   * is reading mid-decision, on a dialog that never moved. Freezing it here
   * makes that impossible for every consumer at once, including `confirmClaim`,
   * rather than asking each of them to remember.
   *
   * Nothing is lost by freezing it. The claim is settled by the endpoint's
   * atomic conditional update when the driver submits — a `409` is what opens
   * the lost-the-race dialog, and that is the only thing that opens it — so a
   * fresher `status` on this row would have nothing to add and no right to act
   * on it.
   */
  const [dialogLoad, setDialogLoad] = React.useState<HubLoad | null>(null);
  const dialogId = dialogLoad?.id ?? null;

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
   *
   * **The filters apply to the open board only.** `task-10`'s `isVisible`
   * returns on `tab === "mine"` before it reaches any of them, and the rejected
   * sub-view is the same kind of list: both answer "what do I already have a
   * relationship with", not "what would I take", and the filter panel is asking
   * the second question. Applying them anyway is silent and unrecoverable from
   * inside the list — a driver who narrowed the open board to Kutaisi, switched
   * to "My loads" and saw two of their five loads has no reason to suspect a
   * control they set on a different tab, because neither list shows the filter
   * badge as the thing hiding rows. `resetFilters` would fix it, if anything on
   * screen suggested that it needed fixing.
   *
   * The sort still applies to every list: a column header is visibly pressed on
   * the list it is ordering, so it cannot go looking like data loss.
   */
  const filtersApply = !(tab === "mine" || showRejected);

  const visibleLoads = React.useMemo(() => {
    const filtered = baseLoads.filter((load) => {
      // Every row passes on the two lists the filter panel does not describe.
      // Checked per row rather than by branching around the `filter` call so
      // the sort below still receives a fresh array in both cases — it sorts in
      // place, and the state arrays are not ours to reorder.
      if (!filtersApply) {
        return true;
      }

      // Exact string equality, per the design. Both sides are already
      // `formatCity()`-humanised by the endpoint, so there is no casing or
      // enum-vs-label mismatch to guard against.
      if (fPickup !== ALL_CITIES && load.pickupCity !== fPickup) {
        return false;
      }

      if (fDrop !== ALL_CITIES && load.dropoffCity !== fDrop) {
        return false;
      }

      // An undeclared weight passes, and this branch is now load-bearing rather
      // than defensive. It was written when the server's fit filter resolved an
      // unknown envelope to "does not fit" and withheld those loads, so nothing
      // reached here with a null weight; `GET /api/loads` now lists them —
      // `classifyFit` separates "never declared" from "too heavy", and the claim
      // routes have always accepted the former — so this is the branch that
      // decides what the weight slider does with them. Passing is the right
      // answer: excluding them would mean a slider at its maximum, nominally
      // "no filter", silently removing rows.
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
  }, [
    baseLoads,
    fDrop,
    fPickup,
    fTags,
    fWeight,
    filtersApply,
    sortDir,
    sortKey,
  ]);

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

  /**
   * The ids of the loads this account has hidden.
   *
   * A `Set` rather than an `Array.includes` over `rejected` on every row: the
   * table asks this question once per visible row per render, and the endpoint
   * imposes no ceiling on how many loads an account may have rejected.
   */
  const rejectedIds = React.useMemo(
    () => new Set(rejected.map((load) => load.id)),
    [rejected],
  );

  const isRejected = React.useCallback(
    (id: string) => rejectedIds.has(id),
    [rejectedIds],
  );

  /* --- selection --------------------------------------------------------- */

  /**
   * Resolve a row by id against every array rather than against `visibleLoads`.
   *
   * Deliberate: a drawer open on a row that a filter change has just hidden
   * should stay open showing that row, not blank itself. The id is the state;
   * the row is a lookup.
   *
   * Its identity is stable across a poll that changed nothing, because the merge
   * hands back the same three arrays when no row changed — so `openConfirm`,
   * which depends on this, is stable too.
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

  /**
   * Live, unlike `dialogLoad` — see the note on `LoadsBoardValue.selectedLoad`.
   * This is how a load claimed by somebody else reaches an open drawer or sheet
   * as the "claimed" treatment instead of as a panel that empties itself.
   */
  const selectedLoad = findLoad(selectedId);

  /**
   * Publish the two ids the merge is allowed to read.
   *
   * In an effect rather than assigned during render: a render is not a commit,
   * and writing a ref from the render body would have this ref describing a
   * selection that a discarded render proposed. Every caller that reads it —
   * the poll — runs from a timer or a fetch callback, well after the commit that
   * this effect belongs to, so it always sees the state the driver can see.
   */
  React.useEffect(() => {
    openTargetsRef.current = { selectedId, dialogId };
  }, [dialogId, selectedId]);

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

  /**
   * Open the confirm dialog on a load, taking the snapshot it will show.
   *
   * The lookup happens exactly here — once, on the transition into "open" — and
   * never again for the life of the dialog. See `dialogLoad`'s own note for why
   * that is the whole point rather than an implementation detail.
   *
   * A row that cannot be found opens nothing. That is unreachable from the UI
   * (every Accept button is rendered from a row the board is holding), and the
   * honest alternative to a silent no-op would be a dialog with a target it
   * cannot describe.
   */
  const openConfirm = React.useCallback(
    (id: string) => {
      const load = findLoad(id);

      if (load === null) {
        return;
      }

      setDialogLoad(load);
      // Any error from a previous attempt belongs to that attempt. Clearing it
      // here rather than on close means re-opening the dialog after a failure
      // shows the confirm state, not a stale complaint.
      setClaimError(null);
    },
    [findLoad],
  );

  const closeConfirm = React.useCallback(() => {
    setDialogLoad(null);
  }, []);

  const closeLost = React.useCallback(() => {
    setLostLoad(null);
  }, []);

  const dismissClaimError = React.useCallback(() => {
    setClaimError(null);
  }, []);

  /* --- who may claim what -------------------------------------------------- */

  /**
   * Each vehicle class's capability, keyed by id — the floor a load booked
   * against that class sets for every vehicle offered to fulfil it.
   *
   * Built through `specCapability` and never from the four columns by hand, for
   * the reason that helper's own doc gives: it routes through `capabilityOf`,
   * the one place `cargoHeightM === 0` becomes `Infinity` for an open bed. A
   * literal here would give every flatbed booking a height floor of zero, which
   * every vehicle on the platform trivially clears — turning the strictest class
   * in the catalogue into the most substitutable one, on the client only, while
   * the server went on refusing every such claim. `GET /api/loads` builds the
   * identical map the identical way.
   *
   * Memoised on the prop rather than recomputed per load: a board of two hundred
   * rows references at most the eleven seeded classes.
   */
  const bookedClassFloors = React.useMemo(
    () =>
      new Map<string, VehicleCapability>(
        vehicleClasses.map((spec) => [spec.id, specCapability(spec)]),
      ),
    [vehicleClasses],
  );

  /**
   * The candidate vehicles for the load the confirm dialog is open on.
   *
   * Derived from `dialogLoad` — the frozen snapshot — rather than from a live
   * lookup, so the set the picker offers is the set for the load whose figures
   * the driver is reading, and a poll cannot swap a driver's vehicle options out
   * from under a decision in progress. `dialogLoad`'s own note explains why that
   * snapshot exists; this inherits it for free by depending on it.
   *
   * A BUSINESS account short-circuits to the empty list. Its `claimVehicles` is
   * already empty so the filter would return nothing anyway, but the branch
   * states the reason rather than relying on the coincidence: a company claim
   * names no vehicle, so there is no candidate to compute, and if a fleet ever
   * were shipped to this screen for some other purpose this must not start
   * quietly offering a picker on the company path.
   */
  const claimCandidates = React.useMemo(() => {
    if (accountKind === "BUSINESS" || dialogLoad === null) {
      return NO_CLAIM_CANDIDATES;
    }

    return claimCandidatesFor(claimVehicles, dialogLoad, bookedClassFloors);
  }, [accountKind, bookedClassFloors, claimVehicles, dialogLoad]);

  /* --- mutations ---------------------------------------------------------- */

  /**
   * Claim the load the confirm dialog is open on.
   *
   * Two endpoints, because the two operations differ in what they record:
   *
   * - A **driver** calls `POST /api/orders/[id]/accept` with `{ vehicleId }`.
   *   The vehicle is required and must meet or beat the booked class on all
   *   four capacity axes while offering the body the client asked for — that is
   *   the commercial contract the client paid for, and the route refuses
   *   anything less — so the vehicle is `claimCandidates`' answer to that same
   *   question, narrowed to the driver's own choice where they made one. If no
   *   vehicle of theirs qualifies, the load should never have been on their
   *   board (`GET /api/loads` runs the same two predicates at listing time), so
   *   it is reported here as a state error rather than sent to be refused.
   *
   *   **This is deliberately not "send the first vehicle and let the server
   *   decide".** The server would decide correctly — it re-checks everything —
   *   but it would decide *after* the driver committed, which is the one outcome
   *   this dialog exists to prevent, and with two vehicles registered the
   *   difference between a claim and a refusal would come down to array order.
   *   See `claimCandidatesFor`.
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
  const confirmClaim = React.useCallback(
    async (vehicleId?: string | null) => {
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
          /**
           * The driver's choice where they made one, the default otherwise.
           *
           * Resolved against `claimCandidates` — the very list the picker was
           * rendered from — rather than against `claimVehicles`, so a chosen id
           * can only ever be one the rule already admitted. The fallback to the
           * first candidate covers three cases with one expression: no argument
           * at all (one candidate, no picker, nothing to choose), an argument
           * naming a vehicle that is no longer a candidate, and a caller outside
           * the dialog. Only the first is reachable today; the others resolve to
           * the same vehicle the picker would have defaulted to, which is a
           * claim that will stand rather than one the server has to refuse.
           */
          const candidate =
            claimCandidates.find((entry) => entry.vehicle.id === vehicleId) ??
            claimCandidates[0];

          // No vehicle of this driver's may take this load. Reported here rather
          // than sent to be refused: the answer would be the same and the driver
          // would have committed to get it. `GET /api/loads` filters on the same
          // two predicates, so a load reaching this branch means the board and
          // the account's fleet have disagreed — a vehicle deregistered in
          // another tab since the board was read, most plausibly.
          if (candidate === undefined) {
            setClaimError({
              message: NO_ELIGIBLE_VEHICLE_MESSAGE,
              code: null,
            });
            return;
          }

          response = await fetch(`/api/orders/${load.id}/accept`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vehicleId: candidate.vehicle.id }),
          });
        }

        if (response.ok) {
          setDialogLoad(null);
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
          setDialogLoad(null);
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
          message:
            "Couldn't reach the server. Check your connection and retry.",
          code: null,
        });
      } finally {
        setIsClaiming(false);
      }
    },
    [accountKind, claimCandidates, dialogLoad, isClaiming, refetch, setTab],
  );

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

  /**
   * Accept is blocked only by this row's own pending action, never by another
   * row's. The reasoning is on `LoadsBoardValue.canAccept`, where the surfaces
   * that consume it will read it.
   *
   * Deliberately not also gated on `isClaiming`: a claim in flight means the
   * confirm dialog is open and modal, so no Accept behind it is reachable, and
   * naming a condition here that cannot occur would suggest to the next reader
   * that it can.
   */
  const canAccept = React.useCallback(
    (id: string) => pendingActionId !== id,
    [pendingActionId],
  );

  /* --- the value ---------------------------------------------------------- */

  const value = React.useMemo<LoadsBoardValue>(
    () => ({
      accountKind,
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
      filtersApply,
      sortKey,
      sortDir,
      setSort,
      showRejected,
      setShowRejected,
      isRejected,
      selectedId,
      selectedLoad,
      selectLoad,
      dialogId,
      dialogLoad,
      openConfirm,
      closeConfirm,
      lostLoad,
      closeLost,
      claimCandidates,
      confirmClaim,
      isClaiming,
      claimError,
      dismissClaimError,
      reject,
      restore,
      pendingActionId,
      canAccept,
      actionError,
      nowIso,
      availableCount,
      mineCount,
      rejectedCount,
      visibleLoads,
    }),
    [
      accountKind,
      activeFilterCount,
      actionError,
      availableCount,
      canAccept,
      claimCandidates,
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
      filtersApply,
      filtersOpen,
      hiddenByCapacityCount,
      isClaiming,
      isLoading,
      isRejected,
      loadError,
      lostLoad,
      mineCount,
      nowIso,
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
 * Reconcile one incoming array into the one already on screen, by load `id`.
 *
 * Three rules, in order:
 *
 * 1. A row present in both keeps the object the board is already rendering
 *    whenever the two are field-for-field equal. Every consumer memoises on
 *    array and row identity, so this is what makes an uneventful tick cost
 *    nothing at all.
 * 2. A row present in both but changed takes the incoming object — in its own
 *    slot, so nothing around it is disturbed.
 * 3. A row that has left the response is offered to `holdVanished`, which
 *    returns either the row to keep (possibly rewritten) or `null` to let it go.
 *
 * Held rows are appended rather than kept in place, which costs nothing: the
 * board sorts `visibleLoads` through `compareLoads` before anything renders it,
 * so position in these arrays is not an ordering anybody sees.
 *
 * Returns `previous` unchanged — the same array object — when the merge produced
 * an identical list, which is the whole point of rule 1.
 */
function mergeLoadsById(
  previous: HubLoad[],
  incoming: HubLoad[],
  holdVanished: (load: HubLoad) => HubLoad | null,
): HubLoad[] {
  const previousById = new Map(previous.map((load) => [load.id, load]));
  const incomingIds = new Set(incoming.map((load) => load.id));

  const next: HubLoad[] = incoming.map((load) => {
    const before = previousById.get(load.id);

    return before !== undefined && isSameLoad(before, load) ? before : load;
  });

  for (const before of previous) {
    if (incomingIds.has(before.id)) {
      continue;
    }

    const held = holdVanished(before);

    if (held !== null) {
      next.push(held);
    }
  }

  return isSameLoadList(previous, next) ? previous : next;
}

/**
 * Whether two lists are the same rows, in the same order, as the same objects.
 *
 * Reference equality per element rather than a value comparison, because by the
 * time this runs `mergeLoadsById` has already reduced every unchanged row to the
 * object it was: anything left holding a new reference is a row that genuinely
 * changed.
 */
function isSameLoadList(a: HubLoad[], b: HubLoad[]): boolean {
  return a.length === b.length && a.every((load, index) => load === b[index]);
}

/**
 * Whether a freshly parsed row carries the same values as the one on screen.
 *
 * Iterates the incoming object's own keys rather than naming forty fields, so a
 * field added to `HubLoad` is compared without anyone having to remember to add
 * it here — the failure mode of a hand-written comparison being a row that stops
 * updating in one column, silently.
 *
 * `handlingTags` is the one field that cannot be compared by reference: it is an
 * array, and `JSON.parse` builds a new one on every read, so left to `Object.is`
 * it would report every row as changed on every tick and defeat the merge
 * entirely.
 */
function isSameLoad(previous: HubLoad, incoming: HubLoad): boolean {
  if (previous === incoming) {
    return true;
  }

  for (const key of Object.keys(incoming) as (keyof HubLoad)[]) {
    if (key === "handlingTags") {
      continue;
    }

    if (!Object.is(previous[key], incoming[key])) {
      return false;
    }
  }

  return (
    previous.handlingTags.length === incoming.handlingTags.length &&
    previous.handlingTags.every(
      (tag, index) => tag === incoming.handlingTags[index],
    )
  );
}

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
