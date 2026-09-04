# Requirements: Client Dashboard — Booking & Payment

## Summary

The signed-in client experience is roughly 330 lines of product code against a driver hub of ~8,000. It has no order detail page, no list affordances, prints US dollars for prices denominated in Georgian lari, and `/wallet` is an honest placeholder. This feature closes the largest gaps using the design handoff at `UI:UX/Client Dashboard/design_handoff_booking_delivery_info/`.

Six changes land in the booking flow: a delivery-info popup capturing a contact at each stop, a three-tier service level, a load-space (body) type filter, progressive step gating, a payment-method step, and a Business-only PO/cost-centre reference. `/orders` is restyled onto the booking page's visual language without changing what it shows. `/wallet` becomes a Payment methods page with saved cards.

The outcome is a client surface that looks like one product with the rest of the app, records the operational detail drivers actually need (who to call at each end, what body the load requires), and stops quoting the wrong currency.

## Goals

- Capture a contact name, phone and block/floor/room for both the pickup and the dropoff, and surface them to the driver and to company ops.
- Offer Priority / Regular / Pooling service levels with prices derived from the quoted fare, recorded on the order.
- Let a client filter vehicles by load space (Dry Box / Refrigerated / Open Chassis), driven by data on the vehicle taxonomy rather than a hard-coded table.
- Gate every step of the booking form until the one before it is answered.
- Give Business clients a PO / cost-centre reference on an order; Individual clients never see the field.
- Restyle `/orders` and rebuild `/wallet` onto the landing token set.
- Render every client-facing price in GEL (`₾`), not `$`.

## Non-Goals

- **`/account` (My account) is untouched.** Explicitly excluded by the user.
- **No payment gateway.** No provider has been chosen. No card is tokenised, stored or charged.
- **No transaction history and no invoices.** Neither has a backing table and there is no PDF pipeline. Both sections of the handoff's wallet design are omitted rather than filled with illustrative rows.
- **No dispatch behaviour for service levels.** The matching logic does not read `serviceLevel` in this pass. Copy must not promise that it does.
- **No body-type surcharge.** See Assumptions.
- **No consolidated invoicing and no VAT-ID-on-invoice work** — both depend on invoice tables that are out of scope.
- No order detail page (`/orders/[id]`), no reorder, no cancellation, no saved addresses, no ratings. Real gaps, but not in this handoff.
- No `dark:` utilities anywhere in this work. See Technical Constraints.

## Acceptance Criteria

- [ ] Selecting a pickup or dropoff suggestion opens the delivery-info dialog for that stop; typing does not. Cancel/Escape/backdrop discards the draft and leaves the address in the field.
- [ ] All three contact fields are optional; Save is never disabled; nothing is rendered on the Route card afterwards.
- [ ] Stop contacts persist on the order and appear in the driver hub job detail panel.
- [ ] The service-level card shows three tiers, defaults to Regular, and shows an em dash per tier until a quote exists.
- [ ] Switching tiers re-derives the displayed price without invalidating the quote. Every other edit still invalidates it.
- [ ] `Order.serviceLevel` and `Order.serviceLevelAdjustment` are set server-side from the client's chosen level — the client's price figure is never trusted.
- [ ] The body-type picker sits above the vehicle grid, defaults to Dry Box, filters the vehicle list, and resets weight + vehicle selection on change.
- [ ] When body + cargo + weight match no vehicle, the grid is replaced by the alert copy from the handoff.
- [ ] Each step is visually and interactively disabled until the previous step is answered.
- [ ] A Business client sees a PO / cost-centre field; an Individual client does not.
- [ ] `/orders` renders with the landing tokens, title-cased status pills, P/D endpoint rows and a meta row, showing no new data.
- [ ] `/wallet` lists saved cards with default/remove actions and an empty state, and carries the gateway-pending banner.
- [ ] Adding a card never transmits or persists the PAN or CVC.
- [ ] Every client-facing price renders as `₾` with two decimals.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.

## Assumptions

- **Handoff §5 and server-change §3 (helper count) are already implemented** by commit `e7a7441` and must not be rebuilt. `Order.helperCount` exists (`prisma/schema.prisma:803`), the fee is already per-helper (`src/lib/pricing.ts:276`), and `booking-form.tsx:1228-1279` renders a 1–4 crew picker using a native `fieldset`/`legend` with `sr-only` radios. The handoff's checkbox-plus-`aria-pressed`-buttons design is **older and worse** — it loses free arrow-key grouping and the "3 of 4" announcement. Keep what ships today. The helper fee is **₾40**, not $20.
- **No body-type surcharge, for either Refrigerated or Open Chassis.** The seeded catalogue already discriminates by body — Closed Box Van, Refrigerated Van, Refrigerated Truck and Flatbed Truck are separate `VehicleTypeSpec` rows with their own `PricingRule`s, and Refrigerated Van already prices above Closed Box Van. A body surcharge would double-charge a premium the catalogue already carries. If a reefer should cost more, the fix is to raise that type's own `PricingRule` rates — one place, and it scales with distance because `perKm` lives in the rule. Flatbeds are typically cheaper than an equivalent box body, not dearer.
- **The handoff's vehicle names do not exist.** `1.7 m Van`, `2.5 m Van`, `3.5 t Truck` and `7 t Truck` appear nowhere in the app. The real catalogue is eleven seeded types (`prisma/seed.ts:62-302`). Body mapping is derived from data, never from the handoff's table.
- **`Order.price` is GEL major units.** There is no `currency` column; GEL is asserted in comments and in the driver hub's five `formatGel` helpers. The handoff's `$` figures faithfully document a bug the app already has at eleven sites.
- **`--landing-accent-hover` already exists** as `#b4530f` (`src/app/globals.css:61`). Do not introduce the handoff's `#e94f18` as a second hover token for the same role.
- Priority `+25%` and Pooling `−10%` are starting values chosen because the prototype's flat `+25` is a 200% uplift on an MPV (₾12) and 28% on a trailer truck (₾90). They are tunable constants, not signed-off rates.

## Technical Constraints

- **The booking page does not carry `data-landing-page`.** The dark variant is `@custom-variant dark (&:is(.dark [data-landing-page], .dark [data-landing-page] *))` (`src/app/globals.css:29`), so `dark:` utilities are inert on every surface in this feature. **Write none.** The six `--landing-*` values are the only ones these pages will ever resolve.
- **Use the shadcn `Dialog`** at `src/components/ui/dialog.tsx`, retinted to landing tokens the way the date Popover is retinted at `booking-form.tsx:986-995`. The handoff prescribes a hand-rolled fixed-inset modal and warns against translate-centring — that warning is a prototype artifact of its own keyframe fill-mode and does not apply to Radix. Hand-rolling would mean re-implementing focus trap, scroll lock, `aria-modal` and Escape handling that `Dialog` already provides.
- **Translate every hex literal in the handoff to a Tailwind token utility** (`bg-ink`, `bg-surface`, `text-paper`, `text-muted`, `border-line`, accent utilities). The codebase's only inline-style precedent is a deliberate one-line token retint.
- **Semantic status colours use Tailwind palette utilities**, as the codebase already does — `STATUS_STYLES` (`order-card.tsx:8-15`), the emerald "Best" badge (`booking-form.tsx:1189-1191`). The landing token set contains no semantic status colour at all. Do not add `--landing-status-*` tokens.
- **`src/components/home/booking-form.tsx` is ~1,445 lines and eight features modify it.** Only one task per wave may edit it. Waves 3–7 are serialised on this file.
- **Formatters are per-screen by convention**, not shared. `src/components/driver-hub/screens/earnings-format.ts:11-15` records why: a cross-screen import ties one screen's money formatting to a file another screen is free to change. Each client screen gets its own `*-format.ts`.
- Every `Intl` formatter is pinned to `en-GB` — never the browser's locale. A client on a `de-DE` browser reading `₾1.200,50` beside a hard-coded `₾0.40` sees two different currencies.
- **Copy is British English.** No "please", no "oops", no exclamation marks, no emoji. Sentence case. Buttons are verb + object. `·` is the inline separator. Validation messages are imperatives naming the fix, never "invalid".
- `router.refresh()` after every successful mutation. Errors render inline as `<p role="alert">`, never `alert()`, preferring the server's own `{error}` wording.
- `pnpm lint`, `pnpm typecheck` and `pnpm build` must pass before a task is considered complete.
