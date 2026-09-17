"use client";

import * as React from "react";

import {
  formatDims,
  formatWeightKg,
} from "@/components/driver-hub/screens/loads-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * "Assign a driver and vehicle" — the dispatch step, which is the half of a
 * fleet claim that had a working endpoint and no UI.
 *
 * A BUSINESS account claims a load with `POST
 * /api/logistics-company/orders/[id]/claim`, which sends **no body at all**: the
 * order records a `companyId` and names no vehicle and no driver, because which
 * truck fulfils it is a decision a dispatcher makes at a desk afterwards and
 * pinning one at claim time would only go stale while the order waited. The
 * order therefore lands in `CLAIMED` with a null `driverId` — the state
 * `jobSheetStatusPill` prints as "Awaiting dispatch" — and `POST
 * /api/logistics-company/orders/[id]/dispatch` is what moves it to `ACCEPTED`
 * with a real driver and a real plate on it. This dialog is that POST's only
 * caller.
 *
 * ## Two entry points, one dialog, and therefore props rather than context
 *
 * It opens from two places that share no state:
 *
 * - **Straight after a successful company claim**, from `loads-claim-dialogs.tsx`,
 *   off the board context's `dispatchTarget`.
 * - **From the company job sheet**, `/dashboard/jobs/[id]`, which is a
 *   server-rendered page with no `LoadsProvider` anywhere above it.
 *
 * So this component reads `useLoadsBoard()` nowhere and takes everything as
 * props — unlike every other Wave 4 surface, and for a reason that is not
 * stylistic: calling the board hook here would throw outright on the job sheet.
 * The only thing it needs from either caller is an order id, because
 * `GET /api/logistics-company/orders/[id]/dispatch-options` supplies the rest.
 *
 * ## Why it fetches on open rather than ahead of time
 *
 * The options are read when the dialog opens, and the row list shows a pending
 * skeleton until they land. Pre-loading them with the board would mean a request
 * per claimed order on a screen where most sessions dispatch nothing; this opens
 * on a deliberate press, which is the moment the answer is actually wanted. The
 * skeleton rather than an empty panel because the list is the dialog — there is
 * nothing else to look at while it loads.
 *
 * ## `capability.heightM === null` means **unbounded**, not unknown
 *
 * JSON cannot carry `Infinity`, so the endpoint spells an open bed as `null` and
 * the translation back happens exactly once, in `resolveCapability` below.
 * `formatDims` is the only thing in this codebase that renders an open bed
 * correctly, and it does it by testing `Number.isFinite` — hand it a `0` or an
 * em-dash instead and every flatbed in the fleet prints a height of "0.0 m",
 * which reads as a vehicle with no usable hold at all. Getting this backwards is
 * silent: the figure is plausible, just wrong, on exactly the class of vehicle a
 * fleet dispatches the awkward loads to.
 *
 * ## One choice is made here — the vehicle — and the driver comes with it
 *
 * **There is no driver picker.** A company vehicle carries its own driver: the
 * assignment made on the Vehicles screen (`POST
 * /api/logistics-company/vehicles/[id]/assignment`) is what "who drives this
 * truck" means everywhere else in the hub, and this dialog now simply obeys it.
 * Picking a plate dispatches that plate's `pairedDriver`, and the submit sends
 * that driver's id alongside the vehicle's.
 *
 * This replaces an earlier arrangement where the vehicle only *pre-filled* a
 * roster select the dispatcher could override, and it deletes the `roster` half
 * of the options response with it. The override was answering a question the
 * fleet had already answered: a dispatcher who wants a different driver in that
 * truck today changes the assignment, and then every screen agrees about it —
 * whereas an override here produced a job whose driver matched nothing the
 * Vehicles screen would tell you. The cost of the change is real and is accepted
 * deliberately: a one-off swap now takes a trip to the Vehicles screen.
 *
 * The consequence for this list is that **a vehicle with no assigned driver is
 * not dispatchable.** It stays on the list, disabled, tagged "No driver
 * assigned" — the same treatment as a vehicle that is too small, because from
 * the dispatcher's seat it is the same kind of fact: this truck cannot take this
 * job until something is fixed, and here is what. Hiding it would leave a plate
 * missing from the fleet with nothing to explain the gap.
 *
 * ## Every vehicle is listed, and the ones that cannot go say why
 *
 * The endpoint returns a verdict per vehicle rather than a filtered list, and
 * this renders all of them — the ones that cannot take the job disabled, with
 * the obstacle named. A dispatcher shown a shorter list learns nothing about why
 * their other six trucks are not on it; a dispatcher shown "Not approved for
 * dispatch" beside a plate knows what to go and fix. `disabled` on the **real
 * radio** is what makes those rows unselectable to the keyboard and to assistive
 * technology, not just to the pointer.
 *
 * ## The platform recommends; the dispatcher decides
 *
 * Exactly one option may arrive with `recommended: true` — the smallest vehicle
 * that fits, computed by the server, which is the choice that leaves the bigger
 * trucks free for work that needs them. It is rendered as a **tag on the row and
 * nothing more**: nothing is selected when the dialog opens, no effect selects
 * anything later, and the submit button stays dead until the dispatcher presses
 * a row themselves.
 *
 * Pre-selecting it was rejected outright. The dispatcher knows which truck is
 * loaded, lent out or in the shop today and the platform does not, so a
 * pre-selection would be the platform making a decision it lacks the facts for,
 * on a screen where the fastest path is to press the primary button without
 * reading — and the resulting dispatch would look, in every record afterwards,
 * exactly like one somebody chose. See `RecommendedTag` for how the tag is kept
 * visually distinct from the selected state, which is the other half of the same
 * requirement.
 *
 * ## Order is the server's, and is not recomputed here
 *
 * `vehicles` arrives sorted — dispatchable first, smallest payload first, then
 * the rest — and is rendered in the order given. Sorting it again here would put
 * two implementations of one rule in two files, and the recommendation is
 * *defined* as the first dispatchable entry: a client-side re-sort that drifted
 * would move the tag off the row it belongs to and the dialog would quietly
 * recommend the wrong truck.
 *
 * ## `data-admin-surface=""` on `DialogContent` — mandatory
 *
 * Radix portals its content to `document.body`, outside the `DriverHubShell`
 * root that carries `data-admin-surface` and with it the scheme pin that makes
 * `bg-card` / `bg-muted` / `border-border` resolve to the hub palette rather
 * than the marketing one. There is no wrapper up the tree that can carry it on
 * this component's behalf. Every other element this dialog renders is a child of
 * `DialogContent` and inherits the pin from it. See the doc comment on
 * `src/components/driver-hub/driver-hub-shell.tsx`.
 */

/* -------------------------------------------------------------------------- */
/* The frozen server contract                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `GET /api/logistics-company/orders/[id]/dispatch-options`, declared here
 * rather than in a shared module.
 *
 * Deliberately local. The route is being built alongside this file, and a shared
 * `types.ts` is a file two authors would land on top of each other in; this is
 * the only consumer the response has, so the duplication costs one declaration
 * and buys an independent landing. If a second consumer ever appears, lifting
 * these three types into the route's own module and importing them from there is
 * the move — not re-declaring them a second time.
 */
type DispatchVerdict =
  | { kind: "FITS" }
  | { kind: "NOT_APPROVED" }
  | { kind: "UNDER_BOOKED_CLASS" }
  | { kind: "WRONG_BODY_TYPE" }
  | { kind: "OVER_CARGO"; axes: DispatchAxis[] };

type DispatchAxis = "weight" | "length" | "width" | "height";

type DispatchDriver = { userId: string; name: string; isOnline: boolean };

type DispatchVehicle = {
  vehicleId: string;
  plateNumber: string;
  classLabel: string;
  capability: {
    payloadKg: number;
    lengthM: number;
    widthM: number;
    /** **`null` is "open bed, no height limit"**, not "not recorded". */
    heightM: number | null;
  };
  /**
   * The driver this vehicle is assigned to, and **the only driver it can be
   * dispatched with**. `null` is a vehicle nobody is assigned to, which is a
   * routine state of a real fleet and not an error — it is simply not
   * dispatchable until the Vehicles screen fixes it.
   */
  pairedDriver: DispatchDriver | null;
  verdict: DispatchVerdict;
  /**
   * The server's suggestion: the smallest vehicle that fits, true on at most one
   * option in the array and on none at all when nothing fits.
   *
   * A suggestion is all it is. Nothing in this file selects a row because of it.
   */
  recommended: boolean;
};

/**
 * `roster` used to ride along here, for a driver select this dialog no longer
 * has. It is gone from the response as well as from this type — see the module
 * comment's "One choice is made here".
 */
type DispatchOptionsResponse = {
  vehicles: DispatchVehicle[];
};

/**
 * A vehicle the dispatcher is allowed to pick: it fits **and** somebody is
 * assigned to drive it.
 *
 * The narrowing is the point. `pairedDriver` is non-null on this type, so the
 * submit below can read `chosenVehicle.pairedDriver.userId` and type-check —
 * where a plain `DispatchVehicle` would need a `!` at exactly the spot where
 * being wrong means POSTing `undefined` as a driver id. The guarantee is carried
 * by `isDispatchable`, which is the only way to obtain one of these.
 */
type DispatchableVehicle = DispatchVehicle & {
  pairedDriver: DispatchDriver;
  verdict: { kind: "FITS" };
};

/**
 * The selectability rule, in one place, as a type predicate.
 *
 * Both halves are load-bearing and neither is redundant: `POST .../dispatch`
 * requires `driverUserId` *and* `vehicleId` and re-checks the fit, so a row that
 * fails either half can only ever produce a refusal *after* the dispatcher
 * committed — which is the failure this whole verdict list exists to prevent.
 */
function isDispatchable(
  vehicle: DispatchVehicle,
): vehicle is DispatchableVehicle {
  return vehicle.verdict.kind === "FITS" && vehicle.pairedDriver !== null;
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The network failure both requests share, worded exactly as the board's claim
 * path words it (`loads-context.tsx`). A dispatcher who loses signal mid-dialog
 * should not be told two different things depending on which of the two
 * requests was in flight.
 */
const NETWORK_ERROR =
  "Couldn't reach the server. Check your connection and retry.";

/**
 * What a dispatcher reads when the options request 404s.
 *
 * `GET .../dispatch-options` scopes on `{ id, companyId, status: CLAIMED }` and
 * answers `{ error: "Order not found." }` to anything else. That sentence is
 * right for the endpoint — the 404-not-403 convention keeps a stranger from
 * confirming an id exists by probing it — and useless here, because this dialog
 * only ever opens on a row the board just handed *this* dispatcher. Passing it
 * through told somebody their own delivery did not exist.
 *
 * So the status is translated at this one call site rather than the route being
 * reworded, and rather than `refusalMessage` being taught to rewrite 404s
 * generally: the submit's 404s include "Driver not found." and "Vehicle not
 * found.", which name a real obstacle and must keep reaching the dispatcher
 * intact. A blanket rule would swallow them.
 *
 * It names two outcomes because the endpoint cannot distinguish them and
 * neither can this: the order left CLAIMED (dispatched from another tab, which
 * is the likely one) or it left the fleet's hands entirely (cancelled). Naming
 * only the first would be the more fluent sentence and would sometimes be a
 * lie. Both readings point at the same recovery, which is to look at the board
 * again — so the sentence ends by saying the board is stale rather than leaving
 * the dispatcher to work that out.
 */
const NOT_DISPATCHABLE_MESSAGE =
  "This delivery can no longer be assigned — it already has a driver, or it " +
  "was cancelled. Close this and refresh the board to see where it stands.";

/**
 * How many placeholder rows stand in for the list while it loads.
 *
 * Three, because it is the shape of a small fleet's answer and the panel does
 * not jump much when the real rows replace it. It is a guess at a length, which
 * is all a skeleton ever is — it must never be read as a count.
 */
const SKELETON_ROW_COUNT = 3;

/**
 * The word for a vehicle that falls short on one axis.
 *
 * Keyed by the axis the endpoint names, and iterated in **this** declaration
 * order rather than in the order `axes` arrives in, so a vehicle short on
 * payload and length cannot read "too long and too heavy" on one request and
 * "too heavy and too long" on the next.
 */
const AXIS_SHORTFALL: Record<DispatchAxis, string> = {
  weight: "heavy",
  length: "long",
  width: "wide",
  height: "tall",
};

const AXIS_ORDER: DispatchAxis[] = ["weight", "length", "width", "height"];

/**
 * The shortfall for an `OVER_CARGO` verdict that names **no axis at all**.
 *
 * **`axes` being empty is a routine outcome of the contract, not a malformed
 * response**, and the server half pins it with a test. The two halves of the
 * verdict answer slightly different questions: `OVER_CARGO` fires on
 * `!loadFits`, which is all-or-nothing about nulls — an undeclared axis makes
 * the whole load not-fitting — while `oversizeAxes` reports only the axes the
 * client actually *declared* and exceeded, because "you did not tell us the
 * height" is not evidence the cargo is too tall. So a load that declares 200 kg
 * and nothing else, against a 500 kg minivan, is refused with no offending axis
 * to name. See `OVER_CARGO.axes` in `src/lib/orders/dispatch-fit.ts`, which
 * spells this out and tells a rendering caller to survive it.
 *
 * Without this the row would print "Too  for this load", with the hole where the
 * axis words would have gone.
 *
 * It is the load board confirm dialog's existing tag, verbatim, so the two
 * surfaces refuse a vehicle in the same words — and it keeps the voice rule the
 * axis-specific tags keep: it names the vehicle as too small, never the load as
 * too big.
 */
const GENERIC_SHORTFALL = "Too small for this load";

/**
 * The one obstacle that is not a verdict: nobody drives this truck.
 *
 * Worded to match the Vehicles screen, which prints "Unassigned" against a
 * vehicle in exactly this state — the dispatcher reading this tag is being sent
 * to that screen, and the two surfaces should be recognisably describing one
 * thing. It keeps the voice rule the shortfalls keep: it names something missing
 * from the vehicle, and says nothing about the load.
 */
const NO_DRIVER_SHORTFALL = "No driver assigned";

/* -------------------------------------------------------------------------- */
/* Verdicts                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The short tag under an unfit vehicle's row, or `null` for one that fits.
 *
 * **Every string here names the vehicle's shortfall and none of them names the
 * load's size.** The load is what the client booked and what the fleet already
 * claimed; it is not wrong, and a dispatcher cannot change it. What they can
 * change is which truck goes, which is the only thing these lines are for. The
 * same rule is written on the claim dialog's "Too small for this load" tag, and
 * it is the reason none of these quote a weight or a dimension: the figures on
 * the row above already say what the vehicle can do, and repeating the load's
 * numbers here would invite reading the refusal as a complaint about the job.
 *
 * Returning `null` rather than an empty string so the caller's `? :` is a
 * presence test and not a truthiness test on a string that could plausibly
 * arrive empty.
 */
function dispatchShortfall(verdict: DispatchVerdict): string | null {
  switch (verdict.kind) {
    case "FITS":
      return null;
    case "NOT_APPROVED":
      return "Not approved for dispatch";
    case "UNDER_BOOKED_CLASS":
      return "Under the booked vehicle class";
    case "WRONG_BODY_TYPE":
      return "Doesn't offer this load space";
    case "OVER_CARGO":
      return overCargoShortfall(verdict.axes);
  }
}

/**
 * Why this vehicle cannot take this delivery, or `null` when it can.
 *
 * Two obstacles feed one line, and **the fit problem outranks the missing
 * driver**. A truck that is too small for the load stays too small whoever is
 * assigned to it, so "No driver assigned" on such a row would send the
 * dispatcher off to the Vehicles screen to fix something that changes nothing
 * about this job. The precedence is not invented here either: it is the one the
 * server already applies one level up, where `dispatchVerdictFor`
 * (`src/lib/orders/dispatch-fit.ts`) returns `NOT_APPROVED` from its first
 * branch and never reaches the fit checks — so an unapproved *and* oversized
 * vehicle reports as unapproved, on the same reasoning: report the obstacle that
 * has to be cleared first.
 *
 * This returns `null` on exactly the vehicles `isDispatchable` accepts — both
 * are "the verdict is `FITS` and a driver is assigned", read from the two halves
 * in the same order — which is what lets a row use one for its text and the
 * other for its disabled state without the two disagreeing.
 */
function dispatchObstacle(vehicle: DispatchVehicle): string | null {
  const shortfall = dispatchShortfall(vehicle.verdict);

  if (shortfall !== null) {
    return shortfall;
  }

  return vehicle.pairedDriver === null ? NO_DRIVER_SHORTFALL : null;
}

/** `["weight"]` → `"Too heavy for this load"`; `["length", "weight"]` → `"Too heavy and too long for this load"`. */
function overCargoShortfall(axes: DispatchAxis[]): string {
  const words = AXIS_ORDER.filter((axis) => axes.includes(axis)).map(
    (axis) => `too ${AXIS_SHORTFALL[axis]}`,
  );

  // `pop` on an array `map` just produced, so nothing shared is mutated — and it
  // is what makes the last word a plain `string` under
  // `noUncheckedIndexedAccess`, where `words[words.length - 1]` is
  // `string | undefined` and would need an assertion to use. The `undefined`
  // here is the empty-`axes` case and is handled rather than asserted away.
  const last = words.pop();

  if (last === undefined) {
    return GENERIC_SHORTFALL;
  }

  // "too heavy", "too heavy and too long", "too heavy, too long and too tall".
  // Spelled out rather than run through an `Intl.ListFormat`: four items is the
  // ceiling, the locale is fixed, and a formatter would be a dependency on a
  // list this surface can enumerate.
  const joined = words.length === 0 ? last : `${words.join(", ")} and ${last}`;

  // Sentence case restored on the first word only — the rest of the clause is
  // lowercase by construction.
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)} for this load`;
}

/**
 * The wire's capability as `formatDims` takes one.
 *
 * **This is the `null` → `Infinity` translation, and it happens exactly here.**
 * `capability.heightM === null` means the bed is open and imposes no height
 * limit; JSON has no `Infinity` literal, so the endpoint spells it `null` and
 * this is where it becomes a number again. `formatDims` tests `Number.isFinite`
 * and prints "open" for anything that fails it — the only rendering of a
 * flatbed in this codebase that is not a lie. Translating to `0` would print
 * "0.0 m" (a hold with no height), and passing the `null` straight through
 * would not type-check against `formatDims`, which takes three plain numbers
 * precisely so that a caller has to make this decision consciously.
 *
 * The payload and the other two axes pass through untouched: they are always
 * bounded, and the endpoint has already resolved each vehicle's own declared
 * figures over its class catalogue's, so these are the **resolved** capability
 * and never the class's nominal one.
 */
function resolveCapability(capability: DispatchVehicle["capability"]): {
  lengthM: number;
  widthM: number;
  heightM: number;
} {
  return {
    lengthM: capability.lengthM,
    widthM: capability.widthM,
    heightM: capability.heightM ?? Number.POSITIVE_INFINITY,
  };
}

/**
 * The endpoint's own `{ error }` where it sent one, an HTTP fallback otherwise.
 *
 * Mirrors `confirmClaim`'s handling in `loads-context.tsx` down to the shape of
 * the fallback sentence. The route's messages name the real obstacle — an
 * unapproved vehicle, a driver who left the roster, an order that is no longer
 * `CLAIMED` — and nothing this file could word would be more useful, so the
 * generic line is only ever reached when the response carried no message at all.
 */
async function refusalMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;

  return typeof body?.error === "string"
    ? body.error
    : `${fallback} (HTTP ${response.status}).`;
}

/* -------------------------------------------------------------------------- */
/* Dialog                                                                     */
/* -------------------------------------------------------------------------- */

export type LoadsDispatchDialogProps = {
  /**
   * The order to dispatch, or `null` to render nothing.
   *
   * `null` is how this dialog is closed, exactly as a `null` `dialogLoad` closes
   * the confirm dialog: there is no `isOpen` companion boolean anywhere in this
   * feature, because two pieces of state describing one thing are two pieces of
   * state that can disagree about it.
   */
  orderId: string | null;
  /**
   * The human-readable `GE-48210` handle, for the description line. Optional —
   * `null` simply drops the reference from the sentence rather than printing a
   * dash, because the dispatcher already knows which order they pressed.
   */
  reference: string | null;
  /**
   * Dismissed without dispatching — the X, Escape, or a click outside.
   *
   * The dialog is dismissible by design: a dispatcher who claimed a load at
   * 18:00 may genuinely not know yet which truck takes it in the morning, and
   * the order simply sits in "Awaiting dispatch" until they do. The company job
   * sheet carries the way back in.
   */
  onClose: () => void;
  /**
   * The dispatch landed. **The caller decides what that means** — the board
   * re-reads `GET /api/loads`, the job sheet calls `router.refresh()` inside its
   * own transition — and the caller also closes the dialog, because on the job
   * sheet the close and the refresh have to happen in one transition or the
   * trigger re-enables over a sheet that has not caught up yet. This component
   * does not close itself: it does not know which of those two it is inside.
   */
  onDispatched: () => void;
};

export function LoadsDispatchDialog({
  orderId,
  reference,
  onClose,
  onDispatched,
}: LoadsDispatchDialogProps) {
  const [options, setOptions] = React.useState<DispatchOptionsResponse | null>(
    null,
  );
  const [optionsError, setOptionsError] = React.useState<string | null>(null);
  /**
   * Starts `true`, not `false`.
   *
   * The first paint happens before the effect below has run, and a list that
   * flashes "No vehicles" for one frame and then fills in is worse than one that
   * is honestly pending from the start. The effect is what clears it.
   */
  const [isLoadingOptions, setIsLoadingOptions] = React.useState(true);

  /**
   * The dispatcher's pick, and **the only choice this dialog collects**.
   *
   * It starts `null` and stays `null` until a row is pressed. There is
   * deliberately no effect seeding it from the recommended option: see "The
   * platform recommends; the dispatcher decides" in the module comment.
   */
  const [chosenVehicleId, setChosenVehicleId] = React.useState<string | null>(
    null,
  );

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  /**
   * Read the options once, when the dialog opens on an order.
   *
   * Keyed on `orderId` alone: both callers mount this fresh per order (the board
   * through a `key`, the job sheet by rendering it only while open), so this
   * runs once per dialog and never re-runs under a dispatcher mid-decision — a
   * re-read that reshuffled the list while someone was reading it would be the
   * same failure the confirm dialog's frozen snapshot exists to prevent.
   *
   * The abort is not an optimisation. React runs effects twice in development's
   * StrictMode and a dispatcher can close the dialog before the response lands;
   * without it, the second response would overwrite the first and a closed
   * dialog would still be flipping state.
   */
  React.useEffect(() => {
    if (orderId === null) {
      return;
    }

    const controller = new AbortController();

    setIsLoadingOptions(true);
    setOptionsError(null);

    async function read(id: string) {
      try {
        const response = await fetch(
          `/api/logistics-company/orders/${id}/dispatch-options`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          // 404 is the one refusal this dialog can reach by being *right* about
          // a stale fact rather than wrong about a request, so it is the one
          // that gets its own sentence. The board gates this control on
          // `HubLoad.dispatchable`, which is resolved server-side from the real
          // `OrderStatus`, so a 404 here is no longer the predictable failure it
          // was when the gate read `driverId === null` — it is the genuine race,
          // where the load was dispatched from another tab between the last poll
          // and this press. Every other status still carries the route's own
          // wording, which names an obstacle better than anything here could.
          setOptionsError(
            response.status === 404
              ? NOT_DISPATCHABLE_MESSAGE
              : await refusalMessage(
                  response,
                  "Couldn't load this order's vehicles",
                ),
          );
          return;
        }

        setOptions((await response.json()) as DispatchOptionsResponse);
      } catch {
        // An abort lands here too, and it is not a failure to report: the
        // dispatcher closed the dialog, and there is nothing left on screen to
        // tell. Every other throw is the network.
        if (controller.signal.aborted) {
          return;
        }

        setOptionsError(NETWORK_ERROR);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingOptions(false);
        }
      }
    }

    void read(orderId);

    return () => {
      controller.abort();
    };
  }, [orderId]);

  const vehicles = options?.vehicles ?? [];

  /**
   * The row the dispatcher pressed, whatever its state, resolved against the
   * list on every render rather than trusted from state.
   *
   * Separate from `chosenVehicle` below so the dispatchability test is a real
   * type guard applied to a real value — `Array.prototype.find` only narrows for
   * a predicate that *is* a guard, and folding the id comparison into it would
   * force an annotation that asserts the narrowing instead of proving it.
   */
  const pressedVehicle =
    vehicles.find((vehicle) => vehicle.vehicleId === chosenVehicleId) ?? null;

  /**
   * The vehicle the submit will actually name, and the driver with it.
   *
   * **Only ever a `DispatchableVehicle`.** The radios on every other row are
   * `disabled`, so an unfit or driverless id cannot come from this dialog, and
   * this is the floor under that — the endpoint re-checks all of it and would
   * refuse, but only after the dispatcher committed. The narrowing is also what
   * makes `pairedDriver` non-null for the POST below without an assertion.
   */
  const chosenVehicle =
    pressedVehicle !== null && isDispatchable(pressedVehicle)
      ? pressedVehicle
      : null;

  /**
   * One flag behind every disabled control on the panel.
   *
   * Both waits belong to it: the options read (nothing is choosable yet) and the
   * dispatch itself (a choice already committed). Deriving it once is what stops
   * the vehicle radios and the submit button from each growing their own
   * slightly different condition.
   */
  const isBusy = isLoadingOptions || isSubmitting;

  /**
   * Whether the list is in a state worth summarising underneath.
   *
   * Suppressed while the read is pending (the skeleton is the summary) and,
   * crucially, when it **failed**: a failed read leaves `options` at `null`, and
   * an empty `vehicles` array is then an artefact of the failure rather than a
   * fact about the fleet. Telling a dispatcher whose request 500'd that they
   * have no registered vehicles would be a confident lie printed directly under
   * the error saying the list could not be read.
   */
  const listNoteSuppressed = isLoadingOptions || optionsError !== null;

  /**
   * No target, no dialog.
   *
   * Below every hook above, because React requires a stable hook order across
   * renders and an early return before `useState` would change how many hooks
   * this component calls the moment its caller cleared the target. The same
   * guard, in the same place, for the same reason as the confirm dialog's.
   */
  if (orderId === null) {
    return null;
  }

  async function handleDispatch() {
    // The button is disabled without a pick, and this is the floor under that.
    // One test covers both halves the route requires: a `DispatchableVehicle`
    // carries its driver, so there is no second null to check and no
    // half-dispatch this function can send.
    if (orderId === null || chosenVehicle === null) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(
        `/api/logistics-company/orders/${orderId}/dispatch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // The vehicle's own driver, never a separately chosen one — that is
            // the whole change. Non-null by the type, not by an assertion.
            driverUserId: chosenVehicle.pairedDriver.userId,
            vehicleId: chosenVehicle.vehicleId,
          }),
        },
      );

      if (!response.ok) {
        setSubmitError(
          await refusalMessage(response, "Couldn't dispatch this delivery"),
        );
        return;
      }

      // The caller closes and resyncs. See `onDispatched`.
      onDispatched();
    } catch {
      setSubmitError(NETWORK_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // The X, Escape and the overlay all report through here. None of them
        // may interrupt a dispatch already in flight: a dialog dismissed
        // mid-submit leaves the answer — including a refusal the dispatcher
        // needs to act on — with nowhere to render.
        if (!open && !isBusy) {
          onClose();
        }
      }}
    >
      <DialogContent
        // Portalled outside the shell — see the module comment. Not optional.
        data-admin-surface=""
        // **Kept**, unlike the confirm dialog's, which suppresses it. That panel
        // has a Cancel/Confirm pair and the Cancel carries the dismiss; this one
        // has a single primary action, so without the X there would be no
        // visible way out of a dialog that is explicitly allowed to be
        // dismissed. Leaving an order in "Awaiting dispatch" is a legitimate
        // answer here, not an escape hatch.
        showCloseButton
        className="gap-0 p-0 sm:max-w-[440px]"
        onEscapeKeyDown={(event) => {
          if (isBusy) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (isBusy) {
            event.preventDefault();
          }
        }}
      >
        {/* `pr-10` keeps the title clear of the close button, which is
            positioned against the panel rather than flowed after the header. */}
        <DialogHeader className="gap-1 px-5 pt-5 pr-10">
          <DialogTitle className="text-base font-semibold tracking-[-0.01em]">
            Assign a driver and vehicle
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {reference === null ? (
              "Your company holds this delivery. Choose which vehicle takes it."
            ) : (
              <>
                Your company holds{" "}
                <span className="font-price">{reference}</span>. Choose which
                vehicle takes it.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <fieldset
          className="mx-5 mt-4 flex min-w-0 flex-col gap-2"
          aria-describedby="loads-dispatch-vehicle-note"
        >
          <legend className="mb-1.5 text-[13px] font-medium text-foreground">
            Vehicle
          </legend>
          {/* Says the thing the removed Driver field used to say by existing:
              the driver is not a second question, it rides with the plate. */}
          <p
            id="loads-dispatch-vehicle-note"
            className="mb-0.5 text-[13px] text-muted-foreground"
          >
            Every vehicle in your fleet is listed with the driver it goes out
            with. The ones this delivery can&rsquo;t go on say why.
          </p>

          {/* The list scrolls rather than the panel: the header, the note below
              and the button stay put while a large fleet is scrolled through,
              which is the only arrangement where the submit button is reachable
              without scrolling past forty plates. `-m-0.5 p-0.5` keeps a focused
              row's ring clear of the scroller's clip — the same trick
              `drivers-add-panel.tsx` uses on its own vehicle list. */}
          <div className="-m-0.5 flex max-h-[228px] min-w-0 flex-col gap-2 overflow-y-auto p-0.5">
            {isLoadingOptions ? (
              <DispatchRowSkeletons />
            ) : (
              // Rendered in the order received. See "Order is the server's" in
              // the module comment — this `map` is deliberately not preceded by
              // a `sort`.
              vehicles.map((vehicle) => (
                <DispatchVehicleRow
                  key={vehicle.vehicleId}
                  vehicle={vehicle}
                  selected={vehicle.vehicleId === chosenVehicle?.vehicleId}
                  disabled={isBusy}
                  onSelect={() => {
                    // The whole of this dialog's state-changing surface. There
                    // is no paired-driver copy to keep in step any more, which
                    // is the second half of what deleting the override bought.
                    setChosenVehicleId(vehicle.vehicleId);
                  }}
                />
              ))
            )}
          </div>

          {/* Outside the scroller on purpose: when every row is disabled the
              note is the one thing the dispatcher needs, and a fleet of twelve
              would bury it below the fold. */}
          <DispatchListNote
            vehicles={vehicles}
            suppressed={listNoteSuppressed}
          />
        </fieldset>

        {/* The options read failed, so there is nothing to choose from. Rendered
            where the message is useful rather than above the button: the button
            is disabled anyway, and the failure is about the list. */}
        {optionsError !== null ? (
          <p role="alert" className="mx-5 mt-4 text-[13px] text-destructive">
            {optionsError}
          </p>
        ) : null}

        {/* Inline above the button row, never an `alert()` — the pattern the
            whole hub follows. The endpoint's own message wherever it sent one:
            "This vehicle hasn't been approved yet", "Order not found", and the
            rest name things a dispatcher can act on. */}
        {submitError !== null ? (
          <p role="alert" className="mx-5 mt-4 text-[13px] text-destructive">
            {submitError}
          </p>
        ) : null}

        <div className="px-5 pt-4 pb-5">
          <Button
            type="button"
            className="h-10 w-full text-sm"
            // One condition now, where there were two: a chosen vehicle carries
            // its driver. It is `null` until the dispatcher presses a row — the
            // recommendation does not enable this button, which is the point of
            // marking rather than pre-selecting.
            disabled={isBusy || chosenVehicle === null}
            onClick={() => {
              void handleDispatch();
            }}
          >
            {/* Relabelled, never a spinner: the button is the only thing that
                changed and the label is the only place the change means
                anything. U+2026, not three periods. */}
            {isSubmitting ? "Assigning…" : "Assign and dispatch"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Vehicle row                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One vehicle, as a real radio inside a real `fieldset`.
 *
 * A `<label>` wrapping an `sr-only` `<input type="radio">`, with an
 * `aria-hidden` ring beside it, rather than a `<div onClick>`. The difference is
 * not cosmetic: the browser gives this group a single tab stop, arrow-key
 * movement between the options, an announced group name from the `<legend>`, and
 * a `disabled` state that assistive technology and the keyboard both honour. A
 * div with a click handler gets none of that and would have to reimplement all
 * four, which is how a picker ends up mouse-only. The input stays `sr-only`
 * rather than `hidden` precisely so it keeps its place in the accessibility tree
 * and the tab order while the ring carries the visual state — the pattern
 * `vehicles-add-form.tsx`, `drivers-add-panel.tsx` and the claim dialog all use.
 *
 * Everything inside the `<label>` is part of the option's accessible name, which
 * is why the driver's name, the "Recommended" tag and the obstacle line are all
 * plain text rather than decorations: a screen-reader user hears "GE-123 · Van,
 * 1,200 kg …, Recommended, Driver Nino Beridze" and has the same three facts a
 * sighted dispatcher reads off the row.
 */
function DispatchVehicleRow({
  vehicle,
  selected,
  disabled,
  onSelect,
}: {
  vehicle: DispatchVehicle;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const dispatchable = isDispatchable(vehicle);
  const obstacle = dispatchObstacle(vehicle);

  // A recommendation on a row nobody can press is not advice, it is noise — and
  // it would flatly contradict the disabled tag beside it. The contract says the
  // server only ever marks a dispatchable option, so this guard is expected to
  // be a no-op; it is here because the tag is the one element on the row that
  // would read as an instruction if the two halves of the response ever drifted.
  const showRecommendation = vehicle.recommended && dispatchable;

  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 rounded-[10px] border p-3 transition-colors",
        !dispatchable
          ? "cursor-not-allowed border-border bg-background opacity-60"
          : "cursor-pointer has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        // The row's border and fill are reserved for **selection**, and nothing
        // else on the row is allowed to touch them. See `RecommendedTag`.
        dispatchable &&
          (selected
            ? "border-foreground bg-muted"
            : "border-border bg-background hover:bg-muted/50"),
      )}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">
          <span className="font-price">{vehicle.plateNumber}</span> ·{" "}
          {vehicle.classLabel}
          {showRecommendation ? <RecommendedTag /> : null}
        </span>
        {/* The **resolved** capability the endpoint computed for this specific
            vehicle — its own declared figures over its class catalogue's — and
            never the class's nominal numbers, which would describe a truck the
            fleet may not own. `formatDims` prints an open bed as "open"; see
            `resolveCapability` for the `null` it is handed as. */}
        <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          {formatWeightKg(vehicle.capability.payloadKg)} ·{" "}
          {formatDims(resolveCapability(vehicle.capability))}
        </span>
        {/* The third-row slot, and it now answers one of two questions: either
            why this vehicle cannot go, or **who goes with it**.

            The driver's name on a fitting row is a reversal. It was deliberately
            left off while a separate Driver field existed below the list, on the
            reasoning that a line on every row would restate what that field said
            about the one row that mattered. That field is gone — the vehicle's
            assignment *is* the dispatch now — so this row is the only place the
            dispatcher ever sees who they are about to send, and omitting it
            would mean committing a named person to a job without their name
            appearing anywhere on the screen.

            The two never compete for the slot: `dispatchObstacle` returns `null`
            on exactly the rows that are dispatchable, so a row shows an obstacle
            or a driver and never both. An unfit vehicle's driver is left unsaid
            on purpose — that row cannot be pressed, so who drives it is not a
            fact the dispatcher has to weigh. */}
        {obstacle !== null ? (
          <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
            {obstacle}
          </span>
        ) : vehicle.pairedDriver !== null ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Driver:{" "}
            <span className="font-medium text-foreground">
              {vehicle.pairedDriver.name}
            </span>
            {/* Carried over from the roster select this row replaced. Offline is
                not a blocker — `POST .../dispatch` accepts an offline driver and
                a dispatcher routinely assigns work to someone who has not opened
                the app yet — but it is worth knowing before pressing, so it is
                shown and never enforced. */}
            {vehicle.pairedDriver.isOnline ? null : <span> · Offline</span>}
          </span>
        ) : null}
      </span>
      <input
        type="radio"
        name="loads-dispatch-vehicle"
        value={vehicle.vehicleId}
        checked={selected}
        onChange={onSelect}
        // `disabled` on the **real** radio, not merely `cursor-not-allowed` on
        // the label: pointer styling stops a mouse and nothing else. This is
        // what takes the row out of the arrow-key rotation and reports it as
        // unavailable rather than as an option somebody failed to notice. A
        // driverless vehicle is disabled here for the same reason an oversized
        // one is: the route would refuse it.
        disabled={disabled || !dispatchable}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0 rounded-full",
          selected ? "border-[5px] border-foreground" : "border border-border",
        )}
      />
    </label>
  );
}

/**
 * "Recommended" — the server's suggestion, and it must not read as a choice
 * already made.
 *
 * The two signals are kept in **different channels**, which is the whole design:
 *
 * - *Selected* is structural. It is the row's `border-foreground`, its `bg-muted`
 *   fill and the filled radio on the right — the same three things every picker
 *   in this hub uses for the state, and none of them appear anywhere in this
 *   tag.
 * - *Recommended* is a word. A small outlined pill in `text-muted-foreground`,
 *   inline with the plate, adding no fill and no border to the row itself.
 *
 * So a recommended row that has not been pressed keeps a plain border and an
 * empty radio — unmistakably unchosen — and pressing it adds the border, the
 * fill and the dot *underneath* a tag that has not changed. Both facts stay
 * readable at once, which a shared channel (tinting the recommended row, or
 * pre-filling its radio) could not manage: the dispatcher would have to work out
 * whether the highlight meant "we suggest" or "you picked", and on the fast path
 * they would not.
 *
 * Muted rather than an accent colour for the same reason. The recommendation is
 * the platform's opinion about a fleet it cannot see today; loud styling would
 * make skipping it feel like overriding a warning, and skipping it is an
 * entirely ordinary thing for a dispatcher to do.
 */
function RecommendedTag() {
  return (
    <Badge
      variant="outline"
      className="ml-1.5 h-auto rounded-full border-border bg-transparent px-[7px] py-px align-middle text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase"
    >
      Recommended
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Pending list                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What the row list is while the options are in flight.
 *
 * `aria-hidden`, with no text and no role: it carries no information, and a
 * screen reader announcing three empty boxes would be worse than silence. The
 * submit button below is disabled and still says "Assign and dispatch", which is
 * the honest account of the state — nothing has been chosen and nothing has
 * happened.
 *
 * Boxes at the real row height rather than a shrinking bar, so the panel does
 * not resize under the pointer when the answer lands.
 */
function DispatchRowSkeletons() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <div
          key={index}
          className="h-[58px] animate-pulse rounded-[10px] border border-border bg-muted"
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* List note                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The sentence under the list for the three states in which **the submit button
 * can never enable**, whatever the dispatcher does.
 *
 * Each of them is a dialog that would otherwise look broken — an empty box, or a
 * full list where every row refuses the pointer and a dead primary button sits
 * underneath with nothing to explain it. A disabled control with no stated
 * reason is read as a bug, and the dispatcher's next move is to retry rather
 * than to go and fix the fleet.
 *
 * The three are genuinely different problems with different fixes:
 *
 * - **No vehicles at all** — register one.
 * - **Vehicles that fit, none of them driven** — the change that made this state
 *   reachable at all. Assign a driver on the Vehicles screen; the trucks are
 *   fine.
 * - **Nothing fits** — nothing on this screen will help. The rows above each say
 *   why, so this only has to say that they all do.
 *
 * The order of the tests is the order of severity, and the middle one is checked
 * against `FITS` rather than against "not every row is unfit" so the actionable
 * message is only offered when there is genuinely a truck waiting on a driver.
 */
function DispatchListNote({
  vehicles,
  /** Pending or failed read — see `listNoteSuppressed` for why a failure counts. */
  suppressed,
}: {
  vehicles: DispatchVehicle[];
  suppressed: boolean;
}) {
  if (suppressed) {
    return null;
  }

  if (vehicles.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Your fleet has no registered vehicles. Register one from the Vehicles
        screen, then dispatch this delivery.
      </p>
    );
  }

  // Something is pressable, so the list speaks for itself.
  if (vehicles.some(isDispatchable)) {
    return null;
  }

  if (vehicles.some((vehicle) => vehicle.verdict.kind === "FITS")) {
    return (
      <p className="text-[13px] text-muted-foreground">
        The vehicles that can take this delivery have no driver assigned. Assign
        one from the Vehicles screen, then dispatch this delivery.
      </p>
    );
  }

  return (
    <p className="text-[13px] text-muted-foreground">
      None of your vehicles can take this delivery. Each one above says why.
    </p>
  );
}
