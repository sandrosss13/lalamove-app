# Handoff: Business Fleet Onboarding

## Overview

Self-serve registration for a logistics company running multiple vehicles: register the
company once, declare the fleet by cargo body type and vehicle class, specify each vehicle,
put a named driver behind every one, and submit for review. Operations verifies the company
as a whole and clears or flags each vehicle individually.

Companion to the individual driver flow in `design_handoff_driver_onboarding/`. The two share
the vehicle taxonomy, body types, colour list, city list, and the review/flag/resubmit
pattern — build those once.

## About the design files

`Business Onboarding.dc.html` is a **design reference created in HTML** — a prototype showing
intended layout, copy and behaviour, not production code. Inline styles and a single-file
structure are deliberate, for fast iteration in a design tool.

`Driver Onboarding.dc.html` is included for the shared pieces.

The task is to **recreate these designs in the target codebase** (Next.js App Router,
Tailwind v4, React 19, the `src/components/ui` shadcn set) using its established patterns.

## Fidelity

**High fidelity.** Colours, type, spacing, copy, validation messages and state transitions
are final. Where the codebase's components differ in detail from the prototype's hand-built
controls, prefer the codebase's components.

## Surfaces

- **Business portal** — desktop web, left step rail with a live fleet tally, centred content
  column (wider on the table steps).
- **Admin review** — back-office table with a 560px detail drawer.

The top-bar switcher between them is a prototype affordance only; in the real app these are
separate routes.

## Screens

### Welcome

42px/600 "Register your fleet". Sub: "For logistics companies running more than one vehicle.
Register the company once, declare the fleet by body type and class, then put a driver behind
every vehicle." Then the five-step outline, a resume-draft banner if a draft exists (orange,
`rgba(255,90,31,0.06)`), and "Start a new application".

### Step 1 — Company & authorisation

**Company phone** on its own screen first: "The company's main line. It becomes the account
login and the number dispatch calls when an order needs a decision." Required, 10–15 digits.

An SMS OTP screen exists in the prototype (6 boxes, 30s resend lock, demo code `482913`) but
is **currently bypassed** — phone goes straight to company details. Re-enabling it is a
one-line change. Decide whether it ships.

**Company details**, in three titled groups:

*Legal entity* — Company name (required, ≥3 chars) · VAT / tax ID (required, 9 digits,
digits only) · Registered address (required) · **Cities of operation** (multi-select, ≥1
required).

*Contact person* — Full name (required, two words) · Role (required) · Company email
(required, email shape).

*Payouts* — Bank account IBAN (required, ≥18 chars after stripping spaces). Helper: "Order
revenue is settled to this account weekly. It must belong to the registered entity."

Cities control: selected cities render as removable orange chips above the field; the
dropdown is a checkbox list (city + region, e.g. "Batumi · Adjara"), max-height 236px; the
input placeholder becomes "Add another city…" once one is chosen. Helper: "Where the fleet
picks up. Orders outside these cities are not offered to your drivers." 36 Georgian cities in
the prototype list.

### Step 2 — Fleet composition

"Set how many vehicles you run in each combination. You fill in plates and specifications for
each one in the next step — this just builds the list."

Three panels, one per cargo body type, each with a 104px inline SVG side view and a
description:

| Body | Description | Classes offered |
|---|---|---|
| Dry Box | Enclosed rigid body. General palletised and boxed cargo. | all five |
| Refrigerated Vehicle | Temperature-controlled, −20 °C to +8 °C. Cooling unit service record required per vehicle. | all five |
| Open Chassis | Flatbed or curtain-side with drop sides. Oversized, construction and machinery loads. | medium, heavy, trailer only |

Vans are not sold as flatbeds on this platform — Open Chassis deliberately omits Small Van
and Large Van.

Each row: class name, capacity line, category chip, and a −/count/+ stepper (0–40). Rows with
a non-zero count tint `rgba(255,90,31,0.03)` and the count turns orange. Panel header shows
its subtotal. A footer card shows the grand total: "Vehicles to specify in the next step".

Validation: at least two vehicles — "A business account needs at least two vehicles. Use the
individual driver flow for a single vehicle."

### Step 3 — Vehicle specifications

The counts generate a numbered vehicle table, grouped by body then class: `#`, Class & body,
Make / model, Plate, Payload, Status (Ready / Incomplete). Header shows "4 of 7 specified".
Changing counts in step 2 preserves already-filled vehicles and only adds or removes at the
tail.

A row opens a 640px editor dialog:

- **Make and model** — searchable dropdown filtered to the class. Each option shows its
  published spec on the right (`5,500 kg · 6.20 × 2.35 × 2.35 m`). Picking one **writes those
  figures into the payload and dimension fields**, adjusted for the body type. Free text
  allowed if nothing matches.
- **Year** — 1995–2026. **Licence plate** — mono, uppercased, ≥4 chars.
- **Colour** — 12 swatches, 4-across (White, Silver, Grey, Black, Blue, Navy, Red, Green,
  Yellow, Orange, Beige, Brown). Required.
- **Payload (kg)** — 100–40,000. **Cargo hold L × W × H (m)** — each > 0 and ≤ 20; a trailer
  truck's length must be ≥ 8 m.
- Live line: "Usable volume 35.7 m³ — used to match this vehicle with orders."
- Footer names the source: "Prefilled from Hino 916 as a dry box. Correct them to the real
  vehicle."

**Model reference data** (make, model, payload kg, internal L × W × H m) — realistic
manufacturer figures for the standard cargo variant, **pending ops review before seeding**:

*Small Van* — Renault Dokker Van 750 / 1.90×1.22×1.21 · Fiat Doblò Cargo Maxi 1000 /
2.17×1.23×1.30 · Toyota Proace City L2 1000 / 2.16×1.23×1.24 · Ford Transit Connect L2 900 /
2.08×1.22×1.27 · Citroën Berlingo Van XL 1000 / 2.16×1.23×1.24 · Peugeot Partner Long 1000 /
2.16×1.23×1.24

*Large Van* — Fiat Ducato L3H2 1500 / 3.70×1.87×1.93 · Ford Transit L3H2 1400 /
3.49×1.78×1.89 · Mercedes-Benz Sprinter 315 L3H2 1400 / 3.62×1.78×1.94 · Renault Master L3H2
1500 / 3.73×1.77×1.89 · Volkswagen Crafter L3H3 1450 / 3.45×1.83×1.96 · Iveco Daily 35S L3H2
1500 / 3.54×1.80×1.90

*Medium Truck* — Hino 916 5500 / 6.20×2.35×2.35 · Mitsubishi Fuso Canter 7C15 4200 /
5.60×2.20×2.25 · Isuzu NPR 75 4500 / 5.80×2.30×2.30 · Iveco Eurocargo 120E 6800 /
7.20×2.45×2.50 · Mercedes-Benz Atego 1018 5000 / 6.30×2.40×2.45 · Ford Trucks 1026 5800 /
6.80×2.45×2.50

*Heavy Freight Truck* — MAN TGM 18.290 10500 / 8.60×2.45×2.70 · MAN TGL 12.220 6500 /
7.20×2.45×2.60 · Volvo FL 280 9500 / 8.40×2.45×2.65 · Scania P 280 10000 / 8.50×2.45×2.70 ·
DAF LF 260 8800 / 8.20×2.45×2.65 · Mercedes-Benz Atego 1830 9200 / 8.30×2.45×2.65

*Trailer Truck* — Mercedes-Benz Actros 1845 LS · Volvo FH 460 4x2 · Scania R 450 A4x2 · MAN
TGX 18.470 · DAF XF 480 FT · Renault T High 480 · Iveco S-Way AS440 — all 24000 /
13.60×2.48×2.70 (standard semi-trailer)

**Body-type adjustment** applied to the above:

| Body | Payload | Length | Width | Height |
|---|---|---|---|---|
| Dry Box | ×1 | — | — | — |
| Refrigerated | ×0.92 | −0.25 m | −0.12 m | −0.16 m |
| Open Chassis | ×1.05 | — | +0.05 m | drop-side height: 0.50 m (medium), 0.60 m (heavy, trailer) |

Payload rounds to the nearest 10 kg.

### Step 4 — Drivers & assignment

"Every vehicle needs a named driver. Create the account yourself for drivers already on
staff, or send an invitation and let them complete their own licence details."

Table: `#`, Vehicle (class + "needs category C"), Plate, Driver (name + phone/categories, or
"invitation sent · licence pending"), Status (Unassigned / Assigned / Invited). Header shows
"5 of 7 assigned".

A row opens a 640px dialog with three tabs. It opens on **Existing driver** when the roster
has an eligible driver, otherwise on **Create account**.

- **Existing driver** — roster list, each row showing initials, phone, categories, and an
  eligibility note. Ineligible rows sit at 0.55 opacity with a red note: "No category CE", or
  "on 34 ABC 128" if the driver already holds another vehicle. Clicking one flashes why.
  Empty state: "No driver on your roster holds the categories this vehicle needs. Create an
  account or send an invitation instead."
- **Create account** — Full name, Mobile, Licence number, Expiry (must be future),
  Categories held (B / C / CE checkboxes, prechecked with the vehicle's requirement). The
  required category must be among them, else: "This vehicle needs category CE. Assign a
  different driver or vehicle." Note card: "Shown once when you save, for you to pass on. The
  driver must change it at first sign-in and upload their own licence photos before their
  first order." On save, a temp-password dialog: login, an 8-char password (4 letters + 4
  digits, ambiguous characters excluded), Copy credentials / Done.
- **Send invitation** — Name and Mobile only. "The driver gets a link and completes their own
  licence, categories and profile photo. The vehicle stays reserved for them and cannot be
  dispatched until they finish." Orange note: "Their licence must show category CE. If their
  licence does not show it, the invitation cannot be completed and the vehicle stays
  unassigned."

Footer carries a red "Remove current driver" when one is assigned.

### Step 5 — Review & submit

"The company is reviewed as a whole. Individual vehicles can be sent back without holding up
the rest of the fleet." Four summary cards — Company, Fleet (counts per body type + total),
Vehicles (one row each), Drivers (one row each) — with Edit links back to the right step.

### Application status

Status card, then a Fleet status table: `#`, class + body, plate, driver, reason, per-vehicle
chip (Approved / Flagged / Pending), and a red **Fix** button on flagged rows opening the
vehicle editor.

- **Pending** — amber. "Fleet under review. Our team is checking the company registration,
  then each vehicle and its driver. Vehicles are cleared individually — you can start
  dispatching as soon as the company is approved and at least one vehicle passes."
  Footnote: "Typical review time is 24–48 hours for a fleet this size."
- **Action required** — red. Title is either "Company details need correcting" or "2 vehicles
  need correcting". Body: "The rest of the fleet is unaffected and stays in review. Fix what
  is flagged below and resubmit — approved vehicles keep their verdict." Resubmit button
  disabled until every flagged item is fixed; label counts them.
- **Approved** — green. "Your fleet is live." CTA "Open the dispatch dashboard". Footnote:
  "Licences and cooling-unit records are re-checked 30 days before expiry."

Saving a flagged vehicle in the editor clears its flag.

### Admin — Business applications

Table: Company (name + mono ref), City ("Tbilisi +2"), Fleet, Drivers (`5/7`), Status.

Detail drawer, 560px:

- **Company** block — VAT/tax ID, registered address, cities of operation, contact + role,
  phone, email, payout account. Two buttons: "Company details verified" / "Flag company
  details". Company flag reasons: VAT ID not found in the registry · Address does not match
  registration · Bank account not held by the entity · Contact person unreachable.
- **Fleet & drivers** — one card per vehicle: class + plate, then body · model · year ·
  payload, then state + driver. Approve / Flag per vehicle; Flag expands reason chips: Plate
  does not match the documents · Payload above the class limit · Dimensions look wrong ·
  Vehicle too old for the platform · Duplicate plate on another fleet · Cooling unit record
  missing. Header counts "3 approved, 1 flagged, 3 pending".
- Footer: a hint that changes with progress, then "Request changes (n)" and "Activate fleet".
  Request changes needs the company flagged or ≥1 vehicle flagged. Activate needs the company
  verified and every vehicle decided.

## Interactions & behaviour

- Validation fires on Continue. Field-level errors show inline with a red border; the toast
  carries the first message on table steps and "Fix the highlighted fields to continue." on
  form steps.
- Toast: fixed bottom centre, `rgba(17,17,19,0.94)`, 11px radius, 2.4s.
- Step rail entries jump directly; jumping to step 3 before a fleet exists flashes "Declare
  your fleet first."
- Panels animate `fadeUp` 0.3s; dropdowns and modals `pop` 0.16s.
- Progress bar: five segments filled orange up to the current step, 0.35s transition.
- The full loop must work end to end: submit → pending → admin verifies company and flags one
  vehicle → business sees Action required with that vehicle only → fix it → resubmit →
  pending → admin approves all → Approved.

## Design tokens

Same as the driver flow — the bound Lalamove UI Kit. Values used directly:

| Purpose | Value |
|---|---|
| Brand orange | `#ff5a1f`, hover `#e04a13`, tint `rgba(255,90,31,0.03–0.06)` |
| Success green | `oklch(0.5 0.13 145)` |
| Danger red | `oklch(0.577 0.245 27.325)` |
| Amber (pending) | `oklch(0.62 0.15 70)` |
| Border | `oklch(0.922 0 0)` |
| Body font | IBM Plex Sans |
| Mono (refs, plates, counts) | IBM Plex Mono |
| Radii | inputs 10px, cards 12–14px, modal 16px, chips/pills 20px |
| Control heights | inputs 46px, steppers 32px, primary CTA 48px |
| Label style | 11.5px/600, 0.04em, uppercase, muted |

## Schema and infrastructure gaps

Open decisions, each a question in `PROMPT.md`: chassis body type, the five-class taxonomy vs
`VehicleCategory`, where per-model specifications live, multiple cities per company, temp
password reuse and whether invitations ship in v1, application state at fleet granularity,
ownership of company-created driver accounts, how a user lands in this flow vs the individual
one, and the realistic fleet-size ceiling.

## Assets

None. All imagery is inline SVG line drawing (three body types in the fleet step) authored
for this design. No raster assets, no icon font — the codebase already has `lucide-react`.

## Files

- `Business Onboarding.dc.html` — the business prototype (design reference).
- `Driver Onboarding.dc.html` — the individual driver prototype, for the shared pieces.
- `PROMPT.md` — the task to paste into Claude Code.
