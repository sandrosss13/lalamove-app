# Handoff: Driver & Vehicle Onboarding

## Overview

A self-serve onboarding wizard that takes a new driver from a phone number to an activated,
dispatchable account, plus the admin review queue that gates activation. Four steps for the
driver, one review console for operations.

## About the design files

`Driver Onboarding.dc.html` in this folder is a **design reference created in HTML** — a
prototype showing intended layout, copy and behaviour. It is not production code. It uses
inline styles and a single-file structure deliberately, for fast iteration in a design tool.

The task is to **recreate these designs in the target codebase** (Next.js App Router,
Tailwind v4, React 19, the `src/components/ui` shadcn set) using its established patterns —
not to port the HTML.

## Fidelity

**High fidelity.** Colours, type, spacing, copy, validation messages and state transitions
are final and should be matched. Where the codebase's existing components differ in detail
from the prototype's hand-built controls, prefer the codebase's components.

## Surfaces

Two surfaces in one prototype, switched by the top bar (the switcher is a prototype
affordance only — in the real app these are separate routes):

- **Driver app** — desktop web, left step rail + centred content column, max 900px.
- **Admin review** — back-office table with a 520px detail drawer on the right.

## Screens

### Driver — Welcome

Purpose: set expectations, resume an unfinished application.

- 42px/600 heading "Become a partner driver", −0.03em tracking.
- Sub: "Five steps. Around 12 minutes if your licence and vehicle documents are to hand.
  Progress is saved as you go." (Note: copy says five, the flow is four — fix to four.)
- Outline list of the four steps, numbered mono badges, 1px bordered card, 14px radius.
- If a draft exists: orange-bordered banner, `rgba(255,90,31,0.06)` fill, with "Unfinished
  application", a saved-at line, and a **Resume** button.
- Secondary button: "Start a new application".

### Driver — Step 1: Authorisation & personal

Fields in order:

| Field | Control | Validation |
|---|---|---|
| Mobile number | tel input | required; 10–15 digits after stripping non-digits |
| SMS code | 6 boxes, hidden input behind | required 6 digits; prototype accepts `482913`; resend locked 30s |
| Full name | text | required; at least two words |
| ID / passport number | mono text | required; `^[A-Za-z0-9-]{6,20}$` |
| Date of birth | date | required; age ≥ 21 and ≤ 75 |
| City | searchable dropdown | required; must match a city in the list |
| Profile photo | upload slot | required |

City dropdown: type-to-filter, each row shows city + region (e.g. "Batumi · Adjara"),
max-height 236px, scrolls. Helper text: "Where you will mostly pick up orders. Georgia only
for now."

Profile photo slot: dashed border, circular 64px tile, "Upload a profile photo" / "JPG or
PNG, max 10 MB". Turns green with "Uploaded" once filled.

### Driver — Step 2: Licence verification

- Two upload slots, front and back, each with a 104px preview tile and a status line.
  Intro copy: "Scans or photos both work. All four corners must be visible and free of glare."
- Licence number — mono input, required, min 5 chars.
- Expiry date — required; must be in the future ("This licence has expired. Renew it before
  applying.").
- Categories held — multi-select checkbox cards: **B** "Cars and vans up to 3.5 t",
  **C** "Rigid trucks over 3.5 t", **CE** "Truck with trailer / articulated". At least one
  required. Deselecting a category clears an incompatible vehicle class chosen in step 3.

### Driver — Step 3: Vehicle registration

Three sub-steps.

**3a — Cargo body type.** Three radio cards, each with a 172px inline SVG side view of a
truck: Dry Box (enclosed box), Refrigerated Vehicle (roof cooling unit + snowflake), Open
Chassis (flatbed with drop sides). Required.

**3b — Vehicle class.** Four cards. Each shows name, a mono category chip, capacity line,
and a sample-models line:

| Class | Chip | Capacity | Samples |
|---|---|---|---|
| Small Van | CAT B | Up to 800 kg · 2 pallets | Renault Dokker · Fiat Doblò · Toyota Proace City · Ford Transit Connect |
| Large Van | CAT B | 800–1,500 kg · 4 pallets | Fiat Ducato · Ford Transit · Mercedes-Benz Sprinter · Renault Master |
| Medium Truck | CAT C | 1.5–7 t · 8 pallets | Hino 916 · Mitsubishi Fuso Canter · Isuzu NPR · Iveco Eurocargo |
| Heavy Freight Truck | CAT CE | 7 t and above · 16+ pallets | MAN TGM · MAN TGL · Volvo FL · Scania P-series |

A class whose required category the driver does not hold renders at 0.65 opacity with a red
chip and the line "Locked — your licence does not list category C." Clicking it flashes
"Add category C in step 2 to drive this class." Selecting a class prefills payload and cargo
dimensions with that class's typical values.

**3c — Technical details.**

- Make and model — searchable dropdown filtered to the chosen class (6 real models each);
  free text allowed if nothing matches.
- Year — 4 digits, 1995–2026.
- Licence plate — mono, uppercased, min 4 chars.
- Colour — 12 swatch options in a 4-across grid: White, Silver, Grey, Black, Blue, Navy,
  Red, Green, Yellow, Orange, Beige, Brown. Required.
- Maximum payload (kg) — 100–40,000 ("Payload above 40,000 kg needs a fleet account").
- Cargo hold, metres — L/W/H, each > 0 and ≤ 20 ("Check the dimensions — metres, not
  centimetres"). Above the inputs, a diagram card: a numbered truck side view (1 = length,
  3 = height) plus a rear view (2 = width), switching between box body and flatbed based on
  the body type chosen in 3a, with a legend whose wording changes with it. Below, a live
  line: "Usable volume 35.7 m³ — used to match you with orders."

### Driver — Step 4: Review & submit

Four summary cards (Personal information, Driver's licence, Vehicle, and their key/value
rows) each with an **Edit** link jumping back to the relevant step. CTA "Submit application".
Intro: "Check everything before it goes to the review team. Corrections after submission
cost you a day."

### Driver — Application status

Header: mono application reference + driver name. One status card, then state-specific body.

- **Pending verification** — amber dot, "Under review", plus a three-row timeline
  (Application submitted / Document review in progress / Account activation waiting).
  Footnote: "Typical review time is 12–24 hours on business days."
- **Action required** — red border, title "2 documents need a new photo", body "The review
  team could not read the items below. Replace them and resubmit — the rest of your
  application is kept." Then one row per flagged document showing the admin's reason and a
  **Retake** button opening the upload dialog. The resubmit button stays disabled until every
  flagged document has been replaced.
- **Approved** — green, "You are cleared to drive", a summary card of what was approved, and
  a green "Go online and take orders" CTA.

### Upload dialog

560px modal, not a camera view. Header with a mono step badge, title, and a hint. Body is a
dashed dropzone: "Drag a file here, or click to browse", a per-document guidance line, and
"JPG or PNG · max 10 MB". Footer: "Files are checked by the review team, not automatically."
+ Cancel.

Per-document guidance strings are in the prototype's `CAPTURE_META` object — lift them verbatim.

### Admin — Applications queue

Left nav (Applications / Active drivers / Fleet / Compliance with counts). Table columns:
Applicant (name + mono ref), Vehicle (class · body, mono plate), Categories, Docs (`2/3`),
Status chip. Filter pills: All / Pending / Action required / Approved.

Status chip colours: Pending amber `rgba(200,140,20,0.12)` on `oklch(0.48 0.13 70)`;
Action required red `rgba(220,38,38,0.09)` on `oklch(0.577 0.245 27.325)`; Approved green
`rgba(16,120,70,0.1)` on `oklch(0.5 0.13 145)`.

### Admin — Detail drawer

520px, right side. Applicant fields in a two-column grid (ID number, DOB, mobile, city,
licence number, licence expiry, categories, make/model, year/colour, plate, payload, cargo
hold, body type). Then a document list — three documents (profile photo, licence front,
licence back), each with a thumbnail, state line, and **Approve** / **Flag** buttons. Flag
expands a row of reason chips: "Photo is blurry", "Glare — details unreadable", "Face not
clearly visible", "Wrong document uploaded", "Document expired", "Does not match the ID".

Footer: a hint line that changes with progress, then **Request changes (n)** and **Approve
driver**. Request changes requires ≥1 flagged document and moves the application to Action
required. Approve driver requires all three documents approved.

## Interactions & behaviour

- Validation fires on Continue, not on blur. Failing fields get a red border and an inline
  message; a toast reads "Fix the highlighted fields to continue."
- Toast: fixed bottom centre, `rgba(17,17,19,0.94)`, 11px radius, 2.2s, fade-up 0.2s.
- Step rail entries are clickable and jump directly to that step.
- Entering panels animate `fadeUp` 0.3s ease; dropdowns and modals `pop` 0.16s ease.
- Progress bar: four segments, filled orange up to and including the current step, width
  transitions 0.35s.
- The full loop must work end to end: submit → pending → admin flags a document → driver
  sees Action required → driver re-uploads → resubmit → pending → admin approves all →
  driver sees Approved.

## Design tokens

Everything else comes from the bound Lalamove UI Kit tokens (`_ds_bundle.css`). Values used
directly in the prototype:

| Purpose | Value |
|---|---|
| Brand orange | `#ff5a1f`, hover `#e04a13`, tint `rgba(255,90,31,0.05–0.06)` |
| Success green | `oklch(0.5 0.13 145)`, tint `rgba(16,120,70,0.04)` |
| Danger red | `oklch(0.577 0.245 27.325)`, tint `rgba(220,38,38,0.04)` |
| Amber (pending) | `oklch(0.62 0.15 70)` |
| Border | `oklch(0.922 0 0)` |
| Body font | IBM Plex Sans |
| Mono (refs, plates, numbers) | IBM Plex Mono |
| Radii | inputs 10px, cards 12–14px, modal 16px, pills 20px |
| Control heights | inputs 46px, primary CTA 48–50px |
| Label style | 11.5px/600, 0.04em, uppercase, muted |

## Schema and infrastructure gaps

The prototype collects more than the current schema models. Each of these is an open
decision, listed as a question in `PROMPT.md`: chassis body type, the city enum's size,
licence categories, whether driver-entered payload/dimensions are stored or derived,
application + per-document review state, whether SMS OTP is in scope at all, private
document storage, and whether company-created drivers use this wizard too.

## Assets

None. All imagery in the prototype is inline SVG line drawing (three vehicle body types,
two cargo-dimension diagrams) authored for this design; document thumbnails are neutral
placeholders. No raster assets, no icon font — the codebase already has `lucide-react`.

## Files

- `Driver Onboarding.dc.html` — the prototype (design reference).
- `PROMPT.md` — the task to paste into Claude Code.
