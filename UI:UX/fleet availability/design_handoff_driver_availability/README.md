# Handoff: Driver availability Gantt

## Overview
A back-office scheduling board that shows, for one date, when each **driver** is free and when they are committed. Rows are drivers; the horizontal axis is time. Dispatchers use it to find who can take the next order; a driver-facing variant uses the same board to see their own day.

The reference prototype in this bundle is the **vehicle–driver pair** version of the same board (`reference/Fleet Availability.dc.html`). The task is to implement the **driver-row** version described here in the real app. Everything about the board — filters, timeline, bar states, tooltip, drag-to-hold, Excel export — carries over unchanged; only the row model and one column of row metadata differ (see "Driver row model").

## About the design files
The file in `reference/` is a **design reference created in HTML** — a prototype showing intended look and behaviour, not production code to copy. Recreate it inside `lalamove-app` using the codebase's existing environment and patterns: Next.js App Router, React, Tailwind v4 with the `oklch` token set in `src/app/globals.css`, and the shadcn-style primitives already in `src/components/ui/` (`button`, `select`, `input`, `popover`, `dialog`, `checkbox`, `label`, `table`). Do not add a Gantt/chart library — the timeline is plain absolutely-positioned divs over a CSS-gradient grid, which is what the prototype does and what keeps it inside the token system.

## Fidelity
**High-fidelity.** Colours, type sizes, spacing, row heights, bar geometry and copy below are final. Recreate them exactly, but source every neutral from the existing tokens (`bg-card`, `border-border`, `text-muted-foreground`, `bg-muted`) rather than hardcoding the greys. The five status colours and the "now" marker are the only literal hex values.

## Screens / Views

### Driver availability (one screen)
Lives in the admin surface. Suggested route `/admin/(sections)/fleet/driver-availability`, rendered through `AdminSectionLayout` (`src/components/admin/admin-section-layout.tsx`) so it inherits the section heading and tabs. The whole composition must sit inside an element carrying `data-admin-surface` and `font-body` (that is how the neutral admin token set and IBM Plex resolve).

**Purpose.** Answer "who is free, and when" for a chosen date, narrowed by city, vehicle type, capacity, driver and status; then export the answer to Excel.

**Page layout** — single column, `padding: 24px 24px 40px`, `gap: 16px`, page background `#faf9f6`:

1. **Header row** — `display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:16px`.
   - Left: `h1` in `font-display`, `20px/600`, `letter-spacing:-0.01em`, text `Driver availability`. Under it a `13px` `text-muted-foreground` summary line: `{n} of {total} drivers free at {HH:MM} · {fleet} in fleet`.
   - Right: `Button variant="outline" size="sm"` — `Reset filters`; `Button size="sm"` (primary) — `Export to Excel`.
2. **Filter card** — `bg-card`, `1px solid var(--border)`, `border-radius:12px`, `padding:14px 16px`, `gap:14px`, two stacked blocks.
   - **Controls block**: `flex-wrap` row, `gap:16px`, each control a `flex-column; gap:5px` with an uppercase label above it (`11px/600`, `letter-spacing:0.04em`, `text-muted-foreground`).
     - **Date**: `Button size="icon" variant="outline"` `‹`, `Input type="date"` (`width:158px`, `h-9`), `Button size="icon" variant="outline"` `›`, `Button variant="ghost" size="sm"` `Today`.
     - **From** / **To**: two `Select`s, `104px` wide, options `00:00`–`23:00` and `01:00`–`24:00`. `From` clamps to `To − 1h`, `To` clamps to `From + 1h`.
     - **City** (`148px`): `All cities` + the 8 cities seeded from `GEORGIAN_CITY_OPTIONS` (`src/lib/georgian-cities.ts`) — use the real enum in production.
     - **Vehicle type** (`176px`): `All types` + `VEHICLE_CLASSES` from `src/lib/driver-onboarding/vehicle-classes.ts` (Small Van, Large Van, Medium Truck, Heavy Freight Truck, Trailer Truck). For a driver row this is the class of the vehicle the driver is assigned to.
     - **Capacity** (`150px`): `Any capacity`, `Up to 2 t`, `2 – 8 t`, `8 – 18 t`, `18 t and above`.
     - **Status** (`168px`): `All statuses` + the five status labels.
     - **Driver** (`200px`): a **searchable combobox**, not a `Select`. `PopoverTrigger` styled `w-full h-9 justify-between font-normal border border-input bg-card rounded-md px-3 text-sm` showing the current value (`All drivers` when unset) plus a `▾` caret; `PopoverContent align="start" class="w-64 p-0"` containing an `Input` (`h-8`, placeholder `Type a driver name`) in an `8px` padded header with a bottom border, then a `max-height:216px` scroll list, `padding:4px`. Each option is a `7px 9px`, `6px`-radius row, `13px`, name left and plate right in `11px text-muted-foreground`; the selected option gets `background: var(--muted)` and `font-weight:600`. Filtering is substring, case-insensitive, live on every keystroke. Empty result shows `No driver matches that name.` in `12px text-muted-foreground`. The first row is always `All drivers` with a `{n} pairs` meta.
     - **Plate** (`150px`): `Input`, placeholder `Search plate`, uppercase substring match.
     - **Zoom**: `Button size="icon" variant="outline"` `−`, a `12px` tabular-nums label `{px} px/h` (`min-width:62px`, centred), `Button size="icon" variant="outline"` `+`.
   - **Legend block**: `padding-top:12px`, `border-top:1px solid var(--border)`, `flex-wrap` row, `gap:18px`. Each entry is a `14px` square swatch (`4px` radius, the status fill and border), the label in `12px`, and a count in `12px text-muted-foreground` (Available reads `{n} now`, the others count blocks inside the visible window). Pushed right: a `2px × 14px` `#ff5a1f` bar and `Now {HH:MM}`.
3. **Board** — `1px solid var(--border)`, `border-radius:12px`, `bg-card`, `overflow:hidden`. Inside, one scroll container (`overflow:auto; max-height:600px`) holding a `min-width:max-content` stack, so the header row and the rows scroll horizontally together.
   - **Timeline header**: `position:sticky; top:0; z-index:5`, `bg-card`, `border-bottom:1px solid var(--border)`. First cell is the row-label column: `width:272px`, `position:sticky; left:0; z-index:6`, `border-right:1px solid var(--border)`, `padding:9px 14px`, uppercase `11px/600 text-muted-foreground`, text `Driver · Vehicle`. Then one cell per hour, `width:var(--px-hour)`, `border-left:1px solid var(--border)`, `padding:9px 0 9px 6px`, `11px` tabular-nums. Labels thin out with zoom: every hour at ≥50 px/h, every 2nd at ≥30, every 4th below. A `#ff5a1f` pill (`10px/600`, white, `1px 5px`, `3px` radius) sits at the now offset, `translateX(-50%)`.
   - **Rows**: `height: var(--row-h)`, `border-bottom:1px solid var(--border)`, `display:flex`.
     - Label cell: `width:272px`, `position:sticky; left:0; z-index:4`, `bg-card`, `border-right`, `padding:0 14px`, two lines. Line 1: driver name `13px/600` + phone or shift code in `11px text-muted-foreground`, ellipsised. Line 2: `{plate} · {vehicle model} · {class} · {city}` in `11px text-muted-foreground`, ellipsised.
     - Track: `position:relative`, `width: var(--track-w)`, `cursor:crosshair`, background `#f7fbf8` (the availability wash, toggleable) with hour rules drawn by `background-image: linear-gradient(to right, var(--border) 0 1px, transparent 1px 100%)` and `background-size: var(--px-hour) 100%`.
     - Bars: absolutely positioned, `left`/`width` as a percentage of the visible window, vertically inset `max(4px, (rowH − 26) / 2)`, `border-radius:5px`, `display:flex; align-items:center`, `padding:0 7px`, `11px/500`, `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`, `box-sizing:border-box`, `cursor:pointer`, `z-index:2`. Label degrades by width: `{Status} · {reference}` above 150px, status word only above 74px, nothing below.
     - Now line: `position:absolute; top:0; bottom:0; width:2px; background:#ff5a1f; pointer-events:none; z-index:3`, rendered per row, only when the selected date is today and the time is inside the window.
   - **Footer**: `padding:10px 16px`, `border-top`, `bg-muted`, `Showing {a}–{b} of {n} rows` in `12px text-muted-foreground` on the left, `Previous` / `Next` `Button variant="outline" size="sm"` on the right, disabled at the ends.
4. **Hint line** under the board: `12px text-muted-foreground` — `Drag across an empty stretch of a row to hold it as a booking.`

### Driver row model
One row = one driver. Row metadata comes from the driver's profile plus their currently assigned vehicle (`Vehicle` ↔ `DriverProfile`). Consequences to handle that the pair version does not:
- A driver with **no vehicle assigned** still gets a row: line 2 reads `No vehicle assigned` in `text-muted-foreground`, and the whole track renders as the `Unavailable` hatch with the tooltip reason `No vehicle assigned`.
- A driver assigned **more than one vehicle in a day** keeps one row; each bar's tooltip names the vehicle used for that block.
- The **Vehicle type** and **Capacity** filters match against any vehicle the driver is assigned to within the visible window.
- Driver-facing use (a driver looking at their own day): same board, one row, filters reduced to date and time window, no export button.

### Bar tooltip
Follows the cursor on `mouseenter`/`mousemove`, cleared on `mouseleave`. Fixed position at `cursor.x + 14` (clamped to `innerWidth − 300`) and `cursor.y − 76` (min `8`). `bg-popover`, `text-popover-foreground`, `1px solid var(--border)`, `border-radius:8px`, `box-shadow: 0 8px 24px rgba(21,20,15,0.14)`, `padding:8px 10px`, `max-width:280px`, `pointer-events:none`. Three lines: `{plate} · {Status}` in `12px/600`; `{HH:MM} – {HH:MM}  ({h} h)` in `12px text-muted-foreground` tabular-nums; `{reference} · {route} · {driver}`.

### Drag to hold a slot
`mousedown` on a track records the hour under the cursor, snapped to 15 minutes; `mousemove` on `window` extends it; `mouseup` removes the listeners. Drags under 30 minutes are discarded. While dragging, a ghost bar renders in that row: `rgba(255,90,31,0.14)` fill, `1.5px dashed #ff5a1f`, `6px` top/bottom inset, `5px` radius, centred `11px` label `{HH:MM} – {HH:MM}` in `#8f3810`, `pointer-events:none`, `z-index:4`.

On release a dialog opens — title `Hold this slot`, description `{driver} · {plate}`, three label/value rows (`Date`, `Window`, `Status: Booked (future)`), footer `Discard` (outline) / `Hold slot` (primary). Confirming appends a `booked` block. In production this is a POST that creates the reservation; on failure keep the dialog open and surface the error.

### Export dialog
Title `Export availability`, description `Choose what goes into the spreadsheet.` Three selectable cards, `10px 12px`, `8px` radius, `10px` gap, a `14px` radio dot (`4px solid #ff5a1f` when picked, else `1.5px solid var(--input)`); the picked card gets `1.5px solid #ff5a1f` and `#fff6f1`. Options:
- `Current view` — `{n} vehicles · {from}–{to}`
- `Filtered vehicles, whole day` — `{n} vehicles · 00:00–24:00`
- `All vehicles, whole day` — `{total} vehicles · filters ignored`

Then two `Checkbox` + `Label` rows: `Include free slots as Available rows` (default on) and `Include driver phone number` (default off). A live `12px text-muted-foreground` line reads `{n} spreadsheet rows will be written.` Footer: `Cancel` (outline), `Download .xls` (primary).

**Export format.** The prototype writes SpreadsheetML 2003 XML with a `application/vnd.ms-excel` blob, filename `driver-availability-{YYYY-MM-DD}.xls`, header row bold white on `#FF5A1F`. Columns: `Date, Driver, Plate, Vehicle, Class, Body, Capacity (kg), City[, Driver phone], Status, Start, End, Hours, Reference, Route`. In production prefer a server route that streams a real `.xlsx` (`exceljs`) from the same query the board renders, so the export cannot disagree with the screen; keep the column order above. `Include free slots` means the gaps between committed blocks are emitted as `Available` rows — compute them by walking the sorted blocks inside the window, emitting any gap ≥ 15 minutes.

## Interactions & behavior
- Every filter change resets pagination to page 1.
- `From`/`To` clamp against each other; the visible window drives bar clipping, legend counts, the "Current view" export scope and the now-marker visibility.
- Zoom steps through `24, 34, 52, 78, 116` px per hour (default `52`); it changes `--px-hour` and therefore track width, grid spacing and label density. No transition.
- Date `‹`/`›` step one day; `Today` returns to the current date. Changing the date refetches; the now marker only shows on today.
- Popover and Dialog close on pick, `Esc`, and click-outside, and their content must unmount on close.
- Pagination is client-side in the prototype; server-side paging is fine as long as the summary line and legend counts describe the filtered set, not the page.
- Loading: skeleton rows at the current row height, filter bar interactive. Empty result: `No vehicles match these filters.` centred, `padding:48px`, `13px text-muted-foreground` — reword to `No drivers match these filters.` Errors: inline retry inside the board frame, filters left usable.
- Responsive: the board scrolls horizontally rather than compressing; the filter row wraps; the label column stays sticky. Below ~720px stack the filter controls full-width.

## State management
```
date: ISO date string            fromH, toH: integer hours (0–24)
zoom: index into the px/h scale  page: zero-based page index
city, vclass, cap, status: filter ids ("ALL" = unset)
driver: driver id or "ALL"       driverOpen, driverQuery: combobox state
plate: search string             tip: {x, y, title, range, meta} | null
drag: {rowId, a, b, trackWidth, trackLeft} | null
pending: {rowId, start, end} | null
exportOpen, bookOpen: booleans   scope, inclGaps, inclPhone: export options
```
Data fetching: one query per `(date, filters)` returning drivers with their assigned vehicle and their blocks for that date — `{ driverId, name, phone, vehicle: {plate, model, classId, bodyType, capacityKg}, city, blocks: [{start, end, status, reference, route}] }`. Blocks come from orders plus shift/unavailability records; `Available` is never stored, it is the complement. Statuses derive from the block's relation to now: containing now → `enroute`, entirely past → `assigned`, entirely future → `booked`; shift gaps and rest windows → `unavailable`.

## Design tokens

**Status colours** (the only literal palette; everything else is an existing token)

| Status | Fill | Text | Border |
|---|---|---|---|
| Available | `#eef7f1` | `#1f5c3a` | `1px solid #cfe6d8` |
| Assigned / on order | `#ff5a1f` | `#ffffff` | `1px solid #e64d16` |
| En route | `#15140f` | `#f5f2ea` | `1px solid #15140f` |
| Booked (future) | `#fff3ec` | `#8f3810` | `1.5px dashed #ff5a1f` |
| Unavailable | `repeating-linear-gradient(-45deg,#eceae6 0 5px,#dedbd5 5px 10px)` | `#4b473f` | `1px solid #d7d4ce` |

Accent `#ff5a1f` (`--landing-accent`) — now marker, ghost bar, export radio, export header fill. Ghost fill `rgba(255,90,31,0.14)`. Availability wash `#f7fbf8`. Page background `#faf9f6` (`--landing-surface`). Everything else: `var(--card)`, `var(--border)`, `var(--input)`, `var(--muted)`, `var(--muted-foreground)`, `var(--popover)`, `var(--foreground)`.

**Spacing** — page `24px`; section gap `16px`; card padding `14px 16px`; control gap `16px`; label gap `5px`; legend gap `18px`; row label padding `0 14px`; bar padding `0 7px`.

**Type** — `20px/600` page title (`font-display`); `13px/600` row primary and option rows; `13px` dialog body; `12px` legend, footer, tooltip meta, hints; `11px/600` uppercase filter labels with `0.04em` tracking; `11px/500` bar labels; `11px` hour labels and row secondary; `10px/600` now pill. Tabular numerals on every time, count and plate.

**Radius** — `12px` cards and board; `8px` tooltip and export cards; `6px` combobox rows; `5px` bars; `4px` legend swatches; controls use the DS `rounded-md`.

**Row height** — `48px` comfortable (default), `36px` compact. Label column `272px`. Board scroll cap `600px`. Combobox list cap `216px`.

**Shadow** — tooltip only: `0 8px 24px rgba(21,20,15,0.14)`.

## Assets
None. The `‹ › − + ▾` glyphs are text; swap them for the icon set already used in the admin surface (`lucide-react`) — `ChevronLeft`, `ChevronRight`, `Minus`, `Plus`, `ChevronDown`. No images.

## Files
- `reference/Fleet Availability.dc.html` — the working prototype (vehicle–driver rows). Open it in a browser: all filters, the driver search, the timeline, the tooltip, drag-to-hold, pagination and the `.xls` download are live. Its template holds the exact markup and inline styles; its logic class holds the geometry maths (`segStyle`, `gaps`, the export builder) worth reading before reimplementing.
- Repo files the content is grounded in: `src/lib/georgian-cities.ts`, `src/lib/driver-onboarding/vehicle-classes.ts`, `src/lib/fleet-onboarding/fleet-vehicles.ts`, `src/components/admin/admin-section-layout.tsx`, `src/components/ui/*`.
- Fleet data in the prototype is generated mock data (28 pairs, seeded) — replace it with the real query; do not port the generator.
