# Task 11: Load detail drawer

## Status

pending

## Wave

4

## Description

The 400px right-hand detail drawer that opens when a driver selects a row on
the load board (`/dashboard/loads`) — the surface where a driver reads a
load's full route, cargo specification and handling requirements before
accepting or rejecting it, and the only place on desktop that shows every
handling tag, the packaging/quantity free text and the per-load compliance
warnings the table's seven columns have no room for. Implements section 3 of
the design handoff (`UI:UX/Order Dashboard/design_handoff_driver_load_board/README.md`)
verbatim: header, route, cargo and actions. Every money figure it renders is
the driver's 85% payout, never the client's `Order.price`, and because this
component portals outside the driver hub shell's root it must repeat
`data-admin-surface=""` on itself or its Lalamove tokens silently resolve to
the wrong palette. This task covers the **desktop** drawer only; the mobile
bottom sheet is task-13's separate surface.

## Dependencies

**Depends on:** task-09-board-shell
**Blocks:** None

**Context from dependencies:** task-09 builds the board route at
`/dashboard/loads`, the hub nav entry, the header, the `Available loads` /
`My loads` tabs, the filter panel, and a shared board state container holding
`tab`, filters, `sortKey`/`sortDir`, `selectedId` (the id of the load this
drawer targets — `null` hides the drawer entirely), `dialogId` (the confirm
dialog's target, set when the driver clicks Accept), `lostId`, `rejected`
(the driver's client-known list of rejected load ids) and `showRejected`. It
also creates **this task's file as an unfinished placeholder** already
imported and rendered by the board screen whenever `selectedId !== null` —
this task replaces that placeholder's body, it does not create the file from
nothing. If task-09 lands with the placeholder under a different path or
component name than the one this task declares below, treat this task's name
as the contract and update the board screen's import to match, not the
reverse — this file is the source of truth for the drawer's public interface,
the same way task-01-schema-and-migration.md is the source of truth for the
column names every other task quotes.

Loads come from `GET /api/loads` (task-06), which returns, per row: `id`,
`reference` (`GE-48210` form, IBM Plex Mono), a client name, `pickupAddress` /
`pickupCity`, `dropoffAddress` / `dropoffCity`, `pickupWindowStart` /
`pickupWindowEnd` / `deliveryDeadline`, `cargoCategory`, `cargoWeightKg`,
`cargoLengthM` / `cargoWidthM` / `cargoHeightM`, `packagingDescription`,
`itemQuantity`, `handlingTags` (an array of `FRAGILE` / `COLD_CHAIN` /
`HAZMAT` / `TIME_CRITICAL` / `UPRIGHT_ONLY` / `HEAVY_ITEM`), `helperCount`,
`distanceKm`, `pickupDistanceKm` (nullable, distance from the driver's own
current position — not used by this drawer; see the Route section below),
`driverPayout`, a per-km driver rate, `createdAt`, and a row `state` of
`"available" | "claimed" | "mine"`. Reject and restore are `POST` /
`DELETE /api/loads/[id]/reject` (task-07). Claiming (task-08) returns 409 with
the load's `reference` when another driver won the race, and a distinct
response when the calling driver is offline — this drawer never calls the
claim endpoint itself (see Actions, below); it only opens the confirm dialog
(task-12), which owns that request.

**This task also requires one field `GET /api/loads` does not yet enumerate
in the list above: `bodyType` (`ChassisType | null` — `"DRY_BOX" |
"REFRIGERATED" | "OPEN_CHASSIS"`, mirroring `Order.bodyType`).** It is needed
for the COLD_CHAIN mismatch note below. If task-06's implementation does not
already select and return it by the time this task is built, add
`bodyType: true` to its Prisma `select` and the matching field on its
response type. This is a strictly additive field: it does not change any
value task-10 (table) or task-13 (mobile) already renders, and neither of
those tasks needs to read it.

## Files to Create

None — see Files to Modify.

## Files to Modify

- `src/components/driver-hub/screens/loads-detail-drawer.tsx` — task-09
  creates this as a placeholder; this task replaces its contents with the
  full drawer described below, exporting `LoadsDetailDrawer` as a named
  export.

## Technical Details

### The money rule — read this before anything else

Every figure this component renders is `driverPayout`, the value
`GET /api/loads` already resolves server-side as the driver's 85% share of
`Order.price` (computed once at order creation by `driverPayoutFor` in
`src/lib/orders/payout.ts`, stored on the order, never recomputed here).
**`price` must never be imported, requested, destructured or rendered by this
component — not even to derive a secondary figure.** The design's header
sub-line reads "incl. ₾11 waiting allowance" and describes it as "6% of
price, rounded" — this component instead computes it as **6% of
`driverPayout`**, because `price` is not and must never be available to a
driver-facing component. Document this substitution in the component's own
doc comment so a future reader does not "fix" it by reaching for `price`.
Round with the same whole-cent rule used everywhere else in this codebase
(`Math.round(value * 100) / 100`) and format with two decimals via the same
`₾` formatter as the headline figure — the design's own example text ("₾11")
happens to be a whole number because its sample data is, not because this
label is meant to drop decimals; every other money string in this codebase
renders two decimals uniformly (see `formatGel` in
`src/components/driver-hub/screens/jobs-format.ts`), and this label is not
the place to introduce the one exception.

### `data-admin-surface`

This drawer is `position: fixed`, so React portals it (or CSS-positions it)
outside the normal document flow the hub shell's `data-admin-surface` root
wraps — either way, repeat `data-admin-surface=""` on the drawer's own
outermost element. Without it, the Lalamove `bg-accent` / `bg-muted` /
border tokens this component reaches for resolve to the marketing site's
palette instead. See the doc comment on `DriverHubShell` in
`src/components/driver-hub/driver-hub-shell.tsx` and the precedent this
codebase already has for a portalled Radix element repeating the attribute.

### Row type

Define locally (or import from wherever task-09/task-06 already export an
identical shape — do not fork the field names if one already exists by the
time this is built; this local definition is an acceptable, structurally
compatible fallback either way):

```ts
type LoadRowState = "available" | "claimed" | "mine";

type LoadBoardRow = {
  id: string;
  reference: string;
  clientName: string;
  pickupAddress: string;
  pickupCity: string;
  dropoffAddress: string;
  dropoffCity: string;
  pickupWindowStart: string | null; // ISO
  pickupWindowEnd: string | null; // ISO
  deliveryDeadline: string | null; // ISO
  cargoCategory: CargoCategory;
  // Guaranteed non-null for every row GET /api/loads returns: task-03's
  // loadFits() excludes any load with a null weight or dimension from every
  // driver's board (unknown is treated as "does not fit", never "fits" —
  // see specs/driver-load-board/requirements.md's Assumptions and
  // task-03-vehicle-fit.md's null-handling rule). This drawer therefore never
  // needs an empty-value fallback for these four fields.
  cargoWeightKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
  packagingDescription: string | null;
  itemQuantity: string | null;
  handlingTags: CargoHandlingTag[];
  helperCount: number;
  distanceKm: number;
  pickupDistanceKm: number | null; // not used by this drawer
  driverPayout: number;
  driverRatePerKm: number; // not used by this drawer
  createdAt: string; // ISO, not used by this drawer
  state: LoadRowState;
  bodyType: ChassisType | null; // see "one field this task adds" above
};
```

Import the three enum *types* only (never the runtime enum object) from
`@prisma/client`, matching the pattern `src/lib/cargo.ts` already
establishes for exactly this reason — this is a `"use client"` component, and
importing an enum's runtime object here risks pulling Prisma's client runtime
into the browser bundle:

```ts
import type { CargoCategory, CargoHandlingTag, ChassisType } from "@prisma/client";
```

### Props

```ts
export type LoadsDetailDrawerProps = {
  /** The selected row, or `null` to render nothing (drawer hidden). */
  load: LoadBoardRow | null;
  /** Whether `load.id` is currently in the driver's rejected list. */
  isRejected: boolean;
  /** Clears `selectedId` — the ✕ button. */
  onClose: () => void;
  /** Opens the confirm dialog for this load — sets `dialogId`. */
  onAccept: (loadId: string) => void;
  /** Calls `POST /api/loads/[id]/reject` and refreshes the board's list. */
  onReject: (loadId: string) => void;
  /** Calls `DELETE /api/loads/[id]/reject` and refreshes the board's list. */
  onRestore: (loadId: string) => void;
};
```

This component is deliberately presentational: it owns no fetch of its own
and no board-wide state. `onReject` / `onRestore` are expected to be thin
wrappers the board screen (task-09) supplies around the reject API and a
refetch — this task does not specify or depend on how that wrapper is
implemented internally, only that calling it performs the action described.
Render nothing (`return null`) when `load === null`.

### 1. Header

```
[reference, mono 12px/500]                [status pill]  [✕ 26px square]
[driverPayout, 26px/600, -0.02em, tabular-nums]
[incl. ₾{waitingAllowance} waiting allowance, 12px muted]
```

- The ✕ button calls `onClose`. 26px square, matches the drawer's own
  padding rhythm — a plain `<button>` (or `Button` `variant="ghost"
  size="icon-sm"`) with an `X` icon (`lucide-react`, already a dependency —
  see `dialog.tsx`'s own close button) and `sr-only` "Close" text.
- `waitingAllowance = roundCurrency(load.driverPayout * 0.06)` — see the
  money rule above for why this is 6% of `driverPayout`, not of `price`.

**Status pill — map onto `hub-status.ts`'s six tones, invent no new colour
pair.** Import `HUB_STATUS_TONE_CLASSES` and the `HubStatusTone` type from
`src/components/driver-hub/hub-status.ts`. The design's three pill states use
literal colours (dark/grey/emerald) that do not correspond to words already
in that module's `TONE_BY_STATUS` map, so build a small local lookup instead
of calling `hubStatusTone()`:

```ts
const DRAWER_STATUS_TONE: Record<LoadRowState, HubStatusTone> = {
  // "Open · first to confirm" — urgent, wants the driver to act now. The
  // closest of the six existing tones is `warning` (Pending / Invited / Due
  // soon): "still fine, but needs the driver to do something soon" is
  // exactly what an open, racing load is.
  available: "warning",
  // "Claimed" (by someone else) — settled, no longer actionable. Matches
  // `neutral` (Offline / Idle / Defleeted): a real, deliberate state that is
  // not an alert.
  claimed: "neutral",
  // "Yours" — the state the driver wants. Matches `success` (Completed /
  // Paid / Active), the same family the design's own emerald pill implies.
  mine: "success",
};

const DRAWER_STATUS_LABEL: Record<LoadRowState, string> = {
  available: "Open · first to confirm",
  claimed: "Claimed",
  mine: "Yours",
};
```

A rejected load (`isRejected === true`) keeps the `available` pill and label
— rejecting only changes what this driver's own board shows, not the load's
real server-side status, so there is nothing new to represent in the pill.

Render the pill the same way `HubStatusBadge` renders its own (11px/500,
`rounded-full`, `border-transparent`, `px-[9px] py-[3px]`), spreading
`HUB_STATUS_TONE_CLASSES[DRAWER_STATUS_TONE[load.state]]` — do not import
`HubStatusBadge` itself, since its `status` prop expects a word from
`TONE_BY_STATUS`'s vocabulary and these three pill strings are not in it.

### 2. Route

Two rows, `gap-3` (12px):

```
● PICK-UP          {pickupCity}                                {pickupWindowStart–pickupWindowEnd or "—"}
  {pickupAddress}
○ DROP-OFF         {dropoffCity}                                Deliver by {deliveryDeadline or "—"}
  {dropoffAddress}
      {distanceKm} · 2 stops   ← indented 20px (dot width + gap), 12px muted
```

- Pickup marker: filled 8px circle, `bg-[oklch(0.205_0_0)]`.
- Dropoff marker: same 8px size, 2px ring, transparent centre —
  `border-2 border-[oklch(0.205_0_0)] bg-transparent` on a `size-2` (8px)
  span (the ring reads as the same visual weight as the filled dot at this
  size).
- Label: uppercase 11px, `tracking-[0.06em]`, muted.
- City: 12px, `font-medium`. Address: 12px, muted.
- Time line: pickup row shows the window (`formatClock(pickupWindowStart)` –
  `formatClock(pickupWindowEnd)`, or `"—"` if either is `null`); dropoff row
  shows `"Deliver by {formatDeadline(deliveryDeadline)}"`, or `"—"` if null.
  Pin every formatter to the hub's shared timezone constant —
  `import { HUB_TIME_ZONE } from "@/lib/dashboard/hub/timezone"` — the same
  module `jobs-format.ts` pins to, so a pickup window never reads four hours
  wrong the way an unzoned formatter would.
- The distance/stop-count line is **not** `pickupDistanceKm` (that column is
  the load's distance from the *driver's current position*, which
  `specs/driver-load-board/requirements.md`'s Assumptions note is
  "frequently stale or null" and is not part of the design's section 3 —
  leave it unused here). It is `load.distanceKm`, the load's own
  pickup-to-dropoff trip distance, formatted with one decimal: `` `${km.toFixed(1)} km` ``.

**Stop count is a constant `2`, not derived from any field.** The prototype's
sample data shows a `stops: 3` load, but the schema supports exactly one
pickup and one dropoff — `specs/driver-load-board/requirements.md`'s
Non-Goals states this explicitly ("No multi-stop... Render the stop count as
a constant 2"). Hard-code the string `"2 stops"`; do not look for a `stops`
field on the row, because one does not exist.

### 3. Cargo

Uppercase muted "Cargo" label, then an 8-row `96px 1fr` grid (`gap-x-3
gap-y-2`, 13px, keys muted):

| Key | Value |
|---|---|
| Type | `CARGO_CATEGORY_LABELS[load.cargoCategory]` — import from `@/lib/cargo`, do not duplicate this map |
| Weight | `` `${Math.round(load.cargoWeightKg)} kg` `` |
| Dimensions | `` `${l} × ${w} × ${h} m` `` , each axis `toFixed(1)` |
| Volume | see below |
| Packaging | `load.packagingDescription ?? "—"` |
| Quantity | `load.itemQuantity ?? "—"` |
| Handling | comma-joined handling-tag labels, or `"None declared"` if `handlingTags.length === 0` |
| Helpers | `load.helperCount === 0 ? "No helpers requested" : \`${count} helper${count === 1 ? "" : "s"} requested\`` |

**Volume is not a stored column — derive it as `length × width × height`, in
m³, rounded to one decimal place**, matching the one-decimal convention this
codebase already uses for distance (`formatDistanceKm` in
`jobs-format.ts`) and for the Dimensions row above:

```ts
function formatVolumeM3(lengthM: number, widthM: number, heightM: number): string {
  return `${(lengthM * widthM * heightM).toFixed(1)} m³`;
}
```

After the grid, if `handlingTags.length > 0`, render each tag as a pill
(`bg-muted`, 1px `border-border`, `rounded-full`, 11px/500,
`px-[9px] py-[3px]`) using a **locally defined** label map covering all six
values — the filter panel (task-09) may expose only the first three as
filter chips per `specs/driver-load-board/action-required.md`'s "review the
handling-tag vocabulary" item, but every load that carries any of the six
must be able to show its pill here, so do not reuse a partial map task-09
might define for its filter chips:

```ts
const HANDLING_TAG_LABELS: Record<CargoHandlingTag, string> = {
  FRAGILE: "Fragile",
  COLD_CHAIN: "Cold chain",
  HAZMAT: "Hazmat",
  TIME_CRITICAL: "Time critical",
  UPRIGHT_ONLY: "Upright only",
  HEAVY_ITEM: "Heavy item",
};
```

If `handlingTags.length === 0`, render no pills row at all (the grid's
Handling row already said "None declared"; an empty pill row would be a
blank line under it).

Then a `repeat(3, 1fr)` photo grid, `aspect-ratio: 4/3`, 1px **dashed**
border (`border border-dashed border-border`), `bg-muted`, centred 10px
muted text. **These three tiles are permanent dashed placeholders — there is
no cargo photo upload anywhere in the client booking flow to feed them, and
`GET /api/loads` carries no photo field at all.**
`specs/driver-load-board/requirements.md`'s Non-Goals states this
explicitly: "No cargo photos... there is no cargo photo upload anywhere in
the client booking flow to feed them. Do not add one." Render exactly three
static tiles, unconditionally, on every load, each labelled e.g. `"Photo"` —
do not build an upload control, do not gate the count on any field, and do
not remove the tiles for a load that has no photos (every load has no
photos; that is the permanent state of this feature).

### 4. Actions

Stacked, `gap-2` (8px). Branch on `load.state` and `isRejected`:

**`available`, not rejected:**
- "Accept this load" — `Button` default variant, `h-10` (40px), 14px/500,
  `onClick={() => onAccept(load.id)}`.
- "Reject this load" — outline, `h-10`, with the design's destructive hover:
  `hover:bg-[oklch(97.1%_0.013_17.38)] hover:border-[oklch(88.5%_0.062_18.334)] hover:text-[oklch(50.5%_0.213_27.518)]`, `onClick={() => onReject(load.id)}`.
- Below both: 11px muted centred note — "First driver to confirm claims the
  order. Rejecting only hides it from your board."

**`available`, rejected (`isRejected === true`):**
- A single "Restore to open loads" button (outline, `h-10`) in place of the
  Accept/Reject pair, `onClick={() => onRestore(load.id)}`. No accept action
  is offered for a load the driver has hidden — restoring it first is the
  only path back to accepting it, matching the table's own row-state
  behaviour.

**`claimed`:**
- A bordered grey notice (`bg-muted`, 1px `border-border`, `rounded-md`,
  13px): "Claimed by another driver. No longer available." **`GET
  /api/loads` carries no claim timestamp**, so the design's own copy — "…4
  min ago…" — cannot be reproduced; this is a deliberate, documented
  deviation from the design's literal text, not an oversight. If a
  `claimedAt` timestamp is added to the row payload in a later task, restore
  the relative-time wording then.

**`mine`:**
- An emerald notice (`bg-[oklch(97.9%_0.021_166.113)]`,
  `border-[oklch(90.5%_0.093_164.15)]`, `text-[oklch(43.2%_0.095_166.913)]`,
  1px border, `rounded-md`, 13px): "You claimed this load. Contact details
  are in your job sheet."
- An outline **"Open job sheet"** button, `h-10`, that **ships disabled**.
  There is no job-sheet screen to link to —
  `specs/driver-load-board/requirements.md`'s Non-Goals: "No job sheet. The
  drawer's 'Open job sheet' button is designed but has no destination.
  Render it disabled with a tooltip; do not invent the screen." Do not build
  a placeholder route or a dead link. Disable the button (`disabled`), give
  it a `title` explaining why (matching the `NOT_ACTIVATED_TITLE` pattern in
  `src/components/driver-hub/hub-online-toggle.tsx`, since `title` alone is
  not reliably announced to assistive tech, pair it with visible or
  `sr-only` text carrying the same message) — e.g. "Job sheet isn't built
  yet. Client contact details and proof of delivery will live there." This
  gap is tracked in `specs/driver-load-board/action-required.md`'s "Design
  the job sheet" item; cite it in the component's doc comment.

**Compliance notes, additive on top of the state-specific block above (not a
replacement for it), shown whenever they apply regardless of `load.state`:**

- **HAZMAT.** If `load.handlingTags.includes("HAZMAT")`, render a warning
  note above the state-specific action block, using the `warning` tone's
  colour pair from `HUB_STATUS_TONE_CLASSES` (do not invent a new amber):
  "Hazmat cargo. Confirm you and your vehicle hold a valid ADR
  certification before accepting — this isn't checked automatically."
  **Nothing in the schema gates this.** `DriverLicence` has no certification
  field, so any licensed driver can claim a hazmat load regardless of
  whether they hold an ADR certification — this note is advisory only, not
  a control. `specs/driver-load-board/requirements.md`'s Non-Goals: "No
  ADR/hazmat certification gating... Hazmat loads are tagged and warned
  about, not gated." `specs/driver-load-board/action-required.md`'s "Gate
  hazmat loads on driver certification" item tracks the real compliance
  exposure this leaves — cite both in the component's doc comment so
  nobody mistakes this note for enforcement.
- **COLD_CHAIN / body-type mismatch.** If
  `load.handlingTags.includes("COLD_CHAIN")` **and** `load.bodyType !==
  "REFRIGERATED"` (this includes `bodyType === null`, i.e. no body type was
  declared at all), render a neutral note: "This load needs cold-chain
  handling, but wasn't booked with a refrigerated body. Confirm your vehicle
  can keep it cold before accepting." The handling tag describes a
  requirement of the **cargo**; `bodyType` (from `ChassisType`) describes a
  property of the **vehicle body** the client picked at booking — they are
  two different questions and can disagree (a client can declare cold-chain
  cargo without having picked a refrigerated body). Document this
  distinction in the doc comment, matching the reasoning already recorded
  on the `CargoHandlingTag` enum in `prisma/schema.prisma`.

### `bodyType` label (local, small enum — do not import a private helper)

`src/lib/dashboard/hub/jobs.ts` has an unexported `toHubBodyType` switch that
does the same mapping; it is not exported, so do not import it. Write a local
equivalent:

```ts
function bodyTypeLabel(bodyType: ChassisType | null): string {
  switch (bodyType) {
    case "DRY_BOX":
      return "Dry box";
    case "REFRIGERATED":
      return "Refrigerated";
    case "OPEN_CHASSIS":
      return "Open chassis";
    case null:
      return "Not specified";
  }
}
```

(Not used in the grid — the grid has no body-type row — only in the
mismatch note's reasoning above, and it is fine to omit this helper entirely
if the note's copy does not need to name the booked body type.)

## Acceptance Criteria

- [ ] `src/components/driver-hub/screens/loads-detail-drawer.tsx` exports
      `LoadsDetailDrawer`, matching `LoadsDetailDrawerProps` above, and
      returns `null` when `load === null`.
- [ ] The drawer's outermost element carries `data-admin-surface=""`.
- [ ] Neither `Order.price` nor any variable/prop named `price` is read,
      imported or referenced anywhere in the file — verified by grep. The
      "incl. ₾X waiting allowance" line is computed from `driverPayout * 0.06`
      and rendered with the same two-decimal `₾` formatting as the headline
      figure.
- [ ] The header renders `reference` (mono), the status pill, the ✕ close
      button (calls `onClose`), `driverPayout` at 26px/600 tabular-nums, and
      the waiting-allowance sub-line.
- [ ] Every one of the three row states (`available`, `claimed`, `mine`)
      maps to one of `hub-status.ts`'s six `HubStatusTone` values — no new
      colour pair is introduced in this file, verified by grep for
      `oklch(` strings that do not already appear in `hub-status.ts`.
- [ ] The route section renders the pickup (filled dot) and dropoff (ringed
      dot) rows with city, address and time line, plus a distance line that
      always reads `"{distanceKm} km · 2 stops"` — the `2` is a hard-coded
      literal, not derived from any field on the row.
- [ ] The cargo grid renders exactly the eight rows Type, Weight,
      Dimensions, Volume, Packaging, Quantity, Handling, Helpers, in that
      order, with Volume computed as `length × width × height` rounded to
      one decimal place.
- [ ] Handling pills render one per tag in `handlingTags`, covering all six
      `CargoHandlingTag` values with a label, and render nothing when
      `handlingTags` is empty.
- [ ] The photo grid always renders exactly three dashed placeholder tiles,
      regardless of any load's data — no upload control, no image
      rendering, no field on `LoadBoardRow` is read to decide how many to
      show.
- [ ] `available` + not rejected renders Accept/Reject; `available` +
      rejected renders a single Restore button; `claimed` renders the grey
      notice without a relative-time claim ("no `claimedAt` on the API"
      documented in a comment); `mine` renders the emerald notice and a
      **disabled** "Open job sheet" button carrying an explanatory
      `title`.
- [ ] A load whose `handlingTags` includes `HAZMAT` renders the advisory
      warning note, and the component's doc comment states plainly that
      nothing gates it.
- [ ] A load whose `handlingTags` includes `COLD_CHAIN` and whose
      `bodyType !== "REFRIGERATED"` (including `null`) renders the mismatch
      note; a `COLD_CHAIN` load with `bodyType === "REFRIGERATED"` renders
      no such note.
- [ ] `pnpm check` passes with no lint or type errors.

## Notes

- This task does not touch `src/components/driver-hub/screens/loads-screen.tsx`,
  `loads-table.tsx`, the board's state container, or any mobile-view file —
  those belong to task-09, task-10 and task-13 respectively, running in the
  same wave. If any of those files do not yet exist when this task starts,
  do not create them; build this drawer against the props interface defined
  above and let the board screen's own task wire the call site.
- Small formatters (`formatVolumeM3`, a clock formatter pinned to
  `HUB_TIME_ZONE`, etc.) are defined locally in this file rather than
  imported from `jobs-format.ts` or another screen's format module. This
  matches the codebase's existing convention — every hub screen
  (`jobs-format.ts`, `vehicles-format.ts`, `drivers-format.ts`, …) owns its
  own small formatter module rather than sharing one across screens — and
  avoids this task depending on a shared `loads-format.ts` that may or may
  not exist yet, which would risk a conflict with task-10 or task-13 editing
  the same file in the same wave.
- The design's confirm/lost-race dialogs, and how "Accept" flows into them,
  are task-12's file, not this one — `onAccept` here only opens that dialog
  by id; it does not call the claim endpoint.
