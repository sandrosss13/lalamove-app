# Task 10: Loads table

## Status

pending

## Wave

4

## Description

Fills in the desktop loads table that task-09 left as a placeholder inside the
board screen at `/dashboard/loads`. This is the primary surface of the whole
feature: the seven-column sortable table a driver scans to decide what to
accept, with per-row Reject/Accept actions, the three row states (`available`,
`claimed`, `mine`), the empty state and the table footer. It implements
Section 2, "Desktop — Load board", of
`UI:UX/Order Dashboard/design_handoff_driver_load_board/README.md`
verbatim, plus two small additions to the approved design (see below). Three
sibling Wave-4 tasks build the drawer, the confirm/lost-race dialogs and the
mobile view in parallel — this task touches nothing they own.

## Dependencies

**Depends on:** task-09-board-shell
**Blocks:** task-14-live-updates

**Context from dependencies:** task-09 created the board route at
`/dashboard/loads`, the hub nav entry, the header, the tab bar (`Available
loads` / `My loads`), the filter panel, and a board state container holding:
`tab`, `fPickup`, `fDrop`, `fWeight`, `fTags`, `sortKey`, `sortDir`,
`selectedId`, `dialogId`, `lostId`, `rejected`, `showRejected`, and per-load
statuses. It created this task's component file as a placeholder, already
imported and rendered by the board screen. Loads arrive from `GET /api/loads`
(task-06), already filtered server-side by vehicle fit, with, per row: `id`,
`reference` (`GE-48210` form), client name, pickup/dropoff address and city,
`pickupWindowStart`/`pickupWindowEnd`/`deliveryDeadline`, `cargoCategory`,
`cargoWeightKg`, `cargoLengthM`/`WidthM`/`HeightM`, `packagingDescription`,
`itemQuantity`, `handlingTags`, `helperCount`, `distanceKm`,
`pickupDistanceKm` (nullable), `driverPayout`, a per-km driver rate,
`createdAt`, and a row state of `available` | `claimed` | `mine`. The response
also carries the count of loads hidden by the server-side vehicle-fit filter.

**This task's file naming assumption.** task-09 is expected to have created the
placeholder at `src/components/driver-hub/screens/loads-table.tsx`, rendered
from `src/components/driver-hub/screens/loads-screen.tsx` as `<LoadsTable
{...props} />`, matching the existing `jobs-screen.tsx` / `jobs-format.ts`
naming pair in the same directory. If task-09 actually named the placeholder
file differently, implement everything below inside whatever file it created —
the exported component name (`LoadsTable`) and the prop contract in
**Technical Details** are what matters, not the exact path.

## Files to Create

- `src/components/driver-hub/screens/loads-format.ts` — pure formatters for
  money, weight, dimensions, volume, the "from you" distance, the pick-up
  window / deadline strings, and the "posted N ago" relative-age string.

## Files to Modify

- `src/components/driver-hub/screens/loads-table.tsx` — replace task-09's
  placeholder body with the full table: columns, sorting, filtering, the three
  row states, the empty state and the footer.

**Do not modify** the board screen, the board state container/context, or the
filter panel — those belong to task-09 and are shared with three sibling
tasks running in parallel. Do not modify `hub-status.ts` or
`hub-primitives.tsx` — read them, but reuse what they already export instead
of adding a color pair (see **Row states** below). Do not modify
`jobs-format.ts` — this hub's convention is one formatter module per screen,
never shared between them (see `jobs-format.ts`'s own doc comment: kept
separate from the screen so the detail panel can reach it without importing
the screen, "matching `vehicles-format.ts` and `drivers-format.ts`" — every
screen's formatter module stands alone). `loads-format.ts` therefore defines
its own small `formatGel`/`pluralise`, not imports from `jobs-format.ts`.

## Technical Details

### CRITICAL MONEY RULE — read this before writing the Price column

The Price column renders `driverPayout` — the driver's 85% share, already
resolved and stored on the order at creation (`src/lib/orders/payout.ts`,
task-02) — and its sub-line renders the per-km driver rate the API supplies.
**`Order.price` (what the client pays) must never render on this table.** The
API response this component consumes does not even carry `price`, so there is
no field to reach for by mistake — but do not add one, and do not compute a
"client price" from `driverPayout` and a commission rate for display anywhere
in this file. Every money figure in this component traces back to
`driverPayout` or the per-km rate the API hands you, full stop.

### Component contract

Because this task cannot modify the board state container, this component
declares the exact props it needs and task-09's screen is responsible for
supplying them (raw state values and setters, not a pre-filtered list) — this
component derives the visible, sorted rows itself, mirroring how the
prototype's own `visible()` method works. Put this type (or one structurally
identical to it) at the top of `loads-table.tsx`:

```ts
export type LoadRowState = "available" | "claimed" | "mine";

/** Sort keys, one per sortable column. "fromYou" is this task's own addition. */
export type LoadSortKey =
  | "route"
  | "fromYou"
  | "win"
  | "cargoType"
  | "helpers"
  | "weight"
  | "price";

export type SortDir = "asc" | "desc";

export type Load = {
  id: string;
  reference: string;
  clientName: string;
  pickupCity: string;
  pickupAddress: string;
  dropoffCity: string;
  dropoffAddress: string;
  /** ISO timestamps. */
  pickupWindowStart: string;
  pickupWindowEnd: string;
  deliveryDeadline: string;
  cargoCategory: string;
  cargoWeightKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
  packagingDescription: string | null;
  itemQuantity: string | null;
  handlingTags: string[];
  helperCount: number;
  /** The job's own length — Route line 1's "32.4 km", NOT the "From you" column. */
  distanceKm: number;
  /** How far the PICKUP is from the driver right now. Null when unknown/stale. */
  pickupDistanceKm: number | null;
  driverPayout: number;
  driverRatePerKm: number;
  createdAt: string;
  status: LoadRowState;
};

export type LoadsTableProps = {
  /**
   * Every row relevant to the current `tab` / `showRejected` combination.
   * Already vehicle-fit filtered server-side (task-06) — this component does
   * NOT re-apply that filter. Whether `loads` already excludes/includes
   * rejected rows for the current `showRejected` value is task-09's
   * responsibility (one endpoint call with query params, or a merged fetch);
   * this component only filters/sorts within whatever array it is handed,
   * using `tab`, `rejected` and `showRejected` below, exactly mirroring the
   * prototype's client-side filtering against its fixed data set.
   */
  loads: Load[];
  /** Server render instant, for hydration-safe relative "posted N ago" text —
   * same pattern as `JobsScreen`'s `nowIso` in `jobs-screen.tsx`. */
  nowIso: string;

  tab: "available" | "mine";
  fPickup: string; // "All cities" = no filter
  fDrop: string;
  fWeight: number; // upper bound, kg
  fTags: string[]; // CargoHandlingTag enum strings, e.g. "FRAGILE"

  sortKey: LoadSortKey;
  sortDir: SortDir;
  /** Called with the FULL next {key, dir} — this component computes the
   * toggle itself (see Sorting below), so task-09 only needs to store it. */
  onSortChange: (key: LoadSortKey, dir: SortDir) => void;

  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Sets task-09's `dialogId`. Selecting the row is this component's own
   * job (see Row click / Accept wiring below) — call both. */
  onOpenConfirm: (id: string) => void;

  rejected: string[];
  showRejected: boolean;
  onToggleShowRejected: () => void;
  onReject: (id: string) => void;
  onRestore: (id: string) => void;

  /** Count hidden by the server-side vehicle-fit filter, from the API response. */
  hiddenByCapacityCount: number;
};
```

`fTags` values are expected to already be `CargoHandlingTag` enum strings
(`"FRAGILE"`, `"COLD_CHAIN"`, `"HAZMAT"`, …) matching `load.handlingTags`
members directly — task-09's filter chips own translating their display
labels ("Fragile") into these values. This component does a plain membership
check with no normalization of its own, matching the prototype's exact-string
AND-match.

### The two additions to the approved design

State both of these in a doc comment at the top of `loads-table.tsx`,
verbatim in spirit: **these are additions beyond the approved design, not
part of it** — cheap to drop if the design owner rejects them; nothing else in
the feature depends on either.

1. **"From you" column (new 8th column, `pickupDistanceKm`).** The design's
   Route cell already appends a distance to line 1 — but that number is
   `distanceKm`, the LENGTH of the job (pickup to drop-off), which says
   nothing about how far the driver currently is from the pickup. What
   actually decides whether a driver takes a job is how far away it *starts*.
   Per `specs/driver-load-board/requirements.md`'s Assumptions,
   `DriverProfile.currentLat/currentLng` are "frequently stale or null," so
   this column must render `—` when `pickupDistanceKm` is `null` (never
   throw, never fall back to `distanceKm`) and must **never filter the
   table** — only inform and sort. Placed second, directly after Route: it's
   the number most likely to change a driver's decision before they even
   read cargo, weight or price, and sorting by it ("show me what's nearest
   right now") is the single most useful non-default sort this board offers.
2. **Load age ("posted 14 min ago").** Placed as an appended fragment on the
   Route cell's existing third line, after the client name (see **Column 1:
   Route** below), rather than as its own column. Justification: it is
   supplementary, non-filterable context exactly like the id and client name
   already on that line — not a number a driver sorts or scans down a column
   for — and adding a 9th physical column would push the table's practical
   minimum width well past the design's `min-width:760px` floor for no real
   gain. Derived from `createdAt`; a driver uses it to judge whether a load
   has been sitting unclaimed and is possibly stale.

### Formatter module — `loads-format.ts`

Self-contained, matching the shape of `jobs-format.ts` (pinned locale/time
zone, `nowIso` threaded in rather than read from the clock, no shared state
with the screen). Import `HUB_TIME_ZONE`, `hubCivilDate`, `hubDayNumber` from
`@/lib/dashboard/hub/timezone` exactly as `jobs-format.ts` does, for the
Today/Tomorrow/date logic below.

```ts
export const EMPTY_VALUE = "—";

/**
 * `₾190` / `₾161.5`. Whole numbers show no decimals; a genuinely fractional
 * payout (driverPayoutFor rounds to whole tetri, so at most 2 places) shows
 * only the digits it has. Deliberately NOT the fixed-2-decimal `₾18.40` style
 * `jobs-format.ts`'s `formatGel` uses for job fares — this screen's own
 * design copy is whole-number throughout (`₾190`, `₾6/km`, `₾11 waiting
 * allowance`), so this formatter matches ITS screen's copy rather than
 * importing another screen's convention.
 */
export function formatGel(amountGel: number): string {
  return `₾${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(amountGel)}`;
}

/** `32.4 km`. One decimal, matching the handoff's Route-line distance and
 * this task's own "From you" column. */
export function formatDistanceKm(distanceKm: number): string {
  return `${distanceKm.toFixed(1)} km`;
}

/** `—` when unknown/stale; never omit the cell, never fall back to job length. */
export function formatFromYou(pickupDistanceKm: number | null): string {
  return pickupDistanceKm === null ? EMPTY_VALUE : formatDistanceKm(pickupDistanceKm);
}

/** `820 kg`. Rounded to the nearest kg for display — cargoWeightKg is a Float
 * but every design example is a whole number. */
export function formatWeightKg(weightKg: number): string {
  return `${Math.round(weightKg).toLocaleString("en-GB")} kg`;
}

/** `2.4 × 1.1 × 1.4 m`, one decimal per axis, matching the handoff's `dims`. */
export function formatDims(lengthM: number, widthM: number, heightM: number): string {
  return `${lengthM.toFixed(1)} × ${widthM.toFixed(1)} × ${heightM.toFixed(1)} m`;
}

/** `3.7 m³`, one decimal, matching the handoff's `vol`. */
export function formatVolumeM3(lengthM: number, widthM: number, heightM: number): string {
  return `${(lengthM * widthM * heightM).toFixed(1)} m³`;
}

/** `₾6/km`. Same whole-number-first style as formatGel. */
export function formatRatePerKm(ratePerKm: number): string {
  return `${formatGel(ratePerKm)}/km`;
}

/** `1, "load"` → `"1 load"`; `3` → `"3 loads"`. */
export function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/**
 * `09:40`, `4 Aug`. Day-label helper shared by the window and deadline
 * formatters below — Today/Tomorrow/Yesterday/date, exactly the
 * `relativeDayLabel` logic in `jobs-format.ts`, reproduced locally per this
 * hub's one-formatter-module-per-screen convention (see Files to Modify).
 */
// implement: civilDate(date), relativeDayLabel(date, now) — identical
// structure to jobs-format.ts's private helpers of the same names, using
// hubDayNumber/hubCivilDate from "@/lib/dashboard/hub/timezone" and a
// 24-hour en-GB clock formatter pinned to HUB_TIME_ZONE.

/** `Today 14:00–16:00` / `Tomorrow 09:00–10:00` / `4 Aug 14:00–16:00`. */
export function formatPickupWindow(
  startIso: string,
  endIso: string,
  nowIso: string,
): string {
  // dayLabel(startIso, nowIso) + " " + clock(startIso) + "–" + clock(endIso)
  // using the Today/Tomorrow/date day-label helper above.
}

/** `Deadline Today 20:00`. */
export function formatDeadlineLine(deadlineIso: string, nowIso: string): string {
  // "Deadline " + dayLabel(deadlineIso, nowIso) + " " + clock(deadlineIso)
}

/**
 * `posted just now` / `posted 14 min ago` / `posted 2h ago` / `posted 3d ago`.
 * Buckets: <60s "just now"; <60min "N min ago"; <24h "Nh ago"; else "Nd ago".
 */
export function formatPostedAgo(createdAtIso: string, nowIso: string): string {
  const ms = new Date(nowIso).getTime() - new Date(createdAtIso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "posted just now";
  if (minutes < 60) return `posted ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `posted ${hours}h ago`;
  return `posted ${Math.floor(hours / 24)}d ago`;
}
```

### The eight columns, transcribed from the design's table (plus the addition)

Table cells: padding `12px 14px` (`px-3.5 py-3`), `vertical-align: top`
(`align-top`), 1px bottom border `oklch(0.922 0 0)` (`border-b border-border`
— `TableRow` already carries this). Header cells: `9px 14px` padding
(`px-3.5 py-2.5`), 11px/500 uppercase, `letter-spacing:0.06em`, muted,
`cursor-pointer`, `select-none`. **Every numeric column gets `tabular-nums`**
(Tailwind's `font-variant-numeric: tabular-nums` utility) — but per this
task's own house-convention line, mono (`font-price`, IBM Plex Mono) is used
**only** for the reference, nowhere else in this table (a narrower rule than
`jobs-screen.tsx`'s broader mono usage — follow this task's line, not that
screen's precedent).

| # | Column | Sort key | Align | Cell content |
|---|---|---|---|---|
| 1 | Route | `route` | left | See below — 3 lines. |
| 2 | **From you** *(addition)* | `fromYou` | right | `formatFromYou(load.pickupDistanceKm)`, 13px, `tabular-nums`. |
| 3 | Pick-up window | `win` | left | Line 1: `formatPickupWindow(pickupWindowStart, pickupWindowEnd, nowIso)`, 13px. Line 2: `formatDeadlineLine(deliveryDeadline, nowIso)`, 11px muted. |
| 4 | Cargo | `cargoType` | left | Line 1: `cargoCategory`, 13px. Line 2: `` `${packagingDescription ?? EMPTY_VALUE} · ${formatVolumeM3(cargoLengthM, cargoWidthM, cargoHeightM)}` ``, 11px muted. |
| 5 | Helpers | `helpers` | center | Count badge — see **Helpers badge** below. |
| 6 | Weight / dims | `weight` | right | Line 1: `formatWeightKg(cargoWeightKg)`, 13px, `tabular-nums`. Line 2: `formatDims(cargoLengthM, cargoWidthM, cargoHeightM)`, 11px muted. |
| 7 | Price | `price` | right | Line 1: `formatGel(driverPayout)`, 13px/600, `letter-spacing:-0.01em`, `tabular-nums`. Line 2: `formatRatePerKm(driverRatePerKm)`, 11px muted, `tabular-nums`. |
| 8 | *(actions)* | — | right | `w-[132px]`, no sort, header text visually empty (`<span className="sr-only">Actions</span>`). See **Row states**. |

**Column 1: Route** — left-aligned, no fixed width (lets the table breathe).
- Line 1: `` `${pickupCity} → ${dropCity}` ``, 500 weight, with
  `formatDistanceKm(distanceKm)` appended in 11px muted `tabular-nums` (this
  is the job's own length, NOT the "From you" addition — do not conflate the
  two numbers).
- Line 2: `` `${pickupAddress} → ${dropoffAddress}` ``, 11px muted,
  `max-w-[300px] truncate` (put the untruncated string in a `title` attribute
  — Tbilisi addresses regularly outrun 300px, matching the reasoning
  `jobs-screen.tsx` already applies to its own Route cell).
- Line 3 *(load-age addition folded in here)*: `reference` in `font-price`
  (IBM Plex Mono) 11px muted, then `clientName` 11px muted, `gap-2` (8px)
  between them, then `formatPostedAgo(createdAt, nowIso)` appended after the
  client name, same 11px muted style, separated by ` · `.

**Helpers badge (column 5).** `min-w-[24px] h-6 rounded-full inline-flex
items-center justify-center text-xs font-semibold tabular-nums`. When
`helperCount > 0`: `bg-foreground text-background`, content is `helperCount`.
When `0`: `bg-muted text-muted-foreground`, content is `EMPTY_VALUE` (`—`) —
these are the design's literal `oklch(0.145 0 0)`/`oklch(0.985 0 0)` and
`oklch(0.97 0 0)`/muted pairs, which the repo's `--foreground`/`--background`
and `--muted`/`--muted-foreground` tokens already equal exactly (see the
Design Tokens table in the handoff README) — use the tokens, not arbitrary
`oklch(...)` values, since these two pairs are not row-state colours (no
`HubStatusTone` mapping needed here).

### Sorting

Every column in the table above sorts, including the "From you" addition.
Clicking a header's active column toggles `desc` → `asc`; clicking a
different column always starts that column at `desc`. This exact toggle rule
— reproduced from the prototype's own `th()` helper — is computed **inside
this component** (not trusted to task-09's plumbing, since this task must be
buildable without reading task-09's actual implementation):

```ts
function nextSort(
  current: { key: LoadSortKey; dir: SortDir },
  clicked: LoadSortKey,
): { key: LoadSortKey; dir: SortDir } {
  if (current.key === clicked) {
    return { key: clicked, dir: current.dir === "desc" ? "asc" : "desc" };
  }
  return { key: clicked, dir: "desc" };
}
```

Each header's `onClick` calls `onSortChange(...Object.values(nextSort({ key: sortKey, dir: sortDir }, "price")))`
— concretely, compute `nextSort(...)` and spread its `key`/`dir` into
`onSortChange`. The active column's header shows `" ↓"` for `desc` and
`" ↑"` for `asc` appended to the label, and sets `aria-sort="descending"` /
`"ascending"` on its `<TableHead>` (every other header gets no `aria-sort`
attribute, not `"none"` — matches native `<th>` semantics).

String keys (`route` → `pickupCity`, `cargoType` → `cargoCategory`) sort with
`localeCompare`; numeric keys (`win` → `pickupWindowStart` as a timestamp,
`helpers` → `helperCount`, `weight` → `cargoWeightKg`, `price` →
`driverPayout`) sort numerically. **Default sort is `price` desc, over
`driverPayout` — never over a client price, which this component's data does
not even carry.**

`fromYou` (`pickupDistanceKm`) is the one nullable sortable field. Nulls
always sort last, in both directions — a driver sorting "closest first"
should never have the unknown-distance rows land at the top just because
`null < 12.3` is meaningless as a comparison:

```ts
function compareLoads(a: Load, b: Load, key: LoadSortKey, dir: SortDir): number {
  const factor = dir === "asc" ? 1 : -1;
  if (key === "fromYou") {
    const av = a.pickupDistanceKm, bv = b.pickupDistanceKm;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * factor;
  }
  const va = sortValueFor(a, key), vb = sortValueFor(b, key);
  if (typeof va === "string" && typeof vb === "string") {
    return va.localeCompare(vb) * factor;
  }
  return ((va as number) - (vb as number)) * factor;
}
```

Where `sortValueFor` maps `route`→`pickupCity`, `win`→
`new Date(load.pickupWindowStart).getTime()`, `cargoType`→`cargoCategory`,
`helpers`→`helperCount`, `weight`→`cargoWeightKg`, `price`→`driverPayout`.

### Filtering — the visible row list

Compute with `React.useMemo`, keyed on `loads`, `tab`, `rejected`,
`showRejected`, `fPickup`, `fDrop`, `fWeight`, `fTags`, `sortKey`, `sortDir`.
Mirrors the prototype's `visible()` exactly, against this component's prop
names:

```ts
function isVisible(load: Load, p: LoadsTableProps): boolean {
  if (p.tab === "mine") return load.status === "mine";
  if (p.rejected.includes(load.id) !== p.showRejected) return false;
  if (load.status === "mine") return false;
  if (p.fPickup !== "All cities" && load.pickupCity !== p.fPickup) return false;
  if (p.fDrop !== "All cities" && load.dropoffCity !== p.fDrop) return false;
  if (load.cargoWeightKg > p.fWeight) return false;
  if (p.fTags.length > 0 && !p.fTags.every((tag) => load.handlingTags.includes(tag))) return false;
  return true;
}
```

Note the asymmetry, straight from the prototype: on the `mine` tab, none of
the city/weight/tag filters or the rejected toggle apply — "My loads" is
never filtered or subject to rejection. On the `available` tab, `claimed`
rows (claimed by someone else) remain visible, dimmed (see **Row states**) —
only `mine` rows are excluded there.

### Row states and actions cell

Row background: selected row uses `data-state="selected"` on `TableRow` (the
shared `Table` primitive already styles `data-[state=selected]:bg-muted` —
no extra class needed, matching `jobs-screen.tsx`'s own selected-row
pattern). Claimed row: `opacity-60` (Tailwind's `opacity-60` = design's
`opacity: 0.6`).

**Row-state colour mapping.** The design specifies two pill colours for
`claimed` and `mine` that are NOT part of any per-row filter chip or badge
already in `hub-status.ts`. Per the instruction to reuse rather than invent:
read `src/components/driver-hub/hub-status.ts`'s `HUB_STATUS_TONE_CLASSES`
and use it directly (not the `HubStatusBadge` wrapper in
`hub-primitives.tsx`, which derives its tone from a status *word* via
`hubStatusTone()` — `"claimed"` and `"mine"`/`"yours"` are not in that word
list and would silently fall through to `neutral` for both, which is wrong
for `mine`). Instead, build two small inline pills in this file using
`HUB_STATUS_TONE_CLASSES` directly with an explicit tone:
- **`claimed` → `HUB_STATUS_TONE_CLASSES.neutral`.** The design's flat grey
  (`oklch(0.97 0 0)` / `oklch(0.556 0 0)`) has no exact match among the six
  tones — `neutral`'s pair (`oklch(96.7% 0.003 264.542)` /
  `oklch(44.6% 0.03 256.802)`) is a hair's-breadth off in chroma but is the
  only other flat grey in the set and is visually indistinguishable at pill
  size. Do not add a seventh tone for a difference this small.
- **`mine` → `HUB_STATUS_TONE_CLASSES.success`.** The design's emerald
  (`oklch(97.9% 0.021 166.113)` / `oklch(50.8% 0.118 165.612)`) and
  `success`'s green (`oklch(96.2% 0.044 156.743)` /
  `oklch(44.8% 0.119 151.328)`) are a different hue family (166 vs 151) but
  `success` is the only green in the six-tone set, and "claimed by you" is
  unambiguously a success state alongside `success`'s existing "Completed /
  Verified / Paid" vocabulary.

Both pills: `inline-flex items-center rounded-full px-[9px] py-1 text-[11px]
font-medium` (500 weight, per the design's `pill()` helper — NOT
`HubStatusBadge`'s 600/`font-semibold`, which is why this is bespoke markup
rather than that component) plus the relevant `HUB_STATUS_TONE_CLASSES`
entry.

**By status, in the actions cell (right-aligned flex, `gap-1.5` / 6px):**
- **`available`, not rejected** — `Button` `variant="outline" size="sm"` for
  **Reject**, then default-variant `Button size="sm"` for **Accept**. Both
  `onClick={(e) => { e.stopPropagation(); ... }}` so the row's own
  `onClick` (which selects it) never fires from a button press. Reject's
  hover state overrides the default `outline` hover with the design's
  destructive tint: `hover:bg-[oklch(97.1%_0.013_17.38)]
  hover:border-[oklch(88.5%_0.062_18.334)]
  hover:text-[oklch(50.5%_0.213_27.518)]`. Reject calls `onReject(load.id)`
  and, if `selectedId === load.id`, also `onSelect(null)` (clears the
  selection when the rejected row was the open one — the design's own
  behaviour, computed here since this component owns `onSelect`). Accept
  calls `onSelect(load.id)` **and** `onOpenConfirm(load.id)` — per the
  design, "Accept (row or drawer) → selects the load and opens the confirm
  dialog," both state changes, not just one.
- **`available`, rejected (`rejected.includes(load.id)`)** — only reachable
  when `showRejected` is true (see `isVisible` above). A single **Restore**
  button, `variant="outline" size="sm"`, `stopPropagation`, calling
  `onRestore(load.id)`. No Reject/Accept pair.
- **`claimed`** — the `neutral`-toned "Claimed" pill, no buttons.
- **`mine`** — never reached in the actions cell in practice on the
  `available` tab (per `isVisible`, `mine` rows are excluded from that tab
  entirely) but IS reached on the `mine` tab, where every visible row is
  `mine` — render the `success`-toned "Yours" pill there, no buttons.

### Row click

`TableRow`'s own `onClick={() => onSelect(load.id)}` — mouse convenience,
`cursor-pointer`. Action buttons inside the row call `stopPropagation` (above)
so they never also trigger row selection. This sets `selectedId` in the
shared board state; the drawer that reads it is task-11's file — this
component does nothing else with the selection beyond setting it and driving
`data-state="selected"` for the row's own highlight.

### Empty state and footer

Empty state (no rows after filtering), inside the table's card, replacing the
`<TableBody>` rows when the filtered list is empty — 48px vertical padding
(`py-12`), centered:
```
No loads match these filters
```
14px/500, then:
```
Widen the weight range or clear a city to see more.
```
13px muted, directly below.

Footer — a `<div>` below the table (not a `<TableFooter>` inside it, so the
empty-state block above sits between the header row and the footer):
`bg-muted`, 1px top border (`border-t border-border`), `px-3.5 py-2.5`
(`10px 14px`), 12px muted text, `flex items-center justify-between`.

- **Left** (result line, from `visible.length`, pluralised via
  `pluralise()`):
  - `tab === "mine"`: `` `${pluralise(count, "load")} you have claimed` ``
  - `tab === "available" && !showRejected`: `` `${pluralise(count, "load")} open to you` ``
  - `tab === "available" && showRejected`: `` `${pluralise(count, "load")} you rejected` ``
- **Right**, only rendered on the `available` tab:
  - Capacity note, always shown when `hiddenByCapacityCount > 0`:
    `` `${pluralise(hiddenByCapacityCount, "load")} hidden — over your vehicle capacity or dimensions` ``
  - Rejected-list toggle, only when `rejected.length > 0`, an underlined text
    button calling `onToggleShowRejected()` **and** `onSelect(null)` (the
    design: "clearing selection" on this toggle):
    - `!showRejected`: `` `${pluralise(rejected.length, "rejected")} · view` `` —
      note the design's own copy pluralises the word "rejected" itself here
      (`"1 rejected · view"` / `"2 rejected · view"`), not "load(s)
      rejected" — transcribe it exactly as written.
    - `showRejected`: `Back to open loads`

### Responsive

`<Table>` (the shadcn primitive) already wraps itself in an
`overflow-x-auto` container — nothing extra is needed for that. Give the
`<Table>` element `className="min-w-[760px]"` so that wrapper actually has
something to scroll below ~760px, matching the design's own
`min-width:760px` on its table element.

### `handlingTags` arrives in selection order, not enum order

task-04 persists `Order.handlingTags` in the order the client tapped the chips,
not in `CargoHandlingTag` declaration order. The booking form's chips always
*render* in enum order because they iterate a fixed options list, but the stored
array does not inherit that.

So any driver-facing surface that renders these pills must **sort them
explicitly** rather than assume order. Two loads carrying the same three tags
would otherwise show them in different sequences, which reads as a bug and makes
rows harder to scan. Sort by the enum's declaration order (FRAGILE, COLD_CHAIN,
HAZMAT, TIME_CRITICAL, UPRIGHT_ONLY, HEAVY_ITEM), not alphabetically — HAZMAT
should not sort above FRAGILE by accident of spelling.

## Acceptance Criteria

- [ ] Handling-tag pills render in `CargoHandlingTag` declaration order,
      sorted explicitly — the stored array is in the client's selection order.

- [ ] `loads-table.tsx` renders all eight columns from the table above, in
      that order, with the exact per-cell content, alignment and typography
      described (Route's 3 lines including the folded-in `reference` +
      `clientName` + `posted N ago`; "From you"; Pick-up window's 2 lines;
      Cargo's 2 lines; the Helpers badge in both its filled and empty states;
      Weight/dims' 2 lines; Price's 2 lines).
- [ ] No figure derived from a client price (`Order.price` or any commission
      math on top of it) appears anywhere in this component — grep confirms
      `loads-table.tsx` and `loads-format.ts` contain no reference to
      `price` other than `driverPayout`/`driverRatePerKm`-named identifiers,
      and every rendered money string in the table traces to `driverPayout`
      or `driverRatePerKm`.
- [ ] Every column, including "From you", sorts on header click; clicking the
      already-active header toggles `desc` → `asc` and back; clicking a
      different header always lands on `desc`; the active header's label
      shows the correct `" ↓"`/`" ↑"` suffix and `aria-sort` value.
- [ ] Default sort on first render is `price` desc, ordering by `driverPayout`.
- [ ] Sorting by "From you" places every `pickupDistanceKm === null` row last
      regardless of direction.
- [ ] An `available` row not in `rejected` renders Reject and Accept buttons;
      clicking either does not also select the row (verified: clicking Accept
      or Reject on an unselected row leaves `selectedId` at whatever
      `onSelect` was called with by that button's own handler, never as a
      side effect of the row's `onClick`).
- [ ] Clicking Accept calls both `onSelect(id)` and `onOpenConfirm(id)`.
- [ ] An `available` row that IS in `rejected` (visible only when
      `showRejected` is true) renders a single Restore button, no
      Reject/Accept.
- [ ] A `claimed` row renders the neutral-toned "Claimed" pill (no buttons)
      and `opacity-60` on the row.
- [ ] A `mine` row (visible on the "My loads" tab) renders the success-toned
      "Yours" pill, no buttons.
- [ ] `hub-status.ts` and `hub-primitives.tsx` are unmodified; the claimed/
      mine pills are built from `HUB_STATUS_TONE_CLASSES.neutral` and
      `HUB_STATUS_TONE_CLASSES.success` respectively, imported, not
      hand-written `oklch(...)` literals.
- [ ] The empty state renders the exact two-line copy when the filtered list
      is empty.
- [ ] The footer's left line matches the three tab/showRejected cases above,
      correctly pluralised (1 vs N).
- [ ] The footer's right side shows the capacity note only when
      `hiddenByCapacityCount > 0`, and the rejected-list toggle only when
      `rejected.length > 0`, both only on the `available` tab; the toggle's
      label and `onClick` (which also clears `selectedId`) match the spec.
- [ ] Row click sets `selectedId` via `onSelect`; the row shows
      `data-state="selected"` when `load.id === selectedId`.
- [ ] `<Table>` carries `min-w-[760px]` so the primitive's own
      `overflow-x-auto` wrapper scrolls below that width.
- [ ] `pnpm check` passes with no new lint or type errors.

## Notes

- Both additions ("From you" and load age) are explicitly flagged in this
  file and in a doc comment at the top of `loads-table.tsx` as beyond the
  approved design. If the design owner rejects either, "From you" drops
  cleanly as one column and one sort key; load age drops as one appended
  fragment on Route's third line — neither has any other task depending on
  it (task-14, the only thing that blocks on this file, only needs rows to
  update in place, not either addition specifically).
- This component assumes `loads` already contains the correct row set for
  the current `tab`/`showRejected` combination — see the prop doc comment on
  `loads`. If task-09's actual data flow turns out not to include rejected
  rows in `loads` when `showRejected` is true, fixing that fetch is task-09's
  responsibility, not a patch to make inside this file.
- Do not reach for `HubStatusBadge` for the claimed/mine pills — its
  status-word lookup (`hubStatusTone`) has no entries for `"claimed"` or
  `"mine"`/`"yours"` and both would silently render `neutral`, which is wrong
  for "Yours." Build the two pills directly from `HUB_STATUS_TONE_CLASSES`
  instead, as described above.
</content>
