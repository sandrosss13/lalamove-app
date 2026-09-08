# Task 13: Mobile board

## Status

pending

## Wave

4

## Description

Builds the load board's mobile surface: the compact filter row, the weight
slider row, a stacked list of load cards, and the footer capacity note — the
mobile counterpart to the desktop table (task-10) and drawer (task-11). It also
adds a **detail bottom sheet** that the approved design does not include for
mobile, because without it a driver on a phone can accept hazmat or cold-chain
cargo without ever seeing the handling tags that warn them about it — see
"The detail bottom sheet is an addition" below for the full justification. This
task also wires the actual desktop/mobile breakpoint switch into the board
screen, replacing the prototype's manual toggle with real responsive rendering.

## Dependencies

**Depends on:** task-09-board-shell
**Blocks:** None

**Context from dependencies:** task-09 built the board route at
`/dashboard/loads`, the hub nav entry, the sticky header, the `Available
loads`/`My loads` tab bar, the **desktop** filter panel (city selects, weight
slider, handling-tag chips, reset — the grid described in the design's
"Desktop — Load board" section), and a shared board-state container consumed
by every child surface. That container holds exactly the fields the design's
prototype class holds in `this.state`, listed in the design handoff's "State
Management" table:

- `tab: "available" | "mine"`
- filters: `fPickup`, `fDrop` (strings, `"All cities"` = no filter), `fWeight`
  (number, upper-bound kg), `fTags` (`CargoHandlingTag[]`, selected handling
  chips)
- `sortKey` / `sortDir` (`"asc" | "desc"`)
- `selectedId: string | null` — the drawer/sheet target
- `dialogId: string | null` — the confirm-dialog target
- `lostId: string | null` — the lost-the-race dialog target
- `rejected: string[]` — driver-scoped rejected load ids
- `showRejected: boolean`
- `statuses: Record<id, "available" | "claimed" | "mine">`
- the fetched `loads` array itself and an `isLoading` flag (the container must
  own data fetching to compute the derived list every child renders)

This task treats that container as a hook, referred to below as
`useLoadsBoard()`, assumed to live at
`src/components/driver-hub/screens/loads-board-state.ts` and to also expose
`visibleLoads` (the fully filtered + sorted array every surface renders) and
`counts` (open/mine/rejected/hidden-by-capacity, for the footer). **If task-09
named the hook, its file, or these two derived fields differently, apply this
task's changes to whatever it actually exports — the field list above is the
fixed contract; the identifier is not.** task-09 also created this task's own
component file as an unstyled placeholder, already imported and rendered by
the top-level board screen (assumed `src/components/driver-hub/screens/loads-screen.tsx`)
so the route compiles before this task lands.

Loads come from `GET /api/loads` (task-06, not a direct dependency of this
task but already built by the time this wave runs). Each row carries: `id`,
`reference` (`GE-48210` form), client name, pickup/dropoff address and city,
`pickupWindowStart`/`pickupWindowEnd`/`deliveryDeadline`, `cargoCategory`,
`cargoWeightKg`, `cargoLengthM`/`cargoWidthM`/`cargoHeightM`,
`packagingDescription`, `itemQuantity`, `handlingTags`
(`CargoHandlingTag[]`: `FRAGILE`, `COLD_CHAIN`, `HAZMAT`, `TIME_CRITICAL`,
`UPRIGHT_ONLY`, `HEAVY_ITEM`), `helperCount`, `distanceKm`,
`pickupDistanceKm` (nullable), `driverPayout`, a per-km driver rate (referred
to below as `driverRatePerKm`), `createdAt`, and `status: "available" |
"claimed" | "mine"`. **`driverPayout` is the only money figure this task may
ever render. `Order.price` never reaches this component — it is not even in
the API response.** Claiming (`POST /api/loads/[id]/claim`, task-08) returns a
409 with the load's `reference` when another driver already won; rejecting is
`POST`/`DELETE /api/loads/[id]/reject` (task-07).

## Files to Create

- `src/components/ui/sheet.tsx` — shadcn-pattern bottom sheet primitive, built
  on the same `radix-ui` package `dialog.tsx` already uses. Nothing before
  this task needs a sheet, so it does not exist yet.
- `src/components/driver-hub/screens/loads-detail-sheet.tsx` — the mobile
  detail bottom sheet: the addition to the approved design (see Technical
  Details). Opened by tapping a card; carries the same information categories
  as the desktop drawer plus Accept/Reject.

## Files to Modify

- `src/components/driver-hub/screens/loads-mobile-board.tsx` — task-09's
  placeholder. Replace it with the filter row, weight row, card list and
  footer.
- `src/components/driver-hub/screens/loads-screen.tsx` (task-09's top-level
  screen — see the naming caveat above) — wire the actual breakpoint switch:
  render the desktop table + drawer (task-10, task-11) at `lg:` and above, and
  this task's mobile board + detail sheet below `lg`. This is this task's
  responsibility rather than task-09's or task-10/11's because it is the one
  surface that knows about both trees; the individual desktop and mobile
  components each only render their own half.

## Technical Details

### The breakpoint

**Drop the prototype's 390px frame and the Desktop/Mobile segmented control
entirely.** Neither may appear in the shipped code — the design handoff's own
README calls both "a prototype affordance for reviewing both surfaces" and
says production should "drop it and use real breakpoints." There is no
client-only `mode` state anywhere in this feature.

Use Tailwind's default `lg` breakpoint (1024px) as the split, driven purely by
CSS, not by a JS media-query hook:

```tsx
// inside loads-screen.tsx, both trees mounted, one hidden by CSS —
// avoids the remount/reflow (and the lost scroll/selection) that would come
// from swapping components in and out as the viewport crosses the breakpoint
<div className="hidden lg:block">
  <LoadsTable board={board} />
  <LoadsDrawer board={board} />
</div>
<div className="lg:hidden">
  <LoadsMobileBoard board={board} />
  <LoadsDetailSheet board={board} />
</div>
```

`lg` (1024px), not `md` (768px), because the desktop tree needs room for a
248px sidebar plus a table whose own `min-width` is 760px (per the design's
table section) — a browser between 768px and 1024px genuinely cannot fit both
comfortably. Both halves read from the same `useLoadsBoard()` instance, so
switching breakpoints (e.g. rotating a tablet) never loses `selectedId`,
`dialogId`, filters or scroll position — there is exactly one source of truth,
only its presentation is conditional.

### Filter row and weight row

Two rows above the card list, distinct from — and simpler than — task-09's
desktop filter panel (design's "Mobile — driver view" section, not "Desktop"):

```tsx
<div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
  <select
    className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
    value={board.filters.fPickup}
    onChange={(e) => board.setFilters({ fPickup: e.target.value })}
  >
    <option>All cities</option>
    {pickupCities.map((city) => (
      <option key={city}>{city}</option>
    ))}
  </select>
  <span className="text-muted-foreground">→</span>
  <select
    className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
    value={board.filters.fDrop}
    onChange={(e) => board.setFilters({ fDrop: e.target.value })}
  >
    <option>All cities</option>
    {dropCities.map((city) => (
      <option key={city}>{city}</option>
    ))}
  </select>
</div>

<div className="flex items-center gap-3 border-b border-border px-4 py-2">
  <span className="text-[11px] text-muted-foreground tabular-nums">
    ≤ {formatKg(board.filters.fWeight)}
  </span>
  <Slider
    className="flex-1"
    min={100}
    max={1200}
    step={50}
    value={[board.filters.fWeight]}
    onValueChange={([v]) => board.setFilters({ fWeight: v })}
  />
  <span className="text-[11px] text-muted-foreground tabular-nums">
    {board.visibleLoads.length}
  </span>
</div>
```

Both rows read and write the **same** `fPickup`/`fDrop`/`fWeight` fields the
desktop filter panel uses — there is one filter state, not a mobile copy of
it. Reuse the `Slider` primitive task-09 added for the desktop weight range
control (`src/components/ui/slider.tsx`); if it does not exist yet, add it
first with `pnpm dlx shadcn@latest add slider` — no new npm dependency, it
wraps the `radix-ui` package already installed.

The design's mobile filter row has no handling-tag chips and no Reset button —
do not add either; that is a deliberate simplification in the source design,
not an omission to fix. If a driver arrives on mobile with `fTags` already set
(e.g. set on desktop, then the window was resized), the tag filter continues
to apply silently even though mobile exposes no control for it — this is a
documented gap, not a bug (see Notes), and is out of scope for this task
beyond stating it.

### Load cards

Each card is a `<button>`-like `div role="button"` (not a real `<button>` —
it contains nested interactive buttons, which HTML forbids) at 14px padding
with a 1px bottom border. Tapping anywhere on the card outside the action row
opens the detail sheet for that load (`board.setSelectedId(load.id)`).

Five rows, the first three transcribed from the design, the fourth an
addition this task makes, the fifth the design's own action row:

1. **Route + price** — `${pickupCity} → ${dropCity}` at 500 weight, left;
   `formatGel(load.driverPayout)` at 600 weight, `tabular-nums`, right;
   baseline-aligned (`flex items-baseline justify-between`).
2. **Cargo summary** (12px muted) — `${cargoCategory} · ${weight} · ${dims}`.
3. **Timing** (12px muted) — `${windowText} · ${distanceKm} km ·
   ${helperCount} helper(s) requested` (or "No helpers requested" — `helper`
   text pluralised per `pluralise` in the shared format module, matching
   `jobs-format.ts`'s helper elsewhere in the hub).
4. **Handling tag pills** (ADDITION — see Notes) — rendered only when
   `load.handlingTags.length > 0`: a wrapped row of compact pills, same visual
   language as the drawer's tag pills (`bg-muted`, 1px `border-border`, 11px /
   500, `rounded-full`, tighter padding than the drawer's — `px-2 py-0.5` —
   since card real estate is scarcer). Label text from the shared tag-label
   formatter (`Fragile`, `Cold chain`, `Hazmat`, `Time critical`, `Upright
   only`, `Heavy item`).
5. **Action row**, `mt-2.5`, exactly per status — see below. **44px tall,
   non-negotiable** — this is the minimum touch target and the design states
   it explicitly.

```tsx
function LoadCard({ load, board }: { load: LoadRow; board: LoadsBoard }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => board.setSelectedId(load.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") board.setSelectedId(load.id);
      }}
      className="border-b border-border p-3.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">
          {load.pickupCity} → {load.dropCity}
        </span>
        <span className="tabular-nums font-semibold">
          {formatGel(load.driverPayout)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {load.cargoCategory} · {formatKg(load.cargoWeightKg)} ·{" "}
        {formatDims(load)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatWindow(load)} · {formatDistanceKm(load.distanceKm)} ·{" "}
        {formatHelperText(load.helperCount)}
      </p>
      {load.handlingTags.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {load.handlingTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium"
            >
              {formatHandlingTag(tag)}
            </span>
          ))}
        </div>
      ) : null}
      <LoadCardActions load={load} board={board} />
    </div>
  );
}
```

### Row states: `available` / `claimed` / `mine`

**Reuse `HUB_STATUS_TONE_CLASSES` from `src/components/driver-hub/hub-status.ts`
— do not add a seventh tone or hand-roll new colour pairs for these three
states.** That module exists precisely so a new screen never invents its own
palette; the design's own colours for `claimed` and `mine` land close enough
to two of the six existing tones that reusing them is the correct call, not a
compromise:

- **`available`** — no coloured strip. The action row is the two real
  buttons: `Reject` (`variant="outline"`, `w-[88px]`, `h-11`) and `Accept ·
  {formatGel(driverPayout)}` (`variant="default"`, `flex-1`, `h-11`), `gap-1.5`.
  Both call `event.stopPropagation()` so tapping them does not also open the
  sheet. If the load is in `board.rejected`, render a single full-width `h-11`
  **Restore** button instead of the pair.
- **`claimed`** — a full-width `h-11 flex items-center justify-center
  rounded-md text-xs font-medium` strip reading "Claimed by another driver",
  using `HUB_STATUS_TONE_CLASSES.neutral` (the same grey the hub already uses
  for Scheduled/Offline/Idle — "a real, deliberate state that simply is not an
  alert," which is exactly what a load someone else claimed is from this
  driver's point of view).
- **`mine`** — the same shape reading "Yours · view job sheet", using
  `HUB_STATUS_TONE_CLASSES.success` (the emerald the hub already uses for
  Completed/Verified/Paid — claiming a load is a good outcome for the
  driver). Tapping this strip still opens the detail sheet (it is not itself
  a link — "Open job sheet" has no destination per the requirements'
  non-goals, and is rendered disabled with a tooltip inside the sheet, exactly
  as task-11's drawer does).

```ts
const rowStrip: Record<"claimed" | "mine", string> = {
  claimed: HUB_STATUS_TONE_CLASSES.neutral,
  mine: HUB_STATUS_TONE_CLASSES.success,
};
```

### Footer

Sticky or trailing block, `bg-muted`, 11px muted text, the same capacity
sentence the desktop footer renders (`board.counts.hiddenByCapacity`
loads hidden — same copy: `"N loads hidden — over your vehicle capacity or
dimensions"`, singular/plural via `pluralise`). Sourced from the same computed
count as desktop — this task does not recompute it, it reads
`board.counts` from the shared state container.

The design gives desktop a footer toggle to view the rejected list
(`"N rejected · view"`); mobile's footer in the design carries only the
capacity note, no toggle. This task does not add one — see Notes.

### The detail bottom sheet is an addition — required, not optional polish

**The approved design gives mobile no detail view at all.** Desktop gets a
400px drawer with the full route, the cargo grid, every handling tag, and the
(placeholder) photo tiles; mobile cards carry three lines of text and an
Accept button. That means on the device nearly every driver actually uses, a
driver can tap **Accept** and claim a load carrying `HAZMAT` or `COLD_CHAIN`
tags without those tags ever having been rendered anywhere they were looking.
That is not a missing polish item — the requirements list "No ADR/hazmat
certification gating... Hazmat loads are tagged and warned about, not gated"
as an accepted risk specifically *because* the tag is assumed visible before
acceptance. On mobile, as designed, it is not visible at all before
acceptance. This task closes that gap by adding a bottom sheet, opened by
tapping a card, carrying the same information categories as
`loads-drawer.tsx` (task-11):

1. Header — `reference` (mono, 12px/500), a status pill, price at 26px/600
   with the waiting-allowance sub-line.
2. Route — pickup and dropoff rows with markers, addresses, window/deadline,
   distance and stop count (stop count renders as the constant `2` — see
   requirements.md's non-goals; there is no multi-stop).
3. Cargo — the `96px 1fr` label/value grid (type, weight, dimensions, volume,
   packaging, quantity, helpers), **the handling tag pills**, and the three
   dashed cargo-photo placeholder tiles (never real images — see
   requirements.md's non-goals).
4. Actions — Accept / Reject (or Restore), or the claimed/mine notices,
   matching the drawer's copy exactly.

**This task duplicates that content rather than importing or extracting it
from `loads-drawer.tsx`.** Two reasons, both load-bearing:

- **task-11 is not a dependency of this task.** The dependency graph has
  task-13 depending only on task-09; task-11 runs in the *same* wave, in
  parallel, with no ordering guarantee between them. This task cannot assume
  `loads-drawer.tsx` exists yet, has settled on any particular internal
  structure, or exports anything reusable.
- **This task must not modify `loads-drawer.tsx` under any circumstances** —
  it is another task's file, in the same wave, and editing it would be
  exactly the kind of cross-task collision parallel waves are meant to avoid.

So `loads-detail-sheet.tsx` renders its own copy of the four sections above,
built directly from the same `LoadRow` shape both surfaces read from
`GET /api/loads` — it does not need anything from `loads-drawer.tsx` to do
so, since both are driven by identical data. A future cleanup task could
extract the shared JSX once both files exist and are not mid-flight in the
same wave; that extraction is explicitly out of scope here.

Sheet primitive (`src/components/ui/sheet.tsx`, since none exists yet — the
shadcn pattern, built on the same `radix-ui` package `dialog.tsx` already
imports, so no new dependency):

```tsx
"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-150 data-open:animate-in data-closed:animate-out",
  {
    variants: {
      side: {
        bottom:
          "inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-border data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
      },
    },
    defaultVariants: { side: "bottom" },
  },
);

function SheetContent({
  className,
  side,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> &
  VariantProps<typeof sheetVariants>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
      {/* `data-admin-surface` is load-bearing: this content is portalled to
          document.body, outside DriverHubShell's attributed root, so the
          Lalamove bg-muted/bg-accent/border tokens would otherwise resolve to
          the marketing palette (see driver-hub-shell.tsx's doc comment and
          step-4-drivers-assignment.tsx's SelectContent for the precedent). */}
      <SheetPrimitive.Content
        data-admin-surface=""
        data-slot="sheet-content"
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetContent };
```

`loads-detail-sheet.tsx` opens when `board.selectedId` is set (mirroring how
the drawer's visibility works — the two are mutually exclusive by breakpoint,
never both mounted-and-open at once, since only one tree renders per
viewport) and calls `board.setSelectedId(null)` on close. Its Accept button
calls `board.setDialogId(load.id)` — the **same** shared confirm dialog task-12
builds (`loads-confirm-dialog.tsx` or wherever task-12 names it), reused
unmodified: this task does not touch task-12's files, it only sets the same
state field the desktop drawer sets. The confirm dialog and the lost-the-race
dialog are already centred, fixed-position overlays sized for mobile (`440px
max-w-[calc(100%-2rem)]`, per `dialog.tsx`'s existing pattern) — they need no
mobile-specific variant.

### Code Snippets

`formatHandlingTag` (add to the shared format module, assumed
`src/components/driver-hub/screens/loads-format.ts` per task-09 — matching
the `{feature}-format.ts` convention every other hub screen already follows,
e.g. `jobs-format.ts`, `vehicles-format.ts`):

```ts
const HANDLING_TAG_LABELS: Record<CargoHandlingTag, string> = {
  FRAGILE: "Fragile",
  COLD_CHAIN: "Cold chain",
  HAZMAT: "Hazmat",
  TIME_CRITICAL: "Time critical",
  UPRIGHT_ONLY: "Upright only",
  HEAVY_ITEM: "Heavy item",
};

export function formatHandlingTag(tag: CargoHandlingTag): string {
  return HANDLING_TAG_LABELS[tag];
}
```

If `loads-format.ts` does not yet exist under that name, or already defines an
equivalent formatter under a different name, use whatever task-09 actually
created rather than adding a second one — every mobile-only helper this task
needs beyond that (e.g. `formatKg`, `formatDims`) belongs in the same shared
module too, not duplicated locally, so task-10/11/12 and this task never
render the same figure two different ways.

## Acceptance Criteria

- [ ] The mobile board renders only below the `lg` (1024px) breakpoint; the
      desktop table + drawer render only at `lg:` and above. No client-side
      `mode`/viewport-detection state and no 390px frame exist anywhere in the
      shipped code.
- [ ] A filter row (pickup select → drop-off select) and a weight row (slider
      + live result count) render above the card list, and changing either
      updates `board.filters` — the same state object the desktop filter panel
      reads and writes.
- [ ] Each load card renders: a route + price row, a cargo/weight/dims row, a
      window/distance/helpers row, a row of handling-tag pills when
      `handlingTags` is non-empty, and a 44px-tall action row.
- [ ] Reject, Accept, Restore, and the claimed/mine strips are each at least
      44px (`h-11` or taller) — verified by class name, not merely by visual
      inspection.
- [ ] Tapping a card outside its action row opens `loads-detail-sheet.tsx` for
      that load; tapping Reject/Accept/Restore inside the action row does
      **not** also open it (`stopPropagation` verified).
- [ ] `loads-detail-sheet.tsx` renders all four content sections the design
      gives the desktop drawer (header/price, route, cargo grid including
      handling tags, actions) and does not import from or modify
      `src/components/driver-hub/screens/loads-drawer.tsx`.
- [ ] Every handling tag on a load is visible before its Accept button can be
      pressed on a mobile viewport — both as a card pill and inside the sheet.
- [ ] The sheet's Accept action sets the same `dialogId` state the desktop
      drawer's Accept sets, opening the shared confirm dialog from task-12
      unmodified.
- [ ] The sheet's portalled root element carries `data-admin-surface=""`.
- [ ] `available`/`claimed`/`mine` treatments reference
      `HUB_STATUS_TONE_CLASSES` (`neutral` and `success` respectively for the
      latter two) — no new colour literal is introduced for these three
      states.
- [ ] The footer renders the same capacity-hidden sentence as the desktop
      footer, sourced from `board.counts`, not recomputed locally.
- [ ] `pnpm check` passes with no new lint or type errors.

## Notes

- **File-name hedges.** This task assumes task-09 exports a `useLoadsBoard()`
  hook from `loads-board-state.ts`, a top-level screen at `loads-screen.tsx`,
  and a shared `loads-format.ts`. If task-09 landed with different names, wire
  this task's imports to whatever actually exists — the state *shape* (listed
  in Dependencies) is the fixed contract, not any particular file or export
  name.
- **Mobile has no way to reach the rejected list.** The design's mobile
  section carries only the capacity note in its footer, not the desktop
  footer's "`N rejected · view`" toggle. This task does not add one — the
  brief authorises exactly one addition beyond the approved design (the
  detail sheet, for the liability reason above), and a second, unrequested UI
  addition is out of scope. If `board.showRejected` is `true` when a driver is
  on a mobile viewport (e.g. set on desktop, then the window was resized
  narrow), the mobile card list still honours it and renders the rejected
  list — it is simply unreachable *from* mobile. Worth revisiting alongside
  `action-required.md`'s "Reconsider the rejected-list UI" item.
- **Hazmat is still not gated, only visible.** This task makes the handling
  tags visible before acceptance on mobile, which is what it can fix. It does
  not add ADR/certification gating — that remains
  `action-required.md`'s "Gate hazmat loads on driver certification" item,
  unchanged by this task.
- **No multi-stop, no cargo photos.** Per requirements.md's non-goals: render
  stop count as the constant `2` in the sheet, and keep the three cargo-photo
  tiles as dashed placeholders — there is no upload flow anywhere upstream to
  feed them with real images.
