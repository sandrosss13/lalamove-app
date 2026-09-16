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
 * All thirteen are on the row from a 1760px window up. Below that, three of
 * them drop out in a fixed order — Helpers, then Drop-off address, then
 * Pick-up address — so that the board fits a laptop instead of scrolling
 * sideways at every width a laptop has. The column set, the breakpoints and the
 * arithmetic that picked them are `COLUMN_CLASSES`; what makes the hiding
 * acceptable rather than data loss is that all three are on the detail drawer
 * and all of them are on `loads-mobile.tsx`. The ten that never hide are the
 * ones a driver answers "should I take this" with.
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
 * Header cells: the design's 9px vertical, 11px/500 uppercase with 0.06em
 * tracking, muted. `h-auto` because the shared `TableHead` ships a 40px floor
 * this header row is deliberately shorter than.
 *
 * Two departures from the handoff's `9px 14px`, and both are load-bearing —
 * `COLUMN_CLASSES` below is the arithmetic they pay for:
 *
 * 1. **8px horizontal, not 14px.** 6px a side off thirteen columns is 156px of
 *    table width, and 156px is most of the difference between a 1280px laptop
 *    scrolling and not. 8px is also `TableHead`/`TableCell`'s own `p-2` default
 *    in `src/components/ui/table.tsx`, so this is the primitive's number rather
 *    than an invented one — the design's 14px was simply more than a thirteen
 *    column board can afford on a laptop. The vertical padding is untouched.
 * 2. **`whitespace-normal`, overriding `TableHead`'s `whitespace-nowrap`.**
 *    Four columns — both cities, the pick-up date and the pick-up time — are
 *    floored by their header label rather than by anything they can contain,
 *    and a nowrap header makes that floor absolute: "PICK UP CITY" measures
 *    77.9px, so that column could never be narrower than 94px however little a
 *    Georgian city needs. Wrapping turns the floor into the widest *word run*
 *    ("PICK UP", 47.3px), which is what lets those four sit at 68–80px.
 *
 *    The cost is a two-line header row: 48px at every width, where it used to
 *    be 34px on a wide monitor. It is not a new mechanism — the two address
 *    heads already wrapped (this is where `FLEX_HEAD_CLASSES` went), so the row
 *    was already 48px at 1920px and 62px below the old floor.
 *
 *    Wrapping also means no header can clip or spill, which under `table-fixed`
 *    a nowrap header in a too-narrow column does. Verified in Chromium at
 *    1280/1366/1420/1440/1540/1600/1680/1760/1834/1920/2560: every head's
 *    `scrollWidth` is inside its own cell, every wrapped head breaks after
 *    "PICK UP" / "DROP OFF" rather than mid-phrase, and the row is two lines at
 *    all eleven widths — never three.
 */
const HEAD_CLASSES =
  "h-auto px-2 py-2.5 text-[11px] font-medium tracking-[0.06em] whitespace-normal uppercase text-muted-foreground";

/**
 * Body cells: the design's 12px vertical with `vertical-align: top`, which is
 * what keeps the first line of every multi-line cell on one baseline. The
 * horizontal 14px is 8px here for the reason `HEAD_CLASSES` gives above, and
 * the two constants have to keep agreeing: every width in `COLUMN_CLASSES` is
 * `content + 16`, so a padding that differed between the header and the body
 * would size the column for one of them and clip the other.
 */
const CELL_CLASSES = "px-2 py-3 align-top";

/** The design's 11px muted sub-line, used by four of the thirteen columns. */
const SUBLINE_CLASSES = "text-[11px] text-muted-foreground";

/**
 * An address cell: fill the column, ellipsise what does not fit.
 *
 * No `max-width` of its own any more. It used to carry `max-w-[180px]`, which
 * looked like a truncation rule and was really a *column width* — and a rigid
 * one, because a `max-width`ed block inside a `white-space: nowrap` cell
 * contributes its full width to the column's minimum as well as its maximum.
 * Measured in Chromium: the two address columns sat at a flat 208px (180 + the
 * 14px padding each side) at every viewport, unable to give a pixel back when
 * the table was squeezed or to take one when it had room. The cap was the
 * single largest reason this table could not fit any window.
 *
 * Under `table-fixed` (see `COLUMN_CLASSES`) the column decides the width and
 * this div simply fills it, so the two address columns are the only ones that
 * flex: they absorb every spare pixel on a wide monitor and are the first to
 * give it back on a narrow one — and, below 1540px, the first to leave the
 * table altogether. Both share this class so the two sides of a route stay the
 * same width as each other down the table.
 *
 * Every truncated address still carries the whole string as a `title` — Tbilisi
 * addresses routinely outrun any width worth giving them, and a truncated
 * address with no way to read the rest is not an address. The same `title` is
 * what makes hiding the column acceptable at narrow widths rather than a loss:
 * the full address is in the drawer either way (`RouteStop` in
 * `loads-drawer.tsx` renders both stops' `address` in full).
 */
const ADDRESS_CELL_CLASSES = "truncate";

/**
 * THE COLUMN GEOMETRY. One entry per column, carrying both its width and the
 * width of window at which it appears at all.
 *
 * ## Why the widths are declared at all
 *
 * The table is `table-fixed`. Under the automatic algorithm a table can never
 * be narrower than the sum of its columns' *content*, and with thirteen nowrap
 * columns that sum was an immovable 1770px — which is why the `min-w-[1440px]`
 * two revisions back was pure decoration: 1440 < 1770, so the declared floor
 * never once decided anything.
 *
 * `table-fixed` is what makes the widths below mean something: the column set
 * is resolved from the header row alone, columns with a declared width get it,
 * and the two without one split whatever is left. Chromium does **not** shrink
 * declared columns to make a table fit — measured: a fixed table whose columns
 * sum to 1178px inside a 966px box renders 1178px wide and scrolls. So "no
 * horizontal scroll" is not a styling wish here, it is the arithmetic
 * requirement that the *visible* widths sum to no more than the container.
 *
 * ## The container, and how a viewport breakpoint maps onto it
 *
 * The breakpoints that matter are the **container's**, but Tailwind's variants
 * are viewport media queries, so each one below is a container figure converted
 * to a window figure by adding back everything between the window edge and the
 * table:
 *
 *   container = viewport − 248 (the rail, `w-[248px]` incl. its right border)
 *                        −  64 (the shell's `lg:px-8` gutters, 32 a side)
 *                        −   2 (this card's own 1px border, a side)
 *   so  viewport = container + 314
 *
 * Verified against the real tree, not assumed: at 1920px the table container
 * measures 1606px, at 2560px it measures 1798px (the shell's 1800px cap binding
 * rather than the window). `lg:` is where the rail appears and where this table
 * replaces `loads-mobile.tsx`, so the formula holds across every width this
 * component is painted at.
 *
 * ## Why these numbers
 *
 * Each width is `max(widest header line, worst-case cell content) + 16px` — the
 * 8px padding of `CELL_CLASSES`. Measured in Chromium with the real IBM Plex
 * faces; the widest string each column can emit was taken from
 * `loads-format.ts` and `georgian-cities.ts` rather than from today's data:
 *
 *   load        112  "posted 59 min ago" (91.4) — the age line, not the ref
 *   pickupCity   76  wrapped head "PICK UP" (47.3); long cities truncate
 *   pickupDate   80  "Tomorrow" (59.2); wrapped head is 47.3
 *   pickupTime   68  wrapped head "PICK UP" (47.3); "14:30" is 35
 *   dropoffCity  80 → 154  see the two-step note below
 *   cargo        96 → 140  see the two-step note below
 *   helpers      84  head + sort glyph, "HELPERS ↓" (65.2); the badge is 24
 *   weight      124  "12.4 × 12.2 × open m" (106.2), the dims sub-line
 *   distance     92  "12,312.5 km" (75.1)
 *   price        80  "₾124,800" (59.4) — ₾ has no IBM Plex glyph, falls back wide
 *   actions     148  Reject + Accept at `size="sm"` with their 6px gap (127.6)
 *
 * The ten columns that never hide total **956px**, which is the whole point:
 * a 1280px laptop has 966px to give. The old set totalled 1362px before either
 * address column got a pixel, and scrolled at 1280, 1366, 1440 and 1600.
 *
 * Where the 406px came from, measured: 156px from the padding (`HEAD_CLASSES`),
 * ~114px from letting the four header-floored columns wrap instead of sizing
 * them to a nowrap label, 124px from the three columns that now hide, and the
 * rest from `cargo` and `dropoffCity` giving up width at the tightest tier.
 *
 * ## The two-step columns
 *
 * `cargo` and `dropoffCity` are the only widths that change with the window,
 * and both change at 1420px for the same reason: they are the two columns whose
 * content is *worth* more width but survives without it.
 *
 * - `dropoffCity` is floored by its deadline sub-line, "Deliver by Tomorrow
 *   18:00" (133.9). Below 1420px it is 80px and that line truncates behind a
 *   `title`; at 1420px and up it is 154px and the line reads in full. 154px is
 *   unaffordable at 1280 — it alone would put the board 74px over.
 * - `cargo` was already a deliberate cap rather than a content measurement: the
 *   longest category label, "Construction & Hardware Materials", is 204px and
 *   would make this the widest column on the board for a value a driver reads
 *   once. 140px is that cap; 96px is what the tightest tier can afford, and the
 *   label truncates behind a `title` either way.
 *
 * 1420px is the window at which the container (1106px) clears the 1074px those
 * two full widths need. Below it the board is at its tightest and the spare
 * pixels are spread proportionally by `table-fixed` — at 1366px, for instance,
 * cargo renders 105.6px rather than its declared 96.
 *
 * ## Which columns hide, and where
 *
 * In the order the user set, least decision-critical first. The row's job is
 * "should I take this load", so `price`, `cargo`, `weight`, `distance`,
 * `pickupCity`, `pickupDate`, `pickupTime` and `load` never hide — nor does
 * `actions`, and nor does `dropoffCity`, because hiding both cities would take
 * the route off the row entirely.
 *
 *   helpers         ≥ 1760px  needs container 1438 = 1158 fixed + 140 per address
 *   dropoffAddress  ≥ 1680px  needs container 1354 = 1074 fixed + 140 per address
 *   pickupAddress   ≥ 1540px  needs container 1214 = 1074 fixed + 140
 *
 * 140px is the least an address column can be given and still be an address —
 * 124px of text, around twenty characters of a Tbilisi street. Each breakpoint
 * is that floor converted through `viewport = container + 314` and rounded up
 * to the next ten, which is where 1528→1540, 1668→1680 and 1752→1760 come from.
 *
 * All thirteen columns are therefore showing from 1760px, comfortably inside
 * the 1834px the old geometry needed just to stop scrolling.
 *
 * ## Why this record holds the visibility as well as the width
 *
 * Because a header cell and its body cell must hide together or the table
 * corrupts: one `<th>` fewer than its `<td>` shifts every column after it by
 * one, silently, and only at some window widths. Both sites read the same entry
 * from this record, so there is no second place for the two to disagree. The
 * `w-*` half is inert on a body cell under `table-fixed` (the header row
 * resolves the column set), which is exactly why sharing one string is safe.
 *
 * Deliberately not container queries: Tailwind v4 supports them, but nothing in
 * this codebase uses one and a single adopter is a convention nobody else is
 * following. The `viewport = container + 314` conversion above is the price of
 * that, and it is why the rail and the gutters are spelled out rather than
 * assumed.
 *
 * ## Where the columns are not in this list
 *
 * `pickupAddress` and `dropoffAddress` declare no width, so `table-fixed` hands
 * them everything the other eleven do not use, split evenly. They are the right
 * pair to flex because they are the only cells whose content is unbounded and
 * already truncating (`ADDRESS_CELL_CLASSES`), so every extra pixel shows more
 * of a real address and every pixel taken back shows less — no other column
 * converts width into information that way. They are also, for the same reason,
 * the right pair to hide first: a truncated address is the one cell on the row
 * that is already only part of its own value.
 */
const COLUMN_CLASSES = {
  load: "w-[112px]",
  pickupAddress: "hidden min-[1540px]:table-cell",
  pickupCity: "w-[76px]",
  pickupDate: "w-[80px]",
  pickupTime: "w-[68px]",
  dropoffAddress: "hidden min-[1680px]:table-cell",
  dropoffCity: "w-[80px] min-[1420px]:w-[154px]",
  cargo: "w-[96px] min-[1420px]:w-[140px]",
  helpers: "hidden w-[84px] min-[1760px]:table-cell",
  weight: "w-[124px]",
  distance: "w-[92px]",
  price: "w-[80px]",
  actions: "w-[148px]",
} as const;

/**
 * The floor, and the measured arithmetic behind it.
 *
 * 956px is the sum of the ten columns that never hide — the board at its
 * narrowest honest width. It is not a target and not "how wide the board wants
 * to be": it is the width below which `overflow-x-auto` has to take over,
 * because every one of those ten is already at
 * `max(its own wrapped header, its own widest value) + 16`.
 *
 * With `viewport = container + 314` (see `COLUMN_CLASSES`) the floor stops
 * binding at a 1270px window, so the only widths it engages at are 1024–1269px:
 * the band between where `loads-mobile.tsx` hands over at `lg` and where the
 * narrow tier fits. A 1024px window scrolls 246px. Narrowing that band means
 * moving the `lg` handover, not tuning this number.
 *
 * Measured in Chromium against the real faces and the real shell — container,
 * table, visible columns and whether the container scrolls:
 *
 *   viewport  container  table   cols  result
 *   ────────  ─────────  ─────   ────  ───────────────────────────────────────
 *     1280px      966px    966     10  FITS (10px of slack, spread across all)
 *     1366px     1052px   1052     10  FITS; cargo renders 105.6, weight 136.4
 *     1440px     1126px   1126     10  FITS; dropoffCity 161.5, deadline reads
 *     1600px     1286px   1286     11  FITS; pickupAddress 212px
 *     1834px     1520px   1520     13  FITS; addresses 181px each
 *     1920px     1606px   1606     13  FITS; addresses 224px each
 *     2560px     1798px   1798     13  FITS; addresses 320px (shell cap binds)
 *
 * The board no longer scrolls at any window width a laptop or monitor has. What
 * that cost, stated plainly so nobody has to rediscover it: three columns are
 * gone below 1760px, the design's 14px cell padding is 8px, the header row is
 * permanently two lines, and between 1280px and 1419px the drop-off deadline
 * and the cargo label are truncated behind their `title`s. Every one of those
 * values is still on the row's detail drawer — which is the condition that made
 * hiding them acceptable rather than a loss. See `loads-drawer.tsx`:
 * `RouteStop` renders both stops' full address and the deadline, and
 * `CargoSpecList` renders the cargo type and the helper count.
 */
const TABLE_MIN_WIDTH_CLASS = "min-w-[956px]";

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
  // Resolved once: the cargo cell renders it and also hands it to its own
  // `title`, and a lookup written twice is a lookup that can be changed once.
  const cargoLabel = cargoCategoryLabel(load.cargoCategory);
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
      {/* Every cell below carries its column's `COLUMN_CLASSES` entry, the same
          string its header carries. The `w-*` half is inert here — under
          `table-fixed` the header row alone resolves the column set — but the
          `hidden`/`table-cell` half is not, and it is the reason the record is
          shared rather than the widths being inlined above: a `<th>` that hides
          without its `<td>` shifts every column after it by one, silently, and
          only at some window widths. There is no second place for the two rows
          to disagree.

          1 — Load (addition). The row's identity, and the only cell on it a
          keyboard can use to open the drawer — see the module comment. Never
          hidden at any width: dropping it would delete that keyboard path. */}
      <TableCell className={cn(CELL_CLASSES, COLUMN_CLASSES.load)}>
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
            old Route cell's third line. Side by side the two would want
            62 + 91 = 153px of the 96px this column gives them; stacked, the age
            line alone sets the width and the column is 112px rather than a
            169px one that earns none of it. (Pick-up time, at 68px, is the
            narrowest column that never hides — this is the fourth widest.) */}
        <div className={SUBLINE_CLASSES}>
          {formatPostedAgo(load.createdAt, nowIso)}
        </div>
      </TableCell>

      {/* 2 — Pick-up address. Not sortable: ordering rows by street name is not
          a question anybody asks, and a header that sorts is a header a driver
          will press.

          The last column to hide, at 1540px, because it is the more useful half
          of a route a driver is deciding whether to start. */}
      <TableCell className={cn(CELL_CLASSES, COLUMN_CLASSES.pickupAddress)}>
        <div className={ADDRESS_CELL_CLASSES} title={load.pickupAddress}>
          {load.pickupAddress}
        </div>
      </TableCell>

      {/* 3 — Pick-up city. Nullable: the geocoder could not place the stop.

          Truncating behind a `title`, which it did not used to be. At 76px this
          column has 60px of text, and the longest label in
          `GEORGIAN_CITY_OPTIONS` ("Dedoplistsqaro") outruns it — under
          `table-fixed` a nowrap cell that overruns spills into its neighbour
          rather than widening the column, so the choice is an ellipsis or a
          collision. Every common city (Tbilisi, Batumi, Kutaisi, Rustavi) fits
          untouched. */}
      <TableCell className={cn(CELL_CLASSES, COLUMN_CLASSES.pickupCity)}>
        <div className="truncate" title={load.pickupCity ?? undefined}>
          {load.pickupCity ?? EM_DASH}
        </div>
      </TableCell>

      {/* 4 — Pick-up date. `scheduledAt`, relative-day labelled ("Today",
          "Tomorrow", "4 Aug") like every other date on this board, and dashed
          when the order predates the column. Never the pick-up window — see the
          module comment. */}
      <TableCell className={cn(CELL_CLASSES, COLUMN_CLASSES.pickupDate)}>
        {formatLoadDayLabel(load.scheduledAt, nowIso)}
      </TableCell>

      {/* 5 — Pick-up time. The same field's clock half, dashing on the same
          rows, so the two cells are never half-answered. */}
      <TableCell
        className={cn(CELL_CLASSES, COLUMN_CLASSES.pickupTime, "tabular-nums")}
      >
        {formatClock(load.scheduledAt)}
      </TableCell>

      {/* 6 — Drop-off address. The second column to hide, at 1680px: of the two
          addresses this is the one a driver reads after deciding, not while
          deciding, and its city stays on the row either way. */}
      <TableCell className={cn(CELL_CLASSES, COLUMN_CLASSES.dropoffAddress)}>
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
          says nothing.

          Both lines truncate behind a `title`. This column is 154px from 1420px
          up, which is the full 133.9px of "Deliver by Tomorrow 18:00" plus its
          padding; below that it is 80px and the deadline reads as far as it
          fits. `COLUMN_CLASSES` says why it cannot be 154px on a 1280px laptop.
          The unabbreviated deadline is on the drawer's drop-off stop either
          way. */}
      <TableCell className={cn(CELL_CLASSES, COLUMN_CLASSES.dropoffCity)}>
        <div className="truncate" title={load.dropoffCity ?? undefined}>
          {load.dropoffCity ?? EM_DASH}
        </div>
        {deadline === null ? null : (
          <div className={cn(SUBLINE_CLASSES, "truncate")} title={deadline}>
            {deadline}
          </div>
        )}
      </TableCell>

      {/* 8 — Cargo. */}
      <TableCell className={cn(CELL_CLASSES, COLUMN_CLASSES.cargo)}>
        {/* `cargoCategory` is the wire enum (`INDUSTRIAL_SUPPLIES`), never
            driver-facing copy. Same lookup as the drawer and the mobile card,
            so a row and the drawer describing it cannot read differently.

            Truncating, which it did not used to. The labels run to 204px
            ("Construction & Hardware Materials") and this column is 140px, or
            96px below a 1420px window, so under `table-fixed` an untruncated
            label would spill into its neighbour rather than widening the
            column. The `title` carries the whole label — the same bargain the
            addresses make, and the one the packaging line below already
            made. */}
        <div className="truncate" title={cargoLabel}>
          {cargoLabel}
        </div>
        <div
          // Packaging is free text a client typed and occasionally runs to a
          // sentence. It used to carry `max-w-[220px]`, which under the old
          // automatic layout was what stopped one verbose booking widening the
          // whole table; the column now has a declared width, so the cap would
          // only be a second, looser limit that never binds.
          className={cn(SUBLINE_CLASSES, "truncate")}
          title={cargoDetail}
        >
          {cargoDetail}
        </div>
      </TableCell>

      {/* 9 — Helpers. The first column to hide, below 1760px: a one-glyph badge
          costing 84px because of its own header, answering a question ("does
          this need a second pair of hands") that the drawer's cargo table
          answers in full as "Helpers". */}
      <TableCell
        className={cn(CELL_CLASSES, COLUMN_CLASSES.helpers, "text-center")}
      >
        <HelpersBadge helperCount={load.helperCount} />
      </TableCell>

      {/* 10 — Weight / dims. */}
      <TableCell
        className={cn(CELL_CLASSES, COLUMN_CLASSES.weight, "text-right")}
      >
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
      <TableCell
        className={cn(
          CELL_CLASSES,
          COLUMN_CLASSES.distance,
          "text-right tabular-nums",
        )}
      >
        {formatDistanceKm(load.distanceKm)}
      </TableCell>

      {/* 12 — Price. `driverPayout` and its per-km rate, never a client fare. */}
      <TableCell
        className={cn(CELL_CLASSES, COLUMN_CLASSES.price, "text-right")}
      >
        <div className="font-semibold tracking-[-0.01em] tabular-nums">
          {formatGel(load.driverPayout)}
        </div>
        <div className={cn(SUBLINE_CLASSES, "tabular-nums")}>
          {formatGelPerKm(load.ratePerKm)}
        </div>
      </TableCell>

      {/* 13 — Actions. The `w-*` inside this entry is inert on a body cell —
          under `table-fixed` the header cell sizes the column — and it is
          carried here only so every cell reads the same record; see the note at
          the top of this row. The width itself is the one number on the board
          that no amount of squeezing moves: Reject and Accept measure 127.6px
          side by side with their 6px gap, so 148px is that plus the 16px of
          padding and nothing else. */}
      <TableCell className={cn(CELL_CLASSES, COLUMN_CLASSES.actions)}>
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
      {/* `table-fixed` is the load-bearing half of this; `COLUMN_CLASSES` and
          `TABLE_MIN_WIDTH_CLASS` document the arithmetic behind both. In short:
          the automatic algorithm sized this table from its content and could not
          be talked below 1770px, so it scrolled at every width; the fixed
          algorithm sizes it from the header row, which is what lets the declared
          columns hold their width while the address columns take and give back
          the slack — and what lets three of them leave the row entirely on a
          narrow window without the rest re-flowing.

          `Table` brings its own `overflow-x-auto` wrapper and it stays, but it
          is now a backstop rather than the everyday experience: with the narrow
          tier at 956px and a 1280px window offering 966px, the wrapper engages
          only between `lg` (1024px) and 1270px. Below `lg` this tree is not
          painted at all; `loads-mobile.tsx` has the viewport from there down and
          shows every field, which is the other half of why hiding columns here
          costs a driver nothing. */}
      <Table
        className={cn("table-fixed", TABLE_MIN_WIDTH_CLASS)}
        aria-label="Loads"
      >
        <TableHeader>
          <TableRow className="bg-muted hover:bg-muted">
            {/* Not sortable. The reference is an opaque per-order string and the
                age under it is already the default arrival order of the board;
                neither is an axis a driver compares rows on. */}
            {/* Under `table-fixed` this row *is* the column set: every width
                the table will use is read from these thirteen cells and from
                nowhere else, which is why each one carries its own
                `COLUMN_CLASSES` entry and why the two address heads carry no
                width inside theirs. A width added to a `TableCell` in the body
                below would be ignored — which is what lets the body cells share
                these same strings for the sake of the `hidden` half. */}
            <TableHead
              scope="col"
              className={cn(HEAD_CLASSES, COLUMN_CLASSES.load)}
            >
              Load
            </TableHead>
            {/* The two address headers are plain `TableHead`s for the same
                reason: alphabetical-by-street is not a question. Their cities
                beside them are, which is what the sortable heads are for.

                They are also the two that declare no width — they are the
                board's flexible pair — and the first two to leave the table as
                it narrows; `COLUMN_CLASSES` has the breakpoints.

                "Pick up", not "Pick up address": the noun was 104px of 11px
                uppercase against 47px for the qualifier that actually
                distinguishes this column from its neighbours, and the cell
                under it visibly holds a street address. The three "Pick up …"
                heads that follow are what make the bare one unambiguous. */}
            <TableHead
              scope="col"
              className={cn(HEAD_CLASSES, COLUMN_CLASSES.pickupAddress)}
            >
              Pick up
            </TableHead>
            <SortableHead
              columnKey="pickupCity"
              label="Pick up city"
              className={COLUMN_CLASSES.pickupCity}
            />
            {/* Both of these order `scheduledAt`, and they order it differently
                — chronologically here, by time of day next door. `LoadsSortKey`
                in `loads-context.tsx` says why that is two keys and not one.

                Neither label is shortened to a bare "Date"/"Time", tempting as
                the 50px would be: below 1540px both addresses are gone and
                these sit beside a Drop off city carrying a "Deliver by …" line,
                where an unqualified date column is exactly the ambiguity the
                qualifier exists to prevent. They pay for themselves by wrapping
                instead — see `HEAD_CLASSES`. */}
            <SortableHead
              columnKey="pickupDate"
              label="Pick up date"
              title="The day the client booked this job for"
              className={COLUMN_CLASSES.pickupDate}
            />
            <SortableHead
              columnKey="pickupTime"
              label="Pick up time"
              title="Sorts by time of day, not by date"
              className={COLUMN_CLASSES.pickupTime}
            />
            <TableHead
              scope="col"
              className={cn(HEAD_CLASSES, COLUMN_CLASSES.dropoffAddress)}
            >
              Drop off
            </TableHead>
            <SortableHead
              columnKey="dropoffCity"
              label="Drop off city"
              className={COLUMN_CLASSES.dropoffCity}
            />
            <SortableHead
              columnKey="cargo"
              label="Cargo"
              className={COLUMN_CLASSES.cargo}
            />
            <SortableHead
              columnKey="helpers"
              label="Helpers"
              align="center"
              className={COLUMN_CLASSES.helpers}
            />
            <SortableHead
              columnKey="weight"
              label="Weight / dims"
              align="right"
              className={COLUMN_CLASSES.weight}
            />
            {/* The trip's own length. The board no longer carries a second
                distance for this one to be confused with. */}
            <SortableHead
              columnKey="distance"
              label="Distance"
              align="right"
              title="How far this job runs, pick-up to drop-off"
              className={COLUMN_CLASSES.distance}
            />
            {/* The header reads "Price" because that is the design's copy and
                what a driver calls it; the key is `payout` because that is the
                column it orders. Sized for the sort glyph as well as the label:
                `payout` is the board's default sort, so this header is the one
                that always carries an arrow. */}
            <SortableHead
              columnKey="payout"
              label="Price"
              align="right"
              className={COLUMN_CLASSES.price}
            />
            <TableHead
              scope="col"
              className={cn(HEAD_CLASSES, COLUMN_CLASSES.actions)}
            >
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
