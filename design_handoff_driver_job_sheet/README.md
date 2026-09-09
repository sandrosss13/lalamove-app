# Handoff: Driver Job Sheet

## Overview

The screen a driver works from **after** they claim a load. The load board ends at "claimed";
everything from arriving at the pickup to marking the delivery done happens here.

The "Open job sheet" button already exists on three surfaces and ships **disabled**, because
this screen was never designed. A driver who claims a job is told *"Contact details are in your
job sheet"* beside a button that says the job sheet isn't built — so today they cannot reach the
client's phone number at all.

Core rules the design must encode:

- **The driver sees `driverPayout`, never the client's price.** Not `price`, `baseFare`,
  `distanceFare`, `timeFare`, `helperFee`, `overtimeFee` or `serviceLevelAdjustment`. Those
  columns are excluded at the `select` level from every driver-facing query, so they are not
  merely hidden — they never arrive.
- **Two actions change state, and both already exist server-side.** `Start delivery` and
  `Mark delivered`. Nothing else on this screen writes.
- **Completion requires a waiting-time figure.** The API refuses without it. There is no
  existing UI anywhere in the product that captures it.
- **A driver cannot cancel.** No endpoint exists. Do not design an abort affordance.

Market: Georgia. Addresses are free text, often mixed Georgian/Latin script. Phone numbers are
`+995`. Currency is GEL (`₾`). Locale `en-GB`, timezone `Asia/Tbilisi`.

**Out of scope for v1:** no delivery photos, no signature, no captured media of any kind.
Delivery is confirmed by a state transition, not by evidence.

## About the design files

This brief is **text only** — there is no `.dc.html` prototype yet. Produce one. The two
existing handoffs (`UI:UX/Order Dashboard/design_handoff_driver_load_board/`,
`design_handoff_driver_onboarding/`) ship a self-contained HTML artboard per surface plus the
token bundle; follow that convention, with **two sibling artboards**: phone and desktop.

Reuse `_ds_bundle.css`, `styles.css` and `fonts/` from the load board bundle unchanged.

## Fidelity

**High fidelity.** Final colours, typography, spacing, states and copy.

## The design system — read this before drawing anything

**It is not neobrutalism.** `components.json` sets `"style": "radix-nova"`, `"baseColor":
"neutral"`, `"iconLibrary": "lucide"`. Across the whole `src/components` tree there are **zero**
hard-offset shadows and **five** occurrences of `border-2`/`border-4`, all on 8–14px dots, never
a panel.

The accurate description: **a quiet, dense, information-first admin surface — white cards, 1px
hairline borders, 14px card radii, mono numerics, colour used only for status.**

### Surface contract (load-bearing)

Every hub root carries `data-admin-surface` and `font-body`. Without that attribute the
`bg-accent` / `bg-muted` / border tokens resolve to the *marketing* palette. Any portalled
content — Dialog, Sheet, Popover, Select — **must repeat `data-admin-surface` on itself**.

**Light mode only.** The `dark:` variant is narrowed to landing pages; there is no dark hub.

### Colour tokens (`src/app/globals.css:150-178`)

| Token | Value | Role |
|---|---|---|
| `--background` / `--card` / `--popover` | `oklch(1 0 0)` | page, card, drawer, sheet |
| `--foreground` | `oklch(0.145 0 0)` | primary text |
| `--primary` | `oklch(0.205 0 0)` | primary button, route markers |
| `--primary-foreground` | `oklch(0.985 0 0)` | text on primary |
| `--secondary` / `--muted` / `--accent` | `oklch(0.97 0 0)` | muted surfaces, hover |
| `--muted-foreground` | `oklch(0.556 0 0)` | all secondary text |
| `--border` / `--input` | `oklch(0.922 0 0)` | every 1px rule |
| `--ring` | `oklch(0.708 0 0)` | focus ring |
| `--destructive` | `oklch(0.577 0.245 27.325)` | destructive |

Brand accent, currently **un-tokenised** and spelled out in three files:
`bg-[oklch(64%_0.19_48)]`.

### Status pills — a closed set of six

`src/components/driver-hub/hub-status.ts` states: *"The six colour pairs the design defines — no
screen may add a seventh."* `hubStatusTone()` already normalises `IN_TRANSIT` / `in-transit` /
`"In transit"` to one key, so **every status this screen shows is already mapped**:
in transit → `info`, completed → `success`, cancelled → `danger`, scheduled → `neutral`.

Pill shape: `h-auto rounded-full border-transparent px-[9px] py-[3px] text-[11px] font-semibold
tracking-[0.02em]`.

### Type

IBM Plex Sans (`font-body`) throughout. **IBM Plex Mono (`font-price`) for every numeric** —
money, counts, ids, plates, dates — paired with `tabular-nums` on aligned columns. Fonts are
opt-in per surface, never a body default.

Scale in real use: `text-[11px]` (uppercase labels, pills), `text-xs` 12px, `text-[13px]` (the
hub's workhorse body size), `text-sm` 14px, `text-[15px]` (card title), `text-[17px]`/`[20px]`
(page title mobile/desktop), `text-[26px]` (drawer payout).

Letter-spacing idioms: `tracking-[0.06em] uppercase` on 11px section labels;
`tracking-[0.08em] uppercase` on metric labels; `tracking-[-0.02em]` on large numerals.

### Reusable class patterns — quote these, do not invent

```
Card             min-w-0 gap-4 rounded-[14px] border border-border p-[22px] ring-0
Card title       text-[15px] font-semibold
Section label    text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase
Spec list        grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-[13px]
Desktop action   h-10 text-sm font-medium
Mobile action    h-11 text-sm font-medium        (TOUCH_TARGET_CLASSES — 44px floor)
Stop marker      size-2 rounded-full mt-[5px] flex-none
                 pickup  bg-primary
                 dropoff border-2 border-primary bg-transparent
Empty state      py-10 text-center text-muted-foreground + text-sm
```

Radius census: `rounded-md` ×41, `rounded-full` ×38, `rounded-[10px]` ×16, `rounded-lg` ×11,
`rounded-[14px]` (card), `rounded-xl` (sheet/dialog). Spacing: `gap-3` dominates, `gap-5`
between page sections. Page body is supplied by the shell — **screens return sections as
siblings and never restate page padding**.

### Primitives that do NOT exist

`src/components/ui/` has 15 files: badge, button, calendar, card, checkbox, dialog,
dropdown-menu, input, label, popover, select, sheet, table, tabs, textarea.

**There is no tooltip, no toast, no progress bar, no separator, no avatar, no skeleton, no
accordion.** Specifying any of them is specifying new component work — flag it explicitly.
Async feedback in this codebase uses `role="status"` / `aria-live="polite"`, not toasts.

### The honesty convention

`SampleNote` — a dashed 10px uppercase badge with an accent dot — is **mandatory** on anything
fed by placeholder data. Any invented figure on this screen must wear one. Equally, real data
must *not* be badged "for symmetry".

## The critical departure: design this phone-first

Every other hub screen is desktop-first with a phone pass (`lg:` appears 67 times across the
driver hub; `max-*:` appears zero times). **Invert that here, and say so.** A driver reads a job
sheet standing at a loading bay or sitting in a cab, one-handed, in daylight, possibly gloved.

- Primary artboard: **390 × 844**. The hub already names this width as its phone target.
- **44px minimum** on every control (the hub's stated floor), **56px** on the two state-change
  actions.
- The primary action is a **persistent bottom-anchored bar**, not a section buried mid-scroll.
- `tel:` links are full-width rows, not inline text.
- Desktop: a single column at `max-width: 720px`. This is a task list, not a dashboard — do not
  spread it into the 1180px content width the other screens use.

Two shell facts that will bite: below `lg` the 248px sidebar **disappears entirely** and the
page-title bar **stops being sticky** (deliberately — *"pinning a 60px bar, a 44px job strip and
a two-line title block on a 390×844 screen would spend a fifth of the viewport on chrome"*).

Also: the load board established that **both the mobile and desktop trees mount simultaneously
and CSS picks between them** — there is no JS viewport detection anywhere in the feature. Any
portalled sheet must therefore carry `lg:hidden` on **both** the content and the scrim, and must
be `modal={false}` so it does not freeze the desktop tree behind it.

## Screens / Views

### 1. Job sheet — ACCEPTED (before pickup)

Purpose: get the driver to the pickup with the right phone number in hand.

1. **Job header** — order reference in mono (e.g. `GE-48204`), status pill, `driverPayout` at
   26px / 600 / `tracking-[-0.02em]` / tabular-nums.
2. **Timing** — scheduled pickup, pickup window if present, delivery deadline if present. The
   most common reason a driver opens the sheet before setting off, so it sits high.
3. **Stop 1 · Pick-up** — address, city, contact name, phone. Actions: **Call**, **Navigate**.
4. **Stop 2 · Drop-off** — same shape, visually subordinate while status is ACCEPTED.
5. **Cargo** — category, packaging, weight, dimensions, quantity, handling tags, helper count.
6. **Bottom bar** — `Start delivery`, full width.

### 2. Job sheet — IN_TRANSIT (after pickup)

Same screen, re-weighted: stop 2 becomes prominent, stop 1 collapses to one completed line, the
status pill changes, and the bottom bar becomes `Mark delivered`.

### 3. Delivery confirmation dialog

`Mark delivered` opens a confirm dialog — it is irreversible and there is no driver-side undo.
Follow the `loads-claim-dialogs.tsx` precedent: ~440px panel, `rounded-xl`, a summary card, then
`Cancel` at `flex:1` and the primary at `flex:1.6`.

Contains:

- A summary line naming the drop-off, so the driver can confirm they are at the right stop.
- **Waiting time** — required, whole minutes, default `0`. Not optional garnish: the API returns
  400 without it. **There is no UI precedent for this field anywhere in the product.**
- **Received by** — optional recipient name. *Requires a new column; see gaps.*
- Confirm / Cancel.

### 4. Job sheet — COMPLETED

Read-only. Actions gone. Shows completion time, the waiting minutes recorded, overtime payout if
any, and the received-by name. **Contacts stay visible** — a driver may need to call about a
finished job.

### 5. Error and edge states

- **Not your job** — a generic "not found", deliberately indistinguishable from a missing id.
  The existing `orders/[id]/track` page does exactly this to block id probing; match it. Do not
  design a permission error that names the order.
- **Cancelled while you held it** — terminal state, route back to the board. Note the timeline
  cannot say *when*: there is no `cancelledAt` column. Existing copy handles this honestly —
  *"Cancelled before/after pickup. Nothing records when it was cancelled."*
- **Failed action** — the transition must leave the driver on the sheet with the old status
  intact and a retry. Never a half-applied state.

## Interactions & Behavior

**Call.** `tel:` link, with the number also shown as selectable text — drivers routinely copy it
into WhatsApp rather than dialling. An existing `toTelHref` helper falls back to plain text when
a number is unusable.

**Navigate.** Hand off to the device's map app. **There is no existing pattern for this** — zero
matches for `maps.google`, `geo:`, `waze` or `window.open` anywhere in the codebase, so this is
net-new behaviour and needs platform branching specified (`comgooglemaps://`, `maps://`,
`https://www.google.com/maps/dir/?api=1&destination=…`).

Do **not** embed a map in v1. `@vis.gl/react-google-maps` exists but its only consumer,
`order-tracking-map.tsx`, predates the design system and is not token-styled.

**Transitions.** Both endpoints exist, are guarded, and — critically — **have no UI caller
anywhere in the codebase today**. This screen is their first consumer.

| Action | Endpoint | Body | Writes | Refuses |
|---|---|---|---|---|
| Start delivery | `POST /api/orders/[id]/start` | none | `status`, `inTransitAt` | 409 unless status is exactly `ACCEPTED`; 403 unless you are the assigned driver |
| Mark delivered | `POST /api/orders/[id]/complete` | `{ waitingMinutes }` integer ≥ 0 | `status`, `completedAt`, `waitingMinutes`, `overtimeFee`, `overtimeDriverPayout` | 409 unless `IN_TRANSIT`; 400 on a bad figure |

`complete` computes overtime inline:
`overtimeFee = max(0, waitingMinutes − freeLoadingMinutes) × overtimeRatePerMinute`, then the
driver's commissioned share of it. So the waiting figure the driver enters **changes their pay**
— worth surfacing in the confirmation dialog.

Because `start` refuses anything that is not `ACCEPTED`, buttons must reflect real server status,
not optimistic local state.

## Data

### Where it comes from

**Not from `GET /api/loads`.** That endpoint serialises status as only
`"available" | "claimed" | "mine"` — the raw `OrderStatus` is absent, and distinguishing
ACCEPTED from IN_TRANSIT is exactly what gates the two buttons. **There is also no
`GET /api/orders/[id]`.** So this page must read Prisma server-side, following the
`orders/[id]/track/page.tsx` pattern: server component, `dynamic = "force-dynamic"`,
`auth.api.getSession`, ownership check, generic not-found.

### Fields available on `Order`

**Stops** — `pickupAddress`, `pickupLat`, `pickupLng`, `pickupCity`, `pickupContactName`,
`pickupContactPhone`, `pickupContactDetails`, and the same six for dropoff. Addresses are free
text; `pickupCity`/`dropoffCity` are a 63-value `GeorgianCity` enum and the only structured geo.

**Cargo** — `cargoCategory`, `description`, `packagingDescription`, `itemQuantity`,
`cargoWeightKg`, `cargoLengthM`, `cargoWidthM`, `cargoHeightM`, `handlingTags`, `helperCount`,
`bodyType`.

**Timing** — `scheduledAt`, `pickupWindowStart`, `pickupWindowEnd`, `deliveryDeadline`,
`inTransitAt`, `completedAt`.

**Money** — `driverPayout`, `overtimeDriverPayout`. Nothing else.

### Only three honest timeline points

`Order` carries **no `acceptedAt`, `claimedAt`, `dispatchedAt` or `cancelledAt`**. A timeline can
truthfully show only: order placed (`createdAt`), picked up (`inTransitAt`), dropped off
(`completedAt`). Do not design a five-step tracker.

### Contact redaction

Contacts are visible only once the order is *held* — for a driver, `order.driverId === userId`.
Redaction works by **nulling the six keys, not omitting them**, so every row keeps one shape.
Since the job sheet is only reachable by the assigned driver, contacts are always present here —
but the rule lives in the data layer, not in this screen.

Note for whoever writes the spec: `specs/driver-load-board/action-required.md` says
`ORDER_PARTY_SELECT` provides this data. **It is dead code** — the live one is
`CARRIER_ORDER_PARTY_SELECT`, and `canSeeStopContacts` exists as three separate local copies
rather than a shared helper.

## This screen is mostly a merge, not an invention

Two-thirds of it is already built to production quality, split across two files. **Do not
redraw these — reuse them, and extract shared parts rather than copying a third time.** The
codebase has already been burned by exactly this: *"a sentence that lives in only one of these
files is a sentence half the drivers never read."*

| Section | Exists | Where |
|---|---|---|
| Contacts — name, `tel:`, details, both stops | ✅ | `jobs-detail-panel.tsx:267-308, 499-503` |
| Timeline — 3 steps, dot states, timestamps | ✅ | `jobs-detail-panel.tsx:139-176, 399-436` |
| Payout + overtime breakdown | ✅ | `jobs-detail-panel.tsx:226-240, 444-478` |
| Route stops with markers, city, window, deadline | ✅ | `loads-drawer.tsx:289-331` |
| Cargo spec, 8 rows | ✅ | `loads-detail-parts.tsx:263-303` |
| Handling tag pills | ✅ | `loads-detail-parts.tsx:317-339` |
| Compliance advisories (hazmat, cold chain) | ✅ | `loads-detail-parts.tsx:407-444` |
| **Start / Mark delivered** | ❌ | endpoints exist, no UI |
| **Navigation handoff** | ❌ | nothing in repo |

The two existing data shapes are disjoint by design — `HubJob` has contacts, timeline and money
but **no cargo**; `HubLoad` has cargo and windows but no timeline or raw status. A job sheet
needs a **third view model** unioning them. Also note `toHubJobStatus` collapses PENDING,
CLAIMED and ACCEPTED all into `"Scheduled"`; this screen needs the raw `OrderStatus`.

## Routing

**`/dashboard/jobs/[id]`**, at `src/app/dashboard/(hub)/jobs/[id]/page.tsx`.

This would be the **first dynamic segment in the hub** — there is no `[id]` anywhere under
`src/app/dashboard/` today; detail views are in-page local state. It inherits the shell for
free, and `hubNavItemForPath` prefix-matches it to "My orders" with no change.

`driver-hub-job-pill.tsx:37-46` names this exact URL as the route it is waiting for:
*"There is no `/dashboard/jobs/[id]` route in this app … When job detail routes land, this is
the one place that changes."* On a phone that pill is the natural front door.

Wiring the three disabled entry points is then trivial — swap `disabled` for `asChild` + `Link`
in `loads-drawer.tsx:359`, `loads-detail-sheet.tsx:386`, and make `loads-mobile.tsx:559` a link.

## Copy

| Context | String |
|---|---|
| Page title | `Job sheet` |
| Pickup section | `Pick-up` |
| Dropoff section | `Drop-off` |
| Primary, ACCEPTED | `Start delivery` |
| Primary, IN_TRANSIT | `Mark delivered` |
| Call | `Call` |
| Navigate | `Navigate` |
| Waiting time label | `Waiting time` |
| Waiting time helper | `Whole minutes spent waiting at either stop. Enter 0 if none.` |
| Received by | `Received by (optional)` |
| Confirm | `Confirm delivery` |
| Completed | `Delivered` |
| Not yours | `This delivery isn't assigned to you.` |
| Cancelled | `This delivery was cancelled.` |

Existing strings that must change when this ships (`loads-detail-parts.tsx`):

- `JOB_SHEET_TITLE` — *"Job sheet isn't built yet. Client contact details and proof of delivery
  will live there."* → delete; the button becomes enabled.
- `ClaimedByYouNote` — *"You claimed this load. Contact details are in your job sheet."* →
  keep; it becomes true.

Note the current copy promises "proof of delivery". Since v1 captures none, that phrase must not
survive.

## Schema and infrastructure gaps

Small, but real — the design should not assume they exist.

1. **`receivedBy` is not on `Order`.** Keeping that field needs a nullable column and an
   extension to `complete`, which today accepts only `{ waitingMinutes }`. Drop the field and
   this disappears.
2. **No route exists.** First `[id]` segment in the hub.
3. **No driver-side cancel endpoint.** Only a company can cancel, and only its own orders.
4. **Seeded orders have null lat/lng.** `scripts/seed-driver-hub-personas.ts` never sets
   coordinates, so any distance or map element renders empty in every persona demo. **Design the
   null state as a first-class state, not an afterthought.**

## Open questions carried out of design

1. **Where does waiting time get entered?** A field in the confirmation dialog is simplest but
   asks a driver to recall a number after the fact. A timer started on arrival is accurate but
   needs arrival timestamps, which do not exist. This brief assumes the field.
2. **Does this replace `today-current-job-card`?** That card already shows an active job on
   Today. Decide whether Today links here and shows less, or the two coexist at different depth.
3. **Should the driver see what waiting time earns them?** It changes `overtimeDriverPayout`
   directly. Showing it is honest; it also re-opens the rejected "waiting allowance" line, which
   was refused twice for quoting a driver a breakdown no stored value supported.
4. **Two-stop assumption.** The schema supports exactly one pickup and one dropoff — six columns
   rather than a `Stop` relation, documented as reversible if multi-stop arrives. Design for
   two; do not design a layout that could never extend.
5. **Future-dated jobs.** `scheduledAt` can be days out. Is a job sheet for a future job the
   same screen with a disabled action, or its own state?

## Reference files

- Tokens, fonts, prototype conventions —
  `UI:UX/Order Dashboard/design_handoff_driver_load_board/`
- Design system — `src/app/globals.css` (tokens 150-178, surface 626-642),
  `src/components/driver-hub/hub-primitives.tsx`, `hub-status.ts`
- Sections to reuse — `src/components/driver-hub/screens/jobs-detail-panel.tsx`,
  `loads-detail-parts.tsx`, `loads-drawer.tsx`
- The disabled button — `loads-drawer.tsx:359`, `loads-detail-sheet.tsx:386`,
  `loads-mobile.tsx:559`
- Transitions — `src/app/api/orders/[id]/start/route.ts`, `.../complete/route.ts`
- Auth/not-found pattern — `src/app/orders/[id]/track/page.tsx`
- The gap this closes — `specs/driver-load-board/action-required.md`, "Design the job sheet"
