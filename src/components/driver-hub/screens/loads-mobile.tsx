"use client";

import * as React from "react";

import { HubEmptyState } from "@/components/driver-hub/hub-primitives";
import { HUB_STATUS_TONE_CLASSES } from "@/components/driver-hub/hub-status";
import { LoadsDetailSheet } from "@/components/driver-hub/screens/loads-detail-sheet";
import {
  ALL_CITIES,
  MAX_WEIGHT_FILTER_KG,
  MIN_WEIGHT_FILTER_KG,
  WEIGHT_FILTER_STEP_KG,
  useLoadsBoard,
  type HubLoad,
} from "@/components/driver-hub/screens/loads-context";
import {
  EM_DASH,
  cargoCategoryLabel,
  formatDistanceKm,
  formatGel,
  formatHelperRequest,
  formatLoadDims,
  formatPickupWindow,
  formatWeightKg,
  pluralise,
  sortedHandlingTags,
} from "@/components/driver-hub/screens/loads-format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The load board on a phone: a compact filter row, a weight row, a stacked list
 * of load cards, and the capacity footer — the counterpart to the desktop
 * table (task-10) and its drawer (task-11).
 *
 * ## The breakpoint is CSS, and only CSS
 *
 * This subtree is `lg:hidden`; `LoadsTable` and `LoadsDrawer` are
 * `hidden lg:block`. Both trees are always mounted and the viewport decides
 * which one paints. There is no `mode` state, no media-query hook and no 390px
 * prototype frame anywhere in this feature — the design handoff's own README
 * calls its Desktop/Mobile toggle "a prototype affordance for reviewing both
 * surfaces" and says production should use real breakpoints.
 *
 * Keeping both mounted is what makes rotating a tablet free: `selectedId`,
 * `dialogId`, the filters and the scroll position all live in `useLoadsBoard()`
 * above both trees, so crossing 1024px changes which markup paints and nothing
 * else. Swapping components in and out on resize would remount the survivor and
 * drop all of it.
 *
 * `lg` (1024px) rather than `md`: the desktop tree needs a 248px sidebar plus a
 * table whose own minimum width is 760px, and a viewport between those two
 * breakpoints genuinely cannot fit both.
 *
 * ## Takes no props
 *
 * Everything comes from `useLoadsBoard()`, by contract — see the note on
 * `LoadsBoardValue`. The detail sheet is mounted from here rather than from
 * `loads-screen.tsx` so that the whole mobile surface is one file's concern,
 * and so that it and the cards are handed the same `nowIso` from one place.
 *
 * ## What mobile deliberately does not have
 *
 * The design's mobile filter row carries no handling-tag chips and no Reset,
 * and its footer carries no "N rejected · view" toggle. None of the three is
 * added here — they are simplifications in the source design, not omissions to
 * fix, and this task authorises exactly one addition beyond the approved design
 * (the detail sheet, for the hazmat-visibility reason that file explains).
 *
 * The consequence is worth stating because it is invisible: a driver who set a
 * tag filter or opened the rejected list on a wide window and then narrowed it
 * still has that state applied, with no control on this surface to clear it.
 * `specs/driver-load-board/action-required.md` tracks the rejected-list half of
 * it under "Reconsider the rejected-list UI".
 */

/* -------------------------------------------------------------------------- */
/* Board                                                                      */
/* -------------------------------------------------------------------------- */

export function LoadsMobile() {
  /**
   * `nowIso` is the board's, not this surface's.
   *
   * This file used to own a `setInterval` of its own beside the desktop
   * table's. Both trees are mounted at once (see the breakpoint note above), so
   * two timers meant a card and the drawer describing the same pick-up window
   * could sit a minute out of phase on a tablet wide enough to show both. One
   * clock for the board settles it — `LoadsBoardValue.nowIso` has the whole
   * reasoning.
   *
   * It is still threaded down as a prop rather than re-read from the context
   * inside `LoadCard` and `LoadsDetailSheet`: a card and the sheet opened from
   * it must not label one window with two different days, and passing the
   * instant they have to agree on makes that agreement visible at the call
   * site.
   */
  const {
    visibleLoads,
    hiddenByCapacityCount,
    activeFilterCount,
    filtersApply,
    showRejected,
    actionError,
    tab,
    nowIso,
  } = useLoadsBoard();

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card lg:hidden">
      {/* The two filter rows are the controls for the open board, and they are
          absent on the two lists they do not filter. `visibleLoads` ignores the
          city and weight filters on "My loads" and in the rejected sub-view —
          see `filtersApply` — so leaving the rows up there would offer a driver
          a select and a slider that change the count in the corner and nothing
          else, which is a worse answer than not offering them.

          Hidden rather than disabled, and that is the same call `loads-screen`
          makes for the desktop panel it hides beside a *disabled* Filters
          toggle: the toggle is the affordance that has to stay put and say why,
          and the panel behind it is what goes. These two rows are that panel,
          not that toggle — this surface has no toggle of its own, and the
          disabled one above the board is rendered at every width, so a driver
          on a phone still gets the explanation without a row of dead controls
          taking the scarcest space the list has. The filters a driver set are
          not discarded either way — they apply again the moment the open board
          comes back. */}
      {filtersApply ? (
        <>
          <FilterRow />
          <WeightRow />
        </>
      ) : null}

      {/* The reject/restore failure. It lives above the list rather than on the
          card that failed because the row it belongs to may have moved between
          the open and rejected lists by the time the message arrives. */}
      {actionError === null ? null : (
        <p
          role="alert"
          className="border-b border-border px-3.5 py-2 text-xs text-destructive"
        >
          {actionError}
        </p>
      )}

      {visibleLoads.length === 0 ? (
        <HubEmptyState
          // `filtersApply` gates the filter sentence for the same reason the
          // rows above are gated on it: on "My loads" the filters can be set
          // and are still not what emptied the list, so blaming them would send
          // a driver looking for controls to clear that were hiding nothing.
          message={
            showRejected
              ? "You haven't hidden any loads."
              : filtersApply && activeFilterCount > 0
                ? "No loads match these filters."
                : "No loads on the board right now."
          }
        />
      ) : (
        // Keyed by `load.id`, never by index, and the `<ul>` itself carries no
        // key — the same rule the desktop table states at its own `map`. The
        // board re-reads itself every ten seconds and merges by id, so a card
        // whose data is unchanged is the same React element and the same DOM
        // node across a refresh; that is what keeps a phone's scroll position
        // and stops a thumb landing on a card that moved between the press and
        // the release.
        <ul>
          {visibleLoads.map((load) => (
            <li key={load.id}>
              <LoadCard load={load} nowIso={nowIso} />
            </li>
          ))}
        </ul>
      )}

      {/* Absent at zero rather than reading "0 loads hidden": the sentence
          exists to explain a gap between what the board shows and what the
          driver expected, and at zero there is no gap. Absent on "My loads" for
          the reason the desktop footer drops it there too — that list is never
          filtered by vehicle fit, so a capacity note beside it would be
          answering a question nobody asked. The count is the board's own
          `hiddenByCapacityCount`, the same figure the desktop footer prints.
          This surface does not recompute it. */}
      {tab === "available" && !showRejected && hiddenByCapacityCount > 0 ? (
        <p className="border-t border-border bg-muted px-3.5 py-2.5 text-[11px] text-muted-foreground tabular-nums">
          {pluralise(hiddenByCapacityCount, "load")} hidden — over your vehicle
          capacity or dimensions
        </p>
      ) : null}

      {/* Portalled to the body when open, so its position in this tree costs
          the layout nothing — but it is mounted here, inside the mobile
          subtree, so the whole mobile surface stays one file's concern. */}
      <LoadsDetailSheet nowIso={nowIso} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Filter row and weight row                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Pick-up city → drop-off city, reading and writing the **same** `fPickup` and
 * `fDrop` the desktop filter panel does. There is one filter state on this
 * board, not a mobile copy of it.
 *
 * Native `<select>`s rather than the shadcn `Select` the desktop panel uses,
 * and the reason is the device: on a phone a native select opens the platform's
 * own picker — a wheel or a full-screen list, sized for a thumb and driven by
 * the OS's accessibility settings — where a Radix listbox renders a portalled
 * menu that has to be styled, positioned and `data-admin-surface`'d back into
 * the hub's palette. The codebase already takes this trade in both directions
 * (`account-profile-form.tsx` and `booking-form.tsx` use native selects for
 * small fixed option sets, for the sibling reason that the portal escapes their
 * page's palette), so this is an established pattern rather than a new one.
 */
function FilterRow() {
  const {
    fPickup,
    setFPickup,
    fDrop,
    setFDrop,
    pickupCityOptions,
    dropCityOptions,
  } = useLoadsBoard();

  return (
    <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
      <CitySelect
        label="Pick-up city"
        value={fPickup}
        onChange={setFPickup}
        options={pickupCityOptions}
      />
      {/* Decorative: both selects are individually labelled, and an arrow
          announced between them adds noise rather than meaning. */}
      <span aria-hidden="true" className="text-xs text-muted-foreground">
        →
      </span>
      <CitySelect
        label="Drop-off city"
        value={fDrop}
        onChange={setFDrop}
        options={dropCityOptions}
      />
    </div>
  );
}

/**
 * One city select.
 *
 * `aria-label` rather than a visible `<label>`: the design's mobile row has no
 * room for two labels over two controls, and the selected value is itself the
 * answer to "which city" — but a control with no accessible name at all is
 * announced as a bare "combo box".
 *
 * 36px tall rather than the design's 32px. A filter is not one of the 44px
 * touch targets the design mandates — those are the card actions — but 32px is
 * below what a thumb hits reliably, and the extra four pixels cost the row
 * nothing.
 */
function CitySelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (city: string) => void;
  options: readonly string[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <option value={ALL_CITIES}>{ALL_CITIES}</option>
      {options.map((city) => (
        <option key={city} value={city}>
          {city}
        </option>
      ))}
    </select>
  );
}

/**
 * The cargo-weight ceiling, plus a live count of what survives it.
 *
 * A native `<input type="range">`, matching the desktop filter panel exactly.
 * This project has no shadcn `Slider`, and adding one for the mobile copy of a
 * control the desktop draws with a range input would give one filter two
 * appearances.
 *
 * The result count sits at the end of the row because a weight ceiling has no
 * other feedback: dragging the thumb changes a number whose effect the driver
 * cannot otherwise see without scrolling.
 */
function WeightRow() {
  const { fWeight, setFWeight, visibleLoads } = useLoadsBoard();

  // A generated id rather than a literal: a label→control association is the
  // kind of thing that breaks silently, and only for screen-reader users, if
  // this row is ever rendered twice on one page.
  const weightId = React.useId();

  return (
    <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
      <label
        htmlFor={weightId}
        className="flex-none text-[11px] text-muted-foreground tabular-nums"
      >
        ≤ {formatWeightKg(fWeight)}
      </label>
      <input
        id={weightId}
        type="range"
        min={MIN_WEIGHT_FILTER_KG}
        max={MAX_WEIGHT_FILTER_KG}
        step={WEIGHT_FILTER_STEP_KG}
        value={fWeight}
        onChange={(event) => setFWeight(Number(event.target.value))}
        className="h-9 min-w-0 flex-1 accent-foreground"
      />
      {/* `aria-live` so a driver dragging the thumb with a screen reader on
          hears the list shrink; the slider itself announces only kilograms. */}
      <span
        aria-live="polite"
        className="flex-none text-[11px] text-muted-foreground tabular-nums"
      >
        {pluralise(visibleLoads.length, "load")}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One load, as five rows: route and payout, the cargo line, the timing line,
 * the handling pills, and the action row.
 *
 * ## Why this is a `div role="group"` and not a `<button>`
 *
 * The card contains buttons — Reject, Accept — and HTML forbids nesting
 * interactive content inside a `<button>`. The whole card is still the target
 * that opens the detail sheet, because on a phone the card *is* the row and
 * asking a thumb to find a chevron would be worse. So it carries the tab stop
 * and the Enter/Space handling a real button would have given it, and the
 * nested buttons stop their events from reaching it.
 *
 * **`role="button"` is not the escape hatch, and this card used to claim it.**
 * ARIA puts the same constraint on the role as HTML puts on the element: a
 * `button` role takes presentational children, so assistive technology
 * flattens everything inside the card into the button's accessible name and
 * the nested Reject and Accept stop being announced as the separate controls
 * they are. That trades a markup validity error for one a driver actually
 * hits — on the surface where the screen reader is most likely to be a phone's.
 *
 * `role="group"` instead: a container role that both accepts a name and
 * permits focusable descendants, so the card is one labelled stop that the two
 * real buttons sit inside rather than a control that swallows them. The
 * `aria-label` names the load explicitly because a group named from its own
 * contents would announce all five rows of it, and `aria-haspopup` came off
 * with the role — it is defined for `button` and its relatives, not for a
 * group, so leaving it would be a promise nothing reads.
 *
 * What that gives up is the word "button" in the announcement: activating a
 * card is now discoverable from its label rather than from its role. The trade
 * is worth it because the two things a driver must be able to do from here,
 * Reject and Accept, are real buttons *inside* the card, and everything the
 * sheet adds is detail they can reach after the card announces which load it
 * is.
 *
 * ## Why the handling pills are on the card at all
 *
 * They are an addition to the approved design, for the same reason the detail
 * sheet is one: a driver has to be able to see that a load is `HAZMAT` or
 * `COLD_CHAIN` *before* the Accept button under their thumb does anything. The
 * sheet is the thorough answer; these pills are the one that does not require
 * the driver to have opened anything first.
 */
function LoadCard({ load, nowIso }: { load: HubLoad; nowIso: string }) {
  const { selectLoad } = useLoadsBoard();

  const tags = sortedHandlingTags(load.handlingTags);
  const open = () => selectLoad(load.id);

  return (
    <div
      role="group"
      tabIndex={0}
      // The reference rather than the route: it is what the confirm dialog and
      // the lost-the-race dialog name a load by, so a driver hears the same
      // identifier from the card they pressed and the dialog it produced. Same
      // shape as `step-3-vehicle-specifications.tsx`'s row label.
      aria-label={`Load ${load.reference} details`}
      onClick={open}
      onKeyDown={(event) => {
        // The nested Reject/Accept/Restore buttons own their own keys. Without
        // this guard their `keydown` bubbles here first and the
        // `preventDefault()` below cancels the button's own activation — Enter
        // dispatches a button's click as the keydown default action, and Space
        // arms on keydown and is cancelled the same way — so a keyboard user
        // pressing Enter on Reject would open the detail sheet and never
        // reject. `stopPropagation` on the buttons cannot help: it is wired for
        // mouse events, which is what opens the sheet by pointer.
        if (event.target !== event.currentTarget) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          // Space scrolls the page on anything that is not a real button, and a
          // list that jumps a screen whenever a card is activated by keyboard
          // is worse than one that cannot be.
          event.preventDefault();
          open();
        }
      }}
      className="border-b border-border p-3.5 text-left outline-none focus-visible:bg-muted"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-medium">
          {load.pickupCity ?? EM_DASH} → {load.dropoffCity ?? EM_DASH}
        </span>
        {/* `driverPayout` — never `Order.price`, which is not a field on
            `HubLoad` and is not in the endpoint's select. See the money rule in
            `loads-format.ts`. */}
        <span className="flex-none font-price font-semibold tabular-nums">
          {formatGel(load.driverPayout)}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {cargoCategoryLabel(load.cargoCategory)} ·{" "}
        {formatWeightKg(load.cargoWeightKg)} ·{" "}
        {formatLoadDims({
          lengthM: load.cargoLengthM,
          widthM: load.cargoWidthM,
          heightM: load.cargoHeightM,
        })}
      </p>

      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        {formatPickupWindow(
          load.pickupWindowStart,
          load.pickupWindowEnd,
          nowIso,
        )}{" "}
        · {formatDistanceKm(load.distanceKm)} ·{" "}
        {formatHelperRequest(load.helperCount)}
      </p>

      {/* Declaration order via `sortedHandlingTags`, never the stored array's
          order — that is the sequence the client happened to tap the chips in
          at booking, so two loads carrying the same three tags would otherwise
          show them three different ways down one list. */}
      {tags.length === 0 ? null : (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <li
              key={tag.value}
              className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium"
            >
              {tag.label}
            </li>
          ))}
        </ul>
      )}

      <LoadCardActions load={load} />
    </div>
  );
}

/**
 * The card's action row — 44px tall in every one of its four forms, which the
 * design states explicitly and which is the floor for a control a thumb has to
 * hit in a moving vehicle.
 *
 * Every button here stops propagation: the card around it opens the detail
 * sheet, and a Reject that also opened a sheet describing the load it just hid
 * would be a bug the driver then has to undo.
 *
 * The claimed and mine treatments reuse `HUB_STATUS_TONE_CLASSES` rather than
 * introducing colours of their own — `neutral` for a load somebody else took
 * (the hub's tone for a real state that is simply not an alert) and `success`
 * for one this account holds. That module exists precisely so a new screen
 * never invents a seventh tone.
 */
function LoadCardActions({ load }: { load: HubLoad }) {
  const {
    isRejected,
    openConfirm,
    reject,
    restore,
    pendingActionId,
    canAccept,
    selectLoad,
  } = useLoadsBoard();

  const isPending = pendingActionId === load.id;
  // Reject and Restore only. The state container refuses a second reject or
  // restore while one is running, so leaving the others enabled would mean taps
  // that silently do nothing. Accept does not belong to this rule — it asks the
  // board, below.
  const isActionBlocked = pendingActionId !== null;

  /** Keeps a tap on a control from also opening the card's detail sheet. */
  const stop = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  // Asked of the board rather than inferred from the rejected sub-view being
  // open: `GET /api/loads` returns a hidden load with `status: "available"`, so
  // nothing on the card's own row says it has been rejected.
  if (isRejected(load.id)) {
    return (
      <div className="mt-2.5">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          disabled={isActionBlocked}
          aria-busy={isPending}
          onClick={(event) => {
            stop(event);
            void restore(load.id);
          }}
        >
          Restore to board
        </Button>
      </div>
    );
  }

  if (load.status === "claimed") {
    return (
      <p
        className={cn(
          "mt-2.5 flex h-11 items-center justify-center rounded-md text-xs font-medium",
          HUB_STATUS_TONE_CLASSES.neutral,
        )}
      >
        Claimed by another driver
      </p>
    );
  }

  if (load.status === "mine") {
    // Not a link and not a button: "Open job sheet" has no destination in this
    // feature (`requirements.md`, non-goals). Tapping the strip does what
    // tapping the rest of the card does — opens the detail sheet, where the
    // same unavailable action is spelled out on a disabled control.
    return (
      <p
        className={cn(
          "mt-2.5 flex h-11 items-center justify-center rounded-md text-xs font-medium",
          HUB_STATUS_TONE_CLASSES.success,
        )}
      >
        Yours · view job sheet
      </p>
    );
  }

  return (
    <div className="mt-2.5 flex gap-1.5">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-[88px]"
        disabled={isActionBlocked}
        aria-busy={isPending}
        onClick={(event) => {
          stop(event);
          void reject(load.id);
        }}
      >
        Reject
      </Button>
      <Button
        type="button"
        className="h-11 flex-1"
        // `canAccept`, not `isActionBlocked`, and the difference is a load
        // won or lost. Rejections are serialised board-wide, so `pendingActionId`
        // is non-null for a second or two after *any* card's Reject — disabling
        // Accept on that would take this card's control away because of a card
        // the driver never touched, on a first-come-first-served list. A pending
        // action on *this* card still blocks it. The board owns both halves of
        // the rule; see `LoadsBoardValue.canAccept`.
        disabled={!canAccept(load.id)}
        onClick={(event) => {
          stop(event);
          // Selecting the load as well as opening the confirm dialog means
          // dismissing the dialog leaves the driver on the sheet for the load
          // they were about to take, rather than back at an unchanged list
          // wondering whether the tap registered.
          selectLoad(load.id);
          openConfirm(load.id);
        }}
      >
        Accept ·{" "}
        {/* `formatGel`, the scannable form, deliberately. This is the card's
            own payout repeated on its control, three lines below the figure at
            the top of the card, and the two disagreeing ("₾110" up there,
            "₾109.5" here) would read as two different numbers rather than as
            one number stated precisely. Nothing is committed by pressing this —
            it opens the confirm dialog, which is where a driver agrees to a
            figure and where `formatGelExact` prints every tetri of it. */}
        <span className="font-price tabular-nums">
          {formatGel(load.driverPayout)}
        </span>
      </Button>
    </div>
  );
}
