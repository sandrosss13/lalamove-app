# Handoff: Booking flow — Delivery info popup + service-level pricing

## Overview

Two additions to the existing client booking page (`Book a delivery`, rendered by
`src/components/home/booking-form.tsx` in `sandrosss13/lalamove-app`):

1. **Delivery info popup.** When the user picks a pickup or a dropoff address from the
   Google Places autocomplete, a small modal opens asking for the contact at that stop —
   Name, phone (with a `+995` prefix), and Block/Floor/Room. One popup per stop, numbered
   1 for pickup and 2 for dropoff.
2. **Service level.** Three mutually exclusive options above the Calculate action —
   **Priority**, **Regular**, **Pooling** — each showing its own price once a quote exists.
3. **Load-space (body) type.** A Dry Box / Refrigerated / Open Chassis choice at the top of
   step 5, which filters the vehicle list.
4. **Helper count.** The helper checkbox now reveals a 1–4 picker; the fee is per helper.
5. **Payment methods.** A new step 7 in the booking flow to pick a saved card (or Pay later),
   and `/wallet` — an empty placeholder today — becomes a Payment methods page with saved
   cards, transaction history and invoices.
6. **Progressive gating.** Every step is disabled until the one before it is answered.

Everything else on the page is unchanged from what ships today.

## About the design files

`Book a Delivery.dc.html` in this bundle is a **design reference created in HTML** — a
prototype showing intended look and behaviour, not production code to copy. The task is to
recreate these two changes inside the existing Next.js app, in
`src/components/home/booking-form.tsx` and its siblings, using the app's own patterns:
Tailwind utilities over the `--landing-*` token set, the shadcn wrappers in
`src/components/ui/`, `AddressAutocomplete` for the address fields, and lucide-react for
icons. Do not port the prototype's inline styles.

The prototype stands in for two things it cannot reach:

- **Addresses and the map are real Google integrations in the app.** The prototype fakes the
  autocomplete with a hard-coded list of Tbilisi addresses and draws a CSS placeholder where
  the map goes. In the app, keep `AddressAutocomplete` (Google Places) and
  `RoutePreviewMap` (Google Maps JS API) exactly as they are — the only change is that
  `onLocationChange` firing (i.e. a suggestion was *selected*, not typed) must now also open
  the delivery-info popup for that field.
- **Pricing is server-side.** The prototype computes a fare in the browser from a haversine
  distance so the three tiers show believable numbers. In the app the quote still comes from
  `POST /api/pricing/estimate`; see "Server changes" below.

## Fidelity

**High-fidelity.** Colours, type, spacing, and radii below are exact and already match the
app's `--landing-*` tokens. Recreate pixel-for-pixel with Tailwind classes.

## Screens / Views

### 1. Booking page — Route card (step 2), modified

Unchanged layout: two stacked `AddressAutocomplete` fields, `gap-4`, inside the existing
`StepCard step={2} title="Route"`.

**New behaviour:** selecting a suggestion for either field opens the Delivery info popup for
that field. Typing without selecting does not open it. The address text stays in the field
regardless of how the popup is dismissed.

### 1b. Delivery date & time (step 1) — unchanged, but note the Date control

The Date field is **not** a native `<input type="date">`. The source renders a Popover
trigger button — `CalendarDays` icon at `16px` in `#6b675f`, then `Select a date` in
`#6b675f` while empty, or the picked date in `#201f1c` formatted
`{weekday:"short", month:"short", day:"numeric"}` ("Thu, Sep 10"). Never the browser's
`dd/mm/yyyy` placeholder or its calendar swatch. In the app keep the shadcn
`Popover` + `Calendar` pair with `--primary` retinted to `--landing-accent`, exactly as
`booking-form.tsx` already does; the prototype fakes it with a styled button over a
visually-hidden date input.

The Time `<select>`'s empty option is `disabled` — it is a placeholder, not a choice.

### 2. Delivery info popup (new)

A centred modal dialog, not a slide-over.

- **Overlay**: `position: fixed; inset: 0; z-index: 40`, a flex container with
  `align-items: center; justify-content: center; padding: 16px`. Centre the panel this way,
  **not** with `top/left: 50%` + `translate(-50%, -50%)` — the entry animation below uses
  `animation-fill-mode: both`, whose final keyframe `transform` overrides the element's own
  and knocks a translate-centred panel off-centre.
- **Backdrop**: a `position: absolute; inset: 0` sibling inside the overlay,
  `background: rgba(32,31,28,0.4)`. Clicking it cancels.
- **Panel**: `position: relative; z-index: 41`, `width: 420px`, `max-width: 100%`,
  `max-height: 100%`, `overflow-y: auto`, **`box-sizing: border-box`** (the 420px is the
  outer width, padding included), `border: 1px solid #e7e4de`, `border-radius: 14px`,
  `background: #ffffff`, `padding: 26px`,
  `box-shadow: 0 24px 60px rgba(32,31,28,0.22)`.
- **Entry animation**: `translateY(8px) scale(0.98)` + `opacity 0` → identity over `180ms`,
  `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Header row**: `display: flex; align-items: center; gap: 12px; margin-bottom: 20px`.
  - Step badge: `24 × 24`, `border-radius: 9999px`, `background: #ff5a1f`, text `#ffffff`,
    `font-size: 11px`, `font-weight: 600`. Content is `1` for pickup, `2` for dropoff.
    `aria-hidden="true"` — the dialog's accessible name carries the meaning.
  - Title: `DELIVERY INFO` — `font-size: 13px`, `font-weight: 600`,
    `letter-spacing: 0.1em`, `text-transform: uppercase`, colour `#6b675f`.
- **Address line**: the selected address, `font-size: 13px`, `line-height: 1.4`,
  colour `#6b675f`, `margin-bottom: 16px`. (Not in the visual reference — added so the user
  can tell which of the two stops they are filling in.)
- **Fields**: a `flex-column` with `gap: 12px`. Each field is `height: 48px`,
  `border: 1px solid #e7e4de`, `border-radius: 8px`, `background: #ffffff`,
  `padding: 0 14px`, `font-size: 15px`, text `#201f1c`.
  1. `Name` — placeholder `Name`, `aria-label="Name"`.
  2. Phone — the `48px` box is the container; inside it a static `+995` in `#6b675f`
     (`flex-shrink: 0`) then a borderless transparent input with `padding-left: 12px`,
     placeholder `Phone Number`, `inputmode="tel"`, `aria-label="Phone number"`.
  3. `Block/Floor/Room` — `aria-label="Block, floor or room"`.
- **Focus ring** (all three): `border-color: #ff5a1f` plus
  `box-shadow: 0 0 0 3px rgba(255,90,31,0.2)`.
- **Helper text**: `All fields are optional.` — `font-size: 12px`, colour `#6b675f`,
  `margin-top: 12px`.
- **Actions**: right-aligned row, `gap: 16px`, `margin-top: 22px`.
  - `Cancel` — text button, no border/background, `padding: 12px 8px`, `font-size: 15px`,
    `font-weight: 600`, colour `#ff5a1f`.
  - `Save` — `background: #ff5a1f`, text `#ffffff`, `border-radius: 8px`,
    `padding: 13px 32px`, `font-size: 15px`, `font-weight: 600`.
    Hover `#e94f18`.

### 3. Service level card (new)

Sits between step 6 (`Additional details`) and the `Price breakdown` panel. An unnumbered
card matching the step cards: `border: 1px solid #e7e4de`, `border-radius: 14px`,
`background: #ffffff`, `padding: 22px`.

- **Header row**: `Service level` on the left — `font-size: 11px`, `font-weight: 600`,
  `letter-spacing: 0.1em`, uppercase, `#6b675f`. On the right, `font-size: 11px`, `#6b675f`:
  `Prices appear after you calculate` before a quote exists, `Prices below are for this route`
  after.
- **Grid**: `grid-template-columns: repeat(3, minmax(0, 1fr))`, `gap: 10px`,
  `margin-top: 14px`.
- **Each card** is a `<button type="button" aria-pressed>`: `position: relative`,
  `flex-column`, `gap: 4px`, `border-radius: 12px`, `padding: 16px`, `min-height: 128px`,
  `text-align: left`.
  - Idle: `border: 1px solid #e7e4de`, `background: #ffffff`.
  - Selected: `border: 1px solid #ff5a1f`, `background: rgba(255,90,31,0.06)`.
  - Title: `font-size: 15px`, `font-weight: 600`, `#201f1c`.
  - Description: `font-size: 12px`, `line-height: 1.35`, `#6b675f`, `min-height: 32px` so
    the three prices stay on one baseline.
  - Price: `IBM Plex Mono`, `font-size: 21px`, `font-weight: 600`, `#201f1c`,
    `margin-top: 6px`. Before a quote: an em dash at `font-size: 15px`, colour `#a8a49b`.
  - Corner badge (Priority and Pooling only): `position: absolute; top: 10px; right: 10px`,
    `22 × 22`, `border-radius: 9999px`, `background: rgba(0,0,0,0.04)`, `font-size: 12px`,
    `font-weight: 700`. `⚡` in `#f5b301` for Priority, `%` in `#0f9d8f` for Pooling.
    Regular has no badge.

| Tier | Description | Price | Badge |
| --- | --- | --- | --- |
| Priority | `Match faster for quick deliveries` | Regular **+ $25** | `⚡` `#f5b301` |
| Regular | `Standard matching and delivery window` | the quoted fare (**default selection**) | none |
| Pooling | `Pick up within 2h, deliver within 4h` | Regular **− 10%** | `%` `#0f9d8f` |

### 4. Recommended vehicle (step 5) — modified

A body-type picker sits above the existing vehicle grid, inside the same step card.

- Label: `What kind of load space do you need?` — `font-size: 13px`, `font-weight: 500`,
  `margin-bottom: 10px`. The block has `margin-bottom: 18px` above the vehicle grid.
- Grid: `role="group" aria-label="Vehicle body type"`,
  `grid-template-columns: repeat(3, minmax(0, 1fr))`, `gap: 10px`.
- Cards use the same pick-card geometry as the cargo and vehicle cards
  (`position: relative`, `border-radius: 12px`, `padding: 14px`, idle
  `1px solid #e7e4de` on `#ffffff`, selected `1px solid #ff5a1f` on
  `rgba(255,90,31,0.06)`, orange `16 × 16` tick at `top: 10px; right: 10px`).
- Card contents: title `13px/600`; description `12px` in `#6b675f`; then a count in
  `IBM Plex Mono` `11px` `#6b675f` reading `N vehicles` — how many vehicles offer that
  body for the currently selected cargo.

| Body type | Description | Available on |
| --- | --- | --- |
| Dry Box (**default**) | `Enclosed and weather-proof` | every vehicle |
| Refrigerated | `Temperature-controlled load space` | 1.7 m Van, 2.5 m Van, 3.5 t Truck, 7 t Truck |
| Open Chassis | `Flatbed, loadable from any side` | 3.5 t Truck, 7 t Truck |

**Filtering.** The body type is an additional filter on the vehicle list, applied alongside
the existing cargo-category and weight filters. Changing it resets the weight selection and
the vehicle selection (the same reset the cargo change already does) and invalidates the
quote.

**Empty state.** If no vehicle satisfies body type + cargo + weight together, the vehicle
grid is replaced by an alert: `No vehicle matches this body type for your goods and weight.
Pick a different load space.` — `13px`, colour `#ff5a1f`, on
`rgba(255,90,31,0.08)` with a `1px solid rgba(255,90,31,0.3)` border, `border-radius: 8px`,
`padding: 12px 14px`. This mirrors the existing "No vehicle is currently available for these
goods" alert.

**"Best" badge collision.** On the selected vehicle card the teal `Best` badge and the orange
tick both sit top-right; the badge takes `margin-right: 20px` while selected so they don't
overlap.

### 5. Additional details (step 6) — modified

The `Request a helper / mover` checkbox stays. When it is checked, a helper-count picker
appears below it, `margin-left: 28px` (aligned to the checkbox label), `flex-column`,
`gap: 8px`:

- Label `How many helpers?` — `font-size: 13px`, `font-weight: 500`.
- A `role="group" aria-label="Number of helpers"` row, `gap: 8px`, of four
  `40 × 40` buttons labelled `1`–`4`, `border-radius: 8px`, `font-size: 14px`,
  `font-weight: 600`. Idle `border: 1px solid #e7e4de`, `background: #ffffff`, text
  `#201f1c`; selected `border-color: #ff5a1f`, `background: rgba(255,90,31,0.06)`, text
  `#ff5a1f`. Default `1`.
- Note below: `$20.00 per helper · $NN.00 added to the fare` — `font-size: 12px`, `#6b675f`.

The card's own copy changed from "charged as a flat fee on top of the fare" to
"charged as a flat fee **per helper** on top of the fare".

### 6. My orders (`/orders`) — restyled

`src/app/orders/page.tsx` + `src/components/order-card.tsx` currently render this page with
default Tailwind (plain `rounded border`, raw `IN_TRANSIT` enum strings, no landing tokens).
The prototype restyles it onto the booking page's language — same header rhythm, same card
geometry — without changing what it shows.

- **Shell**: `max-width: 48rem`, `padding: 32px 32px 64px`, `flex-column`, `gap: 24px`.
- **Header**: accent eyebrow `YOUR DELIVERIES` (`11px/600`, `letter-spacing: 0.24em`,
  uppercase, `#ff5a1f`) over `Your orders` at `40px/600`, `letter-spacing: -0.025em` —
  identical to the booking page's `NEW DELIVERY` / `Book a delivery` pair. `← New order`
  sits right-aligned and baseline-aligned, `14px/600`, hover `#ff5a1f`.
- **Card** (`<li>`): `border-radius: 14px`, `border: 1px solid #e7e4de`,
  `background: #ffffff`, `padding: 22px`; list `gap: 14px`.
- **Card top row**: status pill left, price right. Price is `IBM Plex Mono` `20px/600`,
  `letter-spacing: -0.01em`.
- **Status pill**: `border-radius: 9999px`, `padding: 4px 12px`, `font-size: 11px`,
  `font-weight: 600`, `letter-spacing: 0.06em`, uppercase, and **title-cased copy**
  (`In transit`, not `IN_TRANSIT`). `order-card.tsx`'s solid fills become soft washes so
  they sit on the light palette rather than shouting over it; all six semantics are kept.

  | Status | Background | Text |
  | --- | --- | --- |
  | Pending | `rgba(245,179,1,0.16)` | `#8a5a00` |
  | Claimed | `rgba(139,92,246,0.12)` | `#5b21b6` |
  | Accepted | `rgba(59,130,246,0.12)` | `#1d4ed8` |
  | In transit | `rgba(255,90,31,0.1)` | `#ff5a1f` (brand accent — the live state) |
  | Completed | `rgba(5,150,105,0.1)` | `#047857` |
  | Cancelled | `rgba(220,38,38,0.1)` | `#b91c1c` |

- **Route**: replaces the source's `From`/`To` `<dl>` rows with the same P/D endpoint rows
  the map panel uses — `20 × 20` badge, `rgba(255,90,31,0.1)` on `#ff5a1f`, `10px/600`,
  `gap: 10px`, address `14px` truncating. Stack `gap: 8px`, `margin-top: 16px`.
- **Meta row**: `margin-top: 16px`, `border-top: 1px solid #e7e4de`, `padding-top: 14px`,
  `flex-wrap` with `gap: 8px 20px`. Cargo / Distance / Vehicle, each an `11px/600`
  `0.1em` uppercase `#6b675f` label over a `13px/500` value; distance in `IBM Plex Mono`.
  The Vehicle cell is omitted entirely when `order.vehicle` is null, as the source does.
- **Track link**: `Track delivery →`, `14px/600`, `#ff5a1f`, `margin-top: 14px`. Same
  condition as the source — `driverId !== null` **and** status is `ACCEPTED` or
  `IN_TRANSIT`.
- **Empty state**: the source's bare `You haven't placed any orders yet.` becomes a centred
  panel — `border-radius: 14px`, `1px solid #e7e4de`, `background: #faf9f6`,
  `padding: 32px`, `14px` `#6b675f`.

No new data is shown: the card renders exactly the fields `OrderCardOrder` already carries.

### 6b. Payment (step 7) — new

Sits between step 6 and the Service level card, same step-card chrome, numbered badge `7`.
Subtitle: `Optional — you can book now and settle later.`

- **Options list**: `flex-column`, `gap: 10px`, `role="group" aria-label="Payment method"`.
  One row per saved card plus a final `Pay later` row. Each row is the standard pick-card
  (`1px solid #e7e4de` / selected `#ff5a1f` on `rgba(255,90,31,0.06)`, `border-radius: 12px`)
  laid out horizontally: `padding: 14px 16px`, `gap: 14px`, `align-items: center`.
  - Brand chip: `32px` tall, `min-width: 56px`, `border-radius: 6px`, `11px/700`,
    `letter-spacing: 0.04em`. Visa `rgba(59,130,246,0.12)`/`#1d4ed8`, Mastercard
    (`MC`) `rgba(245,179,1,0.16)`/`#8a5a00`, Amex `rgba(5,150,105,0.1)`/`#047857`,
    anything else `#f2f0eb`/`#6b675f`.
  - Title `14px/500` (`Visa •••• 4242`), note `12px` `#6b675f`
    (`Expires 08/28 · Default`). `Pay later` reads
    `Settle from your wallet after the delivery`.
  - Selected rows get a `16 × 16` accent tick pushed right with `margin-left: auto`.
- **Add card**: a full-width `1px dashed #e7e4de` button, `border-radius: 8px`,
  `padding: 11px 16px`, `14px/500`, `margin-top: 12px`; hover turns border and text
  `#ff5a1f`. Opens the same Add card dialog the Wallet page uses.
- **Not part of the gating chain.** The step is greyed out until a vehicle is chosen (like
  step 6), but leaving it unanswered never blocks Calculate or Book delivery — the default
  card is pre-selected and `Pay later` is a first-class choice.

### 6c. Add card dialog — new

Same overlay mechanics as the Delivery info popup (fixed inset-0 flex centring, absolute
backdrop, `modal-in`), panel `440px`.

- Title `ADD CARD` (`13px/600`, `0.1em`, uppercase, `#6b675f`) over
  `Credit or debit card. Nothing is charged until you book a delivery.`
- Fields, each `48px` tall on `1px solid #e7e4de`, `border-radius: 8px`, `padding: 0 14px`:
  **Card number** (`IBM Plex Mono`, `letter-spacing: 0.04em`, grouped in 4s as typed, max 19
  digits, with a live brand chip right-aligned inside the field once 2+ digits are entered),
  then **Expiry** (`MM/YY`, slash inserted automatically) and **CVC** (3–4 digits) side by
  side in a 2-column grid, then **Name on card**. Each has a `13px/500` label above it.
  `autocomplete` is set properly: `cc-number`, `cc-exp`, `cc-csc`, `cc-name`.
- **Set as default payment method** checkbox (`accent-color: #ff5a1f`), pre-checked when this
  is the client's first card.
- Footnote: `Gateway integration is pending, so no card is charged yet.` — this mirrors the
  note `admin/finance/payment-methods` already shows staff for `CARD`.
- `Cancel` (accent text) / `Save card` (accent fill). Save is disabled — `rgba(255,90,31,0.45)`,
  `cursor: not-allowed` — until number ≥ 14 digits, expiry matches `MM/YY`, CVC ≥ 3 digits,
  and a name is entered. Brand is derived from the leading digits **in the prototype only**;
  a real gateway returns it.

### 6d. Wallet → Payment methods (`/wallet`) — replaces the placeholder

`src/app/wallet/page.tsx` is currently an honest stub ("Wallet balance, top-ups and
transaction history aren't built yet"). It becomes a real page, same shell as My orders:
`max-width: 48rem`, `padding: 32px 32px 64px`, section `gap: 32px`. Header is the accent
eyebrow `WALLET` over `Payment methods` at `40px/600`, with `← New order` right-aligned.

Three sections, each led by an `11px/600` `0.1em` uppercase `#6b675f` heading:

1. **Saved cards** — heading row carries the accent `+ Add card` button
   (`9px 16px`, `border-radius: 8px`). Each card is a `14px`-radius white row on
   `#e7e4de`, `padding: 18px 20px`: brand chip, then masked number in
   `IBM Plex Mono` `15px/500` (`•••• •••• •••• 4242`) over
   `<name> · Expires MM/YY` at `12px` `#6b675f`; a `Default` pill
   (`rgba(255,90,31,0.1)`/`#ff5a1f`, `4px 12px`, `11px/600`, `0.06em`, uppercase) on the
   default card; and right-aligned `Make default` (`13px/600`, hidden on the default card)
   and `Remove` (`13px/600`, `#b91c1c`). Removing the default promotes the next card.
   Empty state: a dashed `#e7e4de` panel on `#faf9f6`, `padding: 32px`, centred —
   `No cards saved yet. Add a credit or debit card to pay for deliveries.`
2. **Transaction history** — one `14px`-radius bordered table.
   Header row on `#faf9f6`: `96px minmax(0,1fr) 120px 92px` = Date / Order / Method /
   Amount (right-aligned), `11px/600` `0.1em` uppercase. Body rows `13px`, `padding: 13px 18px`,
   amount in `IBM Plex Mono` `500`, order text truncating.
3. **Invoices & receipts** — one `14px`-radius white row per invoice, `padding: 16px 20px`:
   title `14px/500` over period `12px` `#6b675f`, amount in mono `15px/500` pushed right
   with `margin-left: auto`, then a `Download PDF` link in `13px/600` `#ff5a1f`.

**Client-side scope is card only.** The schema's `PaymentMethodType` also has `CASH`
("Cash on delivery") and `BANK_TRANSFER`, and `/admin/finance/payment-methods` toggles all
three platform-wide — but the client-facing flow here offers cards plus `Pay later`, per the
designer's decision. If a method is disabled in admin it must disappear from step 7.

### 7. Price breakdown + bottom bar — modified

The breakdown gains three lines after the existing Distance / Base fare / Distance fare /
Time fare rows:

- `Helpers × N` — `$20.00 × N`, only when helpers were requested (replaces the old
  single `Helper` row).
- `Regular fare` — the unmodified quoted fare.
- Then, depending on the selected tier: `Priority fee  +$25.00`, or
  `Pooling discount  −$X.XX`. Regular adds neither.
- `Total` — the tier-adjusted figure.

**Keep the minimum-fare note.** The source renders
`Minimum fare applied for this vehicle type.` (`mt-2.5 text-xs text-accent`) under the
breakdown whenever `price` exceeds the sum of its components, because the quote is floored at
the vehicle type's minimum fare. Without it the breakdown reads as bad arithmetic — an MPV on
a 1.1 km route shows `$8.00 + $1.00 + $0.38` against a `$12.00` fare. The booked-order
confirmation panel carries the same note; keep it in both.

The fixed bottom bar's `ESTIMATED TOTAL` shows the **selected tier's** price, and its caption
reads `<Tier> · <Vehicle label>`.

## Interactions & behaviour

- **Popup trigger**: fires when an address is *selected* from the autocomplete (in the app:
  when `AddressAutocomplete`'s `onLocationChange` resolves a place), for that field only.
  Typing does not trigger it. Re-selecting an address re-opens the popup, pre-filled with
  whatever was saved for that stop.
- **Cancel**: closes the popup and discards the draft. **The address stays in the field.**
- **Save**: closes the popup and stores the three values against that stop.
- **Escape** closes the popup (discard, same as Cancel). Backdrop click does the same.
- **Nothing is rendered on the Route card after Save** — no summary line, no "edit" link.
  This is a deliberate product decision, confirmed with the designer.
- **All three fields are optional.** No validation, no required markers, Save is never
  disabled.
- **Tier selection** does not invalidate the quote — switching tiers only re-derives the
  displayed price from the existing `regular` fare. Every *other* edit (route, cargo,
  weight, vehicle, helper count) invalidates the quote as it does today.
- **Calculate** relabels to `Recalculate` once a quote exists. A `Book delivery` outline
  button appears next to it at that point.

## State management

New client state on the booking form:

```ts
type StopContact = { name: string; phone: string; room: string };

const [contacts, setContacts] = useState<{
  pickup: StopContact | null;
  dropoff: StopContact | null;
}>({ pickup: null, dropoff: null });

// Which stop's popup is open, and the in-flight draft for it.
const [contactModalFor, setContactModalFor] = useState<"pickup" | "dropoff" | null>(null);
const [contactDraft, setContactDraft] = useState<StopContact>({ name: "", phone: "", room: "" });

const [serviceLevel, setServiceLevel] = useState<"PRIORITY" | "REGULAR" | "POOLING">("REGULAR");
const [helperCount, setHelperCount] = useState(1); // only meaningful while requiresHelper
const [bodyType, setBodyType] = useState<"DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS">("DRY_BOX");
```

Transitions:

- `onLocationChange` resolves for a field → `setContactModalFor(field)` and seed
  `contactDraft` from `contacts[field]` (or empties).
- Save → write `contactDraft` into `contacts[field]`, clear `contactModalFor`.
- Cancel / Escape / backdrop → clear `contactModalFor` only.
- `serviceLevel` change → **no** quote invalidation.
- `helperCount` change → invalidate the quote (it changes the fare).
- `bodyType` change → reset `maxWeightKg` and `vehicleTypeCode`, invalidate the quote.

Derived display price:

```ts
const PRIORITY_FEE = 25;
const POOLING_DISCOUNT = 0.1;

function priceFor(level: ServiceLevel, quotedPrice: number): number {
  if (level === "PRIORITY") return quotedPrice + PRIORITY_FEE;
  if (level === "POOLING") return quotedPrice * (1 - POOLING_DISCOUNT);
  return quotedPrice;
}
```

## Server changes needed

The prototype cannot make these; they are the real work behind the design.

1. **Persist stop contacts.** `Order` currently has `pickupAddress` / `dropoffAddress` and no
   contact fields. Add nullable `pickupContactName`, `pickupContactPhone`,
   `pickupContactDetails`, and the three `dropoff*` equivalents (or a `StopContact` relation
   if multi-stop is coming). Accept them in `POST /api/orders` and surface them to the driver
   and to the company ops order drawer.
2. **Service level.** Add a `ServiceLevel` enum (`PRIORITY | REGULAR | POOLING`) to `Order`,
   default `REGULAR`. `POST /api/orders` must take it and re-derive the price server-side —
   never trust the client's figure. `POST /api/pricing/estimate` should either return all
   three prices or accept a level; returning all three is cheaper (one geocode, three
   arithmetic results) and matches the design, which shows all three at once.
   `PRIORITY_FEE` and `POOLING_DISCOUNT` belong in `src/lib/pricing.ts` next to the existing
   rules, not in the component.
3. **Helper count.** `requiresHelper` is a boolean today and the helper fee is flat. Either
   add `helperCount: Int @default(0)` and make the fee `helperFee × count`, or keep the
   boolean and add the count alongside. `src/lib/pricing.ts` owns the multiplication.
4. **Body type on the vehicle taxonomy.** The prototype hard-codes which body each vehicle
   offers. In the app this belongs on `VehicleTypeSpec` (or a `VehicleBody` enum + join), so
   `GET` of the vehicle types returns the bodies each one supports and the client filter is
   data-driven rather than a literal table. Company-registered vehicles then need a body
   field too, and dispatch must only offer a vehicle whose body matches the order's — the
   same shape as the existing `vehicleTypeSpecId` match in
   `src/app/api/logistics-company/orders/[id]/dispatch/route.ts`. Add `bodyType` to `Order`.
   Decide whether Refrigerated carries a surcharge — the prototype charges nothing extra,
   which is almost certainly wrong for a reefer, and the designer has flagged it as an open
   question.
5. **Dispatch semantics for Priority/Pooling.** The design implies Priority is matched sooner
   and Pooling has a 2h pickup / 4h delivery window. Nothing in the current matching logic
   reads a service level — decide whether this is real dispatch behaviour or a pricing-only
   label before shipping, because the copy promises the former.

## Responsive behaviour

The page grid keeps the source's breakpoint exactly:
`grid items-start gap-6 lg:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]` — a single stacked
column below `1024px`, form-then-map two-up from `lg` up. Do not make it unconditionally
two-column; the map panel's four-up route-summary stat row cannot survive the ~180px column
that results at tablet widths. In the prototype that row is
`repeat(auto-fit, minmax(96px, 1fr))` so it wraps rather than overflows — worth keeping.

## Design tokens

Straight from `src/app/globals.css` — use the existing Tailwind utilities, not the literals.

| Token | Value | Used for |
| --- | --- | --- |
| `--landing-ink` | `#ffffff` | page background, cards, fields |
| `--landing-surface` | `#faf9f6` | breakdown panel, map panel, hover fills |
| `--landing-paper` | `#201f1c` | body text, headings |
| `--landing-muted` | `#6b675f` | secondary text, labels, placeholders |
| `--landing-accent` | `#ff5a1f` | step badges, selected borders, primary buttons |
| `--landing-line` | `#e7e4de` | all borders and dividers |

Non-token literals introduced by this design (add as needed):
`#e94f18` (accent hover), `#a8a49b` (empty-price grey), `#f5b301` (Priority bolt),
`#0f9d8f` (Pooling percent), `rgba(255,90,31,0.06)` (selected card fill),
`rgba(255,90,31,0.2)` (focus ring), `rgba(32,31,28,0.4)` (backdrop),
`0 24px 60px rgba(32,31,28,0.22)` (modal shadow),
`0 12px 32px rgba(32,31,28,0.12)` (autocomplete dropdown shadow).

Radii: `8px` fields and small buttons, `12px` picker cards, `14px` step cards and the modal,
`9999px` badges and the Calculate pill.

Type: `IBM Plex Sans` for everything (`--font-display` / `--font-body`); `IBM Plex Mono`
(`--font-price`) for every currency figure, distance, and vehicle dimension.
Scale in play: `40px/600` page title, `26px/600` bottom-bar total, `21px/600` tier price,
`16px/600` step titles, `15px` modal fields, `14px` body and inputs, `13px` labels and
descriptions, `12px` helper text, `11px` uppercase panel labels (`letter-spacing: 0.1em`),
`10px` route-summary stat labels (`0.08em`).

## Assets

- **Icons**: lucide-react, already a dependency. Cargo cards use `Sofa`, `Refrigerator`,
  `Boxes`, `PartyPopper`, `House`, `Factory`, `HardHat` — the exact mapping in
  `src/components/home/order-cargo-options.ts`. Vehicle cards use the hand-written
  `VanGlyph` / `TruckGlyph` SVGs already in `booking-form.tsx`. The prototype reproduces both
  faithfully; no new assets.
- **Map**: Google Maps JS API via the existing `RoutePreviewMap`. The grey grid panel in the
  prototype is a placeholder only — it is not a design for anything.
- **No images.** No raster assets are introduced.

## Files

- `design_handoff_booking_delivery_info/Book a Delivery.dc.html` — the design reference.
  Open it in a browser; it runs standalone. The popup opens by picking any pickup or dropoff
  suggestion; press Calculate to populate the three tier prices.

## Server changes needed for payment

7. **No card data may touch your server.** The prototype holds the raw number in component
   state because it has nowhere else to put it. In the app, the Add card form must post
   directly to the gateway (Stripe Elements, Adyen, BOG/TBC for Georgia) and store only the
   returned token plus `brand`, `last4`, `expMonth`, `expYear`, `holderName`. A
   `SavedCard` model keyed to the client with a `isDefault` flag covers the UI above.
   Never persist the CVC.
8. **Order needs a payment selection.** Add `paymentMethodType` (the existing
   `PaymentMethodType` enum) and a nullable `savedCardId` to `Order`, plus a
   `PAY_LATER`-style state if that is distinct from `CASH`. `POST /api/orders` accepts it;
   step 7 being optional means the field must be nullable.
9. **Respect the admin toggles.** `paymentMethodConfig` already decides which methods are
   offered at checkout. Step 7 must read that config, not hard-code cards.
10. **Transaction history and invoices have no backing tables.** The rows in the prototype
    are illustrative. Decide whether history is derived from completed orders or from real
    gateway charges, and whether invoices are generated documents or a rolled-up view.

## Open questions for the product owner

- Does **Refrigerated** cost more than Dry Box? The prototype prices them identically.
- Does **Open Chassis** change the helper requirement (crane/strapping)?
- Are **Priority** and **Pooling** real dispatch behaviours or pricing labels only?

Reference implementation files in the repo:

- `src/components/home/booking-form.tsx` — the page being modified.
- `src/components/home/order-cargo-options.ts` — cargo card taxonomy and icons.
- `src/components/address-autocomplete.tsx` — the Google Places field; its
  `onLocationChange` is the popup's trigger.
- `src/components/home/route-preview-map.tsx` — the real map panel.
- `src/lib/pricing.ts` — where the Priority fee, Pooling discount, and per-helper fee belong.
- `src/app/api/pricing/estimate/route.ts`, `src/app/api/orders/route.ts` — the endpoints to
  extend.
- `src/app/orders/page.tsx`, `src/components/order-card.tsx` — the My orders page and its
  card, including `STATUS_STYLES` and the track-link condition.
- `src/components/auth-status.tsx`, `src/app/layout.tsx` — the header nav and shell.
- `src/app/globals.css` — the `--landing-*` token block.
