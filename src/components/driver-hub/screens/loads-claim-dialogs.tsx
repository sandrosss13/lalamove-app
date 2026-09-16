"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  useLoadsBoard,
  type HubLoad,
} from "@/components/driver-hub/screens/loads-context";
import { LoadsDispatchDialog } from "@/components/driver-hub/screens/loads-dispatch-dialog";
import {
  EM_DASH,
  cargoCategoryLabel,
  formatAbsoluteDateTime,
  formatAbsoluteWindow,
  formatDims,
  formatDistanceKm,
  formatGelExact,
  formatHelperRequest,
  formatLoadDims,
  formatWeightKg,
} from "@/components/driver-hub/screens/loads-format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The two dialogs that decide whether a driver actually gets a load: the
 * **confirm** dialog a driver reaches from Accept anywhere on the board, and the
 * **lost-the-race** dialog it hands off to when another account's claim landed
 * first. Sections 4 and 5 of the design handoff
 * (`UI:UX/Order Dashboard/design_handoff_driver_load_board/README.md`).
 *
 * Both are rendered unconditionally by `loads-screen.tsx` and both render
 * nothing until the board's state names a target, so this component takes no
 * props — like every other Wave 4 surface, everything it reads comes from
 * `useLoadsBoard()`.
 *
 * ## Where the race is actually decided
 *
 * Nowhere in this file. The confirm button calls `confirmClaim()`, which always
 * issues the claim request and branches only on the response: the winner is
 * chosen by the endpoint's atomic conditional update, never by a client-side
 * look at `load.status`. A board that has not polled for thirty seconds still
 * behaves correctly, because it never guesses — it asks. A `409` comes back as
 * `lostLoad`, and the second dialog below explains it.
 *
 * ## The board refreshes underneath this dialog, and must not reach it
 *
 * `loads-context.tsx` re-reads `GET /api/loads` every ten seconds, so the row
 * this dialog describes can be replaced by a fresher one while the driver is
 * still reading it. None of that is allowed through: `dialogLoad` is a snapshot
 * the context froze when `openConfirm` ran, not a lookup it repeats, so every
 * figure below — reference, route, cargo, weight, distance, payout — is fixed
 * for as long as the dialog stays open.
 *
 * **Do not "fix" this by resolving the row from the board on render.** The
 * numbers a driver commits to have to be the numbers they were shown, and a
 * summary that rewrites itself mid-decision is the one way this dialog can
 * mislead. A poll may also never close this dialog, swap it for the
 * lost-the-race one, or pre-empt a claim already in flight: the only thing that
 * moves a driver from here to the second dialog is their own submit coming back
 * `409`.
 *
 * ## Which vehicle claims the load, and who picks it
 *
 * A driver's claim has to name one vehicle. The board's context works out which
 * of the driver's vehicles the booking permits — registered under the booked
 * class or at or above it on payload, length, width and height, and offering the
 * body the client asked for — and, for each of those, whether this load's cargo
 * actually goes in it. It hands both answers down as `claimCandidates`, whose
 * `fits` flag carries the second. See `claimCandidatesFor` in
 * `loads-context.tsx` for the rule and for why the client mirrors the server's
 * version of it instead of sending any vehicle and letting the claim route sort
 * it out.
 *
 * What is decided *here* is who chooses between them:
 *
 * - **One candidate** — no picker. There is nothing to ask about, and a radio
 *   group with a single option is a question that reads as a decision.
 * - **Two or more** — the picker below, defaulting to the first candidate that
 *   fits the load, which is the smallest qualifying vehicle by payload. Every
 *   candidate satisfies what the client booked, so the platform has no basis for
 *   preferring one of the ones that can take the job; the driver knows which
 *   truck is loaded, lent out, or in the shop today and the platform does not, so
 *   the driver picks. The default is the choice that leaves their bigger vehicles
 *   free for work that needs them.
 *
 *   A candidate that does *not* fit stays in the list, disabled and labelled
 *   "Too small for this load". It is a vehicle the driver may bring to this class
 *   of booking but not to this particular load, which is worth saying: the board
 *   lists a load as soon as one of an account's vehicles fits it, so a mixed
 *   fleet reaches this dialog routinely. It can never be the default and cannot
 *   be selected, because `POST /api/orders/[id]/accept` refuses it — a picker
 *   that offered it would produce a refusal *after* the driver committed, which
 *   is the failure this dialog exists to prevent.
 * - **None** — no picker and no request. Confirm reports the context's
 *   `NO_ELIGIBLE_VEHICLE_MESSAGE` when nothing qualified at all, or its
 *   `NO_FITTING_VEHICLE_MESSAGE` when something qualified and nothing fit. Both
 *   are worded from the claim route's own refusals, so the driver cannot be told
 *   two different things about one load.
 *
 * The choice is local state here rather than context state, and the `key` on
 * this dialog is what resets it when the driver moves to another row — the same
 * mechanism the hazmat acknowledgement relies on, for the same reason: a vehicle
 * picked for one load means nothing on the next.
 *
 * ## The money rule, restated where it is easiest to break
 *
 * The confirm dialog's headline is "You are paid", and the figure beside it is
 * `HubLoad.driverPayout` — the driver's 85% share, resolved and stored at
 * booking. `Order.price` is what the *client* pays; it is not on `HubLoad`, it
 * is not in `GET /api/loads`'s response, and it must never reach this dialog.
 * Being wrong here is wrong in the driver's favour, which is the worst
 * direction: it sets an expectation the driver acts on and the platform then has
 * to walk back.
 *
 * ## `data-admin-surface` on both `DialogContent`s
 *
 * Radix portals its dialog content to the document body, outside the
 * `DriverHubShell` root that carries `data-admin-surface` — and with it the
 * light-scheme pin that makes `bg-muted` / `bg-card` / `border-border` resolve
 * to the Lalamove palette rather than the marketing one. Two dialogs, two
 * attributes; there is no shared wrapper that can carry it for them. See the doc
 * comment on `src/components/driver-hub/driver-hub-shell.tsx`.
 *
 * ## The hazmat acknowledgement is a UI-only gate
 *
 * Checking the box below is an attestation, not a control. `DriverLicence`
 * carries no certification field, so **nothing server-side verifies it** — a
 * driver who ticks it inaccurately is stopped by nothing downstream, and the
 * claim endpoints do not know the box exists.
 * `specs/driver-load-board/requirements.md`'s Non-Goals ("Hazmat loads are
 * tagged and warned about, not gated") and
 * `specs/driver-load-board/action-required.md`'s "Gate hazmat loads on driver
 * certification" item track the real compliance exposure this leaves. The
 * checkbox exists to make a driver pause and attest, not to enforce compliance.
 */

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every string in this file comes from `loads-format.ts`.
 *
 * This dialog used to carry its own clock, day-month, ISO-parse, window,
 * deadline, cargo-category and helper-sentence helpers, written here only
 * because that module was fenced to a sibling task while this file was being
 * built. They are all shared now, which is what stops the drawer and this dialog
 * from naming one pick-up window two different ways — the failure the old
 * comment here warned against and which had already happened one file over: the
 * drawer printed "4 Aug, 18:00" where this dialog printed "4 Aug 18:00".
 *
 * **The absolute phrasing survives the merge, deliberately.** The board's rows
 * label an instant relatively ("Today 14:00–16:00") through
 * `formatPickupWindow`; this dialog names it as a date through
 * `formatAbsoluteWindow` and `formatAbsoluteDateTime`. A relative label needs a
 * "now" to compare against, and this is the one screen a driver can leave open
 * across Tbilisi midnight while deciding — where "Today" would quietly become a
 * lie on the exact screen they commit from. The two are separate shared
 * functions rather than a forked formatter, so both spellings still come from
 * one place.
 */

/**
 * **A constant, never derived from a field.**
 *
 * The schema supports exactly one pickup and one dropoff — there is no `stops`
 * column to read and no multi-stop order to count
 * (`specs/driver-load-board/requirements.md`, Non-Goals). The prototype's sample
 * data shows a `stops: 3` load; it is fiction.
 */
const STOP_COUNT_TEXT = "2 stops";

/** The endpoint that owns `DriverProfile.isOnline`, as `HubOnlineToggle` calls it. */
const STATUS_ENDPOINT = "/api/driver-profile/status";

const ONLINE_GENERIC_ERROR = "Could not update your online status.";
const ONLINE_NETWORK_ERROR =
  "Couldn't reach the server. Check your connection and retry.";

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Mounts both dialogs and hands each the target the board's state names, which
 * is `null` whenever that dialog should not be on screen. Each renders nothing
 * in that case, so an always-mounted pair is inert until a driver acts.
 *
 * **This is the only component in this file the board screen mounts**, and it
 * takes no props — like every other Wave 4 surface, everything it needs comes
 * from `useLoadsBoard()`. The two dialogs below are exported for the record and
 * for testing; mounting either of them a second time elsewhere would put two
 * confirm dialogs on the same load, which is exactly what this single mount
 * point exists to prevent.
 *
 * The `key` on the confirm dialog is what resets its local state — the hazmat
 * acknowledgement, the chosen claim vehicle, any go-online error — when the
 * driver moves from one row to another without closing the dialog in between.
 * Without it, a box ticked for one load would still be ticked for the next, and
 * a vehicle picked for one booking would be pre-selected for a booking that may
 * not even permit it.
 *
 * It is keyed on the load's **id**, and `dialogLoad` is a frozen snapshot, so a
 * background poll cannot change it and cannot therefore remount this dialog
 * from under a driver mid-decision — which would clear exactly that hazmat tick
 * and any go-online error alongside it.
 *
 * The three are siblings rather than an either/or: `confirmClaim()` sets
 * `lostLoad` and clears `dialogId` in the same update, and on a company's
 * success it sets `dispatchTarget` and clears `dialogId` in the same update, so
 * for one commit two of them are non-null. Rendering them independently means
 * that never produces a dialog that fails to open — a mutually-exclusive
 * arrangement would have to pick a winner, and the one it dropped would be the
 * one the account had just earned.
 *
 * ## The third dialog, and why its `key` matters as much as the first's
 *
 * `LoadsDispatchDialog` is the fleet's follow-up step: a `"BUSINESS"` claim
 * names no vehicle and no driver, so the order it wins sits in "Awaiting
 * dispatch" until somebody assigns one. `confirmClaim` hands it the frozen
 * snapshot it just claimed, and it fetches the fleet's options by order id from
 * there.
 *
 * It is keyed on the target's id for the same reason the confirm dialog is, and
 * the consequence is more concrete: **a vehicle chosen for one order must not
 * survive into the next order's dialog.** The pick is local state in that
 * component, so without the key a dispatcher who claimed two loads in a row
 * would find the second dialog pre-selected with the first one's truck — under
 * a driver field that would then claim, truthfully but uselessly, that the name
 * in it is paired with a vehicle they never picked for this job. The `"none"`
 * fallback also remounts it between openings, which is what drops a stale
 * options list and a spent error.
 *
 * Unlike the other two it takes no board state of its own beyond that target:
 * it also opens from the company job sheet, which has no `LoadsProvider` above
 * it, so everything it needs arrives as props.
 */
export function LoadsClaimDialogs() {
  const { dialogLoad, lostLoad, dispatchTarget, closeDispatch, refetch } =
    useLoadsBoard();

  return (
    <>
      <LoadsConfirmDialog key={dialogLoad?.id ?? "none"} load={dialogLoad} />
      <LoadsLostRaceDialog reference={lostLoad?.reference ?? null} />
      <LoadsDispatchDialog
        key={dispatchTarget?.id ?? "none"}
        orderId={dispatchTarget?.id ?? null}
        reference={dispatchTarget?.reference ?? null}
        onClose={closeDispatch}
        // Close, then re-read the board. The dispatch moved the order from
        // `CLAIMED` to `ACCEPTED` with a driver and a plate on it, which is a
        // change the `mine` tab is now stale about — and `refetch` is the
        // foreground read, so a failure surfaces through `loadError` rather than
        // leaving a quietly wrong list. Closing first because the dialog's work
        // is done either way; whether the board catches up is a separate
        // question from whether the dispatch landed.
        onDispatched={() => {
          closeDispatch();
          void refetch();
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirm dialog                                                             */
/* -------------------------------------------------------------------------- */

export type LoadsConfirmDialogProps = {
  /**
   * The load being confirmed, or `null` — a `null` `dialogLoad` on the board
   * closes this dialog, and this component then renders nothing at all rather
   * than an empty panel.
   *
   * A snapshot taken when the dialog opened, not a live row. See the module
   * comment: this component must render whatever it is handed and never re-read
   * the board for a fresher copy.
   */
  load: HubLoad | null;
};

/**
 * "Confirm this shipment" — the one place on the board that claims a load.
 *
 * The table, the drawer and the mobile cards all only ever *open* this dialog by
 * id. That is what keeps the claim's three outcomes (won, lost the race,
 * refused) in a single place instead of three, and it is why `confirmClaim()`
 * lives on the board context rather than here: this component renders a
 * decision, the context performs it.
 *
 * Three pieces of state drive everything below, and only one of them is local:
 *
 * - `isClaiming` (context) — a request is in flight. The button relabels, and
 *   Escape and outside-click are blocked, because a dialog dismissed mid-submit
 *   leaves the eventual answer nowhere to render.
 * - `claimError` (context) — the last refusal. `code === "DRIVER_OFFLINE"` is
 *   the one worth branching on: it is recoverable in place, so it replaces the
 *   button row with a prompt instead of a dead-end message.
 * - `hazmatAcknowledged` (local) — see the module comment. UI-only.
 *
 * Mount it through `LoadsClaimDialogs` and nowhere else: two of these on the
 * same board would offer two Confirm buttons for one load.
 */
export function LoadsConfirmDialog({ load }: LoadsConfirmDialogProps) {
  const {
    accountKind,
    claimCandidates,
    closeConfirm,
    confirmClaim,
    isClaiming,
    claimError,
    dismissClaimError,
  } = useLoadsBoard();
  const router = useRouter();

  /**
   * Whether this session is a logistics company rather than an individual
   * driver, which decides two things below: the needs-assignment note, and
   * whether a `DRIVER_OFFLINE` refusal is offered a remedy.
   *
   * Read from the board's own `accountKind`, which `loads/page.tsx` resolves
   * server-side through `resolveHubAccount()` and hands to `LoadsProvider` —
   * the same value `confirmClaim` picks its endpoint with, so the note and the
   * request it describes can never disagree. This used to call `useSession()`
   * and re-derive `role === "COMPANY"`: the same fact by a longer route, and one
   * that arrives a render late, so a company account's first paint of this
   * dialog showed the individual driver's copy.
   */
  const isCompanyAccount = accountKind === "BUSINESS";

  const [hazmatAcknowledged, setHazmatAcknowledged] = React.useState(false);
  const [isGoingOnline, setIsGoingOnline] = React.useState(false);
  const [goOnlineError, setGoOnlineError] = React.useState<string | null>(null);

  /**
   * Which vehicle the driver picked, or `null` for "hasn't picked one".
   *
   * The null is not a missing value to be filled in on mount: it is the default,
   * and `chosenCandidate` below resolves it to the first candidate on every
   * render. Storing the default id in state instead would have to be kept in
   * step with a candidate list that changes whenever the dialog's load does —
   * which is exactly the effect-driven state this component has none of. Reset
   * per load by the `key` on this component; see the module comment.
   */
  const [chosenVehicleId, setChosenVehicleId] = React.useState<string | null>(
    null,
  );

  /**
   * The candidate the Confirm button will actually send.
   *
   * `undefined` when nothing qualifies *or* when nothing that qualifies can
   * carry the cargo — both are branches that report an error instead of
   * claiming, and the context words them differently because they are different
   * facts about the fleet.
   *
   * **Only a candidate that fits is ever chosen.** A vehicle can clear the
   * booked class and the body and still be too small for this particular load,
   * and `POST /api/orders/[id]/accept` refuses exactly that with "This vehicle
   * can't carry this load's cargo"; picking one here would send a claim the
   * server is certain to bounce, after the driver committed. Those options are
   * rendered disabled below rather than hidden, so the driver can see which of
   * their trucks the load actually needs.
   *
   * The `??` is the default rule in one line: an untouched picker, an id that has
   * stopped being a candidate, and a deliberately disabled one all fall back to
   * the first *fitting* entry — the smallest qualifying vehicle that takes the
   * load, in the order the context sorts them.
   */
  const chosenCandidate =
    claimCandidates.find(
      (candidate) => candidate.vehicle.id === chosenVehicleId && candidate.fits,
    ) ?? claimCandidates.find((candidate) => candidate.fits);

  /**
   * One qualifying vehicle is not a choice, so it is not offered as one. See the
   * module comment for the product decision behind the three cases.
   *
   * Counted over every candidate, including those that do not fit: a driver with
   * two eligible trucks of which one is too small is being told something by the
   * second row, and hiding it would leave the dialog silently picking the larger
   * truck with no indication that a choice existed or why it went that way.
   */
  const showVehiclePicker = claimCandidates.length > 1;

  /**
   * Whether every vehicle on offer can actually carry this load, which decides
   * only how the picker's note is worded.
   *
   * The common case by far — the board lists a load for an individual driver
   * only when one of their vehicles fits it, and a fleet is usually uniform
   * enough that the rest do too — so the plain sentence stays the default and the
   * qualified one appears exactly when it is true.
   */
  const everyCandidateFits = claimCandidates.every(
    (candidate) => candidate.fits,
  );

  /**
   * No target, no dialog.
   *
   * The guard sits *below* every hook above rather than at the top of the
   * function because React requires a stable hook order across renders — an
   * early return before `useState` would change how many hooks this component
   * calls the moment the board cleared `dialogId`.
   */
  if (load === null) {
    return null;
  }

  const needsHazmatAcknowledgement = load.handlingTags.includes("HAZMAT");

  /**
   * An offline driver is offered "go online and claim" rather than a message.
   *
   * A company can never legitimately reach this branch — a `"BUSINESS"` session
   * claims through `POST /api/logistics-company/orders/[id]/claim`, which has no
   * online concept and cannot answer `DRIVER_OFFLINE`, and `PATCH
   * /api/driver-profile/status` would refuse a COMPANY caller anyway. If one
   * somehow did, falling through to the plain error message is the honest
   * outcome; offering to toggle a flag that does not exist for that account is
   * not.
   */
  const showOfflinePrompt =
    claimError?.code === "DRIVER_OFFLINE" && !isCompanyAccount;

  // Any request in flight — the claim itself, or the status flip that precedes a
  // retry. Both must hold the dialog open and both must disable the footer.
  const isBusy = isClaiming || isGoingOnline;

  /**
   * Go online, then immediately retry the claim.
   *
   * The retry is automatic on purpose: clicking "Go online & claim" is the
   * driver expressing the intent once, and making them click Confirm again after
   * the toggle succeeds is a second chance to lose the same race.
   *
   * `router.refresh()` runs after the claim settles rather than before it, so
   * the header's availability pill and anything else reading `isOnline` catch up
   * off one server read — the same "the server's answer wins" rule
   * `HubOnlineToggle` follows — without a re-render landing in the middle of the
   * claim.
   */
  async function handleGoOnlineAndClaim() {
    setGoOnlineError(null);
    setIsGoingOnline(true);

    try {
      const response = await fetch(STATUS_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnline: true }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;

        // The endpoint's own message names the real obstacle ("Your account
        // isn't approved yet…"), which ours cannot. The prompt stays up rather
        // than reverting to the plain footer: the driver is still offline, so
        // the plain Confirm button would only reproduce the same refusal.
        setGoOnlineError(
          typeof body?.error === "string" ? body.error : ONLINE_GENERIC_ERROR,
        );
        return;
      }

      // The offline refusal is spent; clearing it here means the footer is back
      // to its normal state whatever the retry answers.
      dismissClaimError();
      // The same vehicle the plain Confirm button would send. Read at call time
      // rather than captured, so a driver who changed the picker while the
      // offline prompt was up retries with the vehicle they can actually see
      // selected.
      await confirmClaim(chosenCandidate?.vehicle.id ?? null);
      router.refresh();
    } catch {
      setGoOnlineError(ONLINE_NETWORK_ERROR);
    } finally {
      setIsGoingOnline(false);
    }
  }

  /**
   * The summary card's seven rows, in the design's order.
   *
   * Built as data rather than as seven hand-written grid pairs so the label
   * column and the value column cannot drift apart, and so the "no `price`
   * anywhere" property of this card is readable in one place. Every value here
   * is descriptive; the only money on this dialog is the footer strip below.
   */
  const summaryRows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Load",
      value: <span className="font-price">{load.reference}</span>,
    },
    {
      label: "Pick-up",
      value: `${load.pickupCity ?? EM_DASH} · ${formatAbsoluteWindow(
        load.pickupWindowStart,
        load.pickupWindowEnd,
      )}`,
    },
    {
      label: "Drop-off",
      value: `${load.dropoffCity ?? EM_DASH} · by ${formatAbsoluteDateTime(
        load.deliveryDeadline,
      )}`,
    },
    {
      label: "Cargo",
      value: `${cargoCategoryLabel(load.cargoCategory)} · ${
        load.packagingDescription ?? EM_DASH
      }`,
    },
    { label: "Helpers", value: formatHelperRequest(load.helperCount) },
    {
      label: "Weight",
      value: `${formatWeightKg(load.cargoWeightKg)} · ${formatLoadDims({
        lengthM: load.cargoLengthM,
        widthM: load.cargoWidthM,
        heightM: load.cargoHeightM,
      })}`,
    },
    {
      label: "Distance",
      value: `${formatDistanceKm(load.distanceKm)} · ${STOP_COUNT_TEXT}`,
    },
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Radix reports Escape, the overlay and Cancel through here alike; none
        // of them may interrupt a request already in flight.
        if (!open && !isBusy) {
          closeConfirm();
        }
      }}
    >
      <DialogContent
        // Portalled outside the shell — see the module comment.
        data-admin-surface=""
        showCloseButton={false}
        // The design's 440px panel, laid out edge to edge: the summary card and
        // the footer strip both need to reach the panel's borders, so the
        // primitive's own padding is dropped and each section carries its own.
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
        <DialogHeader className="gap-1 px-5 pt-5">
          <DialogTitle className="text-base font-semibold tracking-[-0.01em]">
            Confirm this shipment
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            First come, first served. Confirming claims the order and closes it
            to other drivers.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-5 mt-4 overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 px-[14px] py-3 text-[13px]">
            {summaryRows.map((row) => (
              <React.Fragment key={row.label}>
                <div className="text-muted-foreground">{row.label}</div>
                <div className="tabular-nums">{row.value}</div>
              </React.Fragment>
            ))}
          </div>

          {/* The one money figure on this dialog, and it is the driver's share.
              Both formatters name their parameter `driverPayout` for the same
              reason — a call site passing anything else reads wrong on sight.

              `formatGelExact` rather than the board's scannable `formatGel`:
              this is the figure the whole dialog exists to have a driver agree
              to, and it is not a whole number as often as it looks.
              `driverPayoutFor` returns `roundCurrency(...)`, which rounds to
              tetri, not to lari (`src/lib/pricing.ts`), so a stored `109.50`
              prints as "₾110" through a zero-decimal formatter — a figure
              inflated in the driver's favour, which the money note above calls
              the worst direction to be wrong in. */}
          <div className="flex items-baseline justify-between border-t border-border bg-muted px-[14px] py-3">
            <span className="text-[13px] text-muted-foreground">
              You are paid
            </span>
            <span className="font-price text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
              {formatGelExact(load.driverPayout)}
            </span>
          </div>
        </div>

        {showVehiclePicker ? (
          // A real `fieldset`/`legend` around real `input type="radio"`s, the
          // pattern `vehicles-add-form.tsx` uses for its own class picker: the
          // group is named and its selection announced by the platform, and the
          // arrow keys move between options, none of which a div with click
          // handlers gets. Each input is `sr-only` rather than hidden, so it
          // keeps its place in the accessibility tree and the tab order while
          // the ring beside it carries the visual state.
          <fieldset
            className="mx-5 mt-4 flex min-w-0 flex-col gap-2"
            aria-describedby="loads-confirm-vehicle-note"
          >
            <legend className="mb-1.5 text-[13px] font-medium text-foreground">
              Vehicle
            </legend>
            <p
              id="loads-confirm-vehicle-note"
              className="mb-0.5 text-[13px] text-muted-foreground"
            >
              {everyCandidateFits
                ? "More than one of your vehicles fits this booking. Pick the one you’ll drive."
                : "More than one of your vehicles matches this booking, but not all of them can carry this load. Pick the one you’ll drive."}
            </p>

            {claimCandidates.map((candidate) => {
              const selected =
                candidate.vehicle.id === chosenCandidate?.vehicle.id;
              // Eligible for the booking but too small for this load. Shown and
              // explained rather than dropped from the list — a driver reading
              // "this one is too small" learns which truck the job needs; a
              // driver shown a shorter list learns nothing. `disabled` on the
              // real radio is what makes it unselectable to the keyboard and to
              // assistive technology, not just to the pointer.
              const tooSmall = !candidate.fits;

              return (
                <label
                  key={candidate.vehicle.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-[10px] border p-3 transition-colors",
                    tooSmall
                      ? "cursor-not-allowed border-border bg-background opacity-60"
                      : "cursor-pointer has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                    !tooSmall &&
                      (selected
                        ? "border-foreground bg-muted"
                        : "border-border bg-background hover:bg-muted/50"),
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">
                      <span className="font-price">
                        {candidate.vehicle.plateNumber}
                      </span>{" "}
                      · {candidate.vehicle.vehicleTypeSpec.label}
                    </span>
                    {/* The resolved capability, not the class catalogue's
                        figures: it is what qualified this vehicle, it includes
                        whatever the driver declared for this specific truck,
                        and it is the only form in which an open bed reads
                        "open" rather than as a height of zero. */}
                    <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                      {formatWeightKg(candidate.capability.payloadKg)} ·{" "}
                      {formatDims(candidate.capability)}
                    </span>
                    {tooSmall ? (
                      // The claim route's own refusal, shortened to a tag. It
                      // names the vehicle's shortfall, never the load's size:
                      // the load is what the client booked and is not wrong.
                      <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                        Too small for this load
                      </span>
                    ) : null}
                  </span>
                  <input
                    type="radio"
                    name="loads-confirm-vehicle"
                    value={candidate.vehicle.id}
                    checked={selected}
                    onChange={() => {
                      setChosenVehicleId(candidate.vehicle.id);
                    }}
                    disabled={isBusy || tooSmall}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-3.5 shrink-0 rounded-full",
                      selected
                        ? "border-[5px] border-foreground"
                        : "border border-border",
                    )}
                  />
                </label>
              );
            })}
          </fieldset>
        ) : null}

        {isCompanyAccount ? (
          // Informational, not a warning — hence `bg-muted` rather than a tone
          // colour. A company claims with its account as a whole; which truck
          // and which driver fulfil it is a dispatch decision made afterwards,
          // per `specs/driver-load-board/requirements.md`'s Assumptions. That is
          // also why the claim request carries no vehicle at all.
          <p className="mx-5 mt-4 rounded-md border border-border bg-muted px-3 py-2 text-[13px] text-muted-foreground">
            You&rsquo;re claiming with your company account. Assign a driver and
            vehicle to this load afterwards.
          </p>
        ) : null}

        {needsHazmatAcknowledgement ? (
          <div className="mx-5 mt-4 flex items-start gap-2.5">
            <Checkbox
              id="loads-confirm-hazmat"
              checked={hazmatAcknowledged}
              // Radix models a third, indeterminate state; this box has only
              // two, so anything that is not literally `true` is unchecked.
              onCheckedChange={(checked) => {
                setHazmatAcknowledged(checked === true);
              }}
              disabled={isBusy}
              className="mt-px"
            />
            <label
              htmlFor="loads-confirm-hazmat"
              className="cursor-pointer text-[13px] leading-snug text-foreground"
            >
              I confirm my vehicle and licence meet this load&rsquo;s hazmat
              handling requirements.
            </label>
          </div>
        ) : null}

        {showOfflinePrompt ? (
          <div className="mx-5 mt-4 mb-5 flex flex-col gap-2.5">
            <p role="alert" className="text-[13px] text-foreground">
              You&rsquo;re offline — go online to claim?
            </p>

            {goOnlineError !== null ? (
              <p role="alert" className="text-[13px] text-destructive">
                {goOnlineError}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 text-sm"
                disabled={isBusy}
                onClick={() => {
                  setGoOnlineError(null);
                  dismissClaimError();
                }}
              >
                Stay offline
              </Button>
              <Button
                type="button"
                className="h-10 flex-[1.6] text-sm"
                disabled={isBusy}
                onClick={() => {
                  void handleGoOnlineAndClaim();
                }}
              >
                {/* Two waits behind one button, and they are worth telling
                    apart: the status flip is quick and the claim that follows
                    it is the one that can lose the race. */}
                {isClaiming
                  ? "Claiming…"
                  : isGoingOnline
                    ? "Going online…"
                    : "Go online & claim"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {claimError !== null ? (
              // Inline beside the control that caused it, never an `alert()` —
              // the pattern `hub-online-toggle.tsx` established.
              <p
                role="alert"
                className="mx-5 mt-4 text-[13px] text-destructive"
              >
                {claimError.message}
              </p>
            ) : null}

            <div className="flex gap-2 px-5 pt-4 pb-5">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 text-sm"
                disabled={isBusy}
                onClick={closeConfirm}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 flex-[1.6] text-sm"
                // Gated on the hazmat attestation only when the box is on
                // screen: a load without the tag renders no checkbox and is
                // therefore never blocked by one.
                disabled={
                  isBusy || (needsHazmatAcknowledgement && !hazmatAcknowledged)
                }
                onClick={() => {
                  // No pre-check of `load.status`. The server decides the race;
                  // see the module comment.
                  //
                  // A `null` here means no vehicle of this driver's qualifies,
                  // and `confirmClaim` answers it with the no-eligible-vehicle
                  // message rather than a request. The button stays enabled for
                  // that case on purpose: a driver who pressed Accept is owed a
                  // reason, and a Confirm button that is simply dead offers
                  // none. It is also a state the board should never have shown
                  // them, so it is worth saying out loud rather than hiding.
                  void confirmClaim(chosenCandidate?.vehicle.id ?? null);
                }}
              >
                {isClaiming ? "Claiming…" : "Confirm and claim"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Lost-the-race dialog                                                       */
/* -------------------------------------------------------------------------- */

export type LoadsLostRaceDialogProps = {
  /**
   * The human-readable reference of the load that was lost — `"GE-48233"`, not
   * a database id — or `null` to render nothing.
   *
   * It is a string rather than a row on purpose. By the time this opens, the
   * board has already refetched and the load is gone from `available`, so there
   * is no local row left to look anything up against: the 409 response's own
   * `reference` is the only source of truth for what just happened.
   */
  reference: string | null;
};

/**
 * "Just claimed by another driver" — the dead end that is not a failure.
 *
 * Deliberately not an inline error on the confirm dialog. Losing a race is a
 * normal outcome of a first-come-first-served board, not a malfunction, and it
 * needs its own acknowledgement: the confirm dialog's summary describes a load
 * this driver can no longer have, so leaving it on screen behind a red line of
 * text would invite a second, futile Confirm.
 */
export function LoadsLostRaceDialog({ reference }: LoadsLostRaceDialogProps) {
  const { closeLost } = useLoadsBoard();

  // Below the hook, for the reason the confirm dialog's own guard states.
  if (reference === null) {
    return null;
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Escape, the overlay and the button all land here — nothing is in
        // flight, so every one of them simply clears the board's `lostLoad`.
        if (!open) {
          closeLost();
        }
      }}
    >
      <DialogContent
        data-admin-surface=""
        showCloseButton={false}
        className="gap-0 p-5 sm:max-w-[380px]"
      >
        <DialogHeader className="gap-1.5">
          <DialogTitle className="text-base font-semibold">
            Just claimed by another driver
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            <span className="font-price">{reference}</span> was confirmed a
            moment before you. It has been removed from your available list.
          </DialogDescription>
        </DialogHeader>

        <Button
          type="button"
          className="mt-4 h-10 w-full text-sm"
          onClick={closeLost}
        >
          Back to dashboard
        </Button>
      </DialogContent>
    </Dialog>
  );
}
