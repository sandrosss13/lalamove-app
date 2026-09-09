"use client";

import * as React from "react";

import { HubEmptyState } from "@/components/driver-hub/hub-primitives";
import { HUB_STATUS_TONE_CLASSES } from "@/components/driver-hub/hub-status";
import {
  LoadsDetailSheet,
  helperText,
} from "@/components/driver-hub/screens/loads-detail-sheet";
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
  formatDistanceKm,
  formatGel,
  formatLoadDims,
  formatPickupWindow,
  formatWeightKg,
  pluralise,
  sortedHandlingTags,
} from "@/components/driver-hub/screens/loads-format";
import { Button } from "@/components/ui/button";
import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";
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
 * and because this is where its `nowIso` is owned.
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

/**
 * How often the relative labels re-measure themselves.
 *
 * One minute, matching `loads-table.tsx`: the coarsest bucket a pick-up window
 * can change into ("Today" → "Yesterday") turns over on a calendar boundary,
 * and a faster tick would re-render every card to produce identical strings.
 */
const CLOCK_TICK_MS = 60_000;

/**
 * The cargo category's display copy, falling back to the raw enum value.
 *
 * `GET /api/loads` returns `Order.cargoCategory` verbatim — a
 * `FURNITURE_FURNISHINGS`, not a "Furniture & Furnishings" — and `HubLoad` types
 * it as `string` because it crosses the wire as JSON. So the
 * `Record<CargoCategory, string>` lookup is widened here rather than the row
 * being cast; a category added to the schema without copy fails typecheck in
 * `src/lib/cargo.ts` long before it could reach this fallback.
 *
 * This repeats four lines of `loads-detail-sheet.tsx`, which needs the same
 * mapping. They are not shared because that file is being written by another
 * agent in this same wave; folding both onto one helper in `loads-format.ts` is
 * a follow-up once the wave closes.
 */
const CARGO_CATEGORY_LABEL_BY_VALUE: Record<string, string> =
  CARGO_CATEGORY_LABELS;

function cargoCategoryLabel(cargoCategory: string): string {
  return CARGO_CATEGORY_LABEL_BY_VALUE[cargoCategory] ?? cargoCategory;
}

/* -------------------------------------------------------------------------- */
/* Board                                                                      */
/* -------------------------------------------------------------------------- */

export function LoadsMobile() {
  const {
    visibleLoads,
    hiddenByCapacityCount,
    activeFilterCount,
    showRejected,
    actionError,
    tab,
  } = useLoadsBoard();

  /**
   * The instant every relative label on this surface is measured against.
   *
   * Read from the clock on first render, which is safe here in a way it would
   * not be on a server-rendered hub screen: the board fetches from the browser,
   * so `loads-screen.tsx` renders its loading state instead of mounting this
   * component until after hydration. No card ever renders on the server, so
   * there is no first pass for a second one to disagree with.
   *
   * One timer for the whole list, threaded into the cards and into the detail
   * sheet, rather than one per consumer: a card and the sheet opened from it
   * must not label the same pick-up window with two different days.
   */
  const [nowIso, setNowIso] = React.useState(() => new Date().toISOString());

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNowIso(new Date().toISOString());
    }, CLOCK_TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card lg:hidden">
      <FilterRow />
      <WeightRow />

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
          message={
            showRejected
              ? "You haven't hidden any loads."
              : activeFilterCount > 0
                ? "No loads match these filters."
                : "No loads on the board right now."
          }
        />
      ) : (
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
      {tab === "available" && hiddenByCapacityCount > 0 ? (
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
 * ## Why this is a `div role="button"` and not a `<button>`
 *
 * The card contains buttons — Reject, Accept — and HTML forbids nesting
 * interactive content inside a `<button>`. The whole card is still the target
 * that opens the detail sheet, because on a phone the card *is* the row and
 * asking a thumb to find a chevron would be worse. So it carries the role, the
 * tab stop and the Enter/Space handling a real button would have given it, and
 * the nested buttons stop their events from reaching it.
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
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      onClick={open}
      onKeyDown={(event) => {
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
        · {formatDistanceKm(load.distanceKm)} · {helperText(load.helperCount)}
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
    showRejected,
    openConfirm,
    reject,
    restore,
    pendingActionId,
    selectLoad,
  } = useLoadsBoard();

  const isPending = pendingActionId === load.id;
  // The state container refuses a second reject/restore while one is running,
  // so leaving the others enabled would mean taps that silently do nothing.
  const isActionBlocked = pendingActionId !== null;

  /** Keeps a tap on a control from also opening the card's detail sheet. */
  const stop = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  if (showRejected) {
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
        <span className="font-price tabular-nums">
          {formatGel(load.driverPayout)}
        </span>
      </Button>
    </div>
  );
}
