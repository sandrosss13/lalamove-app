"use client";

import { X } from "lucide-react";

import { useLoadsBoard } from "@/components/driver-hub/screens/loads-context";
import {
  CargoPhotoTiles,
  CargoSpecList,
  ClaimedByYouNote,
  ClaimedElsewhereNote,
  HandlingTagPills,
  JOB_SHEET_TITLE,
  LoadComplianceNotes,
  LoadStatusPill,
  RouteStopHeading,
  RouteStopMarker,
  SECTION_LABEL_CLASSES,
  type RouteStopMarkerKind,
} from "@/components/driver-hub/screens/loads-detail-parts";
import {
  EM_DASH,
  formatAbsoluteDateTime,
  formatClock,
  formatDistanceKm,
  formatFullTimestamp,
  formatGelExact,
} from "@/components/driver-hub/screens/loads-format";
import { Button } from "@/components/ui/button";

/**
 * The load board's 400px right-hand detail drawer: one load's full route, cargo
 * specification, handling requirements and the accept/reject decision.
 *
 * This is the only desktop surface that shows every handling tag, the free-text
 * packaging and quantity the client typed, and the per-load compliance warnings
 * the table's seven columns have no room for. Implements section 3 of the
 * design handoff (`UI:UX/Order Dashboard/design_handoff_driver_load_board/README.md`).
 *
 * ## The money rule
 *
 * Every figure here is `HubLoad.driverPayout` — the driver's 85% share,
 * commissioned once at booking by `driverPayoutFor` and stored on the order.
 * **`Order.price` is never read, imported, derived from or rendered.** It is
 * not merely avoided: `GET /api/loads` does not select the fare columns at all,
 * so `HubLoad` has no `price` field and reaching for one is a compile error.
 *
 * The design's header sub-line reads "incl. ₾11 waiting allowance" and defines
 * it as "6% of price, rounded". **That line is deliberately not rendered.**
 * `price` is not and must never be available to a driver-facing component, and
 * taking the same percentage of `driverPayout` instead — which this drawer did
 * until the figure was reviewed — quotes drivers a breakdown of their own pay
 * that no stored value supports. It stays out until the order carries a real
 * waiting-allowance field, tracked in
 * `specs/driver-load-board/action-required.md`. Do not restore it by reaching
 * for the client's fare.
 *
 * ## `data-admin-surface` on the outermost element
 *
 * Required, and not decoration. This drawer is `position: fixed`, so it is
 * visually detached from the shell's layout, and if it is ever moved onto a
 * Radix portal it will be literally outside the shell's subtree. Without the
 * attribute the `bg-card` / `bg-muted` / `border-border` tokens it reaches for
 * resolve to the marketing site's palette instead of the hub's. Nothing errors;
 * the colours are just quietly wrong. `top-[61px]` clears the hub's sticky
 * header, which is that tall.
 *
 * ## What this file still owns, and what it no longer does
 *
 * Everything a driver *reads* about a load — the status pill's tone and label,
 * the cargo table, the handling pills, the photo tiles, the two compliance
 * advisories and the claimed/mine notes — lives in `loads-detail-parts.tsx` and
 * is rendered identically by the mobile sheet. That module exists because these
 * two files had already diverged twice in ways users could see, most seriously
 * with the hazmat advisory rendering on desktop only. Do not re-inline any of
 * it here: a sentence that exists in this file alone is, by construction, a
 * sentence a driver on a phone never reads.
 *
 * What stays here is this surface's own chrome: the fixed aside, the header row
 * with its ✕, the two route stops laid out with the time beside the label and
 * the address truncated behind a `title` (a desktop-only affordance — the sheet
 * wraps instead, because a phone has no hover), and the action block, whose
 * controls are sized for a pointer rather than for the mobile touch floor.
 *
 * ## "Open job sheet" ships disabled
 *
 * There is no job-sheet screen to link to, and inventing one is explicitly out
 * of scope (`specs/driver-load-board/requirements.md`, Non-Goals: "The drawer's
 * 'Open job sheet' button is designed but has no destination. Render it
 * disabled with a tooltip; do not invent the screen."). The gap is tracked in
 * `specs/driver-load-board/action-required.md` under "Design the job sheet".
 * The button is `disabled` with an explanatory `title`, paired with `sr-only`
 * text carrying the same sentence — `title` alone is not reliably announced.
 *
 * ## Takes no props, by contract
 *
 * Everything comes from `useLoadsBoard()`. See the note at the top of
 * `loads-context.tsx` for why all four Wave 4 surfaces read from the context
 * rather than from props.
 */

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every string this drawer prints comes from `loads-format.ts`.
 *
 * It used to carry eight private formatters — a clock, a deadline, a full
 * timestamp, a relative age, an ISO parse guard, a volume, a currency rounding
 * and a cargo-category lookup — written here only because that module was
 * fenced to a sibling task while this file was being built. They have all moved
 * there, and one of them had already drifted: the deadline was formatted with a
 * single `Intl` pattern carrying day, month, hour and minute together, which
 * `en-GB` renders as "4 Aug, 18:00", while the claim dialogs composed the same
 * instant as "4 Aug 18:00". The shared `formatAbsoluteDateTime` is the
 * composed spelling, so this drawer's deadline lost a comma in the merge.
 *
 * Nothing time-related is formatted locally any more, which is the point: every
 * one of those helpers is pinned to `HUB_TIME_ZONE`, and an unzoned formatter
 * renders a 22:30 Tbilisi pick-up window as "18:30" — four hours wrong on every
 * row, and wrong about the *day* for anything after 20:00.
 */

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

type RouteStopProps = {
  /** "Pick-up" or "Drop-off" — rendered uppercase by CSS, not by the string. */
  label: string;
  /** Filled for the pickup, a hollow ring for the dropoff. */
  marker: RouteStopMarkerKind;
  /** Already-humanised city label, or null when the geocoder could not place it. */
  city: string | null;
  address: string;
  /** The window or the deadline, already formatted. */
  time: string;
  /** The unabbreviated timestamp behind `time`, when there is one. */
  timeTitle?: string;
};

/**
 * One end of the trip: marker, label, city, address and the time line.
 *
 * The desktop layout, and deliberately not shared with the sheet's: the time
 * sits on the right of the label row and the address is truncated behind a
 * `title`, both of which assume a pointer. The sheet stacks the time under a
 * wrapped address instead, because a phone has no hover to reveal an elided
 * Tbilisi address. Only the pieces that carry a decision — the marker's
 * geometry and the label/city pair, including the em-dash fallback for an
 * unplaceable city — come from `loads-detail-parts.tsx`, so the two layouts
 * cannot disagree about anything but where the time goes.
 */
function RouteStop({
  label,
  marker,
  city,
  address,
  time,
  timeTitle,
}: RouteStopProps) {
  return (
    <div className="flex items-start gap-3">
      <RouteStopMarker marker={marker} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <RouteStopHeading label={label} city={city} />
          <span
            title={timeTitle}
            className="flex-none font-price text-xs text-muted-foreground tabular-nums"
          >
            {time}
          </span>
        </div>
        {/* `title` rather than wrapping: an address is one line in the design and
            a two-line one would push the drop-off row out of alignment. */}
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {address}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Drawer                                                                     */
/* -------------------------------------------------------------------------- */

export function LoadsDrawer() {
  const {
    selectedLoad,
    selectLoad,
    openConfirm,
    reject,
    restore,
    canAccept,
    pendingActionId,
    actionError,
    isRejected,
    nowIso,
  } = useLoadsBoard();

  if (selectedLoad === null) {
    return null;
  }

  const load = selectedLoad;

  /**
   * Whether this load is one the driver has hidden.
   *
   * Read from the board rather than inferred from the rejected sub-view being
   * open: the row itself cannot say, because `GET /api/loads` returns a rejected
   * load with `status: "available"`, and "the sub-view is on, therefore this row
   * is rejected" only holds while two unrelated invariants do. The context
   * carries the fact — see `isRejected` in `loads-context.tsx`.
   */
  const isLoadRejected = isRejected(load.id);

  const isPending = pendingActionId === load.id;

  /**
   * Reject and Restore are board-wide-exclusive, and Accept is not.
   *
   * The container drops a second reject/restore call outright, so leaving those
   * two enabled during any pending action would offer presses that do nothing.
   * Accept opens a dialog and touches no rejection state, so it is gated on this
   * row alone through the board's `canAccept` — a driver whose unrelated Reject
   * is still in flight would otherwise lose a first-come-first-served load to
   * whoever had no request pending. The reasoning is on `canAccept` in
   * `loads-context.tsx`; the rule itself lives there so this drawer, the table
   * and the mobile sheet cannot each decide it differently.
   */
  const isBusy = pendingActionId !== null;

  return (
    <aside
      // Required. Without it every token below resolves to the marketing
      // palette — see this file's doc comment.
      data-admin-surface=""
      aria-label={`Load ${load.reference}`}
      // The shadow is the design's own `-8px 0 24px rgba(0,0,0,0.08)`, written
      // as an arbitrary value for the same reason `hub-primitives.tsx` writes
      // the handoff's active-segment shadow that way: these are one-off
      // elevations with no other use in the hub, so they do not earn a
      // `--shadow-*` token. It lifts the drawer off the table it overlaps —
      // without it the 1px left border is the only separation, and the two
      // white surfaces read as one.
      className="fixed top-[61px] right-0 bottom-0 z-30 hidden w-[400px] max-w-[92vw] overflow-y-auto border-l border-border bg-card shadow-[-8px_0_24px_rgba(0,0,0,0.08)] lg:block"
    >
      {/* ---------------------------------------------------------------- */}
      {/* 1. Header                                                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 truncate font-price text-xs font-medium tabular-nums">
            {load.reference}
          </span>
          <div className="flex flex-none items-center gap-2">
            <LoadStatusPill status={load.status} />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => selectLoad(null)}
              className="size-[26px]"
            >
              <X aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>

        {/* `formatGelExact`, not the table's whole-lari `formatGel`: this is
            the headline figure the driver makes the decision on, one step
            before the confirm dialog restates it, and a figure a driver commits
            to has to equal the amount that will land, to the tetri. See the
            note on `formatGelExact` in `loads-format.ts`. */}
        <p className="mt-2 font-price text-[26px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {formatGelExact(load.driverPayout)}
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 2. Route                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-b border-border p-4">
        <div className="flex flex-col gap-3">
          <RouteStop
            label="Pick-up"
            marker="filled"
            city={load.pickupCity}
            address={load.pickupAddress}
            // Both ends of the window or nothing: "09:00–—" describes no slot a
            // driver can plan around.
            time={
              load.pickupWindowStart === null || load.pickupWindowEnd === null
                ? EM_DASH
                : `${formatClock(load.pickupWindowStart)}–${formatClock(load.pickupWindowEnd)}`
            }
            // The window prints as a bare clock, so the date it falls on lives in
            // the tooltip rather than nowhere.
            timeTitle={formatFullTimestamp(load.pickupWindowStart)}
          />
          <RouteStop
            label="Drop-off"
            marker="ring"
            city={load.dropoffCity}
            address={load.dropoffAddress}
            time={
              load.deliveryDeadline === null
                ? EM_DASH
                : `Deliver by ${formatAbsoluteDateTime(load.deliveryDeadline)}`
            }
            timeTitle={formatFullTimestamp(load.deliveryDeadline)}
          />
        </div>

        {/* Indented 20px — the 8px marker plus its 12px gap — so it hangs under
            the two addresses rather than under the markers.

            `distanceKm` is the load's own pickup-to-dropoff trip, NOT
            `pickupDistanceKm` (how far the driver is from the pickup), which is
            frequently stale or null and is not part of this section.

            "2 stops" is a hard-coded constant, not a field: `Order` is a single
            pickup → single dropoff booking with no stop table, so two is the
            only number it can be. See requirements.md's Non-Goals. */}
        <p className="mt-3 pl-5 text-xs text-muted-foreground tabular-nums">
          {formatDistanceKm(load.distanceKm)} · 2 stops
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 3. Cargo                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-b border-border p-4">
        <h3 className={SECTION_LABEL_CLASSES}>Cargo</h3>

        <CargoSpecList load={load} />
        <HandlingTagPills load={load} />
        <CargoPhotoTiles />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 4. Actions                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col gap-2 p-4">
        <LoadComplianceNotes load={load} />

        {load.status === "claimed" ? (
          <ClaimedElsewhereNote load={load} nowIso={nowIso} />
        ) : load.status === "mine" ? (
          <>
            <ClaimedByYouNote />
            <Button
              type="button"
              variant="outline"
              // Ships disabled: there is no job sheet to open. See this file's
              // doc comment and requirements.md's Non-Goals — do not wire this
              // to a placeholder route.
              disabled
              title={JOB_SHEET_TITLE}
              className="h-10 text-sm font-medium"
            >
              Open job sheet
              {/* `title` is not reliably announced, so the reason is real text
                  for assistive tech too — the same pairing
                  `hub-online-toggle.tsx` uses for its disabled pill. */}
              <span className="sr-only">. {JOB_SHEET_TITLE}</span>
            </Button>
          </>
        ) : isLoadRejected ? (
          // No Accept is offered for a load the driver has hidden: restoring it
          // is the only path back to claiming it, matching the table's own
          // row-state behaviour.
          <Button
            type="button"
            variant="outline"
            onClick={() => void restore(load.id)}
            disabled={isBusy}
            className="h-10 text-sm font-medium"
          >
            {isPending ? "Restoring…" : "Restore to open loads"}
          </Button>
        ) : (
          <>
            {/* Opens the confirm dialog (task-12) by id — this drawer never
                calls the claim endpoint itself. */}
            <Button
              type="button"
              onClick={() => openConfirm(load.id)}
              disabled={!canAccept(load.id)}
              className="h-10 text-sm font-medium"
            >
              Accept this load
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void reject(load.id)}
              disabled={isBusy}
              // The design's destructive hover, expressed through the existing
              // `--destructive` token rather than as three raw oklch literals:
              // the tone is the same and the colour stays in one place.
              className="h-10 text-sm font-medium hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            >
              {isPending ? "Rejecting…" : "Reject this load"}
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              First driver to confirm claims the order. Rejecting only hides it
              from your board.
            </p>
          </>
        )}

        {/* The board-wide reject/restore failure. Shown here because this drawer
            is where those two actions were taken from.

            Deliberately *not* a live region: the table renders the same string
            in its footer under `role="status"`, and both are mounted at `lg`
            with neither hiding the other, so announcing here too would read one
            failure out twice — once as an interruption and once politely. The
            table's footer is the single announcer; `loads-detail-sheet.tsx`
            makes the same call against the mobile board's copy. */}
        {actionError === null ? null : (
          <p className="text-xs leading-relaxed text-destructive">
            {actionError}
          </p>
        )}
      </div>
    </aside>
  );
}
