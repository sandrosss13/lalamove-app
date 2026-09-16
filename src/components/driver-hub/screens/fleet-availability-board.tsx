"use client";

import * as React from "react";

import { HubEmptyState } from "@/components/driver-hub/hub-primitives";
import {
  AVAILABILITY_STATUS,
  barLabel,
  formatDuration,
  formatHour,
  hourLabelStep,
} from "@/components/driver-hub/screens/fleet-availability-format";
import { Button } from "@/components/ui/button";
import type {
  HubAvailabilityBlock,
  HubAvailabilityRow,
} from "@/lib/dashboard/hub/fleet-availability";

/**
 * The Gantt itself: a sticky driver column, an hour axis, one absolutely
 * positioned bar per committed block, the now line, the drag ghost, the
 * cursor-following tooltip and the pager.
 *
 * ## Why every measurement here is an inline style
 *
 * Tailwind scans source text statically, and `globals.css` pins its scan root.
 * A class built at runtime — `` `w-[${trackWidth}px]` `` — is a string Tailwind
 * never sees, so the rule is never emitted and the element gets no width at
 * all. That failure is silent and looks like a layout bug, not a build bug.
 *
 * So the geometry travels as **CSS custom properties set once on the board
 * root** (`--hub-fa-*`) and as inline `left`/`width` percentages on the bars.
 * Declaring them once at the top means changing the zoom re-paints the axis,
 * every track and the now line from a single style write rather than from a
 * re-render of several hundred elements' class strings. `HubBarChart` in
 * `hub-primitives.tsx` is the in-repo precedent for exactly this split:
 * constants stay classes, data-driven values become styles.
 *
 * ## Why the colours are variables rather than the handoff's hexes
 *
 * `AVAILABILITY_STATUS` hands back `var(--hub-avail-*)` names, defined twice in
 * `globals.css` — once per theme. This app has an app-wide light/dark toggle,
 * and the handoff has no dark artboard: its `#eef7f1` fill carrying `#1f5c3a`
 * text would be a near-white smear on the dark board. The variables are the
 * contract; the values are somebody else's problem, once.
 *
 * ## Mouse-driven by design, but not mouse-only
 *
 * Dragging a slot has no keyboard equivalent and the handoff proposes none, so
 * the bars are not focus targets — several hundred tab stops that lead nowhere
 * would make the page *less* usable with a keyboard, not more. What a bar knows
 * still reaches assistive tech: each track carries an `sr-only` list of its
 * blocks in words, the same trade `HubBarChart` makes for its `role="img"`
 * plot. Every button here carries a real label, and the pager disables at both
 * ends rather than going quiet.
 */

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

/** The handoff's comfortable row height. */
const ROW_HEIGHT = 48;

/** Bar height inside a row, and the inset that centres it — the handoff's maths. */
const BAR_HEIGHT = 26;
const BAR_INSET = Math.max(4, (ROW_HEIGHT - BAR_HEIGHT) / 2);

/** The sticky driver column. Shared by the header cell and every row. */
const LABEL_COLUMN_WIDTH = 272;

/** The handoff's scroll cap: past this the board scrolls rather than grows. */
const BOARD_MAX_HEIGHT = 600;

/**
 * Tooltip placement, from the handoff: `cursor.x + 14` clamped to
 * `innerWidth − 300`, `cursor.y − 76` with a floor of 8.
 */
const TOOLTIP_OFFSET_X = 14;
const TOOLTIP_OFFSET_Y = -76;
const TOOLTIP_RIGHT_MARGIN = 300;
const TOOLTIP_TOP_MARGIN = 8;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * An in-progress drag.
 *
 * `trackLeft`/`trackWidth` are snapshotted from the track's bounding box at
 * `mousedown`, and `fromHour`/`toHour` from the window that was on screen at
 * the time. The `mousemove` listener then converts a page X into an hour
 * without touching the DOM or reading current state — which is what lets the
 * listener be attached once per drag instead of re-attached on every frame, and
 * what stops a drag from silently rescaling if the window selects change
 * underneath it.
 */
export type AvailabilityDrag = {
  driverId: string;
  driverName: string;
  /** The row's plate, or the "no vehicle" wording — the dialog's subtitle. */
  plateLabel: string;
  /** Where the drag started, snapped. */
  anchorHour: number;
  /** Where the cursor is now, snapped and clamped to the window. */
  cursorHour: number;
  trackLeft: number;
  trackWidth: number;
  fromHour: number;
  toHour: number;
};

/**
 * The cursor-following tooltip.
 *
 * Pre-worded by the board at `mouseenter` rather than held as a block
 * reference, so the three lines cannot be re-derived differently on a later
 * render — and so `derivedNote` is decided exactly once, at the moment the
 * block that needs it is hovered.
 */
export type AvailabilityTooltip = {
  x: number;
  y: number;
  /** `{plate} · {Status}`. */
  title: string;
  /** `{HH:MM} – {HH:MM}  ({h} h)`. */
  range: string;
  /** `{reference} · {route} · {driver}`. */
  meta: string;
  /** Present only on a block whose end was inferred rather than recorded. */
  derivedNote: string | null;
};

export type FleetAvailabilityBoardProps = {
  /**
   * The current page's rows, already filtered, already carrying any locally
   * held slots. This component draws what it is given and counts nothing.
   */
  rows: readonly HubAvailabilityRow[];
  fromHour: number;
  toHour: number;
  pixelsPerHour: number;
  /** Decimal hour of now, or `null` when the day on screen is not today. */
  nowHour: number | null;

  /** 1-based index of the first row on this page; `0` when there are none. */
  rangeStart: number;
  /** 1-based index of the last row on this page; `0` when there are none. */
  rangeEnd: number;
  /** Rows across the whole filtered set, not just this page. */
  totalRowCount: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
  canPreviousPage: boolean;
  canNextPage: boolean;

  isLoading: boolean;
  /** Inline failure text, shown inside the frame with a retry. */
  error: string | null;
  onRetry: () => void;

  drag: AvailabilityDrag | null;
  onTrackMouseDown: (
    row: HubAvailabilityRow,
    event: React.MouseEvent<HTMLDivElement>,
  ) => void;

  tooltip: AvailabilityTooltip | null;
  onTooltipChange: (tooltip: AvailabilityTooltip | null) => void;
};

/* -------------------------------------------------------------------------- */
/* Board                                                                      */
/* -------------------------------------------------------------------------- */

export function FleetAvailabilityBoard({
  rows,
  fromHour,
  toHour,
  pixelsPerHour,
  nowHour,
  rangeStart,
  rangeEnd,
  totalRowCount,
  onPreviousPage,
  onNextPage,
  canPreviousPage,
  canNextPage,
  isLoading,
  error,
  onRetry,
  drag,
  onTrackMouseDown,
  tooltip,
  onTooltipChange,
}: FleetAvailabilityBoardProps) {
  // Floored at one hour: `from`/`to` clamp against each other upstream, but a
  // zero span would divide every bar's width by zero and paint `NaN%`.
  const span = Math.max(1, toHour - fromHour);
  const trackWidth = span * pixelsPerHour;

  // The now marker is offset in **pixels**, not the percentage the prototype
  // uses. The line is drawn once for the whole stack rather than per row, so it
  // has to clear the sticky label column — `calc(272px + …)` — and a percentage
  // inside that `calc` would resolve against the stack's width (label + track)
  // rather than the track's. Pixels are exact and cost one multiplication.
  const showNow = nowHour !== null && nowHour >= fromHour && nowHour <= toHour;
  const nowLeft = nowHour === null ? 0 : (nowHour - fromHour) * pixelsPerHour;

  const hours: number[] = [];
  for (let hour = fromHour; hour < toHour; hour += 1) {
    hours.push(hour);
  }
  const labelStep = hourLabelStep(pixelsPerHour);

  /**
   * Set once on the frame and inherited by the axis, every track and the now
   * line. One style write per zoom change instead of one per element.
   */
  const boardVariables = {
    "--hub-fa-px-hour": `${pixelsPerHour}px`,
    "--hub-fa-track-w": `${trackWidth}px`,
    "--hub-fa-row-h": `${ROW_HEIGHT}px`,
    "--hub-fa-label-w": `${LABEL_COLUMN_WIDTH}px`,
    "--hub-fa-now-left": `${nowLeft}px`,
  } as React.CSSProperties;

  // Loading, failure and "nothing matched" all replace the scroller outright
  // rather than hanging under a live axis. Inside `min-w-max` a centred message
  // would centre against the *track's* width — often several thousand pixels —
  // and land off-screen; and an hour axis over zero rows is a ruler measuring
  // nothing. The frame, its border and its footer stay, so the section does not
  // jump as the state changes.
  //
  // No skeleton rows, despite the handoff asking for them: this repo has no
  // Skeleton primitive and no `loading.tsx` convention in the hub. The text
  // empty-state is the house idiom — `loads-screen.tsx` renders
  // `<HubEmptyState message="Loading loads…" />` in exactly this position — and
  // inventing a second loading vocabulary for one card is worse than matching
  // the six screens beside it.
  const body = (() => {
    if (isLoading) {
      return <HubEmptyState message="Loading availability…" />;
    }

    if (error !== null) {
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          {/* `role="alert"` so the failure is announced rather than silently
              appearing, and `text-destructive` rather than a literal red: the
              token lifts under `html.dark`, a fixed `oklch(44.4% …)` does not.
              Same trade every other error line in the hub made. */}
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      );
    }

    if (rows.length === 0) {
      return <HubEmptyState message="No drivers match these filters." />;
    }

    return (
      // One scroll container for the axis and the rows together, so they can
      // never drift apart horizontally. `min-w-max` makes the stack as wide as
      // the widest row rather than as wide as the viewport, which is what lets
      // the sticky label column have something to stick against.
      <div className="overflow-auto" style={{ maxHeight: BOARD_MAX_HEIGHT }}>
        <div className="relative min-w-max">
          <TimelineHeader
            hours={hours}
            fromHour={fromHour}
            labelStep={labelStep}
            showNow={showNow}
            nowHour={nowHour}
          />

          {rows.map((row) => (
            <BoardRow
              key={row.driverId}
              row={row}
              fromHour={fromHour}
              toHour={toHour}
              span={span}
              pixelsPerHour={pixelsPerHour}
              drag={drag?.driverId === row.driverId ? drag : null}
              onTrackMouseDown={onTrackMouseDown}
              onTooltipChange={onTooltipChange}
            />
          ))}

          {/* One line for the whole stack rather than one per row. It sits at
              z-3, under the sticky label column's z-4, so scrolling right
              tucks it behind the driver names instead of striping them. */}
          {showNow ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 z-[3] w-0.5"
              style={{
                left: "calc(var(--hub-fa-label-w) + var(--hub-fa-now-left))",
                background: "var(--hub-avail-now)",
              }}
            />
          ) : null}
        </div>
      </div>
    );
  })();

  return (
    <div style={boardVariables}>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {body}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted px-4 py-2.5">
          <span className="font-price text-xs text-muted-foreground tabular-nums">
            {totalRowCount === 0
              ? "No rows"
              : `Showing ${rangeStart}–${rangeEnd} of ${totalRowCount} rows`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canPreviousPage}
              onClick={onPreviousPage}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canNextPage}
              onClick={onNextPage}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {tooltip === null ? null : <BarTooltip tooltip={tooltip} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Timeline header                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The hour axis.
 *
 * Sticky on both axes at once: `top-0` keeps it visible while the rows scroll
 * under it, and its first cell is `left-0` so the "Driver · Vehicle" caption
 * stays over the driver column when the board is scrolled sideways. The corner
 * cell therefore needs the higher z-index of the two, or it would slide under
 * the hour cells it is meant to sit beside.
 */
function TimelineHeader({
  hours,
  fromHour,
  labelStep,
  showNow,
  nowHour,
}: {
  hours: readonly number[];
  fromHour: number;
  labelStep: number;
  showNow: boolean;
  nowHour: number | null;
}) {
  return (
    <div className="sticky top-0 z-[5] flex border-b border-border bg-card">
      <div
        className="sticky left-0 z-[6] flex-none border-r border-border bg-card px-[14px] py-[9px] text-[11px] font-semibold tracking-[0.04em] uppercase text-muted-foreground"
        style={{ width: "var(--hub-fa-label-w)" }}
      >
        Driver · Vehicle
      </div>
      <div
        className="relative flex flex-none"
        style={{ width: "var(--hub-fa-track-w)" }}
      >
        {hours.map((hour) => (
          <div
            key={hour}
            className="flex-none overflow-hidden border-l border-border pt-[9px] pr-0 pb-[9px] pl-1.5 font-price text-[11px] whitespace-nowrap text-muted-foreground tabular-nums"
            style={{ width: "var(--hub-fa-px-hour)" }}
          >
            {/* Labels thin out as the zoom tightens — every hour, every 2nd,
                then every 4th. Without that they overlap into a smear at 24
                px/h. The empty cells are still rendered: they draw the axis's
                hour rules. */}
            {(hour - fromHour) % labelStep === 0 ? formatHour(hour) : ""}
          </div>
        ))}
        {showNow && nowHour !== null ? (
          <span
            className="absolute top-1.5 z-[2] rounded-[3px] px-[5px] py-px font-price text-[10px] font-semibold whitespace-nowrap tabular-nums"
            style={{
              left: "var(--hub-fa-now-left)",
              transform: "translateX(-50%)",
              background: "var(--hub-avail-now)",
              // The pill is the brand orange in both themes, so its text is
              // pinned white rather than taken from a token that would flip to
              // near-black on a dark build and vanish into the fill.
              color: "#fff",
            }}
          >
            {formatHour(nowHour)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Row                                                                        */
/* -------------------------------------------------------------------------- */

/** The wording a row with no vehicle pairing shows on its second line. */
const NO_VEHICLE_LINE = "No vehicle assigned";

/**
 * What a block's tooltip calls the vehicle it ran on.
 *
 * Falls back to a statement of absence rather than to the row's *current*
 * pairing. `HubAvailabilityBlock.vehiclePlate` is null when the order recorded
 * none — `Order.vehicleId` stays unset until a job is accepted — and borrowing
 * the row's plate would put a specific truck's registration against a job that
 * never named one.
 */
function blockPlateLabel(block: HubAvailabilityBlock): string {
  return block.vehiclePlate ?? "Vehicle not recorded";
}

function BoardRow({
  row,
  fromHour,
  toHour,
  span,
  pixelsPerHour,
  drag,
  onTrackMouseDown,
  onTooltipChange,
}: {
  row: HubAvailabilityRow;
  fromHour: number;
  toHour: number;
  span: number;
  pixelsPerHour: number;
  /** The drag in progress, but only when it belongs to this row. */
  drag: AvailabilityDrag | null;
  onTrackMouseDown: (
    row: HubAvailabilityRow,
    event: React.MouseEvent<HTMLDivElement>,
  ) => void;
  onTooltipChange: (tooltip: AvailabilityTooltip | null) => void;
}) {
  const visible = row.blocks.filter(
    (block) => block.end > fromHour && block.start < toHour,
  );

  const ghostStart =
    drag === null ? 0 : Math.min(drag.anchorHour, drag.cursorHour);
  const ghostEnd =
    drag === null ? 0 : Math.max(drag.anchorHour, drag.cursorHour);
  // A ghost narrower than the snap interval is a click, not a selection, and
  // drawing it makes every stray click flash a sliver across the row.
  const showGhost = drag !== null && ghostEnd - ghostStart >= 0.25;

  return (
    <div
      className="flex border-b border-border"
      style={{ height: "var(--hub-fa-row-h)" }}
    >
      <div
        className="sticky left-0 z-[4] flex flex-none flex-col justify-center gap-0.5 overflow-hidden border-r border-border bg-card px-[14px]"
        style={{ width: "var(--hub-fa-label-w)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold">{row.name}</span>
          <span className="shrink-0 font-price text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
            {row.phone}
          </span>
        </div>
        {/* A driver with no vehicle still gets a full, live row. The handoff
            hatches their whole track as `Unavailable` — that status does not
            exist in this build (no shift or unavailability model backs it), and
            more importantly an unpaired driver is not unavailable: they can be
            given a truck and dispatched. Hatching the track would tell a
            dispatcher the opposite of the truth. The second line states the
            gap and the track stays readable. */}
        <div className="truncate text-[11px] text-muted-foreground">
          {row.vehicle === null ? (
            NO_VEHICLE_LINE
          ) : (
            <>
              <span className="font-price tabular-nums">
                {row.vehicle.plateNumber}
              </span>
              {` · ${row.vehicle.model} · ${row.vehicle.vehicleClassLabel} · ${row.cityLabel}`}
            </>
          )}
        </div>
      </div>

      <div
        className="relative flex-none cursor-crosshair"
        onMouseDown={(event) => onTrackMouseDown(row, event)}
        style={{
          width: "var(--hub-fa-track-w)",
          // The wash is a `color-mix` against `--card`, so it stays a tint of
          // whatever surface the theme is painting rather than the handoff's
          // fixed `#f7fbf8`, which would be a white strip on a dark board.
          backgroundColor: "var(--hub-avail-track)",
          // Hour rules drawn as a repeating gradient rather than 24 border
          // elements: one paint, and it re-spaces itself from `--hub-fa-px-hour`
          // when the zoom changes.
          backgroundImage:
            "linear-gradient(to right, var(--hub-avail-grid) 0 1px, transparent 1px 100%)",
          backgroundSize: "var(--hub-fa-px-hour) 100%",
        }}
      >
        {visible.map((block) => (
          <Bar
            key={block.id}
            block={block}
            row={row}
            fromHour={fromHour}
            toHour={toHour}
            span={span}
            pixelsPerHour={pixelsPerHour}
            onTooltipChange={onTooltipChange}
          />
        ))}

        {showGhost ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 bottom-1.5 z-[4] flex items-center justify-center rounded-[5px] font-price text-[11px] tabular-nums"
            style={{
              left: `${((ghostStart - fromHour) / span) * 100}%`,
              width: `${((ghostEnd - ghostStart) / span) * 100}%`,
              background: "var(--hub-avail-ghost-bg)",
              border: "1.5px dashed var(--hub-avail-now)",
              color: "var(--hub-avail-ghost-fg)",
            }}
          >
            {`${formatHour(ghostStart)} – ${formatHour(ghostEnd)}`}
          </div>
        ) : null}

        {/* The bars are `aria-hidden` shapes; this is where their content
            actually reaches assistive tech. Same trade `HubBarChart` makes for
            its `role="img"` plot — describing a few hundred absolutely
            positioned divs through labels would be both noisier and less
            accurate than one sentence each. */}
        <ul className="sr-only">
          {visible.map((block) => (
            <li key={block.id}>
              {`${row.name}: ${formatHour(block.start)} to ${formatHour(block.end)}, ` +
                `${AVAILABILITY_STATUS[block.status].label}, ${block.reference}, ` +
                `${block.route}, ${blockPlateLabel(block)}` +
                (block.derivedEnd ? ", end time inferred" : "")}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bar                                                                        */
/* -------------------------------------------------------------------------- */

/** What a bar's tooltip says when its end time was never recorded. */
const DERIVED_END_NOTE =
  "End time inferred — no completion or deadline is recorded for this job.";

function Bar({
  block,
  row,
  fromHour,
  toHour,
  span,
  pixelsPerHour,
  onTooltipChange,
}: {
  block: HubAvailabilityBlock;
  row: HubAvailabilityRow;
  fromHour: number;
  toHour: number;
  span: number;
  pixelsPerHour: number;
  onTooltipChange: (tooltip: AvailabilityTooltip | null) => void;
}) {
  const meta = AVAILABILITY_STATUS[block.status];

  // Clipped to the window rather than hidden: a job that starts at 05:00 on an
  // 06:00–22:00 board is still running at 06:00, and the bar has to say so.
  const start = Math.max(block.start, fromHour);
  const end = Math.min(block.end, toHour);
  const widthPx = (end - start) * pixelsPerHour;

  /** Hover and move both refresh the tooltip, so it tracks the cursor. */
  function showTooltip(event: React.MouseEvent<HTMLDivElement>): void {
    onTooltipChange({
      x: event.clientX,
      y: event.clientY,
      title: `${blockPlateLabel(block)} · ${meta.label}`,
      // The *uncut* hours, not the clipped ones the bar is drawn from: the
      // tooltip answers "when is this job", and a bar cropped by the visible
      // window must not report a shorter job than the one being run.
      range: `${formatHour(block.start)} – ${formatHour(block.end)}  (${formatDuration(block.end - block.start)})`,
      meta: `${block.reference} · ${block.route} · ${row.name}`,
      derivedNote: block.derivedEnd ? DERIVED_END_NOTE : null,
    });
  }

  return (
    <div
      // Not a focus target — see the file comment. The `sr-only` list on the
      // track carries this block's facts instead.
      aria-hidden="true"
      onMouseEnter={showTooltip}
      onMouseMove={showTooltip}
      onMouseLeave={() => onTooltipChange(null)}
      className="absolute z-[2] box-border flex cursor-pointer items-center overflow-hidden rounded-[5px] px-[7px] font-price text-[11px] font-medium text-ellipsis whitespace-nowrap"
      style={{
        left: `${((start - fromHour) / span) * 100}%`,
        width: `${((end - start) / span) * 100}%`,
        top: BAR_INSET,
        height: BAR_HEIGHT,
        background: meta.background,
        color: meta.color,
        border: meta.border,
        // A bar whose end was invented gets the dashed edge, whatever its
        // status: `Order` stores no duration and no ETA, so an "09:00 – 11:30"
        // that a dispatcher will move real trucks on has to look different from
        // one that was measured. The status keeps its own colour and only the
        // stroke changes, so the dashes read as "approximate" rather than as a
        // fifth status. `booked` is already dashed, which is harmless — it is
        // the one status whose end is always a plan anyway.
        ...(block.derivedEnd
          ? { borderStyle: "dashed", borderWidth: 1.5 }
          : null),
      }}
    >
      {barLabel(block.status, block.reference, widthPx)}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The cursor-following tooltip.
 *
 * `position: fixed` and `pointer-events: none`: fixed because it follows a
 * viewport coordinate and must not be clipped by the board's `overflow:auto`,
 * and inert because a box that sat under the cursor would trigger its own
 * source bar's `mouseleave` and make the tooltip flicker itself out of
 * existence.
 *
 * `window.innerWidth` is read during render, which is safe only because this
 * component never renders on the server: `tooltip` starts null and is set from
 * a mouse event, so the first render that reaches here is already in a browser.
 */
function BarTooltip({ tooltip }: { tooltip: AvailabilityTooltip }) {
  return (
    <div
      role="presentation"
      className="pointer-events-none fixed z-[60] max-w-[280px] rounded-lg border border-border bg-popover px-2.5 py-2 text-popover-foreground"
      style={{
        left: Math.min(
          tooltip.x + TOOLTIP_OFFSET_X,
          window.innerWidth - TOOLTIP_RIGHT_MARGIN,
        ),
        top: Math.max(TOOLTIP_TOP_MARGIN, tooltip.y + TOOLTIP_OFFSET_Y),
        boxShadow: "0 8px 24px rgba(21,20,15,0.14)",
      }}
    >
      <div className="mb-0.5 text-xs font-semibold">{tooltip.title}</div>
      <div className="font-price text-xs text-muted-foreground tabular-nums">
        {tooltip.range}
      </div>
      <div className="text-xs text-muted-foreground">{tooltip.meta}</div>
      {/* The derived-end note is the whole point of `HubAvailabilityBlock.
          derivedEnd`: the dashed border says "something is different", this
          says what. Given its own line and the foreground colour so it is not
          mistaken for more muted metadata. */}
      {tooltip.derivedNote === null ? null : (
        <div className="mt-1 text-xs text-foreground">
          {tooltip.derivedNote}
        </div>
      )}
    </div>
  );
}
