"use client";

import * as React from "react";

import {
  HUB_STATUS_TONE_CLASSES,
  type HubStatusTone,
} from "@/components/driver-hub/hub-status";
import {
  useLoadsBoard,
  type HubLoad,
} from "@/components/driver-hub/screens/loads-context";
import {
  EM_DASH,
  formatDeadlineLine,
  formatDistanceKm,
  formatGel,
  formatLoadDims,
  formatPickupWindow,
  formatVolumeM3,
  formatWeightKg,
  pluralise,
  sortedHandlingTags,
} from "@/components/driver-hub/screens/loads-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";
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
 * ## Why it duplicates `loads-drawer.tsx` rather than sharing with it
 *
 * The two files carry the same four sections over the same `HubLoad` shape, and
 * that repetition is deliberate: they are written by two agents in the same
 * wave with no ordering between them, so neither can import from the other and
 * **this file must never modify `loads-drawer.tsx`**. Extracting the shared JSX
 * is a worthwhile follow-up once both have landed; it is explicitly out of
 * scope here.
 *
 * ## The money rule
 *
 * Every figure here is `HubLoad.driverPayout` — the driver's stored 85% share.
 * **`Order.price` is never read, derived from, or rendered.** `GET /api/loads`
 * does not select the fare columns at all, so `HubLoad` has no field to reach
 * for; this note exists so nobody adds one. The design's "incl. ₾11 waiting
 * allowance" sub-line is defined there as 6% of the *client's* price; it is
 * computed here as 6% of the payout instead, for the same reason
 * `loads-drawer.tsx` does. The two figures are not meant to agree.
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
 * 1. The overlay and the content are portalled to `document.body` as siblings,
 *    so **both** carry `lg:hidden` (the overlay via `sheet.tsx`'s
 *    `overlayClassName`). Hiding only the content would leave a scrim over the
 *    desktop board.
 * 2. `modal={false}`. A modal Radix dialog locks `pointer-events` on the body
 *    and `aria-hidden`s everything behind it — which, at `lg`, would freeze the
 *    desktop board behind an invisible sheet.
 * 3. Outside interactions do not dismiss unless they land on the sheet's own
 *    scrim. Dismissing on any outside pointer-down would mean a desktop click
 *    anywhere clearing `selectedId` and closing the drawer the driver is
 *    actually reading.
 */

/* -------------------------------------------------------------------------- */
/* Status pill                                                                */
/* -------------------------------------------------------------------------- */

type LoadStatus = HubLoad["status"];

/**
 * The three load states mapped onto `hub-status.ts`'s six tones — **no seventh
 * colour pair is invented here**, per task-13's own instruction and the reason
 * `hub-status.ts` exists.
 *
 * `HubStatusBadge` is not reused because it derives its tone from the status
 * *word*, and neither "Open · first to confirm" nor "Yours" is in that
 * vocabulary: both would silently fall through to `neutral`.
 */
const SHEET_STATUS_TONE: Record<LoadStatus, HubStatusTone> = {
  // Actionable now, and racing. `warning` is the closest of the six — "still
  // fine, but it needs you to do something soon".
  available: "warning",
  // Settled and no longer actionable, the same tone the hub gives Offline/Idle.
  claimed: "neutral",
  // The outcome the driver wants, in the hub's Completed/Paid emerald.
  mine: "success",
};

const SHEET_STATUS_LABEL: Record<LoadStatus, string> = {
  available: "Open · first to confirm",
  claimed: "Claimed",
  mine: "Yours",
};

/* -------------------------------------------------------------------------- */
/* Shared class strings                                                       */
/* -------------------------------------------------------------------------- */

/** The uppercase section heading above Route and Cargo. */
const SECTION_LABEL_CLASSES =
  "text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase";

/** A pill: the status badge and the handling tags share the design's metrics. */
const PILL_CLASSES =
  "h-auto rounded-full px-[9px] py-[3px] text-[11px] font-medium tracking-[0.02em]";

/** A boxed note in the actions block — the claimed and mine notices. */
const NOTE_CLASSES = "rounded-md border p-2.5 text-[13px] leading-relaxed";

/**
 * The minimum touch target, applied to every control in this sheet.
 *
 * 44px is the design's own stated floor for the mobile surface, and this sheet
 * is only ever reachable from it — a 40px drawer button would be the one
 * undersized control on the screen.
 */
const TOUCH_TARGET_CLASSES = "h-11 text-sm font-medium";

/**
 * Why "Open job sheet" ships disabled.
 *
 * One string so the visible tooltip and the screen-reader sentence beside it
 * cannot drift apart.
 */
const JOB_SHEET_TITLE =
  "Job sheet isn't built yet. Client contact details and proof of delivery " +
  "will live there.";

/**
 * The three cargo-photo tiles.
 *
 * **Permanent dashed placeholders.** There is no cargo-photo upload anywhere in
 * the client booking flow and `GET /api/loads` carries no photo field, so the
 * count is a constant and no field on the row is consulted. See
 * `specs/driver-load-board/requirements.md`'s Non-Goals: "No cargo photos… Do
 * not add one."
 */
const PHOTO_TILES = ["Photo 1", "Photo 2", "Photo 3"];

/**
 * The cargo category's display copy, falling back to the raw enum value.
 *
 * `HubLoad.cargoCategory` is typed `string` — it crosses the wire as JSON — so
 * the `Record<CargoCategory, string>` lookup is widened here rather than the row
 * being cast. A category added to the schema without copy fails typecheck in
 * `src/lib/cargo.ts` long before it could reach this fallback.
 */
const CARGO_CATEGORY_LABEL_BY_VALUE: Record<string, string> =
  CARGO_CATEGORY_LABELS;

function cargoCategoryLabel(cargoCategory: string): string {
  return CARGO_CATEGORY_LABEL_BY_VALUE[cargoCategory] ?? cargoCategory;
}

/** The share of the payout the design presents as a waiting allowance. */
const WAITING_ALLOWANCE_SHARE = 0.06;

/** Currency rounding, to the tetri. `roundCurrency` in `pricing.ts` is server-side. */
function roundToTetri(value: number): number {
  return Math.round(value * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One end of the trip: marker, label, city, address and the time line.
 *
 * Both markers are 8px; the drop-off's 2px ring reads as the same visual weight
 * as the pick-up's filled dot. `bg-primary` rather than the design's literal
 * `oklch(0.205 0 0)` — inside `[data-admin-surface]` that token *is* that
 * colour, and going through it keeps a colour literal out of this file.
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
  marker: "filled" | "ring";
  city: string | null;
  address: string;
  /** The window or the deadline, already formatted. */
  time: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {/* Decorative: the label beside it already says which end this is, and a
          dot announced as "circle" tells a reader nothing. */}
      <span
        aria-hidden="true"
        className={cn(
          "mt-[5px] size-2 flex-none rounded-full",
          marker === "filled"
            ? "bg-primary"
            : "border-2 border-primary bg-transparent",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn(SECTION_LABEL_CLASSES, "flex-none")}>
            {label}
          </span>
          <span className="truncate text-xs font-medium">
            {city ?? EM_DASH}
          </span>
        </div>
        {/* Wrapped rather than truncated, unlike the desktop drawer: a phone has
            no hover, so a `title` on an elided Tbilisi address would be
            unreachable. Vertical space is the cheaper thing to spend here. */}
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

/**
 * The eight cargo rows, in the design's order.
 *
 * Built as data rather than as eight hand-written `<dt>`/`<dd>` pairs so the
 * grid cannot drift row to row and the order is one list to read.
 */
function cargoRows(load: HubLoad): { key: string; value: string }[] {
  const dims = {
    lengthM: load.cargoLengthM,
    widthM: load.cargoWidthM,
    heightM: load.cargoHeightM,
  };
  const tags = sortedHandlingTags(load.handlingTags);

  return [
    { key: "Type", value: cargoCategoryLabel(load.cargoCategory) },
    { key: "Weight", value: formatWeightKg(load.cargoWeightKg) },
    { key: "Dimensions", value: formatLoadDims(dims) },
    { key: "Volume", value: formatVolumeM3(dims) },
    { key: "Packaging", value: load.packagingDescription ?? EM_DASH },
    { key: "Quantity", value: load.itemQuantity ?? EM_DASH },
    {
      key: "Handling",
      // "None declared" rather than an em dash: the client was asked and said
      // nothing applied, which is a different fact from a value being missing.
      value:
        tags.length === 0
          ? "None declared"
          : tags.map((tag) => tag.label).join(", "),
    },
    { key: "Helpers", value: helperText(load.helperCount) },
  ];
}

/**
 * `"No helpers requested"` / `"1 helper requested"` / `"2 helpers requested"`.
 *
 * Composed from the shared `pluralise` rather than added to `loads-format.ts`:
 * that module is another task's file this wave and may not be edited from here.
 * The same sentence is built the same way in `loads-drawer.tsx`; folding both
 * into one shared formatter is part of the post-wave cleanup.
 */
export function helperText(helperCount: number): string {
  return helperCount === 0
    ? "No helpers requested"
    : `${pluralise(helperCount, "helper")} requested`;
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
    selectedLoad,
    selectLoad,
    openConfirm,
    reject,
    restore,
    pendingActionId,
    actionError,
    showRejected,
  } = useLoadsBoard();

  const load = selectedLoad;

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
          aria-label={`Load ${load.reference}`}
          // Radix warns when a dialog has no description; this sheet is a
          // detail panel with no single summarising sentence, so the warning is
          // answered by opting out rather than by inventing one.
          aria-describedby={undefined}
          className="max-h-[85vh] gap-0 overflow-y-auto rounded-t-xl p-0 lg:hidden"
          overlayClassName="lg:hidden"
          onPointerDownOutside={(event) => {
            // Only the sheet's own scrim dismisses. At `lg` the scrim is
            // `display:none`, so no desktop click can reach this and clear the
            // selection out from under the drawer.
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
              <Badge
                // `outline` so no variant background survives the merge if a
                // tone class is ever missing — as `HubStatusBadge` does.
                variant="outline"
                className={cn(
                  PILL_CLASSES,
                  "flex-none border-transparent",
                  HUB_STATUS_TONE_CLASSES[SHEET_STATUS_TONE[load.status]],
                )}
              >
                {/* A rejected load keeps the "available" pill: rejecting hides
                    the row from this driver's board and changes nothing about
                    the load's real status. */}
                {SHEET_STATUS_LABEL[load.status]}
              </Badge>
            </div>

            <p className="mt-2 font-price text-[26px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {formatGel(load.driverPayout)}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              incl.{" "}
              {formatGel(
                roundToTetri(load.driverPayout * WAITING_ALLOWANCE_SHARE),
              )}{" "}
              waiting allowance
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

            <dl className="mt-2 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-[13px]">
              {cargoRows(load).map((row) => (
                <React.Fragment key={row.key}>
                  <dt className="text-muted-foreground">{row.key}</dt>
                  <dd className="min-w-0 break-words">{row.value}</dd>
                </React.Fragment>
              ))}
            </dl>

            {/* The reason this sheet exists. Sorted by `CargoHandlingTag`
                declaration order through `sortedHandlingTags` — never by the
                order they sit in `Order.handlingTags`, which is whatever order
                the client tapped the chips in.

                Absent entirely at zero tags: the Handling row above already
                reads "None declared". */}
            {sortedHandlingTags(load.handlingTags).length === 0 ? null : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {sortedHandlingTags(load.handlingTags).map((tag) => (
                  <span
                    key={tag.value}
                    className={cn(
                      PILL_CLASSES,
                      "border border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2">
              {PHOTO_TILES.map((label) => (
                <div
                  key={label}
                  className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed border-border bg-muted text-[10px] text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* 4. Actions                                                       */}
          {/* ---------------------------------------------------------------- */}
          <div className="flex flex-col gap-2 p-4">
            {load.status === "claimed" ? (
              <p className={cn(NOTE_CLASSES, "border-border bg-muted")}>
                Claimed by another driver. No longer available.
              </p>
            ) : load.status === "mine" ? (
              <>
                <p
                  className={cn(
                    NOTE_CLASSES,
                    "border-transparent",
                    HUB_STATUS_TONE_CLASSES.success,
                  )}
                >
                  You claimed this load. Contact details are in your job sheet.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  // Ships disabled: there is no job sheet to open. See
                  // requirements.md's Non-Goals — do not wire this to a
                  // placeholder route.
                  disabled
                  title={JOB_SHEET_TITLE}
                  className={TOUCH_TARGET_CLASSES}
                >
                  Open job sheet
                  {/* `title` is not reliably announced, so the reason is real
                      text for assistive tech too. */}
                  <span className="sr-only">. {JOB_SHEET_TITLE}</span>
                </Button>
              </>
            ) : showRejected ? (
              // No Accept for a load the driver has hidden: restoring it is the
              // only path back to claiming it, matching the table and drawer.
              // `showRejected` is what put this load on screen — the context
              // clears the selection whenever that sub-view is entered or left,
              // so a selected row while it is on came from the rejected list.
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
                    calls a claim endpoint itself. */}
                <Button
                  type="button"
                  onClick={() => openConfirm(load.id)}
                  disabled={pendingActionId !== null}
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
                  First driver to confirm claims the order. Rejecting only hides
                  it from your board.
                </p>
              </>
            )}

            {/* The board-wide reject/restore failure, shown here because this
                sheet is where those two actions were taken from. */}
            {actionError === null ? null : (
              <p
                role="alert"
                className="text-xs leading-relaxed text-destructive"
              >
                {actionError}
              </p>
            )}
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}
