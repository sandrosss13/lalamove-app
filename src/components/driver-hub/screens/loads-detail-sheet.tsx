"use client";

import Link from "next/link";
import { useLoadsBoard } from "@/components/driver-hub/screens/loads-context";
import {
  CargoPhotoTiles,
  CargoSpecList,
  ClaimedByYouNote,
  ClaimedElsewhereNote,
  HandlingTagPills,
  LoadComplianceNotes,
  LoadStatusPill,
  RouteStopHeading,
  RouteStopMarker,
  SECTION_LABEL_CLASSES,
  type RouteStopMarkerKind,
} from "@/components/driver-hub/screens/loads-detail-parts";
import {
  EM_DASH,
  formatDeadlineLine,
  formatDistanceKm,
  formatGelExact,
  formatPickupWindow,
} from "@/components/driver-hub/screens/loads-format";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The mobile load-detail bottom sheet: one load's full route, cargo
 * specification, handling tags and the accept/reject decision, opened by
 * tapping a card in `loads-mobile.tsx`.
 *
 * ## Why this exists at all — it is an addition to the approved design
 *
 * The design gives mobile no detail view: a card carries three lines of text
 * and an Accept button, and the handling tags live only in the desktop drawer.
 * That means on the device most drivers actually use, a driver could claim a
 * load tagged `HAZMAT` or `COLD_CHAIN` without those tags ever having been
 * rendered where they were looking. `requirements.md` accepts "hazmat loads are
 * tagged and warned about, not gated" as a risk *because the tag is assumed
 * visible before acceptance*; on mobile as designed it was not. This sheet —
 * plus the tag pills on the card itself — is what makes that assumption true.
 * It is the one addition beyond the approved design that task-13 authorises.
 *
 * ## What it shares with `loads-drawer.tsx`, and why that is not optional
 *
 * The two surfaces carry the same four sections over the same `HubLoad`, and
 * they shipped as two independent copies because they were written by two
 * agents in the same wave with no ordering between them. That duplication then
 * cost users twice, both times in this file's direction: the sheet rendered
 * neither compliance advisory — so the hazmat sentence this file exists to put
 * in front of a driver was desktop-only — and its "Claimed by another driver."
 * dropped the claim age the drawer prints from the same `updatedAt`.
 *
 * So everything a driver *reads* now comes from `loads-detail-parts.tsx` and is
 * rendered identically on both surfaces. What stays here is this surface's own
 * chrome: the portalled non-modal panel and its focus management, route stops
 * that stack the time under a wrapped address (see `RouteStop` below), and an
 * action block whose controls are sized to the mobile touch floor. Do not
 * re-inline a sentence from the parts module here or there — a sentence that
 * lives in only one of these files is a sentence half the drivers never read.
 *
 * ## The money rule
 *
 * Every figure here is `HubLoad.driverPayout` — the driver's stored 85% share.
 * **`Order.price` is never read, derived from, or rendered.** `GET /api/loads`
 * does not select the fare columns at all, so `HubLoad` has no field to reach
 * for; this note exists so nobody adds one. The design's "incl. ₾11 waiting
 * allowance" sub-line is defined there as 6% of the *client's* price and is
 * therefore not rendered at all; the note above the Sections block below
 * records why, and `loads-drawer.tsx` omits it on the same grounds.
 *
 * ## Why the sheet is non-modal, and why both portalled elements are `lg:hidden`
 *
 * `loads-screen.tsx` mounts the desktop tree (`loads-table.tsx`,
 * `loads-drawer.tsx`) and the mobile tree at the same time and lets CSS pick
 * between them — there is no JS viewport detection anywhere in this feature.
 * Both trees read the same `selectedId`, so on a desktop viewport this sheet is
 * *open* whenever the drawer is, even though nothing of it should paint. Three
 * consequences are handled here rather than left to chance:
 *
 * 1. The scrim and the content are portalled to `document.body` as siblings,
 *    so **both** carry `lg:hidden` (the scrim via `sheet.tsx`'s
 *    `overlayClassName`). Hiding only the content would leave a scrim over the
 *    desktop board.
 * 2. `modal={false}`. A modal Radix dialog locks `pointer-events` on the body
 *    and `aria-hidden`s everything behind it — which, at `lg`, would freeze the
 *    desktop board behind an invisible sheet. This is also why `sheet.tsx`
 *    paints its own scrim rather than using `SheetPrimitive.Overlay`, which
 *    renders nothing at all when a dialog is non-modal.
 * 3. Outside interactions do not dismiss unless they land on the sheet's own
 *    scrim. Dismissing on any outside pointer-down would mean a desktop click
 *    anywhere clearing `selectedId` and closing the drawer the driver is
 *    actually reading.
 *
 * Escape is the deliberate exception to (3) and is left unguarded: at `lg` it
 * clears `selectedId` and so closes the *desktop drawer*. That is what a driver
 * pressing Escape on an open detail panel expects, and this sheet is the only
 * layer listening for it while a load is selected. Recorded here so nobody
 * "fixes" it into an `onEscapeKeyDown` guard alongside the other two.
 */

/* -------------------------------------------------------------------------- */
/* Local class strings                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The minimum touch target, applied to every control in this sheet.
 *
 * 44px is the design's own stated floor for the mobile surface, and this sheet
 * is only ever reachable from it — a 40px drawer button would be the one
 * undersized control on the screen. This is the reason the action block is not
 * shared with the drawer, which sizes the same controls for a pointer.
 */
const TOUCH_TARGET_CLASSES = "h-11 text-sm font-medium";

/**
 * The design's "incl. ₾11 waiting allowance" sub-line under the payout is
 * **deliberately not rendered**, here or in `loads-drawer.tsx`.
 *
 * No column backs the figure. The design defines it as 6% of the client's
 * price, which a driver-facing surface may not read; both surfaces briefly took
 * the same percentage of `driverPayout` instead, which quotes a driver a
 * breakdown of their own pay that no stored value supports. The headline payout
 * stands alone until the order carries a real waiting-allowance field with a
 * signed-off rate — tracked in `specs/driver-load-board/action-required.md`.
 */

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One end of the trip: marker, label, city, address and the time line.
 *
 * The mobile layout, and deliberately not shared with the drawer's: the address
 * wraps rather than truncating and the time sits under it on its own line,
 * because a phone has no hover and a `title` on an elided Tbilisi address would
 * be unreachable. Vertical space is the cheaper thing to spend here. Only the
 * pieces that carry a decision — the marker's geometry and the label/city pair,
 * including the em-dash fallback for an unplaceable city — come from
 * `loads-detail-parts.tsx`, so the two layouts cannot disagree about anything
 * but where the time goes.
 */
function RouteStop({
  label,
  marker,
  city,
  address,
  time,
}: {
  /** "Pick-up" or "Drop-off" — uppercased by CSS, not by the string. */
  label: string;
  marker: RouteStopMarkerKind;
  city: string | null;
  address: string;
  /** The window or the deadline, already formatted. */
  time: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <RouteStopMarker marker={marker} />
      <div className="min-w-0 flex-1">
        <RouteStopHeading label={label} city={city} />
        <p className="mt-0.5 text-xs break-words text-muted-foreground">
          {address}
        </p>
        <p className="mt-0.5 font-price text-xs text-muted-foreground tabular-nums">
          {time}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sheet                                                                      */
/* -------------------------------------------------------------------------- */

export type LoadsDetailSheetProps = {
  /**
   * The instant every relative label in this sheet is measured against.
   *
   * Threaded down from `loads-mobile.tsx` rather than read from the clock here
   * so the card behind the sheet and the sheet itself cannot disagree about
   * which day a pick-up window falls on — the same reason `loads-table.tsx`
   * threads one `nowIso` to all of its rows instead of one timer per row.
   */
  nowIso: string;
};

export function LoadsDetailSheet({ nowIso }: LoadsDetailSheetProps) {
  const {
    accountKind,
    selectedLoad,
    selectLoad,
    openConfirm,
    openDispatch,
    reject,
    restore,
    canAccept,
    pendingActionId,
    actionError,
    isRejected,
  } = useLoadsBoard();

  const load = selectedLoad;

  /**
   * Whether to offer the dispatch step — the desktop drawer's condition,
   * verbatim.
   *
   * **The reasoning lives on `canDispatch` in `loads-drawer.tsx`** and is not
   * repeated here, because a predicate explained twice is a predicate that gets
   * corrected once — which this one did, having first shipped as
   * `driverId === null` and offered a 404ing control on an ACCEPTED row that
   * carries no driver. `dispatchable` is resolved by `GET /api/loads` against
   * the raw `OrderStatus` and is the only thing on `HubLoad` that answers the
   * question.
   *
   * The `load !== null` arm is this file's alone: the drawer returns early on a
   * null selection, whereas this sheet stays mounted so Radix can animate it
   * out, and the flag is computed above the branch that narrows `load`.
   */
  const canDispatch =
    accountKind === "BUSINESS" && load !== null && load.dispatchable;

  return (
    <Sheet
      // Non-modal by necessity, not by preference — see this file's doc comment.
      modal={false}
      open={load !== null}
      onOpenChange={(open) => {
        if (!open) {
          selectLoad(null);
        }
      }}
    >
      {load === null ? null : (
        <SheetContent
          side="bottom"
          // Required. This content is portalled to `document.body`, outside
          // `DriverHubShell`'s attributed root, so without it `bg-popover`,
          // `bg-muted` and `border-border` resolve to the marketing palette
          // instead of the hub's. Nothing errors; the colours are quietly
          // wrong. Same precedent as `loads-filters.tsx`'s `SelectContent`.
          data-admin-surface=""
          // Radix warns when a dialog has no description; this sheet is a
          // detail panel with no single summarising sentence, so the warning is
          // answered by opting out rather than by inventing one. The accessible
          // *name* comes from the `sr-only` `SheetTitle` below — an `aria-label`
          // here would only override it with the same words.
          aria-describedby={undefined}
          // Radix auto-focuses the first tabbable element on open, which here is
          // **Accept this load** — the ✕ is rendered last, after the content. A
          // screen-reader user would land on the claim button having heard
          // neither the payout, the route, nor the hazmat and cold-chain pills,
          // which is the exact failure this sheet exists to prevent. Focusing
          // the panel itself instead starts the reader at the top. The panel is
          // focusable: Radix's `FocusScope` gives it `tabIndex={-1}`.
          onOpenAutoFocus={(event) => {
            event.preventDefault();

            if (event.currentTarget instanceof HTMLElement) {
              event.currentTarget.focus();
            }
          }}
          // The panel itself does not scroll — the body block below does. That
          // keeps the header (reference, status, payout) and the sheet's own ✕
          // pinned instead of scrolling away on a long load, which matters more
          // here than on desktop: a phone has no Escape key, so the ✕ and the
          // scrim are the only ways out.
          className="flex max-h-[85vh] flex-col gap-0 rounded-t-xl p-0 lg:hidden"
          overlayClassName="lg:hidden"
          onPointerDownOutside={(event) => {
            // Only the sheet's own scrim dismisses. At `lg` the scrim is
            // `display:none`, so no desktop click can reach this and clear the
            // selection out from under the drawer. The scrim is a real element
            // that `SheetContent` paints itself — Radix's `Overlay` renders
            // nothing under `modal={false}`, which is why this guard could
            // never match before that fix.
            const target = event.detail.originalEvent.target;
            const onScrim =
              target instanceof Element &&
              target.closest('[data-slot="sheet-overlay"]') !== null;

            if (!onScrim) {
              event.preventDefault();
            }
          }}
          // Focus moving outside a non-modal layer would otherwise dismiss it —
          // which, at `lg`, is any Tab press on the desktop board.
          onFocusOutside={(event) => event.preventDefault()}
        >
          {/* Radix requires a title for the accessible name. It is `sr-only`
              because the visible header below renders the reference in the
              board's mono face, and a title carrying both class sets would
              depend on how tailwind-merge resolves two font-family utilities. */}
          <SheetTitle className="sr-only">Load {load.reference}</SheetTitle>

          {/* ---------------------------------------------------------------- */}
          {/* 1. Header                                                        */}
          {/* ---------------------------------------------------------------- */}
          <div className="border-b border-border p-4">
            {/* `pr-10` clears the sheet's own ✕, which is positioned at the
                top-right corner of the panel. */}
            <div className="flex items-start justify-between gap-3 pr-10">
              <span className="min-w-0 truncate font-price text-xs font-medium tabular-nums">
                {load.reference}
              </span>
              {/* `flex-none` because this badge is a direct flex child here,
                  where the drawer's sits inside a `flex-none` wrapper it shares
                  with the ✕. */}
              <LoadStatusPill status={load.status} className="flex-none" />
            </div>

            {/* `formatGelExact`, not the board's whole-lari `formatGel`: this is
                the headline figure the driver makes the decision on, one step
                before the confirm dialog restates it, and a figure a driver
                commits to has to equal the amount that will land, to the tetri.
                See the note on `formatGelExact` in `loads-format.ts`. */}
            <p className="mt-2 font-price text-[26px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {formatGelExact(load.driverPayout)}
            </p>
          </div>

          {/* Everything below the header scrolls. `min-h-0` is what lets it: a
              flex child's default `min-height: auto` refuses to shrink below its
              content, and the panel would grow past its own `max-h-[85vh]`
              instead of the block scrolling inside it. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
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
                  time={formatPickupWindow(
                    load.pickupWindowStart,
                    load.pickupWindowEnd,
                    nowIso,
                  )}
                />
                <RouteStop
                  label="Drop-off"
                  marker="ring"
                  city={load.dropoffCity}
                  address={load.dropoffAddress}
                  time={
                    formatDeadlineLine(load.deliveryDeadline, nowIso) ?? EM_DASH
                  }
                />
              </div>

              {/* Indented 20px — the 8px marker plus its 12px gap — so it hangs
                under the addresses rather than under the markers.

                `distanceKm` is the load's own pick-up-to-drop-off trip, not
                `pickupDistanceKm` (how far the driver is from the pick-up).

                "2 stops" is a constant, not a field: `Order` is a single
                pick-up → single drop-off booking with no stop table, so two is
                the only number it can be. See requirements.md's Non-Goals. */}
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
              {/* The pills are the reason this sheet exists: on the design as
                  drawn, a `HAZMAT` or `COLD_CHAIN` tag was never rendered
                  anywhere a driver on a phone would see it before accepting. */}
              <HandlingTagPills load={load} />
              <CargoPhotoTiles />
            </div>

            {/* ---------------------------------------------------------------- */}
            {/* 4. Actions                                                       */}
            {/* ---------------------------------------------------------------- */}
            <div className="flex flex-col gap-2 p-4">
              {/* Additive on top of the state block below, not a replacement
                  for it: a hazmat load that is already claimed still warrants
                  the note. This sheet shipped without either advisory while the
                  drawer rendered both, which meant the ADR sentence reached
                  only the drivers who were not on a phone. */}
              <LoadComplianceNotes load={load} />

              {load.status === "claimed" ? (
                <ClaimedElsewhereNote load={load} nowIso={nowIso} />
              ) : load.status === "mine" ? (
                <>
                  <ClaimedByYouNote />
                  {/* The desktop drawer's twin, at the mobile touch floor
                      rather than 40px. It spent a release `disabled` behind an
                      explanatory `title` because the screen did not exist; the
                      screen exists, so this is a plain link and there is
                      nothing left to explain.

                      `"mine"` is `hubOrderScope`'s answer — the assigned driver
                      for a solo account, the holding company for a fleet — and
                      `getHubJobSheet` accepts both claims, so this link lands
                      on a sheet for either reader. For the length of one
                      release it did not: the sheet required the driver claim
                      and this button sent fleet owners to "Order not found."
                      See `loads-drawer.tsx`'s doc comment for the full
                      history. */}
                  {/* The drawer's "Assign a vehicle", at the mobile touch
                      floor rather than 40px, and primary above the job-sheet
                      link for the same reason: a dispatcher on a load they have
                      claimed and not yet assigned wants to put a truck on it far
                      more often than they want to read the sheet.

                      This sheet is `modal={false}` (see this file's doc comment),
                      so the dispatch dialog Radix portals over it does not fight
                      it for the focus trap — the dialog is modal and takes over,
                      and dismissing it returns the dispatcher to the load they
                      were reading rather than to an empty board.

                      Why the dialog is reachable at all from here: it is mounted
                      by `LoadsClaimDialogs` at board level off the context's
                      `dispatchTarget`, not by this sheet, so `openDispatch` is
                      the whole of the wiring. */}
                  {canDispatch ? (
                    <Button
                      type="button"
                      onClick={() => openDispatch(load)}
                      className={TOUCH_TARGET_CLASSES}
                    >
                      Assign a vehicle
                    </Button>
                  ) : null}
                  <Button
                    asChild
                    variant="outline"
                    className={TOUCH_TARGET_CLASSES}
                  >
                    <Link href={`/dashboard/jobs/${load.id}`}>
                      Open job sheet
                    </Link>
                  </Button>
                </>
              ) : isRejected(load.id) ? (
                // No Accept for a load the driver has hidden: restoring it is the
                // only path back to claiming it, matching the table and drawer.
                // Asked of the board rather than inferred from the rejected
                // sub-view being open: a rejected load still arrives with
                // `status: "available"`, so the row itself cannot say.
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void restore(load.id)}
                  disabled={pendingActionId !== null}
                  className={TOUCH_TARGET_CLASSES}
                >
                  {pendingActionId === load.id
                    ? "Restoring…"
                    : "Restore to open loads"}
                </Button>
              ) : (
                <>
                  {/* Opens the shared confirm dialog (task-12) by id — exactly
                    what the desktop drawer's Accept does. This sheet never
                    calls a claim endpoint itself.

                    Gated on this row alone, never on the board: a driver whose
                    unrelated Reject is still in flight would otherwise lose a
                    first-come-first-served load to whoever had no request
                    pending. Reject and Restore stay board-wide-exclusive
                    because the container drops a second call outright. The rule
                    is `canAccept` in `loads-context.tsx`, so this sheet, the
                    drawer and the table cannot each decide it differently. */}
                  <Button
                    type="button"
                    onClick={() => openConfirm(load.id)}
                    disabled={!canAccept(load.id)}
                    className={TOUCH_TARGET_CLASSES}
                  >
                    Accept this load
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void reject(load.id)}
                    disabled={pendingActionId !== null}
                    // The design's destructive hover, expressed through the
                    // existing `--destructive` token rather than three raw oklch
                    // literals.
                    className={cn(
                      TOUCH_TARGET_CLASSES,
                      "hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
                    )}
                  >
                    {pendingActionId === load.id
                      ? "Rejecting…"
                      : "Reject this load"}
                  </Button>
                  <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                    First driver to confirm claims the order. Rejecting only
                    hides it from your board.
                  </p>
                </>
              )}

              {/* The board-wide reject/restore failure, repeated here because
                this sheet covers the board copy of it when it is open.

                Deliberately *not* a live region: `loads-mobile.tsx` renders the
                same string in a `role="alert"`, and that element is never
                aria-hidden by this sheet (it is non-modal), so making this one
                live too would have a screen reader announce one failure twice. */}
              {actionError === null ? null : (
                <p className="text-xs leading-relaxed text-destructive">
                  {actionError}
                </p>
              )}
            </div>
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}
