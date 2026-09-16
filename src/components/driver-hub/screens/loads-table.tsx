"use client";

import { HUB_STATUS_TONE_CLASSES } from "@/components/driver-hub/hub-status";
import {
  useLoadsBoard,
  type HubLoad,
  type LoadsSortKey,
} from "@/components/driver-hub/screens/loads-context";
import {
  EM_DASH,
  cargoCategoryLabel,
  formatClock,
  formatDeadlineLine,
  formatDistanceKm,
  formatGel,
  formatGelPerKm,
  formatLoadDayLabel,
  formatLoadDims,
  formatPostedAgo,
  formatVolumeM3,
  formatWeightKg,
  pluralise,
} from "@/components/driver-hub/screens/loads-format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * The load board's desktop table — the primary surface of this feature.
 *
 * Thirteen columns a driver scans to decide what to accept, per-row
 * Reject/Accept, the three row states (`available` / `claimed` / `mine`), the
 * empty state and the footer. Transcribed from Section 2, "Desktop — Load
 * board", of `UI:UX/Order Dashboard/design_handoff_driver_load_board/README.md`,
 * and then departed from where the columns are concerned — see "The dissolved
 * Route column" below.
 *
 * Desktop only: `hidden lg:block`, the same `lg` breakpoint `MasterDetailSplit`
 * gates the hub's two-column layouts on. `loads-mobile.tsx` is its `lg:hidden`
 * counterpart and both render unconditionally — the switch is CSS, never a
 * JS-measured breakpoint, which would either mismatch on hydration or need a
 * third "not yet known" render state.
 *
 * ## The money rule
 *
 * Every money figure here is `driverPayout` (the driver's stored 85% share) or
 * `ratePerKm` (that payout per kilometre). **`Order.price` — what the client
 * pays — must never render on this table**, and no figure here may be derived
 * from it by commission arithmetic. `GET /api/loads` does not select the fare
 * columns at all, so `HubLoad` carries no field to reach for by mistake; this
 * note exists so nobody adds one.
 *
 * ## The dissolved Route column
 *
 * The design's first column was a single Route cell stacking four facts —
 * `pickupCity → dropoffCity` with the trip length beside it, the two addresses
 * on one truncated line, and the reference plus the load's age underneath. It is
 * gone. Each of those facts now has a column, because a driver comparing rows
 * compares *one* fact at a time and a cell that answers four questions at once
 * can be scanned for none of them.
 *
 * The order is the approved one: Load, Pick-up address, Pick-up city, Pick-up
 * date, Pick-up time, Drop-off address, Drop-off city, Cargo, Helpers,
 * Weight / dims, Distance, Price, Actions.
 *
 * Three things about that list are worth stating because they are decisions
 * rather than transcription:
 *
 * 1. **The leading "Load" column is this file's own addition.** Nobody asked for
 *    a thirteenth column; it exists because the reference button inside the old
 *    Route cell is **the row's only keyboard path into the detail drawer**, and
 *    dissolving the cell it lived in would have deleted that path. It carries
 *    the reference button and, under it, the load's age ("posted 14 min ago"),
 *    which a driver uses to judge whether a load has been sitting unclaimed. Both
 *    were on the Route cell's third line and neither belongs to any of the twelve
 *    columns around it. Dropping this column means finding somewhere else for the
 *    button first — not deleting it.
 * 2. **Pick-up date and Pick-up time both read `scheduledAt`, and nothing else.**
 *    They replace the design's "Pick-up window" column, which read the
 *    `pickupWindowStart`/`End` pair. That pair is an optional refinement most
 *    clients leave at "Any time", whereas `scheduledAt` is required by the
 *    booking form and by `POST /api/orders` — so the new columns are populated on
 *    strictly more rows than the one they replace, not fewer. They do **not**
 *    fall back to the window when `scheduledAt` is null (an order predating its
 *    migration, or a seeded fixture); both cells dash, which is this table's
 *    treatment for every absent value.
 * 3. **"Distance" is the trip, and "From you" is gone.** The old second column
 *    showed `pickupDistanceKm` — how far the driver is from the pick-up — beside
 *    a Route cell that showed `distanceKm`, the job's own length. Two distances
 *    in adjacent columns is a conflation waiting to happen, and only one of them
 *    survives: the trip. `pickupDistanceKm` is still on `HubLoad` and is now
 *    rendered by nothing; see its note in `loads-context.tsx` before reviving it.
 *
 * ## What this file does *not* own
 *
 * Filtering, sorting and every mutation live in `loads-context.tsx`, which
 * hands back `visibleLoads` already reduced and ordered. This component takes
 * no props and derives no rows: it renders `visibleLoads`, and a header click
 * calls `setSort(key)`. That is what lets the four Wave 4 surfaces be written
 * simultaneously without any two of them agreeing on a prop contract — and it
 * is what stops "which rows are visible" from being computed twice, in two
 * places, and disagreeing.
 *
 * Loading and error states are the screen's (`loads-screen.tsx` returns before
 * mounting this), so there is nothing to render for them here.
 *
 * ## Deviations from the task file, forced by the shipped context
 *
 * - **No client name anywhere on a row.** The task file put one on the Route
 *   cell's third line; `GET /api/loads` deliberately strips everything
 *   identifying the client from an unclaimed load, so `HubLoad` has no
 *   `clientName` to render. The Load column is the reference and the load age.
 * - **No handling-tag pills.** The design's column set has nowhere to put them
 *   and the drawer already shows them; the "sort tags by enum order" rule
 *   therefore has nothing to apply to on this surface. Any future pill here
 *   goes through `sortedHandlingTags()`, never `handlingTags` in array order.
 * - **The footer's rejected-list toggle also renders on "My loads" while the
 *   rejected sub-view is on.** The design scopes it to the open board, which is
 *   correct until you notice that `tab` and `showRejected` are independent in
 *   `loads-context.tsx`: switching tabs with the sub-view on would otherwise
 *   hide the only control that turns it back off. See the footer below.
 */

/* -------------------------------------------------------------------------- */
/* Table geometry                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Header cells: the design's `9px 14px`, 11px/500 uppercase with 0.06em
 * tracking, muted. `h-auto` because the shared `TableHead` ships a 40px floor
 * this header row is deliberately shorter than.
 */
const HEAD_CLASSES =
  "h-auto px-3.5 py-2.5 text-[11px] font-medium tracking-[0.06em] uppercase text-muted-foreground";

/**
 * Body cells: the design's `12px 14px` with `vertical-align: top`, which is
 * what keeps the first line of every multi-line cell on one baseline.
 */
const CELL_CLASSES = "px-3.5 py-3 align-top";

/** The design's 11px muted sub-line, used by four of the thirteen columns. */
const SUBLINE_CLASSES = "text-[11px] text-muted-foreground";

/**
 * How wide an address cell is allowed to get before it truncates.
 *
 * Both address columns share it so the two sides of a route line up down the
 * table instead of one column being sized by whichever booking happened to have
 * the longest street name. Every truncated address carries the whole string as a
 * `title` — Tbilisi addresses routinely outrun any cap worth setting, and a
 * truncated address with no way to read the rest is not an address.
 */
const ADDRESS_CELL_CLASSES = "max-w-[180px] truncate";

/**
 * The `claimed` and `mine` pills.
 *
 * 500 weight, not `HubStatusBadge`'s 600 — which is the reason this is bespoke
 * markup rather than that component. The other reason is that `HubStatusBadge`
 * derives its tone from the status *word* through `hubStatusTone()`, and
 * neither "claimed" nor "yours" is in that vocabulary: both would silently fall
 * through to `neutral`, which is wrong for "Yours". The tones are therefore
 * named explicitly from `HUB_STATUS_TONE_CLASSES` below.
 */
const PILL_CLASSES =
  "inline-flex items-center rounded-full px-[9px] py-1 text-[11px] font-medium";

/**
 * The destructive tint the design gives Reject on hover, overriding the
 * `outline` variant's neutral one. Arbitrary values rather than the
 * `--destructive` token because these are the handoff's three exact colours and
 * none of them is that token's value — the same reasoning `hub-status.ts`
 * applies to its own pill pairs.
 *
 * Which is what obliges each of the three to carry a hand-written `dark:`
 * counterpart. A literal has no token behind it to flip, so on the dark ground
 * the near-white wash would blow out the row and the deep red label would go
 * unreadable against it — the hover would announce itself as a mistake rather
 * than as a destructive action. Each dark value keeps its light counterpart's
 * hue and inverts its lightness, so the trio stays the same *relationship* —
 * a red-tinted ground, a slightly stronger red edge, a red label with contrast
 * to spare — and stays visibly the destructive hover next to the neutral one
 * Accept gets from its own variant.
 */
const REJECT_HOVER_CLASSES =
  "text-muted-foreground " +
  "hover:border-[oklch(88.5%_0.062_18.334)] dark:hover:border-[oklch(38%_0.09_20)] " +
  "hover:bg-[oklch(97.1%_0.013_17.38)] dark:hover:bg-[oklch(28%_0.05_20)] " +
  "hover:text-[oklch(50.5%_0.213_27.518)] dark:hover:text-[oklch(82%_0.12_22)]";

/* -------------------------------------------------------------------------- */
/* Headers                                                                    */
/* -------------------------------------------------------------------------- */

type ColumnAlignment = "left" | "center" | "right";

const ALIGNMENT_CLASSES: Record<ColumnAlignment, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/**
 * One sortable column header.
 *
 * The label is a real `<button>` rather than a click handler on the `<th>`: the
 * design gives the header `cursor:pointer` and nothing else, and a sort control
 * that only a mouse can reach is not a sort control. `aria-sort` on the `<th>`
 * carries the state for assistive technology, so the ↓/↑ glyph — which would
 * otherwise be announced as "down arrow" after every label — is hidden from it.
 *
 * Only the active column gets an `aria-sort`; the others get no attribute at
 * all rather than `"none"`, matching native `<th>` semantics.
 *
 * The toggle rule itself (a new column starts at `desc`, the active column
 * flips) lives in the context's `setSort`, so the table, the mobile board and
 * anything else that ever sorts cannot implement it three slightly different
 * ways.
 */
function SortableHead({
  columnKey,
  label,
  align = "left",
  className,
  title,
}: {
  columnKey: LoadsSortKey;
  label: string;
  align?: ColumnAlignment;
  className?: string;
  /**
   * Hover copy for a header whose label cannot carry its meaning in the two or
   * three words the column has room for — "Pick up time", which sorts by time
   * of day rather than by date, is the case that most needs it.
   */
  title?: string;
}) {
  const { sortKey, sortDir, setSort } = useLoadsBoard();
  const isActive = sortKey === columnKey;

  return (
    <TableHead
      scope="col"
      title={title}
      aria-sort={
        isActive ? (sortDir === "asc" ? "ascending" : "descending") : undefined
      }
      className={cn(HEAD_CLASSES, ALIGNMENT_CLASSES[align], className)}
    >
      <button
        type="button"
        onClick={() => setSort(columnKey)}
        className={cn(
          "w-full cursor-pointer rounded-sm uppercase outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
          ALIGNMENT_CLASSES[align],
        )}
      >
        {label}
        {isActive ? (
          <span aria-hidden="true">{sortDir === "asc" ? " ↑" : " ↓"}</span>
        ) : null}
      </button>
    </TableHead>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The Helpers count badge.
 *
 * The design's two colour pairs are `oklch(0.145 0 0)`/`oklch(0.985 0 0)` and
 * `oklch(0.97 0 0)`/muted, which this theme's `--foreground`/`--background` and
 * `--muted`/`--muted-foreground` already equal exactly — so the tokens are used
 * rather than the literals. These are not row-state colours, so no
 * `HubStatusTone` is involved.
 *
 * A load with no helpers shows `—` rather than `0`: the column answers "does
 * this job need a second pair of hands", and a zero in a filled badge reads as
 * a quantity somebody chose rather than the absence of a request.
 */
function HelpersBadge({ helperCount }: { helperCount: number }) {
  const requested = helperCount > 0;

  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
        requested
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground",
      )}
    >
      {requested ? helperCount : EM_DASH}
    </span>
  );
}

/**
 * The actions cell, which is where a row's state is actually legible.
 *
 * Four cases, in the order they are tested:
 *
 * 1. **A load this account has hidden** — a single Restore, whatever the row's
 *    status: the open-board actions would otherwise offer a claim on a load the
 *    driver explicitly hid. Asked of the context's `isRejected(id)` rather than
 *    inferred from `showRejected`, which is only *coincidentally* the same
 *    answer — a rejected row carries `status: "available"` from the endpoint,
 *    so nothing on the row itself says so.
 * 2. **`available`** — Reject then Accept.
 * 3. **`claimed`** — somebody else got it; the neutral pill, no buttons.
 * 4. **`mine`** — the success pill. Only reachable on the "My loads" tab, where
 *    every row is `mine`.
 *
 * Every button stops propagation, so pressing one never also fires the row's
 * own `onClick`. Reject does *not* clear the selection here: the context's
 * `reject` already does it on success, and clearing it optimistically would
 * close the drawer on a rejection the server went on to refuse.
 */
function LoadActions({ load }: { load: HubLoad }) {
  const {
    isRejected,
    selectLoad,
    openConfirm,
    reject,
    restore,
    pendingActionId,
    canAccept,
  } = useLoadsBoard();

  // One reject/restore at a time, board-wide — `pendingActionId` is not this
  // row's id, it is any row's. The context drops a second call outright while
  // one is in flight, so every Reject and Restore on the board is disabled
  // rather than only the pressed one, which would leave the rest offering a
  // press that silently does nothing.
  //
  // Accept answers a narrower question and does not use `isBusy` at all: only
  // *this* row's own pending action blocks it, because this is
  // first-come-first-served work and a driver who cannot accept while some
  // unrelated row is mid-reject loses the load for nothing. That rule is
  // `canAccept` in `loads-context.tsx` — one definition for the table, the
  // drawer and the mobile board rather than three that drift; the full
  // reasoning is on `LoadsBoardValue.canAccept`.
  const isBusy = pendingActionId !== null;

  if (isRejected(load.id)) {
    return (
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          onClick={(event) => {
            event.stopPropagation();
            void restore(load.id);
          }}
        >
          Restore
        </Button>
      </div>
    );
  }

  if (load.status === "available") {
    return (
      <div className="flex justify-end gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          className={REJECT_HOVER_CLASSES}
          onClick={(event) => {
            event.stopPropagation();
            void reject(load.id);
          }}
        >
          Reject
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canAccept(load.id)}
          onClick={(event) => {
            event.stopPropagation();
            // Both, per the design's "Accept (row or drawer) → selects the load
            // and opens the confirm dialog": the drawer behind the dialog has
            // to be showing the load the dialog is about.
            selectLoad(load.id);
            openConfirm(load.id);
          }}
        >
          Accept
        </Button>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      {load.status === "claimed" ? (
        <span className={cn(PILL_CLASSES, HUB_STATUS_TONE_CLASSES.neutral)}>
          Claimed
        </span>
      ) : (
        <span className={cn(PILL_CLASSES, HUB_STATUS_TONE_CLASSES.success)}>
          Yours
        </span>
      )}
    </div>
  );
}

/**
 * One load.
 *
 * `nowIso` is threaded down rather than read from the clock per row so every
 * "posted N ago" on the board is measured against the same instant — otherwise
 * two rows created in the same second can disagree about which minute bucket
 * they fall in, purely from render order.
 */
function LoadRow({ load, nowIso }: { load: HubLoad; nowIso: string }) {
  const { selectedId, selectLoad } = useLoadsBoard();
  const isSelected = load.id === selectedId;

  const deadline = formatDeadlineLine(load.deliveryDeadline, nowIso);
  const cargoDetail = `${load.packagingDescription ?? EM_DASH} · ${formatVolumeM3(
    {
      lengthM: load.cargoLengthM,
      widthM: load.cargoWidthM,
      heightM: load.cargoHeightM,
    },
  )}`;

  return (
    <TableRow
      // Mouse convenience only — the keyboard path is the reference button in
      // the leading Load cell, which selects the same row.
      onClick={() => selectLoad(load.id)}
      data-state={isSelected ? "selected" : undefined}
      className={cn(
        "cursor-pointer border-b border-border text-[13px]",
        // Claimed by somebody else. The row stays on the board through the
        // endpoint's two-minute grey-out window so it does not vanish out from
        // under a driver who has it open.
        load.status === "claimed" && "opacity-60",
      )}
    >
      {/* 1 — Load (addition). The row's identity, and the only cell on it a
          keyboard can use to open the drawer — see the module comment. */}
      <TableCell className={CELL_CLASSES}>
        <button
          type="button"
          onClick={() => selectLoad(load.id)}
          aria-current={isSelected ? "true" : undefined}
          // The cuid as a `title`: the visible reference is a readable
          // stand-in, not the identifier.
          title={load.id}
          className="cursor-pointer rounded-sm font-price outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {load.reference}
          {/* Without this the accessible name is the bare reference —
              "GE-48210" — which names the load but not what pressing it does,
              and this button is the row's only keyboard path into the drawer.
              `aria-current` above says the row *is* selected; it cannot say
              that activating this selects it. */}
          <span className="sr-only"> — open load details</span>
        </button>
        {/* Stacked under the reference rather than beside it, as it was on the
            old Route cell's third line: this column is the narrowest on the
            table and two facts side by side would force it wider than either
            needs. */}
        <div className={SUBLINE_CLASSES}>
          {formatPostedAgo(load.createdAt, nowIso)}
        </div>
      </TableCell>

      {/* 2 — Pick-up address. Not sortable: ordering rows by street name is not
          a question anybody asks, and a header that sorts is a header a driver
          will press. */}
      <TableCell className={CELL_CLASSES}>
        <div className={ADDRESS_CELL_CLASSES} title={load.pickupAddress}>
          {load.pickupAddress}
        </div>
      </TableCell>

      {/* 3 — Pick-up city. Nullable: the geocoder could not place the stop. */}
      <TableCell className={CELL_CLASSES}>
        {load.pickupCity ?? EM_DASH}
      </TableCell>

      {/* 4 — Pick-up date. `scheduledAt`, relative-day labelled ("Today",
          "Tomorrow", "4 Aug") like every other date on this board, and dashed
          when the order predates the column. Never the pick-up window — see the
          module comment. */}
      <TableCell className={CELL_CLASSES}>
        {formatLoadDayLabel(load.scheduledAt, nowIso)}
      </TableCell>

      {/* 5 — Pick-up time. The same field's clock half, dashing on the same
          rows, so the two cells are never half-answered. */}
      <TableCell className={cn(CELL_CLASSES, "tabular-nums")}>
        {formatClock(load.scheduledAt)}
      </TableCell>

      {/* 6 — Drop-off address. */}
      <TableCell className={CELL_CLASSES}>
        <div className={ADDRESS_CELL_CLASSES} title={load.dropoffAddress}>
          {load.dropoffAddress}
        </div>
      </TableCell>

      {/* 7 — Drop-off city, and the delivery deadline under it.

          The deadline sub-line used to hang under the pick-up window, which no
          longer exists. This is the delivery side of the row, which is what the
          deadline is about, and this cell's content is short enough to carry a
          second line where the address beside it is not. The line names itself
          ("Deliver by …"), so it cannot be misread as belonging to the city
          header above it.

          Omitted rather than dashed: a labelled em dash is a second line that
          says nothing. */}
      <TableCell className={CELL_CLASSES}>
        <div>{load.dropoffCity ?? EM_DASH}</div>
        {deadline === null ? null : (
          <div className={SUBLINE_CLASSES}>{deadline}</div>
        )}
      </TableCell>

      {/* 8 — Cargo. */}
      <TableCell className={CELL_CLASSES}>
        {/* `cargoCategory` is the wire enum (`INDUSTRIAL_SUPPLIES`), never
            driver-facing copy. Same lookup as the drawer and the mobile card,
            so a row and the drawer describing it cannot read differently. */}
        <div>{cargoCategoryLabel(load.cargoCategory)}</div>
        <div
          // Packaging is free text a client typed and occasionally runs to a
          // sentence; capped so one verbose booking cannot widen the table.
          className={cn(SUBLINE_CLASSES, "max-w-[220px] truncate")}
          title={cargoDetail}
        >
          {cargoDetail}
        </div>
      </TableCell>

      {/* 9 — Helpers. */}
      <TableCell className={cn(CELL_CLASSES, "text-center")}>
        <HelpersBadge helperCount={load.helperCount} />
      </TableCell>

      {/* 10 — Weight / dims. */}
      <TableCell className={cn(CELL_CLASSES, "text-right")}>
        <div className="tabular-nums">{formatWeightKg(load.cargoWeightKg)}</div>
        <div className={cn(SUBLINE_CLASSES, "tabular-nums")}>
          {formatLoadDims({
            lengthM: load.cargoLengthM,
            widthM: load.cargoWidthM,
            heightM: load.cargoHeightM,
          })}
        </div>
      </TableCell>

      {/* 11 — Distance. The **trip**: pick-up to drop-off, promoted out of the
          dissolved Route cell into a column of its own. Not `pickupDistanceKm`,
          which measured something else and no longer has a column. */}
      <TableCell className={cn(CELL_CLASSES, "text-right tabular-nums")}>
        {formatDistanceKm(load.distanceKm)}
      </TableCell>

      {/* 12 — Price. `driverPayout` and its per-km rate, never a client fare. */}
      <TableCell className={cn(CELL_CLASSES, "text-right")}>
        <div className="font-semibold tracking-[-0.01em] tabular-nums">
          {formatGel(load.driverPayout)}
        </div>
        <div className={cn(SUBLINE_CLASSES, "tabular-nums")}>
          {formatGelPerKm(load.ratePerKm)}
        </div>
      </TableCell>

      {/* 13 — Actions. */}
      <TableCell className={cn(CELL_CLASSES, "w-[132px]")}>
        <LoadActions load={load} />
      </TableCell>
    </TableRow>
  );
}

/* -------------------------------------------------------------------------- */
/* Table                                                                      */
/* -------------------------------------------------------------------------- */

export function LoadsTable() {
  const {
    visibleLoads,
    hiddenByCapacityCount,
    tab,
    showRejected,
    setShowRejected,
    rejectedCount,
    activeFilterCount,
    filtersApply,
    actionError,
    // The instant every relative label on this board is measured against,
    // re-sampled once a minute by the provider. Shared rather than owned here:
    // the drawer sits open beside the row it describes, and two surfaces each
    // sampling their own `Date` drift apart by however far their timers are out
    // of phase. See `LoadsBoardValue.nowIso`.
    nowIso,
  } = useLoadsBoard();

  const count = visibleLoads.length;

  /**
   * The footer's result line.
   *
   * `showRejected` is tested before the tab because it is a different question
   * ("what have I hidden?") rather than a third tab, and it is what actually
   * selected the rows being counted.
   */
  const resultLine = showRejected
    ? `${pluralise(count, "load")} you rejected`
    : tab === "mine"
      ? `${pluralise(count, "load")} you have claimed`
      : `${pluralise(count, "load")} open to you`;

  /**
   * Whether the empty state below is allowed to blame the filters.
   *
   * `visibleLoads` ignores the city, weight and handling-tag filters on "My
   * loads" and in the rejected sub-view — see `filtersApply` in
   * `loads-context.tsx` — so on those two lists no filter selected the rows
   * that are missing, and "widen the weight range or clear a city" would send a
   * driver to controls that were hiding nothing. `activeFilterCount` covers the
   * rest of it: on the open board with every control at its default, the empty
   * board is the answer, not the filters.
   *
   * The same condition `loads-mobile.tsx` gates its own filter sentence on, so
   * the two surfaces read as one decision rather than two.
   */
  const filtersExplainEmpty = filtersApply && activeFilterCount > 0;

  return (
    <div className="hidden overflow-hidden rounded-lg border border-border bg-card lg:block">
      {/* `Table` brings its own `overflow-x-auto` wrapper; the min-width is
          what gives that wrapper something to scroll.

          1440px, up from the 760px the design sized for eight columns. Thirteen
          do not fit in 760 — they would compress to the point where the two
          address cells truncate after a word and the uppercase headers wrap to
          three lines each, which is worse than scrolling. The figure is a floor
          rather than a target: the cells' own intrinsic widths (the header copy,
          `ADDRESS_CELL_CLASSES`' 180px cap, the 132px action column) already add
          up to a little more than this, so a narrow desktop scrolls and a wide
          one distributes the slack. The `lg` breakpoint below which this tree is
          not painted at all is 1024px, so some horizontal scrolling between
          there and here is expected and is the intended behaviour. */}
      <Table className="min-w-[1440px]" aria-label="Loads">
        <TableHeader>
          <TableRow className="bg-muted hover:bg-muted">
            {/* Not sortable. The reference is an opaque per-order string and the
                age under it is already the default arrival order of the board;
                neither is an axis a driver compares rows on. */}
            <TableHead scope="col" className={HEAD_CLASSES}>
              Load
            </TableHead>
            {/* The two address headers are plain `TableHead`s for the same
                reason: alphabetical-by-street is not a question. Their cities
                beside them are, which is what the sortable heads are for. */}
            <TableHead scope="col" className={HEAD_CLASSES}>
              Pick up address
            </TableHead>
            <SortableHead columnKey="pickupCity" label="Pick up city" />
            {/* Both of these order `scheduledAt`, and they order it differently
                — chronologically here, by time of day next door. `LoadsSortKey`
                in `loads-context.tsx` says why that is two keys and not one. */}
            <SortableHead
              columnKey="pickupDate"
              label="Pick up date"
              title="The day the client booked this job for"
            />
            <SortableHead
              columnKey="pickupTime"
              label="Pick up time"
              title="Sorts by time of day, not by date"
            />
            <TableHead scope="col" className={HEAD_CLASSES}>
              Drop off address
            </TableHead>
            <SortableHead columnKey="dropoffCity" label="Drop off city" />
            <SortableHead columnKey="cargo" label="Cargo" />
            <SortableHead columnKey="helpers" label="Helpers" align="center" />
            <SortableHead
              columnKey="weight"
              label="Weight / dims"
              align="right"
            />
            {/* The trip's own length. The board no longer carries a second
                distance for this one to be confused with. */}
            <SortableHead
              columnKey="distance"
              label="Distance"
              align="right"
              title="How far this job runs, pick-up to drop-off"
            />
            {/* The header reads "Price" because that is the design's copy and
                what a driver calls it; the key is `payout` because that is the
                column it orders. */}
            <SortableHead columnKey="payout" label="Price" align="right" />
            <TableHead scope="col" className={cn(HEAD_CLASSES, "w-[132px]")}>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>

        {/* Keyed by `load.id`, and it has to stay that way. The board re-reads
            itself every ten seconds (`LOADS_POLL_INTERVAL_MS` in
            `loads-context.tsx`) and the sort is live, so rows change position
            under the driver constantly. An array index here would make every
            row past a change point a *different* row to React, remounting the
            tail of the table on a poll and taking the scroll offset, the hover
            state and any in-progress press with it. Nothing above this — the
            wrapper, `Table`, `TableBody` — carries a key at all, which is the
            other half of the same guarantee: the list container is the same
            DOM node across every refresh, so it keeps its scroll position. */}
        <TableBody>
          {visibleLoads.map((load) => (
            <LoadRow key={load.id} load={load} nowIso={nowIso} />
          ))}
        </TableBody>
      </Table>

      {/* Outside the table rather than in an empty `<TableBody>`, so the copy
          is not constrained to one cell of a thirteen-column grid. The header row
          stays: it is what keeps this reading as a board with nothing on it
          rather than a panel that failed to draw. */}
      {count === 0 ? (
        // No `border-t`: the header row above already draws its own bottom
        // border, and a second rule here would render as a 2px line.
        <div className="py-12 text-center">
          {/* `showRejected` is tested first for the reason `resultLine` above
              tests it first: it is a different question ("what have I
              hidden?"), and answering it with the board's own emptiness would
              be false the moment a driver opens a full board's rejected list
              having hidden nothing. The three strings and their order are
              `loads-mobile.tsx`'s, verbatim but for the trailing stops, which
              this file's headings do not carry. */}
          <p className="text-sm font-medium">
            {showRejected
              ? "You haven't hidden any loads"
              : filtersExplainEmpty
                ? "No loads match these filters"
                : "No loads on the board right now"}
          </p>
          {/* Only the filter heading gets the advice line — see
              `filtersExplainEmpty`. Nothing replaces it on the other lists:
              there is no control to point a driver at, and the phone surface
              says the one sentence and stops there too. */}
          {filtersExplainEmpty ? (
            <p className="mt-1 text-[13px] text-muted-foreground">
              Widen the weight range or clear a city to see more.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* A reject or restore that did not go through. `role="status"` rather
          than `alert`: the board is unchanged and nothing is blocked, so this
          is news to be read at the next opportunity, not an interruption. */}
      {actionError === null ? null : (
        <p
          role="status"
          className="border-t border-border bg-destructive/10 px-3.5 py-2 text-xs text-destructive"
        >
          {actionError}
        </p>
      )}

      {/* A plain `<div>`, not `<TableFooter>`, so the empty state above can sit
          between the header row and this. */}
      <div className="flex items-center justify-between gap-4 border-t border-border bg-muted px-3.5 py-2.5 text-xs text-muted-foreground">
        <span className="tabular-nums">{resultLine}</span>

        <div className="flex items-center gap-3">
          {/* The capacity note describes the open board and means nothing on
              "My loads" (never filtered by vehicle fit) or in the rejected
              sub-view, where the rows on screen are the ones this account hid
              and the count is about a list that is not being shown. */}
          {tab === "available" && !showRejected && hiddenByCapacityCount > 0 ? (
            <span className="tabular-nums">
              {pluralise(hiddenByCapacityCount, "load")} hidden — over your
              vehicle capacity or dimensions
            </span>
          ) : null}

          {/* Normally the open board's control, per the design. The
              `|| showRejected` is a deviation and a deliberate one: the
              rejected sub-view and the tab are independent pieces of state in
              `loads-context.tsx`, and switching to "My loads" while it is on
              leaves the driver looking at their rejected list with the only
              way out — this button — hidden. Rendering the escape whenever the
              sub-view is on costs nothing and removes the dead end. */}
          {rejectedCount > 0 && (tab === "available" || showRejected) ? (
            <button
              type="button"
              // The context's `setShowRejected` clears the selection itself,
              // which is the design's "clearing selection" on this toggle —
              // it is not repeated here.
              onClick={() => setShowRejected(!showRejected)}
              className="cursor-pointer rounded-sm underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {showRejected ? (
                "Back to open loads"
              ) : (
                <>
                  {/* The design's own copy, which does not pluralise the word
                      "rejected" — "1 rejected · view", "2 rejected · view" —
                      so this is not run through `pluralise`. */}
                  <span className="tabular-nums">{rejectedCount}</span> rejected
                  · view
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
