"use client";

import * as React from "react";

import {
  formatDims,
  formatWeightKg,
} from "@/components/driver-hub/screens/loads-format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
 * em-dash instead and every flatbed on the roster prints a height of "0.0 m",
 * which reads as a vehicle with no usable hold at all. Getting this backwards is
 * silent: the figure is plausible, just wrong, on exactly the class of vehicle a
 * fleet dispatches the awkward loads to.
 *
 * ## Vehicle first, driver second, and the driver is only pre-filled
 *
 * Picking a vehicle fills in the driver it is paired with; the dispatcher can
 * still pick anyone on the roster instead. A vehicle with **no** paired driver
 * is still dispatchable — the field simply starts empty and a driver is chosen
 * by hand. `POST .../dispatch` requires `driverUserId` *and* `vehicleId` and
 * rejects either alone, so the submit button is dead until both are settled:
 * there is no half-dispatch to send.
 *
 * ## Every vehicle is listed, and the unfit ones say why
 *
 * The endpoint returns a verdict per vehicle rather than a filtered list, and
 * this renders all of them — the unfit ones disabled, with the shortfall named.
 * A dispatcher shown a shorter list learns nothing about why their other six
 * trucks are not on it; a dispatcher shown "Not approved for dispatch" beside a
 * plate knows what to go and fix. `disabled` on the **real radio** is what makes
 * those rows unselectable to the keyboard and to assistive technology, not just
 * to the pointer.
 *
 * ## `data-admin-surface=""` on `DialogContent` — mandatory
 *
 * Radix portals its content to `document.body`, outside the `DriverHubShell`
 * root that carries `data-admin-surface` and with it the scheme pin that makes
 * `bg-card` / `bg-muted` / `border-border` resolve to the hub palette rather
 * than the marketing one. There is no wrapper up the tree that can carry it on
 * this component's behalf. The same applies to the roster `SelectContent`, which
 * is portalled separately and needs its own. See the doc comment on
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
  pairedDriver: DispatchDriver | null;
  verdict: DispatchVerdict;
};

type DispatchOptionsResponse = {
  vehicles: DispatchVehicle[];
  roster: DispatchDriver[];
};

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

  const [chosenVehicleId, setChosenVehicleId] = React.useState<string | null>(
    null,
  );
  /**
   * A driver chosen **instead of** the vehicle's pairing, or `null` for "use
   * whatever the vehicle came with".
   *
   * The null is the default rather than a value waiting to be filled in, which
   * is what keeps the pre-fill out of an effect: `driverUserId` below resolves
   * it against the selected vehicle on every render, so there is no moment where
   * a synced copy of the paired driver can be stale. It is also what makes the
   * "paired with this vehicle" note truthful — the note is the state, not a
   * guess about how the id in the field got there.
   */
  const [chosenDriverId, setChosenDriverId] = React.useState<string | null>(
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
          setOptionsError(
            await refusalMessage(
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

  /**
   * The vehicle the submit will actually name.
   *
   * Resolved against the list on every render rather than trusted from state,
   * and **only ever a vehicle whose verdict is `FITS`**: the radios for the
   * others are `disabled`, so an unfit id cannot come from this dialog, and this
   * is the floor under that. The endpoint re-checks all of it and would refuse —
   * after the dispatcher committed, which is the outcome the whole verdict list
   * exists to prevent.
   */
  const chosenVehicle =
    options?.vehicles.find(
      (vehicle) =>
        vehicle.vehicleId === chosenVehicleId &&
        vehicle.verdict.kind === "FITS",
    ) ?? null;

  /** The vehicle's own driver, which is what the field pre-fills with. */
  const pairedDriver = chosenVehicle?.pairedDriver ?? null;

  /**
   * The driver the submit will name: the dispatcher's override where they made
   * one, the vehicle's pairing otherwise, `null` when neither exists.
   *
   * A `null` here is a perfectly ordinary state and not an error — a vehicle
   * nobody is paired with is still dispatchable, the dispatcher just has to say
   * who is driving it. It disables the submit button and nothing else.
   */
  const driverUserId = chosenDriverId ?? pairedDriver?.userId ?? null;

  /**
   * One flag behind every disabled control on the panel.
   *
   * Both waits belong to it: the options read (nothing is choosable yet) and the
   * dispatch itself (a choice already committed). Deriving it once is what stops
   * the vehicle radios, the roster select and the submit button from each
   * growing their own slightly different condition.
   */
  const isBusy = isLoadingOptions || isSubmitting;

  const vehicles = options?.vehicles ?? [];
  const roster = options?.roster ?? [];

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
    // Both halves are required by the route, which rejects either alone — the
    // button is disabled without them, and this is the floor under that.
    if (orderId === null || driverUserId === null || chosenVehicle === null) {
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
            driverUserId,
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
          <p
            id="loads-dispatch-vehicle-note"
            className="mb-0.5 text-[13px] text-muted-foreground"
          >
            Every vehicle in your fleet is listed. The ones this delivery
            can&rsquo;t go on say why.
          </p>

          {/* The list scrolls rather than the panel: the header, the driver
              field and the button stay put while a large fleet is scrolled
              through, which is the only arrangement where the submit button is
              reachable without scrolling past forty plates. `-m-0.5 p-0.5`
              keeps a focused row's ring clear of the scroller's clip — the same
              trick `drivers-add-panel.tsx` uses on its own vehicle list. */}
          <div className="-m-0.5 flex max-h-[228px] min-w-0 flex-col gap-2 overflow-y-auto p-0.5">
            {isLoadingOptions ? (
              <DispatchRowSkeletons />
            ) : (
              vehicles.map((vehicle) => (
                <DispatchVehicleRow
                  key={vehicle.vehicleId}
                  vehicle={vehicle}
                  selected={vehicle.vehicleId === chosenVehicle?.vehicleId}
                  disabled={isBusy}
                  onSelect={() => {
                    setChosenVehicleId(vehicle.vehicleId);
                    // The pre-fill belongs to the vehicle, so changing the
                    // vehicle drops any override made against the previous one.
                    // Keeping it would leave a dispatcher who picked a driver
                    // for the box truck silently dispatching that same driver in
                    // the van they switched to — a pairing they never chose,
                    // under a field that claims nothing about where it came
                    // from. Done in the handler rather than in an effect
                    // watching `chosenVehicleId`: it is a consequence of this
                    // press, not of the state settling.
                    setChosenDriverId(null);
                  }}
                />
              ))
            )}

            {!isLoadingOptions && vehicles.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Your fleet has no registered vehicles. Register one from the
                Vehicles screen, then dispatch this delivery.
              </p>
            ) : null}
          </div>
        </fieldset>

        <div className="mx-5 mt-4 flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor="loads-dispatch-driver"
            className="text-[13px] font-medium text-foreground"
          >
            Driver
          </label>

          <Select
            // The resolved driver, which is the pairing until the dispatcher
            // overrides it. `""` rather than `undefined` would make this an
            // uncontrolled select; `undefined` is what Radix reads as "no
            // value", which is what shows the placeholder.
            value={driverUserId ?? undefined}
            onValueChange={setChosenDriverId}
            disabled={isBusy || chosenVehicle === null || roster.length === 0}
          >
            <SelectTrigger
              id="loads-dispatch-driver"
              className="w-full data-[size=default]:h-10"
            >
              <SelectValue
                placeholder={
                  chosenVehicle === null
                    ? "Pick a vehicle first"
                    : "Pick a driver"
                }
              />
            </SelectTrigger>
            {/* Portalled separately from the dialog and out of the shell, so it
                carries its own scheme pin. See the module comment. */}
            <SelectContent data-admin-surface="" className="max-h-64">
              {roster.map((driver) => (
                <SelectItem key={driver.userId} value={driver.userId}>
                  {driver.name}
                  {driver.isOnline ? null : (
                    <span className="text-muted-foreground"> · Offline</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Where the name in the field came from, said out loud. The whole
              point of the pre-fill is that it is a suggestion rather than a
              decision, and a filled field with nothing beside it reads as a
              decision somebody else already made. */}
          <DispatchDriverNote
            hasVehicle={chosenVehicle !== null}
            // Overridden means "not the driver this vehicle came with", not
            // merely "the select was touched". A dispatcher who opens the list
            // and picks the paired driver back out of it has changed nothing,
            // and telling them they chose someone other than the usual driver
            // would be false.
            isOverridden={
              chosenDriverId !== null && chosenDriverId !== pairedDriver?.userId
            }
            pairedDriver={pairedDriver}
            rosterIsEmpty={!isLoadingOptions && roster.length === 0}
          />
        </div>

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
            // Both halves, because the route rejects either alone. A button that
            // submits half a dispatch would collect a 400 the dialog could have
            // prevented, after the press.
            disabled={isBusy || chosenVehicle === null || driverUserId === null}
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
  const shortfall = dispatchShortfall(vehicle.verdict);
  const unfit = shortfall !== null;

  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 rounded-[10px] border p-3 transition-colors",
        unfit
          ? "cursor-not-allowed border-border bg-background opacity-60"
          : "cursor-pointer has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        !unfit &&
          (selected
            ? "border-foreground bg-muted"
            : "border-border bg-background hover:bg-muted/50"),
      )}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">
          <span className="font-price">{vehicle.plateNumber}</span> ·{" "}
          {vehicle.classLabel}
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
        {/* The third-row slot, and it means one thing only: this vehicle cannot
            take this delivery, and here is why. The paired driver's name was
            considered for this slot on the fitting rows and left out — it would
            put a line on every row to restate what the Driver field below says
            about the one row that matters, and it would blur a slot whose whole
            value is that seeing it means "unavailable". */}
        {shortfall === null ? null : (
          <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
            {shortfall}
          </span>
        )}
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
        // unavailable rather than as an option somebody failed to notice.
        disabled={disabled || unfit}
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

/* -------------------------------------------------------------------------- */
/* Pending list                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What the row list is while the options are in flight.
 *
 * `aria-hidden`, with no text and no role: it carries no information, and a
 * screen reader announcing three empty boxes would be worse than silence. The
 * `Select` beside it is disabled and the button says nothing has happened yet,
 * which between them is the honest account of the state.
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
/* Driver note                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The sentence under the roster select, which exists to make one distinction
 * legible: **is the name in that field the vehicle's pairing, or a choice?**
 *
 * Four states, and they are genuinely four different facts rather than one
 * message with holes in it:
 *
 * - no vehicle yet — the field is disabled and the note says what unlocks it;
 * - pre-filled — the name came with the vehicle and can be changed;
 * - overridden — the dispatcher chose it, and the vehicle's own driver is not
 *   going;
 * - no pairing — a legitimate state, not an error. The vehicle is dispatchable
 *   and somebody has to be named.
 *
 * Written as a component rather than a nested ternary in the panel so each
 * branch can carry its own wording and the panel's JSX stays readable.
 */
function DispatchDriverNote({
  hasVehicle,
  isOverridden,
  pairedDriver,
  rosterIsEmpty,
}: {
  hasVehicle: boolean;
  isOverridden: boolean;
  pairedDriver: DispatchDriver | null;
  rosterIsEmpty: boolean;
}) {
  // The hard stop, and it outranks the rest: nobody is on the roster, so no
  // dispatch is possible whatever vehicle is picked. Said here rather than left
  // to a disabled button with no explanation.
  if (rosterIsEmpty) {
    return (
      <p className="text-xs text-muted-foreground">
        Your roster has no drivers. Add one from the Drivers screen, then
        dispatch this delivery.
      </p>
    );
  }

  if (!hasVehicle) {
    return (
      <p className="text-xs text-muted-foreground">
        Pick a vehicle above and its driver fills in here.
      </p>
    );
  }

  if (isOverridden) {
    return (
      <p className="text-xs text-muted-foreground">
        Chosen from your roster, not this vehicle&rsquo;s usual driver.
      </p>
    );
  }

  if (pairedDriver === null) {
    return (
      <p className="text-xs text-muted-foreground">
        No driver is paired with this vehicle. Pick who&rsquo;s driving it.
      </p>
    );
  }

  return (
    <p className="text-xs text-muted-foreground">
      Paired with this vehicle. Pick someone else to send them instead.
    </p>
  );
}
