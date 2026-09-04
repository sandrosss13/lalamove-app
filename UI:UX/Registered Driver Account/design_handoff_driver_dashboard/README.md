# Handoff: Driver Hub — Georgia (driver & driver-business dashboard)

## Overview
A logged-in dashboard for **registered Lalamove drivers in Georgia (Tbilisi)**, covering both an
individual driver and a driver *business* (a fleet owner with several vehicles, drivers and
back-office employees). Six screens: Today, Earnings & payouts, Job history, Performance,
Vehicles and Employees & roles.

The account type is switchable in the header (Business / Individual). Individual accounts see
Today, Earnings, Jobs, Performance and a single Vehicle; business accounts additionally see
Drivers and Employees.

## About the Design Files
`Driver Dashboard.dc.html` in this bundle is a **design reference created in HTML** — a working
prototype that shows intended look, copy and behaviour. It is not production code to copy.
The task is to **recreate these designs inside the target codebase's existing environment**
(React/Next, Vue, native, etc.) using its established component library, routing, data layer and
styling conventions. If no environment exists yet, pick the framework most appropriate for the
product and implement there.

The prototype is a single self-contained file with inline styles and a small state class; in a
real codebase this should become routed screens with real components and server data.

## Fidelity
**High fidelity.** Colours, typography, spacing, radii, statuses, copy and interaction states are
final and should be reproduced closely, mapped onto the codebase's own design-system primitives
where equivalents exist (buttons, badges, tables, inputs).

Design system: **Lalamove UI Kit** (light mode only). Its component set is Badge, Button, Calendar,
Card, Checkbox, Dialog, DropdownMenu, Input, Label, Popover, Select, Table, Tabs, Textarea. In a
React codebase these should be used instead of the prototype's hand-rolled markup: the tiles are
`Card`, the status pills are `Badge`, the filter strips are `Tabs`, the tables are `Table`, the form
fields are `Label` + `Input`. Wrap the tree in an element carrying `data-admin-surface` and apply
`font-body` / `font-display` so the IBM Plex fonts and neutral tokens resolve.

---

## Global chrome

### Sidebar (fixed, 248px, sticky, full height)
- White background, 1px right border `oklch(92.8% 0.006 264.531)`, padding 24px 16px, gap 28px.
- Brand row: 26×26px square, radius 7px, fill `oklch(64% 0.19 48)`; label "Driver Hub · Georgia",
  15px/600, letter-spacing −0.01em.
- Nav items: full-width buttons, padding 9px 12px, radius 8px, 14px.
  - Inactive: transparent, text `oklch(44.6% 0.03 256.802)`, weight 400.
  - Active: background `oklch(96.7% 0.003 264.542)`, text `oklch(13% 0.028 261.692)`, weight 600.
  - Optional count badge on the right: pill, background `oklch(64% 0.19 48)`, white 11px/600.
  - Order: Today, Earnings, Jobs, Performance, Vehicles, Drivers*, Employees* (*business only).
- Bottom card (weekly incentive): 1px border, radius 12px, padding 14px. Uppercase 11px label
  (letter-spacing 0.08em, muted), mono 20px/600 value `12/15`, 6px progress track
  (`oklch(92.8% 0.006 264.531)`) with an accent fill at 80%, 12px muted caption
  "3 more jobs by Sunday for a ₾40 bonus."

### Header (sticky, white, 22px 32px, 1px bottom border)
- Left: page title 20px/600 (−0.015em) and a 13px muted subhead that reflects the current screen
  and, on Earnings, the selected date range.
- Right, in order: account-type segmented control (Business / Individual), online toggle, avatar block.
  - Online toggle: pill, 8px status dot + label. Online = background `oklch(96.2% 0.044 156.743)`,
    text `oklch(44.8% 0.119 151.328)`, dot `oklch(59.6% 0.145 163.225)`. Offline = white, 1px border,
    muted text and dot.
  - Avatar block (left border 1px, padding-left 18px): 36px circle with initials "GB", name
    "Giorgi Beridze" 13px/500, mono 11px muted "GE-88214 · Van".

### Page body
Padding 28px 32px 56px (20px 32px 40px in compact density). Content column max-width 1180px,
sections stacked with 20px gap.

### Card
White, 1px border `oklch(92.8% 0.006 264.531)`, radius 14px, padding 20–22px.

### Metric tile
Card + uppercase 11px muted label (0.08em), mono 26px/600 value (38px on the hero tile), 12px muted note.

### Status pill (Badge)
Inline-block, padding 3px 9px, radius 999px, 11px/600, 0.02em, `white-space: nowrap`.

| Status | Background | Text |
|---|---|---|
| Completed / Verified / Paid / Valid / Active / Online | `oklch(96.2% 0.044 156.743)` | `oklch(44.8% 0.119 151.328)` |
| In transit / In review / Processing | `oklch(93.2% 0.032 255.585)` | `oklch(42.4% 0.199 265.638)` |
| Cancelled / Expired / Suspended | `oklch(93.6% 0.032 17.717)` | `oklch(44.4% 0.177 26.899)` |
| Expiring soon / Due soon / Pending / Invited | `oklch(97.3% 0.071 103.193)` | `oklch(47.6% 0.114 61.907)` |
| Scheduled / Offline / Idle / Defleeted / Offboarded | `oklch(96.7% 0.003 264.542)` | `oklch(44.6% 0.03 256.802)` |
| Demand: High | `oklch(96% 0.04 60)` | `oklch(48% 0.15 48)` |

### Filter strip (Tabs)
Row of pills inside a `oklch(96.7% 0.003 264.542)` track, padding 3px, radius 8px; pill padding
6px 13px, radius 6px, 13px, `white-space: nowrap`, `flex: 0 0 auto`. Active pill: white background,
ink text, weight 600, shadow `0 1px 2px rgba(0,0,0,0.06)`.
The strip has `min-width: 0; overflow-x: auto`; its toolbar row wraps (`flex-wrap: wrap`, gap 12px 16px)
so the primary action button never leaves the card.

### Data table
Not a real `<table>` in the prototype — a CSS grid header row plus grid rows (use the design
system's `Table` in the target codebase). Header: uppercase 11px muted (0.08em), 10px bottom
padding, 1px bottom border. Rows: 14px, padding 14px 0 (10px compact), 1px bottom border
`oklch(96.7% 0.003 264.542)`, `cursor: pointer`; selected row background
`oklch(96.7% 0.003 264.542)`. Each table sits in a `overflow-x: auto` wrapper and the rows carry a
`min-width` floor, so narrow panes scroll horizontally instead of crushing the first column.

### Master / detail split
When a row is selected or an add-form is open, the screen becomes a two-column grid:
`minmax(300px, 1.5fr) minmax(260px, 1fr)`, gap 20px, `align-items: start`; the right panel is
`position: sticky; top: 112px`. In the split state the table drops its low-value columns
(see per-screen notes). All form inputs are `width: 100%; min-width: 0` and two-column sub-grids
use `minmax(0,1fr)` so the panel can shrink.

---

## Screens

### 1. Today
Purpose: what the driver earned today, the job in progress, where demand is, what needs action.

Row 1 — three cards, grid `1.15fr 1fr 1fr`:
- **Earned today** (hero): mono 38px/600 `₾142.60` (−0.02em), 13px muted
  "8 jobs · 6h 12m online · ₾17.83 per job", then two links: "View earnings" (ink fill, white text,
  radius 6px, padding 8px 14px) and "Job history" (white, 1px border).
- **Today at a glance**: four label/value rows — Acceptance rate 94%, Completion rate 98%,
  Cancellations 1, Avg rating 4.86 (values mono 15px/600).
- **Current job**: mono 16px/600 `TB4821`, 13px muted "3 stops · 14.2 km · accepted 09:40", then a
  stop list (9px dot, 2px border; filled = done, hollow accent = next) with
  Avlabari · pickup / Rustaveli Ave · stop 1 / Sololaki · final drop and times
  (Collected 09:52 / Delivered 10:14 / ETA 10:38). Footer pinned to bottom: "Fare" + mono 18px/600 `₾18.40`.

Row 2 — grid `1.15fr 1fr` (hidden when the `showZoneDemand` flag is off):
- **Where the demand is** — "Updated 2 min ago"; rows `1.4fr 1fr 100px 90px`, 1px top borders:
  Vake · Vera (14 drivers online, High, +₾3.00), Saburtalo (22, High, +₾2.00),
  Gldani · Didube (31, Medium, —), Isani · Samgori (9, Low, —). Bonus text accent when non-zero.
- **Needs your attention** — two clickable rows, both opening vehicle AB-482-QM in Vehicles:
  1. "MTPL insurance expires in 12 days" / "AB-482-QM · renew the policy to keep receiving jobs."
     — background and border `oklch(97.3% 0.071 103.193)`, radius 10px, padding 14px 16px, chevron ›.
  2. "Technical inspection due 21 October" / "Book the annual inspection for AB-482-QM." — white, 1px border.

### 2. Earnings & payouts
Purpose: range-filtered earnings, breakdown, payout history, Excel export.

- **Filter bar** (card, padding 16px 18px, wrapping row): preset tabs
  *This week · Last week · This month · Last 30 days · Custom*; two `<input type="date">` fields
  (mono 12px, padding 7px 9px, radius 6px; 55% opacity unless Custom is active) separated by "to";
  right side: 12px muted "`from → to · N days`" and an **Export to Excel** button (white, 1px border,
  with an 8px green square). Editing either date switches the preset to Custom.
  Preset ranges: This week 2026-08-24→30, Last week 08-17→23, This month 08-01→31,
  Last 30 days 07-31→08-29.
- **Tiles** (4): Gross earnings (range total), Jobs completed (+ "Nh online"), Incentives,
  Avg per job (+ per-online-hour note). All derived from the filtered day rows.
- **Chart card** (`1.4fr` of a `1.4fr 1fr` grid): title "Daily earnings" (≤10 days) or
  "Weekly earnings" with note "Grouped by week · N weeks"; bar grid height 190px, gap 14px
  (6px when >10 bars), bars radius 5px, ink fill, the peak bar accent, empty days at 12% opacity;
  mono 11px value above each bar and a 12px muted label below.
- **Breakdown card**: Trip fares / Tips / Incentives (green text) / Adjustments (red when non-zero,
  muted when "None in range"), each with a 12px muted note; footer "Range total" + mono 20px/600.
- **Payout history table**: columns Period, Jobs, Incentives, Amount, Status
  (`1.2fr 1fr 1fr 1fr 120px`). Rows 18–24 Aug ₾712.30 Paid, 11–17 Aug ₾596.80 Paid,
  4–10 Aug ₾641.10 Paid, 25–31 Aug ₾658.40 Processing. This table is *static* — it is not
  range-filtered, which is why the breakdown footer says "Range total" rather than "Payout total".
- **Export**: builds an Excel-readable workbook client-side (HTML-table SpreadsheetML,
  `application/vnd.ms-excel`, BOM-prefixed) and downloads it as
  `earnings-<from>_<to>.xls`. Content: header block (driver, range, currency), a blank row, then
  `Date, Day, Jobs, Online hours, Fares, Tips, Incentives, Adjustments, Total` per day, a blank row,
  then a Totals row. In production, prefer a server-generated XLSX endpoint.

### 3. Job history
- Filter tabs: All / Active / Completed / Cancelled ("Active" = In transit + Scheduled), plus
  "N of M shown".
- Columns `110px minmax(180px,1fr) 90px 90px 90px 110px`, min-width 740px:
  Job, Route, Distance, Time, Fare, Status. Job id and numbers in mono.
- Rows (all Tbilisi routes): TB4821 Avlabari → Rustaveli → Sololaki 14.2 km 09:40 ₾18.40 In transit;
  TB4818 Didube → Gldani 8.6 km ₾12.90 Completed; TB4814 Vake → Vera 6.1 km ₾10.20 Completed;
  TB4809 Saburtalo → Dighomi 4.4 km ₾8.60 Cancelled; TB4802 Isani → Samgori → Varketili 11.8 km
  ₾16.30 Completed; TB4796 Chugureti → Mtatsminda 9.3 km ₾13.70 Completed; TB4835 Lilo → Rustavi road
  5.2 km 13:30 ₾9.40 Scheduled; TB4780 Ortachala → Krtsanisi 7.0 km "Yesterday 18:20" ₾11.10 Completed.
- **Detail panel**: job id (mono 18px/600), "Today · HH:MM", status + vehicle pills, a four-step
  timeline (Order accepted / Pickup / Stop 1 delivered / Final drop-off — dots filled for completed,
  accent for current, line-grey for pending; the in-transit job shows "ETA 10:38"), then fare lines
  (Base fare ₾9.80, Distance, Stops, Tip ₾1.00) and "Paid to you" + mono 20px/600.

### 4. Performance
- Five tiles (`repeat(5, minmax(0,1fr))`): Acceptance 94% (+3 pts), Completion 98% (+1 pt),
  Cancellations 2.1% (−0.4 pts), Avg rating 4.86 ("Top 15% in Tbilisi"), Jobs per day 7.4 (−0.6).
  Delta text green for good, amber for bad; each tile has a 4px progress track filled to the metric.
- **Online hours vs jobs completed** (`1.4fr`): 7 day columns, two 14px bars per day (ink = hours,
  accent = jobs), 190px tall, mono value above, day label below, legend with 9px squares.
  Mon 7.2h/7, Tue 8.6/9, Wed 6.4/6, Thu 9.1/10, Fri 6.2/8, Sat 5.0/5, Sun 0/0.
- **What affects your score**: four items (title + mono value + 12px muted body) — Acceptance rate 94%,
  Cancellations 2.1%, Rating 4.86, Idle time 38 min/h (amber).

### 5. Vehicles (business) / Vehicle (individual)
- Tiles: Vehicles 7 ("5 vans · 1 sedan · 2 trucks"), On the road 4 ("1 in service, 2 idle"),
  Unassigned 1, Fleet cost per km ₾0.40.
- Tabs: All / Active / In service / Idle / Defleeted. Primary action **Add vehicle** (ink button).
- Columns full state `1.4fr 100px 110px 90px 90px 120px`, min-width 780px:
  Vehicle (model + mono plate · year), Class, Assigned, Odometer, Cost/km, Status.
  Split state `1.6fr 1fr 120px` (min-width 420px): Vehicle, Assigned, Status only.
- Fleet data: AB-482-QM Mercedes-Benz Vito 116 CDI 2019 Van, Giorgi Beridze, 184 210 km, ₾0.42, Active,
  cities Tbilisi + Rustavi · CD-107-TB Ford Transit Custom 2021 Van, Levan Tsiklauri, 96 480 km, ₾0.38,
  Active, Tbilisi · EF-556-GG Toyota Prius 2018 Sedan, Nino Kapanadze, 231 900 km, ₾0.19, Active,
  Tbilisi + Mtskheta · GH-903-KA Isuzu NPR 1.5t 2017, Tamar Gogichaishvili, 318 640 km, ₾0.61,
  In service, Kutaisi + Batumi · IJ-221-QW Renault Kangoo 2020 Van, Ana Chkheidze, 142 050 km, ₾0.31,
  Active, Tbilisi + Gori · KL-640-BS Hyundai H-1 2016 Van, Unassigned, 276 330 km, ₾0.47, Idle, Batumi ·
  MN-318-RS Mercedes-Benz Sprinter 2022 Truck 1.5t, Zurab Maisuradze, 61 420 km, ₾0.44, Idle,
  Tbilisi + Kutaisi + Batumi.
- **Detail panel**: model, mono "plate · year · assigned driver", status + class pills, a 2×2 spec grid
  (Payload, Fuel, Odometer, Jobs · week) in bordered 10px-radius boxes, **Operating cities** as grey
  pills, **Running costs · this month** (Fuel = cost/km × 1600, Service & parts ₾280.00,
  Insurance (monthly) ₾96.00, Parking & tolls ₾64.50) with a "Cost per km" footer, then the
  defleet action.
- **Add vehicle form** (right rail): Plate (mono, uppercased on input, validated
  `^[A-Z]{2}-\d{3}-[A-Z]{2}$`), Make and model (>2 chars), Year + Odometer (two-column),
  **Class** radio rows (Van "Up to 1200 kg" / Sedan "Documents and small parcels" /
  Truck 1.5t "Pallets and bulk loads" — selected row gets an ink border, grey background and a
  filled 14px ring), **Operating cities** multi-select chips
  (Tbilisi, Rustavi, Batumi, Kutaisi, Gori, Zugdidi, Telavi, Mtskheta — selected = ink fill, white
  text; Tbilisi preselected; at least one required), Assign to driver (free text, empty = Unassigned).
  Save button "Add to fleet" is disabled-looking (grey fill, muted text, `not-allowed`) until valid;
  a 12px hint below reads back the selection or says what is missing. New vehicles join as **Idle**
  with cost/km ₾0.40 and no inspection or policy on file.
- **Defleet**: two-step destructive action at the bottom of the detail panel. First click arms
  ("Defleet vehicle" → "Confirm defleet"); unarmed = white with red text and border, armed = red fill
  with white text. Confirming sets status **Defleeted**; the button then becomes "Return to fleet"
  (neutral). The armed state resets on screen change and on selecting another record. Note text
  changes per state.

### 6. Drivers (business only)
- Tiles: Registered drivers 7, Online now 4, Fleet avg rating 4.76, Needs review 2.
- Tabs: All / Online / Offline / Needs review (Pending + Suspended) / Offboarded. Action **Add driver**.
- Columns full `1.3fr 110px 90px 70px 90px 110px`, min-width 760px: Driver (name + mono "id · vehicle"),
  Zone, Jobs · wk, Rating, Earned, Status. Split `1.6fr 70px 110px` (min-width 380px):
  Driver, Rating, Status.
- Roster: Giorgi Beridze GE-88214 Van Vake 46 4.86 ₾658.40 Online (joined Feb 2026) ·
  Nino Kapanadze GE-88301 Sedan Saburtalo 39 4.92 ₾512.80 Online · Levan Tsiklauri GE-87940 Van Gldani
  51 4.71 ₾704.20 Online · Tamar Gogichaishvili GE-88422 Truck 1.5t Isani 28 4.88 ₾596.00 Offline ·
  Davit Kvaratskhelia GE-88510 Van Didube 12 — ₾148.60 Pending · Ana Chkheidze GE-87755 Sedan Vera 33
  4.79 ₾431.50 Online · Zurab Maisuradze GE-86903 Van Samgori 0 4.42 ₾0.00 Suspended.
- **Detail panel**: 38px initials avatar, name, mono "id · joined <month>", status + zone pills, a 2×2
  stat grid (Jobs this week, Earned, Acceptance, Rating), "Recent jobs" (three id / route / fare rows),
  "Verification" (Driver licence (GE), Vehicle registration, Insurance policy, Technical inspection —
  each with a status pill; a Pending driver shows registration "In review", a Suspended driver shows
  insurance "Expired"), then the offboard action.
- **Add driver form**: Full name (>2 chars), Phone (≥9 digits, placeholder `+995 5XX XXX XXX`) + Zone
  (two-column), **Assign a vehicle** radio rows built from unassigned, non-defleeted plates plus an
  "Unassigned / Assign later" option. Saves as **Pending** with a generated id `GE-886xx`, rating "—",
  0 jobs; hint explains the pending state.
- **Offboard**: same two-step pattern — "Offboard driver" → "Confirm offboarding" → status
  **Offboarded**, then "Reinstate driver".

### 7. Employees & roles (business only)
Subhead: "Gizo Cargo LLC · 6 people, 4 roles · 1 invite pending".
- Tiles: Employees (count), Roles in use 4, Can move money 1 ("Accountant only"), Needs review 2.
- Tabs: All / Active / Invited / Suspended. Action **Invite employee**.
- Columns full `1.4fr 130px 1fr 130px 110px` (min-width 780px): Person (name + mono email), Role,
  Scope, Last active, Status. Split `1.6fr 110px 110px`: Person, Role, Status.
- People: Marika Dolidze — Fleet manager, all vehicles/zones · Irakli Beruashvili — Dispatcher,
  Vake · Saburtalo · Vera · Sopo Kiknadze — Accountant, payouts/invoices · Vano Shengelia — Mechanic,
  service log/inspections · Elene Abashidze — Dispatcher, Invited · Zurab Maisuradze — Driver, Suspended.
- **Detail panel**: avatar + name + email, status + role pills, a 13px muted role note, **Permissions**
  rows with pills — Manage (green), View (blue), None (grey) — then **Assigned** key/value rows, then
  the remove action.
- **Role definitions** (used by both the panel and the invite form):
  - Fleet manager — "Vehicles, drivers and compliance": Vehicles Manage, Drivers Manage,
    Compliance documents Manage, Earnings & payouts View, Employees View.
  - Dispatcher — "Assigns jobs inside their zones": Jobs Manage, Drivers View, Vehicles View,
    Earnings & payouts None, Employees None.
  - Accountant — "Payouts, invoices and tax": Earnings & payouts Manage, Invoices & tax Manage,
    Jobs View, Drivers View, Vehicles None.
  - Mechanic — "Service log and inspections": Vehicles Manage, Service log Manage,
    Compliance documents View, Jobs None, Earnings & payouts None.
  - Driver — "Own jobs and earnings only": Own jobs View, Own earnings View, Vehicles None,
    Drivers None, Employees None.
- **Invite form**: Full name (>2 chars), Work email (`.+@.+\..+`), Role radio rows (label + what the
  role can do), Scope. "Send invite" disabled until valid; hint reads
  "<Role> permissions will apply to <email>." New people join as **Invited** with that role's
  permission set and assigned rows Scope / Invited by / Expires in 7 days; the new row is selected
  after saving.
- **Remove**: two-step — "Remove employee" (or "Revoke invite" for a pending invitation) →
  "Confirm removal" / "Confirm revoke" → the person is dropped from the roster and the selection clears.

---

## Interactions & Behavior
- **Navigation**: sidebar switches screens; no URL routing in the prototype — use real routes.
- **Account type**: Business ⇄ Individual. Switching to Individual while on Drivers or Employees
  returns to Today and hides both items.
- **Online toggle**: flips label, fill and dot colour only.
- **Row selection**: clicking a table row opens the detail panel, closes any open add-form and clears
  an armed destructive action. The ✕ in a panel clears the selection and the table returns to full width.
- **Destructive actions**: always two clicks (arm → confirm), reversible afterwards for defleet and
  offboard, permanent for employee removal. The armed flag is global and cleared on navigation or
  selection change so a stray click cannot delete.
- **Validation**: save buttons stay visibly disabled (grey fill, muted text, `cursor: not-allowed`)
  and a hint below states what is missing.
- **Range filtering** (Earnings): every figure on the screen except the payout-history table derives
  from the filtered day rows; the chart auto-switches from daily to weekly grouping above 10 days;
  an empty range shows ₾0.00 and "No days in the selected range".
- **Density**: comfortable / compact affects page padding and table row padding.
- **Transitions**: none — the design is deliberately static. Add only what the target codebase
  already does for panel open/close.
- **Responsive**: the design targets desktop (≥1180px content). Narrow panes are handled by
  horizontal table scrolling, wrapping toolbars and the column-reduction rules above; there is no
  mobile layout in this prototype.

## State Management
Prototype state (all client-side), useful as a checklist of what the real screens need:
- `screen`, `account` (Business/Individual), `online`
- Jobs: `jobTab`, `jobId`
- Earnings: `range` (preset name or "Custom"), `from`, `to`
- Vehicles: `fleetTab`, `vehiclePlate`, `addingVehicle`, `vehForm {plate, model, year, odo, class, assigned, cities[]}`, `addedVehicles[]`, `defleeted[]`
- Drivers: `driverTab`, `driverId`, `addingDriver`, `drvForm {name, phone, zone, vehicle}`, `addedDrivers[]`, `offboarded[]`
- Employees: `empTab`, `empEmail`, `inviting`, `form {name, email, role, scope}`, `added[]`, `removedEmp[]`
- Shared: `confirm` (which destructive action is armed, e.g. `vehicle:AB-482-QM`)

Data the real implementation needs: driver profile, daily earnings series (date, jobs, hours, fares,
tips, incentives, adjustments), payout periods, job list with timeline and fare lines, performance
metrics, zone demand, fleet, driver roster, employee roster with role definitions. Mutations:
add vehicle, defleet/return, add driver, offboard/reinstate, invite employee, remove employee.

## Design Tokens
Colours (oklch, taken from the Lalamove UI Kit bundle):
- Ink / body text `oklch(13% 0.028 261.692)`
- Muted text `oklch(44.6% 0.03 256.802)`
- Border `oklch(92.8% 0.006 264.531)`
- Page background / subtle fill `oklch(96.7% 0.003 264.542)`
- Surface `#fff`
- Accent (brand orange) `oklch(64% 0.19 48)`; hover `oklch(54% 0.17 46)`
- Success `oklch(59.6% 0.145 163.225)`, on-success text `oklch(44.8% 0.119 151.328)`,
  success surface `oklch(96.2% 0.044 156.743)`
- Warning surface `oklch(97.3% 0.071 103.193)`, warning text `oklch(47.6% 0.114 61.907)`
- Danger `oklch(57.7% 0.245 27.325)`, danger surface `oklch(93.6% 0.032 17.717)`,
  danger text `oklch(44.4% 0.177 26.899)`
- Info surface `oklch(93.2% 0.032 255.585)`, info text `oklch(42.4% 0.199 265.638)`

Typography: **IBM Plex Sans** (400/500/600/700) for UI, **IBM Plex Mono** (400/500/600) for all
numbers, ids, plates and dates. Scale: 38 (hero) / 26 (tile) / 20 (page title, panel total) /
18 (panel title) / 16 / 15 (card title) / 14 (body, table) / 13 (secondary) / 12 (note) /
11 (uppercase label, pill). Letter-spacing: −0.02em on the hero number, −0.015em on the page title,
0.08em on uppercase labels, 0.02em on pills. Line-height 1.5 for prose.

Spacing: 2, 6, 8, 10, 12, 14, 16, 18, 20, 22, 28, 32px. Radii: 6 (buttons, inputs), 7, 8 (nav,
tab track), 10 (inner boxes, alerts), 12, 14 (cards), 999 (pills, progress). Shadow: only
`0 1px 2px rgba(0,0,0,0.06)` on the active tab pill.

## Assets
None. No images or icon set — the few glyphs are text characters (`›`, `✕`) and small coloured
squares/dots built from divs. Fonts ship with the design system (`fonts/` folder in this bundle,
`@font-face` in `fonts/fonts.css`); in the target codebase use its own IBM Plex setup.

## Files
- `Driver Dashboard.dc.html` — the full prototype (all six screens, all flows). Markup is the
  template; screen data, derived values and handlers live in the `class Component` block near the
  bottom of the file.
- `fonts/` — IBM Plex Sans/Mono woff2 files and `fonts.css`, as used by the prototype.

Open the HTML file directly in a browser to click through every flow before implementing.
