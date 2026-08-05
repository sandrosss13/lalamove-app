# Task 05: Client booking form rework

## Status

complete

## Wave

3

## Description

Reworks the client-facing booking form and order-creation API to the new cargo/vehicle-type model:
a client picks a cargo category, a compatible vehicle type, optionally requests a helper, and gets a
real itemized price quote before booking — replacing the old package-type-only flow. This is the
primary "shipper" entry point to the platform and the main place the new pricing engine (task-02)
gets exercised by a real booking, not just an estimate.

## Dependencies

**Depends on:** task-02-pricing-engine.md
**Blocks:** None

**Context from dependencies:** task-02 built `src/lib/pricing.ts` exporting `parseQuoteFields`
(validates `{ pickupAddress, dropoffAddress, vehicleTypeCode, cargoCategory, requiresHelper }`) and
`estimateDelivery(input)` (returns `{ ok: true, estimate: { pickup, dropoff, distanceKm, breakdown } }`
where `breakdown` is `{ baseFare, distanceFare, timeFare, helperFee, price }`, or
`{ ok: false, reason, ... }` for `unresolved_address` / `invalid_vehicle_type` /
`cargo_vehicle_mismatch`). It also built `GET /api/vehicle-types` (public, returns all 10 seeded
`VehicleTypeSpec` rows with nested `pricingRule`) and `src/lib/cargo.ts` (`CARGO_CATEGORY_LABELS`,
`CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES`).

## Files to Modify

- `src/app/page.tsx` — the client booking form (signed-in `CLIENT` branch). Currently collects
  pickup/dropoff address (via `AddressAutocomplete`), a `packageType` select (hardcoded 4-option
  array — delete it), and a `vehicleType` select (from the now-deleted `VEHICLE_TYPE_GROUPS`).
  Replace with: a `cargoCategory` select (options from `CARGO_CATEGORY_LABELS`), a `vehicleTypeCode`
  select fetched from `GET /api/vehicle-types` on mount and filtered to only the types compatible
  with the currently-selected `cargoCategory` (using `CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES` —
  re-filter/reset the vehicle-type selection whenever the cargo category changes, since a previously
  valid selection may no longer be compatible), and a "Request a helper / mover" checkbox. Keep the
  `AddressAutocomplete` pickup/dropoff fields and the `description` textarea unchanged. On submit,
  `POST /api/orders` with `{ pickupAddress, dropoffAddress, cargoCategory, vehicleTypeCode, requiresHelper, description }`.
  Update the success state to show the itemized breakdown, not just a single total — e.g. distance,
  base fare, distance fare, time fare, helper fee (if requested), and the final price — similar
  spirit to the landing calculator's result display (task-08), but this doesn't need to match its
  exact visual style since this form isn't part of the landing page's design system (it uses plain
  Tailwind utility classes like the rest of the authenticated app, not the landing page's dark/orange
  theme).
- `src/app/api/orders/route.ts` — `POST` currently validates `packageType`/`vehicleType` against the
  old enums and calls `estimateDelivery({ pickupAddress, dropoffAddress, packageType })` from the old
  `src/lib/pricing.ts` shape. Update `parseCreateOrderBody` to validate the new fields
  (`cargoCategory`, `vehicleTypeCode`, `requiresHelper` optional boolean default `false`,
  `description` optional string, unchanged) — delegate cargo/address validation to task-02's
  `parseQuoteFields` (same pattern the current code already uses: "the quote fields are validated by
  the shared parser so this route and the public estimate endpoint reject the same input with the
  same messages"). Call `estimateDelivery(parsed.data)`; on `{ ok: false, reason: "unresolved_address", ... }`
  return `422` as before; on `invalid_vehicle_type`/`cargo_vehicle_mismatch` return `400` with the
  message task-02's endpoint uses for the same cases (keep both endpoints' error text consistent).
  On success, persist the order with the itemized breakdown fields (`baseFare`, `distanceFare`,
  `timeFare`, `helperFee`, `price` from `estimate.breakdown`), `distanceKm` from the estimate,
  `cargoCategory`, `requiresHelper`, `vehicleTypeSpecId` (look this up — `estimateDelivery` resolved
  it internally by code; either have `estimateDelivery` return the resolved `VehicleTypeSpec.id`
  alongside the breakdown, or re-look-up by `vehicleTypeCode` here — prefer the former, add
  `vehicleTypeSpecId: string` to `DeliveryEstimate`'s return shape in task-02's contract if it isn't
  already there; if task-02 already landed without it, adapt this task's code to do the lookup here
  instead rather than modifying task-02's file). `GET /api/orders` (same file) needs its `where`
  clause updated too: it currently filters driver-visible `PENDING`/unassigned orders by
  `vehicleType: { in: registeredVehicleTypes }` against the old enum — this task should leave that
  filter logically intact but update it to filter by `vehicleTypeSpecId` instead of the old
  `vehicleType` field (drivers' registered vehicle types now come from their `Vehicle.vehicleTypeSpecId`,
  via task-04's reworked driver vehicle model) — however, **the full driver-matching rework
  (including how a `CLAIMED`/company-mediated order interacts with this query) is task-07's
  responsibility**; this task should make the minimal change needed so `GET /api/orders` still
  compiles and returns sensible results for the CLIENT branch (unaffected) and doesn't crash for the
  DRIVER branch, without redesigning the driver-side matching logic — coordinate by making the
  narrowest correct change here (swap the field name/type in the existing filter) and let task-07
  layer the `CLAIMED`/company logic on top.

## Technical Details

### Order creation error shape (keep consistent with `/api/pricing/estimate`)

| Case | Status | Body |
|---|---|---|
| Missing/invalid field | 400 | `{ error: "<field> is required." }` etc., mirroring `parseQuoteFields`'s messages |
| Unrecognized address | 422 | `{ error: "Could not locate address: <address>" }` |
| Unknown `vehicleTypeCode` | 400 | `{ error: "vehicleTypeCode must be a known vehicle type." }` |
| Cargo/vehicle mismatch | 400 | `{ error: "This cargo category cannot be booked with a <category> vehicle; it requires <required category>." }` |

### Booking form UX notes

- Fetch `GET /api/vehicle-types` once on mount (client component, already `"use client"`); store in
  state; derive the filtered options list from the current `cargoCategory` selection on each render
  rather than re-fetching.
- Group the vehicle-type `<select>` by `category` (`optgroup` for Medium-Duty / Heavy-Duty), same
  pattern the old form used for its vehicle-type groups.
- Show the selected vehicle type's `maxPayloadKg` and dimensions as small helper text under the
  select, so a shipper can sanity-check their cargo fits — this data is already in the fetched list,
  no extra request needed.

## Acceptance Criteria

- [ ] The booking form on `/` (signed-in `CLIENT` branch) shows cargo category, a vehicle-type
      picker filtered to that category's allowed vehicle categories, and a helper checkbox — no
      trace of the old package-type select remains.
- [ ] Selecting `FULL_RELOCATION`, `INDUSTRIAL_SUPPLIES`, or `CONSTRUCTION_MATERIALS` only offers
      `HEAVY_DUTY` vehicle types in the picker; the other four cargo categories offer both.
- [ ] Submitting the form creates a real `Order` row with the itemized price fields populated and
      matching what `/api/pricing/estimate` would quote for the same inputs.
- [ ] Requesting a helper increases the final price by exactly that vehicle type's `helperFee`.
- [ ] `GET /api/orders` continues to work without crashing for both `CLIENT` and `DRIVER` sessions
      (the DRIVER branch's exact matching semantics may still be incomplete pending task-07 — that's
      acceptable for this task, but it must not throw/500).
- [ ] `pnpm lint`/`pnpm typecheck` pass for every file this task touches.
- [ ] Verified live: book a real order end-to-end as a test client for at least two different
      cargo/vehicle combinations (one Medium-Duty-eligible, one Heavy-Duty-only), confirm the
      persisted price breakdown, then clean up test data.

## Notes

- Do not touch `src/app/api/orders/[id]/accept/route.ts`, `src/app/orders/page.tsx`, or anything
  under `src/app/api/logistics-company/` — those are task-07's scope.
- Do not touch the landing page (`src/components/landing/`) — task-08's scope, even though it uses
  the same underlying pricing engine.
