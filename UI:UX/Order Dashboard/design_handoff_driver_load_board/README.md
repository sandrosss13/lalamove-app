# Handoff: Driver Load Board (booking dashboard for drivers)

## Overview
A dashboard where drivers see client bookings ("loads") and claim them on a first-come,
first-served basis. One screen serves all three driver types — individual drivers,
registered companies, and sole proprietors — with no role-specific UI.

Core rules the design encodes:

- Only loads that **fit the signed-in driver's vehicle** (max weight + L×W×H) are ever shown.
  Non-fitting loads are silently filtered out; a footer line states how many were hidden.
- The **first driver to confirm claims the order**. Confirming goes through a dialog; if
  another driver won the race, the driver sees a "just claimed" state instead.
- A driver can **reject** a load, which hides it from their own board (it does not cancel
  the client's booking) and is reversible via a rejected list.

Market: Georgia (country). Cities, addresses, client names and GEL (₾) pricing are Georgian.

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing
intended look and behavior, not production code to copy directly. The task is to
**recreate this design in the target codebase's existing environment** (React, Vue, native,
etc.) using its established patterns, component library, and data layer. If no environment
exists yet, pick the most appropriate framework and implement the design there.

`Driver Load Board.dc.html` is a self-contained HTML prototype: markup with inline styles plus
a single JavaScript class holding all state and derived values. Data is hardcoded in a `LOADS`
array — replace it with the real bookings API.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, states, and copy. Recreate the UI
closely, but express it through the target codebase's design system (the Lalamove UI Kit:
`Table`, `Button`, `Badge`, `Dialog`, `Select`, `Tabs`, `Input`, `Card`) rather than the
prototype's inline styles. Every color below is already a Lalamove token; the mapping is in
**Design Tokens**.

## Screens / Views

### 1. Header (persistent)
**Purpose:** identity, vehicle context, and the desktop/mobile preview switch.

Layout: sticky top bar, `display:flex`, `align-items:center`, `gap:20px`,
padding `14px 24px`, white background, 1px bottom border `oklch(0.922 0 0)`, `z-index:20`
(height ≈ 61px — the drawer's `top` offset depends on it).

Components, left to right:
- **"Load Board"** — 16px / 600 / `letter-spacing:-0.01em`, followed by
  "Bookings open to drivers" at 12px in `oklch(0.556 0 0)`.
- Spacer (`flex:1`).
- **Vehicle pill** — 1px border `oklch(0.922 0 0)`, radius `0.5rem`, padding `5px 10px 5px 8px`.
  Contains a 6px emerald dot `oklch(59.6% 0.145 163.225)`, the label "Vehicle" (12px, muted),
  and the vehicle string: `"Van 5.5t · 1200 kg · 3.2 × 1.7 × 1.9 m"`.
- **Driver identity** — name 13px / 500 right-aligned, type 11px muted
  ("Sole proprietor · verified"), then a 32px circular avatar (background `oklch(0.97 0 0)`,
  1px border, initials 12px / 600).
- **Desktop / Mobile segmented control** — 2px padding wrapper, background `oklch(0.97 0 0)`,
  radius `0.5rem`; the active segment is white with `box-shadow: 0 1px 2px rgba(0,0,0,0.08)`.
  *This switch is a prototype affordance for reviewing both surfaces — in production, drop it
  and use real breakpoints.*

### 2. Desktop — Load board (primary screen)
Page padding `20px 24px 32px` on background `oklch(0.985 0 0)`.

**Tab bar** — `Available loads` and `My loads`, each with a muted count suffix. Tabs are
10px vertical padding, 14px / 500, active tab has a 2px bottom border `oklch(0.145 0 0)` and
`oklch(0.145 0 0)` text; inactive is `oklch(0.556 0 0)`. On the right of the same row, a
**Filters** button (white, 1px border, radius `var(--radius-md)`, 13px / 500) with a dark
count badge (`oklch(0.205 0 0)` bg, 11px, pill radius).

**Filter panel** (open by default, toggled by the Filters button) — white card, 1px border,
radius `0.5rem`, padding `14px 16px`, margin-bottom 14px. Grid:
`repeat(3, minmax(180px, 240px)) 1fr auto`, `gap:16px`, `align-items:end`:
1. **Pick-up city** — `<select>`, 34px tall, options = "All cities" + unique pickup cities, sorted.
2. **Drop-off city** — same, over drop cities.
3. **Cargo weight** — range input, `min=100 max=1200 step=50`, `accent-color: oklch(0.205 0 0)`.
   Label reads "Cargo weight up to 1,200 kg".
4. **Special handling** — chips for `Fragile`, `Cold chain`, `Hazmat`. Selected chip:
   background `oklch(0.145 0 0)`, text `oklch(0.985 0 0)`; unselected: white with
   1px `oklch(0.922 0 0)`. Multi-select, AND semantics (a load must carry every selected tag).
5. **Reset** — 34px, white, muted text, restores all four filters to defaults.

**Loads table** — white card, 1px border, radius `0.5rem`, `overflow:hidden`; table
`width:100%`, `min-width:760px`, `border-collapse:collapse`, font-size 13px.
Header row background `oklch(0.97 0 0)`; header cells 11px / 500 uppercase,
`letter-spacing:0.06em`, muted, `cursor:pointer`, `user-select:none`, padding `9px 14px`.
**All columns sort** (click toggles desc → asc; the active column shows " ↓" / " ↑").

| # | Column | Sort key | Align | Cell content |
|---|---|---|---|---|
| 1 | Route | `route` (pickup city) | left | Line 1: `Pickup → Drop` (500 weight) with distance appended in 11px muted tabular-nums. Line 2: `pickupAddr → dropAddr`, 11px muted, `max-width:300px`. Line 3: load id in IBM Plex Mono 11px muted + client name 11px muted, `gap:8px`. |
| 2 | Pick-up window | `win` | left | Window text; below it "Deadline <deadline>" 11px muted. |
| 3 | Cargo | `cargoType` | left | Cargo type; below it `packaging · volume m³` 11px muted. |
| 4 | Helpers | `helpers` | center | Count badge: min-width 24px, height 24px, pill radius, tabular-nums 12px / 600. Requested → background `oklch(0.145 0 0)`, text `oklch(0.985 0 0)`. None → background `oklch(0.97 0 0)`, muted text, content `—`. |
| 5 | Weight / dims | `weight` | right | `820 kg`; below it dimensions 11px muted. tabular-nums. |
| 6 | Price | `price` | right | `₾190` at 600 weight, `letter-spacing:-0.01em`; below it `₾6/km` 11px muted. tabular-nums. |
| 7 | (actions) | — | right | width 132px. See below. |

Body cells: padding `12px 14px`, `vertical-align:top`, 1px bottom border `oklch(0.922 0 0)`.
Rows are `cursor:pointer` (click selects → opens the drawer). Selected row background
`oklch(0.97 0 0)`; a claimed-by-other row is `opacity:0.6`.

**Actions cell, by status**
- `available` — a right-aligned flex row, `gap:6px`: **Reject** (white, 1px border, muted text;
  hover background `oklch(97.1% 0.013 17.38)`, border `oklch(88.5% 0.062 18.334)`, text
  `oklch(50.5% 0.213 27.518)`) then **Accept** (background `oklch(0.205 0 0)`, text
  `oklch(0.985 0 0)`, 13px / 500, hover `oklch(0.145 0 0)`). Both padded `6px 14px`,
  radius `var(--radius-md)`. Both `stopPropagation` so the row doesn't also select.
  If the load is in the driver's rejected list, these are replaced by a single **Restore** button.
- `claimed` — pill "Claimed": background `oklch(0.97 0 0)`, muted text, 11px / 500.
- `mine` — pill "Yours": background `oklch(97.9% 0.021 166.113)`, text `oklch(50.8% 0.118 165.612)`.

**Empty state** (no rows after filtering) — 48px vertical padding, centered:
"No loads match these filters" (14px / 500) + "Widen the weight range or clear a city to see
more." (13px muted).

**Table footer** — background `oklch(0.97 0 0)`, 1px top border, padding `10px 14px`,
12px muted, `justify-content: space-between`:
- Left: result line, e.g. `"6 loads open to you"` / `"1 load you have claimed"` /
  `"2 loads you rejected"` (singular/plural handled).
- Right: capacity note `"2 loads hidden — over your vehicle capacity or dimensions"`, and,
  when the driver has rejected anything, an underlined text button
  `"2 rejected · view"` / `"Back to open loads"`.

### 3. Load detail drawer (desktop)
Opens on row click. `position:fixed; top:61px; right:0; bottom:0; width:400px;
max-width:92vw; z-index:30`, white, 1px left border, `overflow-y:auto`,
`box-shadow: -8px 0 24px rgba(0,0,0,0.08)`. Hidden entirely when nothing is selected.

Sections, each separated by a 1px `oklch(0.922 0 0)` border, 16px padding:

1. **Header** — load id (IBM Plex Mono 12px / 500) on the left; on the right a status pill
   ("Open · first to confirm" dark / "Claimed" grey / "Yours" emerald) and a 26px square ✕
   close button. Below: price at 26px / 600, `letter-spacing:-0.02em`, tabular-nums, plus
   `"incl. ₾11 waiting allowance"` (6% of price, rounded) at 12px muted.
2. **Route** — two rows, `gap:12px`. Pick-up marker is a filled 8px dot `oklch(0.205 0 0)`;
   drop-off marker is the same size with a 2px ring and transparent center. Each row:
   uppercase 11px `letter-spacing:0.06em` muted label, city at 500, address 12px muted,
   then the time line (pick-up window / "Deliver by <deadline>") at 12px. Below both, indented
   20px, a 12px muted row with distance and stop count.
3. **Cargo** — uppercase muted "Cargo" label, then a `96px 1fr` grid, `row-gap:8px`,
   `column-gap:12px`, 13px, keys muted: Type, Weight, Dimensions, Volume, Packaging,
   Quantity, Handling, **Helpers** ("2 helpers requested" / "No helpers requested").
   Then handling tags as pills (`oklch(0.97 0 0)` bg, 1px border, 11px / 500).
   Then a `repeat(3, 1fr)` photo grid: `aspect-ratio: 4/3`, 1px **dashed** border, background
   `oklch(0.97 0 0)`, centered 10px muted label — these are placeholders for client-uploaded
   cargo photos; wire them to real images.
4. **Actions** — stacked, `gap:8px`:
   - available: **Accept this load** (40px, dark, 14px / 500), **Reject this load** (40px,
     white/outline, destructive hover) or **Restore to open loads** if already rejected, then
     11px muted centered note: "First driver to confirm claims the order. Rejecting only hides
     it from your board."
   - claimed: bordered grey notice "Claimed by another driver 4 min ago. No longer available."
   - mine: emerald notice (`oklch(97.9% 0.021 166.113)` bg, `oklch(90.5% 0.093 164.15)` border,
     `oklch(43.2% 0.095 166.913)` text) "You claimed this load. Contact details are in your job
     sheet." plus an outline **Open job sheet** button (not yet designed — see Open questions).

### 4. Confirm dialog
Overlay `rgba(0,0,0,0.5)`, centered, `z-index:50`. Panel 440px, white, radius `0.75rem`,
`box-shadow: 0 20px 50px rgba(0,0,0,0.25)`.

- Title "Confirm this shipment" (16px / 600) + subtitle 13px muted: "First come, first served.
  Confirming claims the order and closes it to other drivers."
- Summary card (1px border, radius `0.5rem`, margin `16px 20px`): a `92px 1fr` grid, 13px, rows
  Load, Pick-up (city · window), Drop-off (city · by deadline), Cargo (type · packaging),
  **Helpers**, Weight (kg · dims), Distance (km · stops). Footer strip
  (`oklch(0.97 0 0)`, 1px top border): "You are paid" left, price at 20px / 600 right.
- Buttons: **Cancel** (`flex:1`, white outline) and **Confirm and claim** (`flex:1.6`, dark),
  both 40px.

### 5. Lost-the-race dialog
Same overlay. Panel 380px, radius `0.75rem`, 20px padding.
"Just claimed by another driver" (16px / 600) + 13px muted
"<load id> was confirmed a moment before you. It has been removed from your available list."
+ full-width 40px dark **Back to load board** button.

### 6. Mobile — driver view
Rendered inside a 390px-wide frame (white, 1px border, radius `1rem`) centered on the page
with padding `24px 16px 40px`. In production this is the same screen under a mobile breakpoint.

- **Filter row** — pickup `<select>`, a muted `→`, drop-off `<select>`; each `flex:1`, 32px tall,
  12px text. 1px bottom border.
- **Weight row** — `"≤ 1,200 kg"` (11px muted), the range slider (`flex:1`), and the result count
  (11px muted tabular-nums). 1px bottom border.
- **Load cards** — 14px padding, 1px bottom border each:
  - Row 1: `Pickup → Drop` (500) left, price (600, tabular-nums) right, baseline-aligned.
  - Row 2 (12px muted): `cargoType · weight · dims`.
  - Row 3 (12px muted): `window · distance · helpers text`.
  - Row 4, 10px top margin: **Reject** (88px wide, white outline) + **Accept · ₾190**
    (`flex:1`, dark). Both **44px tall** — minimum touch target.
  - claimed: a 44px grey strip "Claimed by another driver".
  - mine: a 44px emerald strip "Yours · view job sheet".
- **Footer** — `oklch(0.97 0 0)` background, 11px muted capacity note.

## Interactions & Behavior
- **Row click** → selects the load and opens the drawer. Action buttons inside the row call
  `stopPropagation` so Accept/Reject don't also change selection.
- **Accept (row or drawer)** → selects the load and opens the confirm dialog.
- **Confirm and claim** → if the load is still `available`, its status becomes `mine` and the view
  switches to the **My loads** tab. If its status changed underneath (someone else claimed it
  first), the dialog closes and the lost-the-race dialog opens instead. This race check is the
  behavior to reproduce server-side: the claim must be an atomic conditional update, and the
  client must handle the losing response.
- **Live claim** — the prototype flips one specific load (`GE-48233`) to `claimed` 6s after mount
  to demonstrate the live state. In production this is a subscription/poll on the board;
  rows should update in place without losing scroll position or selection.
- **Reject** → adds the load id to the driver's rejected list, hides it from the open list, and
  clears selection if it was the selected row. **Restore** removes it again. The footer toggle
  swaps the table between open and rejected lists (`showRejected`), clearing selection.
- **Sorting** — clicking a header sets `sortKey`; clicking the active header toggles direction.
  String keys sort with `localeCompare`, numeric keys numerically. Default: `price` desc.
- **Filters** — all filters AND together and apply on top of the vehicle-fit filter.
  City filters compare exact city names; weight is an upper bound; handling chips require every
  selected tag to be present.
- **Hover states** — dark buttons darken to `oklch(0.145 0 0)`; white buttons go to
  `oklch(0.97 0 0)`; Reject shifts to the destructive tint listed above.
- **Responsive** — the prototype swaps whole layouts via the header toggle. In production, drive
  it from breakpoints: table + drawer on desktop, stacked cards on mobile. The table needs a
  horizontal scroll container below ~760px if it's ever shown narrow.

## State Management
Prototype state (all in one class; map to your store):

| State | Type | Notes |
|---|---|---|
| `mode` | `"desktop" \| "mobile"` | prototype-only preview switch |
| `tab` | `"available" \| "mine"` | |
| `filtersOpen` | boolean | filter panel visibility, default `true` |
| `fPickup`, `fDrop` | string | `"All cities"` = no filter |
| `fWeight` | number | upper bound kg, default 1200 |
| `fTags` | string[] | selected handling tags |
| `sortKey`, `sortDir` | string / `"asc" \| "desc"` | default `price` / `desc` |
| `selectedId` | string \| null | drawer target; `null` = drawer hidden |
| `dialogId` | string \| null | confirm dialog target |
| `lostId` | string \| null | lost-the-race dialog target |
| `rejected` | string[] | driver-scoped rejected load ids (persist per driver) |
| `showRejected` | boolean | table shows rejected list instead of open loads |
| `statuses` | `Record<id, "available" \| "claimed" \| "mine">` | server-owned in production |
| `claimedAgo` | `Record<id, string>` | relative time for the claimed notice |

Derived: the visible list = vehicle-fit filter → tab/rejected filter → city/weight/tag filters →
sort. Counts (`availCount`, `mineCount`, `activeFilterCount`, hidden-by-capacity) come from the
same pipeline.

**Vehicle fit** (`fits(load)` in the prototype): `load.weight <= vehicleCapacityKg` AND each of
the load's three parsed dimensions ≤ the vehicle's `3.2 × 1.7 × 1.9 m`. Dimensions are parsed
from a display string in the prototype — in production carry `lengthM`, `widthM`, `heightM` as
numbers on both the load and the vehicle, and run this filter **server-side** so a driver can
never see or claim a load their vehicle can't carry.

### Data fetching
- `GET` board: bookings filtered by the driver's vehicle profile, excluding the driver's rejected
  ids, with status per load.
- `POST` claim: atomic — succeeds only if still unclaimed; returns the winner otherwise.
- `POST` / `DELETE` reject: driver-scoped hide, reversible.
- Live updates: subscription or short poll for status changes.

### Load model (per the prototype's `LOADS`)
`id, client, pickupCity, pickupAddr, dropCity, dropAddr, win, deadline, cargoType,
weight (kg), dims (string), vol (m³), packaging, qty, helpers (number), tags[], help,
km, price (GEL), stops, photos (count), status, claimedAgo?`

## Design Tokens
Everything below is from the Lalamove UI Kit; prefer the token/utility over the literal.

**Colors**
| Value | Role | Lalamove token |
|---|---|---|
| `oklch(0.145 0 0)` | primary text, active tab underline, selected chip | `--foreground` |
| `oklch(0.205 0 0)` | primary button background, slider accent, markers | `--primary` / `bg-primary` |
| `oklch(0.985 0 0)` | text on primary; page background | `--primary-foreground` / `--background` |
| `oklch(0.556 0 0)` | secondary/muted text | `--muted-foreground` |
| `oklch(0.97 0 0)` | muted surfaces: table header, footers, pills, avatar | `--muted` / `--accent` |
| `oklch(0.922 0 0)` | all 1px borders | `--border` |
| `#ffffff` | card / table / drawer surface | `--card` / `--popover` |
| `oklch(50.5% 0.213 27.518)` | Reject hover text | `--color-red-600` family / `--destructive` |
| `oklch(88.5% 0.062 18.334)` | Reject hover border | `--color-red-200` |
| `oklch(97.1% 0.013 17.38)` | Reject hover background | `--color-red-50` |
| `oklch(59.6% 0.145 163.225)` | vehicle-ready dot | `--color-emerald-500` |
| `oklch(50.8% 0.118 165.612)` | "Yours" pill text | `--color-emerald-700` |
| `oklch(43.2% 0.095 166.913)` | claimed-by-you notice text | `--color-emerald-800` |
| `oklch(90.5% 0.093 164.15)` | claimed-by-you notice border | `--color-emerald-200` |
| `oklch(97.9% 0.021 166.113)` | claimed-by-you notice / "Yours" background | `--color-emerald-50` |
| `rgba(0,0,0,0.5)` | dialog overlay | — |

**Typography** — IBM Plex Sans throughout (`font-body` / `font-display`); IBM Plex Mono for load
ids. Scale in use: 26px/600 (drawer price), 20px/600 (dialog price), 16px/600 (titles),
14px (tabs, buttons, body), 13px (table body, secondary buttons), 12px (meta, selects),
11px (column headers, captions, pills), 10px (photo placeholders).
`letter-spacing:-0.02em` on the two large prices, `-0.01em` on 16px titles and table prices;
`0.06em` uppercase on column headers and drawer section labels.
All numeric columns and prices use `font-variant-numeric: tabular-nums`.

**Spacing** — 24px page gutter, 20px section padding, 16px drawer section padding,
`12px 14px` table cells, `9px 14px` table headers, gaps of 6 / 8 / 12 / 16 / 20 / 24px.

**Radius** — `var(--radius-md)` (0.375rem) on buttons, selects, inputs, notices;
`0.5rem` on cards, the table shell, the filter panel, the vehicle pill; `0.75rem` on dialogs;
`1rem` on the mobile frame; `999px` on all pills and badges.

**Shadows** — drawer `-8px 0 24px rgba(0,0,0,0.08)`; dialog `0 20px 50px rgba(0,0,0,0.25)`;
active segment `0 1px 2px rgba(0,0,0,0.08)`.

**Surface requirement** — the whole composition sits inside a `data-admin-surface` root with
`font-body`. Without that attribute the Lalamove `bg-accent` / `bg-muted` / border tokens resolve
to the marketing palette. Light mode only; no dark variant exists for this token set.

## Assets
No images or icons. `→`, `✕`, `↑`, `↓`, `—`, `≤` are text glyphs. The three cargo photo tiles in
the drawer are dashed placeholders awaiting real client-uploaded photos. Fonts (IBM Plex Sans /
Mono `.woff2`) ship in `fonts/`, referenced from `fonts/fonts.css`.

## Files
- `Driver Load Board.dc.html` — the full prototype (markup + inline styles + the state class,
  including the hardcoded `LOADS` data).
- `styles.css` — design system entry; `@import`s `fonts/fonts.css` and `_ds_bundle.css`.
- `_ds_bundle.css` — compiled Lalamove UI Kit stylesheet with all 267 tokens.
- `fonts/` — IBM Plex Sans / Mono woff2 files and `fonts.css`.

## Open questions carried out of design
1. **Fleet assignment.** A registered company claims with its account, not a specific truck or
   employee driver. Two options were discussed and neither is designed yet: pick a vehicle/driver
   inside the confirm dialog (matching then runs against that vehicle), or claim first and assign
   from the job sheet afterwards. The second suits how fleets operate — claim fast, assign after.
2. **Job sheet.** The "Open job sheet" button in the drawer has no destination designed yet;
   client contact details and proof-of-delivery live there.
3. **Reject semantics.** Currently a personal hide. Confirm whether it should also inform
   dispatch or affect the driver's ranking.
