"use client";

import * as React from "react";

import {
  AVAILABILITY_STATUS,
  formatDuration,
  formatHour,
} from "@/components/driver-hub/screens/fleet-availability-format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The two dialogs the Fleet Availability board opens: **Hold this slot**, which
 * a dispatcher reaches by dragging across an empty stretch of a driver's track,
 * and **Export availability**, which decides what the spreadsheet contains
 * before the server builds it. Sections "Drag to hold a slot" and "Export
 * dialog" of
 * `UI:UX/fleet availability/design_handoff_driver_availability/README.md`.
 *
 * Both are fully controlled. Neither holds the board's state, neither reads the
 * board back, and neither performs the thing it describes — the hold is applied
 * by the board's `onConfirm`, the workbook is fetched by the board's
 * `onDownload`. This file renders a decision; the board performs it. That split
 * is the same one `loads-claim-dialogs.tsx` makes, and it exists for the same
 * reason: a dialog that also owns the mutation has to be mounted to run it, so
 * closing it mid-flight silently cancels the work.
 *
 * ## `data-admin-surface=""` on both `DialogContent`s
 *
 * Radix portals dialog content to `document.body`, which is **outside** the
 * `DriverHubShell` root that carries `data-admin-surface` — and with it the
 * token pin that makes `bg-popover`, `bg-muted`, `border-border` and
 * `text-muted-foreground` resolve to the hub's palette rather than the
 * marketing one. Without the attribute the panel renders in the landing
 * palette: not an error, not a crash, just the wrong greys, which is why every
 * portalled surface in this repo repeats it by hand. There is no shared wrapper
 * that can carry it for them — two dialogs, two attributes.
 *
 * ## No hardcoded status hexes, anywhere below
 *
 * The handoff prints literal colours (`#fff6f1`, `#ff5a1f`, `#fff3ec`) because
 * the prototype had one theme. This app has an app-wide light/dark toggle, so
 * every one of those literals is a near-white smear on a dark panel. The status
 * treatment is therefore read from `AVAILABILITY_STATUS`, whose values are the
 * `--hub-avail-*` custom properties defined twice in `src/app/globals.css`, and
 * the accent is `var(--landing-accent)`.
 *
 * **`bg-accent` is not the accent inside the hub.** `--color-accent` chains
 * through `var(--admin-accent, …)` and resolves to a neutral on an admin
 * surface, so the Tailwind utility would paint a grey radio dot. The accent is
 * spelled out as the custom property at each of the three places it is needed.
 *
 * ## Where the state lives, and why the bodies are separate components
 *
 * The export dialog has two pieces of state a reopened dialog must not inherit:
 * whether a download is in flight, and the last failure. Holding them in
 * `ExportAvailabilityDialog` would keep them across a close — the dialog's own
 * function component stays mounted for as long as the board does, so a
 * dispatcher who hit a failure, closed, and reopened would be greeted by a stale
 * red line about a download they had already abandoned.
 *
 * Clearing them in an effect on `open` is the obvious fix and is the wrong one:
 * it is a render pass of stale content followed by a correction. Instead the
 * body is a child component rendered *inside* `DialogContent`, which Radix
 * unmounts on close — so the state is destroyed by the same mechanism that
 * unmounts the markup, with no effect and no reset branch. Conditionally
 * rendering `DialogContent` itself would work too, and would also throw away
 * Radix's exit animation, because `Presence` needs the node to survive the
 * `data-closed` transition.
 */

/* -------------------------------------------------------------------------- */
/* Shared tokens                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The board's accent, as a value rather than a utility class. See the module
 * comment for why `bg-accent` / `border-accent` cannot be used here.
 */
const ACCENT = "var(--landing-accent)";

/**
 * The tint behind the picked export card — the handoff's `#fff6f1` expressed as
 * a mix of the accent into the panel's own surface.
 *
 * Stated as a mix rather than as the hex for the reason the whole palette is:
 * `#fff6f1` is 97% lightness, so on the dark panel the selected card would be a
 * white block with white text on it. Mixing 8% accent into `--popover` — the
 * surface `DialogContent` actually paints — keeps it a *tint of the card it sits
 * on* in both themes, which is what the light-mode hex is.
 */
const SCOPE_TINT =
  "color-mix(in oklab, var(--landing-accent) 8%, var(--popover))";

/** Shown when a rejection carries no message of its own. */
const DOWNLOAD_GENERIC_ERROR = "Could not build the export. Try again.";

/* -------------------------------------------------------------------------- */
/* Hold a slot                                                                */
/* -------------------------------------------------------------------------- */

export type HoldSlotDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null while closed. Hours are decimal hours in the board's day. */
  pending: {
    driverName: string;
    plateLabel: string;
    dayKey: string;
    start: number;
    end: number;
  } | null;
  onConfirm: () => void;
};

/**
 * "Hold this slot" — the confirmation at the end of a drag across an empty
 * stretch of a driver's track.
 *
 * ## This dialog does not reserve anything, and it says so
 *
 * There is no reservation table in this schema and no endpoint that would write
 * to one. `onConfirm` appends a `booked` bar to the board's **local** state and
 * nothing else: no request leaves the browser, nothing is persisted, and a
 * refresh restores the track exactly as it was. The quiet line at the foot of
 * the panel states that plainly, because a dialog titled "Hold this slot" with
 * a "Hold slot" button makes a promise the build cannot keep, and a dispatcher
 * who believed it would leave a driver double-booked by a colleague five minutes
 * later.
 *
 * The rejected alternative was the handoff's own wording — "In production this
 * is a POST that creates the reservation; on failure keep the dialog open and
 * surface the error" — implemented as an optimistic success. That would mean
 * inventing an endpoint, a table and an error vocabulary for none of which
 * anything exists, and shipping a dialog whose silence reads as confirmation.
 * The other rejected option was disabling the button entirely: the drag ghost is
 * genuinely useful for *reading* a gap against the rest of the day, and a dead
 * button explains nothing. So the action stays, and the sentence is honest about
 * what it does.
 *
 * ## Why `pending` is a snapshot and not a pair of hours
 *
 * The driver name and plate are carried on the payload rather than resolved from
 * the board's rows on render. The board refilters and repaginates underneath an
 * open dialog — a status filter change is enough — and a panel that re-resolved
 * its own subject could rename the driver mid-decision or lose the row
 * altogether. What a dispatcher confirms must be what they were shown.
 */
export function HoldSlotDialog({
  open,
  onOpenChange,
  pending,
  onConfirm,
}: HoldSlotDialogProps): React.JSX.Element {
  const booked = AVAILABILITY_STATUS.booked;

  return (
    <Dialog
      // `pending === null` forces the dialog shut rather than rendering an empty
      // panel. It is a state the board should never produce, but the failure mode
      // if it did — a titleless dialog, which is also an accessibility violation
      // Radix warns about — is worse than a dialog that quietly declines to open.
      open={open && pending !== null}
      onOpenChange={onOpenChange}
    >
      {pending !== null ? (
        <DialogContent
          // Portalled outside the shell — see the module comment.
          data-admin-surface=""
          // Discard is the dismissal, and a second close affordance in the
          // corner of a 420px panel is noise — the same call every other hub
          // dialog makes. Escape and the overlay still close it; Radix's own
          // handling is left untouched.
          showCloseButton={false}
          className="sm:max-w-[420px]"
        >
          <DialogHeader>
            <DialogTitle>Hold this slot</DialogTitle>
            <DialogDescription>
              {pending.driverName} ·{" "}
              <span className="font-price tabular-nums">
                {pending.plateLabel}
              </span>
            </DialogDescription>
          </DialogHeader>

          {/* Three label/value rows rather than a definition list: the values are
              a date, a time range and a status pill, none of which are terms
              being defined, and `dl` would buy nothing a `span` pair does not.
              The label column is `text-muted-foreground` and the value column
              carries the numerals, exactly as the tooltip does one file over, so
              the two surfaces spell one window the same way. */}
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Date</span>
              <span className="font-price tabular-nums">{pending.dayKey}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Window</span>
              {/* One string built from the shared formatters, never from a
                  local `toFixed`: the bar this confirms is drawn from the same
                  two numbers, and a dialog that rounded 09:07 to 09:00 on its
                  own would describe a slot the board does not draw. */}
              <span className="font-price tabular-nums">
                {formatHour(pending.start)} – {formatHour(pending.end)} (
                {formatDuration(pending.end - pending.start)})
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Status</span>
              {/* The board's own `booked` treatment, not a restatement of it: fill,
                  ink and the 1.5px dashed border all come from
                  `AVAILABILITY_STATUS`, so this pill and the bar the confirm
                  produces are the same object seen twice. Inline styles because
                  the values are theme-aware custom properties — including a
                  dashed border width Tailwind has no utility for. */}
              <span
                className="inline-flex items-center rounded-[5px] px-[7px] py-0.5 text-[11px] leading-[18px] font-medium"
                style={{
                  background: booked.background,
                  color: booked.color,
                  border: booked.border,
                }}
              >
                {booked.label}
              </span>
            </div>
          </div>

          {/* The honesty line. See the component comment: nothing here writes to
              a database, and the one place a dispatcher could reasonably assume
              otherwise is the moment before they press "Hold slot". */}
          <p className="text-xs text-muted-foreground">
            Kept in this browser only. Reservations aren&rsquo;t stored yet, so
            this hold disappears when the board reloads and other dispatchers
            won&rsquo;t see it.
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Discard
            </Button>
            <Button type="button" onClick={onConfirm}>
              Hold slot
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Export availability                                                        */
/* -------------------------------------------------------------------------- */

export type ExportScope = "view" | "day" | "all";

export type ExportAvailabilityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: ExportScope;
  onScopeChange: (scope: ExportScope) => void;
  includeGaps: boolean;
  onIncludeGapsChange: (value: boolean) => void;
  includePhone: boolean;
  onIncludePhoneChange: (value: boolean) => void;
  filteredDriverCount: number;
  totalDriverCount: number;
  fromHour: number;
  toHour: number;
  spreadsheetRowCount: number;
  /** Runs the download. Rejects with an Error whose message is shown inline. */
  onDownload: () => Promise<void>;
};

/**
 * "Export availability" — the three scopes, the two column switches and the
 * live row count, in front of a download the board performs.
 *
 * Every figure on this panel is a prop. The dialog counts nothing itself, and
 * in particular does not recompute `spreadsheetRowCount` from the scope: the
 * board derives that number from the same walk over blocks and gaps that the
 * export route will perform, and a second implementation here would be a second
 * answer to "how many rows" — the exact disagreement between the screen and the
 * spreadsheet that the handoff's "prefer a server route … so the export cannot
 * disagree with the screen" note exists to prevent.
 *
 * The scope, both checkboxes and the count are lifted to the board for the same
 * reason: the board is what turns them into a request, so it must hold them.
 *
 * ## `.xlsx`, not the handoff's `.xls`
 *
 * The prototype wrote SpreadsheetML 2003 from a `application/vnd.ms-excel`
 * blob in the browser. This build streams a real `.xlsx` from a server route
 * built with `exceljs`, matching `src/app/api/dashboard/hub/earnings/export/
 * route.ts`, so the button names the file the user will actually receive.
 * Labelling it `.xls` would be a lie about the format on the one control whose
 * job is to describe the file.
 */
export function ExportAvailabilityDialog(
  props: ExportAvailabilityDialogProps,
): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        // Portalled outside the shell — see the module comment.
        data-admin-surface=""
        showCloseButton={false}
        className="sm:max-w-[460px]"
      >
        {/* The body is a child so that Radix unmounting this content on close
            destroys its in-flight flag and its last failure with it. See the
            module comment; this is deliberate and not an accident of nesting. */}
        <ExportAvailabilityDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Everything inside the export panel, including the header, so that the whole
 * subtree — and the two pieces of local state below it — is owned by the node
 * Radix unmounts.
 *
 * Returns a fragment rather than a wrapper `div`: `DialogContent` is a grid with
 * a `gap-4`, and an extra element would collapse the header, the options and the
 * footer into one grid row, losing the spacing the panel is built on.
 */
function ExportAvailabilityDialogBody({
  onOpenChange,
  scope,
  onScopeChange,
  includeGaps,
  onIncludeGapsChange,
  includePhone,
  onIncludePhoneChange,
  filteredDriverCount,
  totalDriverCount,
  fromHour,
  toHour,
  spreadsheetRowCount,
  onDownload,
}: ExportAvailabilityDialogProps): React.JSX.Element {
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * The three scopes, as data.
   *
   * Built here rather than as a module constant because every hint string is a
   * function of the current filters — hoisting it would mean passing all five
   * figures back in, which is the same list with an extra hop. The ids are the
   * `ExportScope` union, so a fourth scope cannot be added without the board
   * being made to understand it.
   *
   * The handoff says "vehicles" throughout. **This board's rows are drivers** —
   * one row per driver, with the assigned vehicle as row metadata — so the copy
   * says drivers. A card promising "24 vehicles" beside a board showing 24
   * driver rows describes a different export from the one that runs.
   */
  const scopeOptions: { id: ExportScope; label: string; hint: string }[] = [
    {
      id: "view",
      label: "Current view",
      hint: `${filteredDriverCount} drivers · ${formatHour(fromHour)}–${formatHour(toHour)}`,
    },
    {
      id: "day",
      label: "Filtered drivers, whole day",
      hint: `${filteredDriverCount} drivers · 00:00–24:00`,
    },
    {
      id: "all",
      label: "All drivers, whole day",
      hint: `${totalDriverCount} drivers · filters ignored`,
    },
  ];

  /**
   * Ask the board for the file, and close only if it arrives.
   *
   * A rejection is rendered in place and the panel stays open, because every way
   * this can fail is one the dispatcher can act on from here: narrow the scope,
   * drop the phone column, or simply press the button again. Closing on failure
   * would take the retry away along with the reason.
   *
   * Escape and the overlay are **not** blocked while a download is in flight,
   * which is the opposite of what the claim dialog does — and deliberately so.
   * The request belongs to the board, not to this panel, so dismissing mid-flight
   * does not cancel it and the file still arrives; the only thing lost is a
   * failure message for a download the dispatcher has already walked away from.
   * Trapping them in a modal to protect a message they are not reading would be
   * the worse trade.
   *
   * `finally` clears the flag even on the success path, where the panel is about
   * to unmount anyway — cheap insurance against the board declining to close
   * (a controlled `open` it chooses not to lower) and leaving a permanently
   * disabled button behind.
   */
  async function handleDownload(): Promise<void> {
    setError(null);
    setIsDownloading(true);

    try {
      await onDownload();
      onOpenChange(false);
    } catch (cause) {
      // The board's own message names the real obstacle — a refused scope, a
      // route that answered 500 — which a generic string here cannot. Anything
      // thrown that is not an `Error`, or an `Error` with an empty message,
      // falls through to the fallback rather than printing "undefined".
      setError(
        cause instanceof Error && cause.message !== ""
          ? cause.message
          : DOWNLOAD_GENERIC_ERROR,
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Export availability</DialogTitle>
        <DialogDescription>
          Choose what goes into the spreadsheet.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2.5">
        {/* A real `fieldset` around real `input type="radio"`s, the pattern the
            claim dialog's vehicle picker uses. The prototype's cards were
            `div`s with click handlers, which is three separate regressions: the
            group is unnamed to a screen reader, the arrow keys do nothing, and
            the cards are unreachable by keyboard at all. Each input is
            `sr-only` rather than `hidden` so it keeps its place in the tab order
            and the accessibility tree while the dot beside it carries the
            state. */}
        <fieldset className="flex min-w-0 flex-col gap-2.5">
          <legend className="sr-only">What to export</legend>

          {scopeOptions.map((option) => {
            const selected = option.id === scope;

            return (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 transition-colors",
                  "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  !selected && "hover:bg-muted/50",
                )}
                style={{
                  // A constant 1.5px border, accent when picked and `--border`
                  // when not, rather than the handoff's 1px→1.5px swap. The swap
                  // grows the card by a pixel on selection, so picking a scope
                  // nudges everything below it — a visible twitch on a list of
                  // three, and one the extra half-pixel of border does not pay
                  // for.
                  border: `1.5px solid ${selected ? ACCENT : "var(--border)"}`,
                  background: selected ? SCOPE_TINT : "transparent",
                }}
              >
                {/* 4px of accent on a 14px circle leaves a 6px well of card
                    showing through, which is what makes this read as a filled
                    radio. Tailwind has no `border-[1.5px]` in the default scale
                    and the accent cannot be a utility here, so both live inline.
                    `margin-top` optically centres the dot on the first line of a
                    two-line card rather than on the card as a whole. */}
                <span
                  aria-hidden="true"
                  className="mt-[3px] size-3.5 shrink-0 rounded-full"
                  style={{
                    border: selected
                      ? `4px solid ${ACCENT}`
                      : "1.5px solid var(--input)",
                  }}
                />

                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] font-medium">
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {option.hint}
                  </span>
                </span>

                <input
                  type="radio"
                  name="fleet-availability-export-scope"
                  value={option.id}
                  checked={selected}
                  onChange={() => {
                    onScopeChange(option.id);
                  }}
                  disabled={isDownloading}
                  className="sr-only"
                />
              </label>
            );
          })}
        </fieldset>

        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id="fleet-availability-export-gaps"
              checked={includeGaps}
              // Radix models a third, indeterminate state; these boxes have two,
              // so anything that is not literally `true` is unchecked.
              onCheckedChange={(checked) => {
                onIncludeGapsChange(checked === true);
              }}
              disabled={isDownloading}
            />
            <Label
              htmlFor="fleet-availability-export-gaps"
              className="cursor-pointer text-[13px]"
            >
              Include free slots as Available rows
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="fleet-availability-export-phone"
              checked={includePhone}
              onCheckedChange={(checked) => {
                onIncludePhoneChange(checked === true);
              }}
              disabled={isDownloading}
            />
            <Label
              htmlFor="fleet-availability-export-phone"
              className="cursor-pointer text-[13px]"
            >
              Include driver phone number
            </Label>
          </div>
        </div>

        {/* The live count. Every control above changes it, which is the point:
            it is the one number that tells a dispatcher whether "all drivers,
            whole day, with free slots" is the 60-row answer they wanted or the
            4,000-row one they did not. */}
        <p className="text-xs text-muted-foreground tabular-nums">
          {spreadsheetRowCount === 1
            ? "1 spreadsheet row will be written."
            : `${spreadsheetRowCount} spreadsheet rows will be written.`}
        </p>

        {/* What an "Available" row in the file actually asserts.
 
            The board computes free slots as the *complement* of committed work
            — `availabilityGaps()` walks the blocks and emits what is left. This
            schema stores no shifts, no rest windows and no declared
            availability, so a gap means "no order is on this driver at this
            hour", which is not the same as "this driver is working and can take
            a job". On screen the distinction is survivable, because a dispatcher
            reads the gap in the context of the whole row. In a spreadsheet the
            row is stripped of that context, gets forwarded, and is read as a
            commitment. Hence the sentence, next to the switch that creates
            those rows. */}
        {includeGaps ? (
          <p className="text-xs text-muted-foreground">
            A free slot means no committed work in the window — not a confirmed
            shift. Shifts and rest periods aren&rsquo;t recorded yet, so these
            rows can&rsquo;t promise a driver is on duty.
          </p>
        ) : null}
      </div>

      {error !== null ? (
        // Inline, beside the control that failed, and above a footer whose
        // button is still pressable — never an `alert()`, the rule across this
        // surface.
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={isDownloading}
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={isDownloading}
          aria-busy={isDownloading}
          onClick={() => {
            void handleDownload();
          }}
        >
          {isDownloading ? "Preparing…" : "Download .xlsx"}
        </Button>
      </DialogFooter>
    </>
  );
}
