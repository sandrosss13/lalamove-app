# Task 02: Pricing engine & public vehicle-type reference API

## Status

complete

## Wave

2

## Description

Replaces the flat "distance × per-package-rate" pricing (`src/lib/pricing.ts`, the
`PACKAGE_TYPE_PRICE_PER_KM` table in `src/lib/geo.ts`) with a real quoting engine driven by the
seeded `VehicleTypeSpec`/`PricingRule` data: base fare + distance fare + time fare + an optional
helper fee, floored at a per-type minimum fare. Also exposes a public, read-only endpoint listing
the vehicle types (with their specs) so both the client booking form (task-05) and the landing page
calculator (task-08) can build their pickers from real data instead of a hardcoded array.

## Dependencies

**Depends on:** task-01-schema-and-seed.md
**Blocks:** task-05-client-booking.md, task-08-landing-page-rework.md

**Context from dependencies:** task-01 created `VehicleTypeSpec` (code, label, category,
maxPayloadKg, cargoLengthM/cargoWidthM/cargoHeightM, loadingAccessType) each with exactly one
`PricingRule` (baseFare, pricePerKm, pricePerMinute, freeLoadingMinutes, overtimeRatePerMinute,
helperFee, minimumFare), and seeded 10 rows (5 `MEDIUM_DUTY`, 5 `HEAVY_DUTY` — see task-01 for the
full table). It also added `CargoCategory` (FURNITURE_FURNISHINGS, APPLIANCES, RETAIL_STOCK,
EVENT_EQUIPMENT, FULL_RELOCATION, INDUSTRIAL_SUPPLIES, CONSTRUCTION_MATERIALS) and reshaped `Order`
to carry `cargoCategory`, `requiresHelper`, and itemized price fields
(`baseFare`/`distanceFare`/`timeFare`/`helperFee`/`price`). The old `PackageType` enum and flat
`VehicleType` enum no longer exist — `pnpm typecheck` is currently failing in files that reference
them, including this task's own target files.

## Files to Modify

- `src/lib/geo.ts` — remove `PACKAGE_TYPE_PRICE_PER_KM` and the old `calculatePrice` function
  entirely (pricing math moves to `src/lib/pricing.ts`, described below); keep `geocodeAddress`,
  `suggestAddresses`, `haversineDistanceKm`, and all the LocationIQ rate-limiting machinery
  unchanged — none of that is part of this pivot.
- `src/lib/pricing.ts` — full rewrite. Currently exports `parseQuoteFields`/`estimateDelivery`
  built around `{ pickupAddress, dropoffAddress, packageType }`; replace with the shape described
  below.
- `src/app/api/pricing/estimate/route.ts` — update to the new request/response shape (still public,
  still rate-limited — reuse `checkRateLimit`/`src/lib/rate-limit.ts` unchanged, same 6-per-minute
  budget).

## Files to Create

- `src/lib/cargo.ts` — the `CargoCategory` → allowed `VehicleCategory` eligibility map (see below),
  plus a human-readable label lookup for each `CargoCategory` value (mirroring how
  `src/lib/vehicle-types.ts` used to expose labels — that old file's `VEHICLE_TYPE_GROUPS`/
  `vehicleTypeLabel` are gone as of task-01's schema change removing the enum they described;
  delete `src/lib/vehicle-types.ts` entirely as part of this task since nothing needs the old
  static option list anymore, and grep the codebase for any remaining import of it to confirm
  nothing else references it before deleting).
- `src/app/api/vehicle-types/route.ts` — public `GET`, no auth required (this is reference data, not
  sensitive), returns every `VehicleTypeSpec` with its nested `pricingRule`. Cheap DB read, no rate
  limiting needed (unlike the estimate endpoint, this doesn't spend the LocationIQ budget).

## Technical Details

### Cargo category eligibility (`src/lib/cargo.ts`)

```ts
import { CargoCategory, VehicleCategory } from "@prisma/client";

export const CARGO_CATEGORY_LABELS: Record<CargoCategory, string> = {
  FURNITURE_FURNISHINGS: "Furniture & Furnishings",
  APPLIANCES: "Home & Office Appliances",
  RETAIL_STOCK: "Store & Retail Stock",
  EVENT_EQUIPMENT: "Event & Exhibition Equipment",
  FULL_RELOCATION: "Full Relocation",
  INDUSTRIAL_SUPPLIES: "Industrial & Commercial Supplies",
  CONSTRUCTION_MATERIALS: "Construction & Hardware Materials",
};

/** Which vehicle categories a cargo category may be booked with. */
export const CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES: Record<
  CargoCategory,
  VehicleCategory[]
> = {
  FURNITURE_FURNISHINGS: ["MEDIUM_DUTY", "HEAVY_DUTY"],
  APPLIANCES: ["MEDIUM_DUTY", "HEAVY_DUTY"],
  RETAIL_STOCK: ["MEDIUM_DUTY", "HEAVY_DUTY"],
  EVENT_EQUIPMENT: ["MEDIUM_DUTY", "HEAVY_DUTY"],
  FULL_RELOCATION: ["HEAVY_DUTY"],
  INDUSTRIAL_SUPPLIES: ["HEAVY_DUTY"],
  CONSTRUCTION_MATERIALS: ["HEAVY_DUTY"],
};
```
This mirrors this project's existing pattern of small, plain-data lib modules (compare
`src/lib/rate-limit.ts`). It's imported both server-side (validation) and safely from client
components (no Prisma client instantiation, just the enum types + plain objects — same reasoning
the old `src/lib/vehicle-types.ts` doc comment gave for why it duplicated enum values instead of
importing `@prisma/client` runtime code into a client bundle; `import type`-only usage of the enum
*types* is fine, but note `CargoCategory`/`VehicleCategory` are used here as runtime object keys via
`@prisma/client`'s generated enum objects, not just types — confirm this doesn't pull Prisma's
client runtime into the browser bundle; if it does, duplicate the string literals directly instead,
same as the old file did for `AddressSuggestion`).

### Pricing engine (`src/lib/pricing.ts`)

```ts
export type QuoteInput = {
  pickupAddress: string;
  dropoffAddress: string;
  vehicleTypeCode: string; // VehicleTypeSpec.code, e.g. "BOX_TRUCK"
  cargoCategory: CargoCategory;
  requiresHelper: boolean;
};

export type PriceBreakdown = {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  helperFee: number;
  price: number; // sum of the above, floored at pricingRule.minimumFare
};

export type DeliveryEstimate = {
  pickup: LatLng;
  dropoff: LatLng;
  distanceKm: number;
  breakdown: PriceBreakdown;
};

export type DeliveryEstimateResult =
  | { ok: true; estimate: DeliveryEstimate }
  | { ok: false; reason: "unresolved_address"; unresolvedAddress: string }
  | { ok: false; reason: "invalid_vehicle_type" }
  | { ok: false; reason: "cargo_vehicle_mismatch" };
```

- `parseQuoteFields(record)` — hand-rolled validation (same pattern as the file's current version):
  `pickupAddress`/`dropoffAddress` required non-empty strings, `vehicleTypeCode` required string,
  `cargoCategory` required and must be a valid `CargoCategory` value, `requiresHelper` optional
  boolean (default `false` if omitted, reject if present and not a boolean).
- `estimateDelivery(input)`:
  1. Look up the `VehicleTypeSpec` by `vehicleTypeCode` (with its `pricingRule`). Not found →
     `{ ok: false, reason: "invalid_vehicle_type" }`.
  2. Check `CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[cargoCategory]` includes the spec's
     `category`. If not → `{ ok: false, reason: "cargo_vehicle_mismatch" }`.
  3. Geocode both addresses via the existing `geocodeAddress` (unchanged import from `src/lib/geo.ts`).
     Either fails → `{ ok: false, reason: "unresolved_address", unresolvedAddress: <the one that failed> }`
     (pickup checked first, matching the current file's existing behavior/comment about reporting
     pickup first when both fail).
  4. `distanceKm = haversineDistanceKm(pickup, dropoff)`.
  5. Estimate minutes: `const AVERAGE_SPEED_KMH = 30; const estimatedMinutes = (distanceKm / AVERAGE_SPEED_KMH) * 60;`
     (a simple constant — no live traffic data, this is a reasonable illustrative assumption,
     document it with a one-line comment).
  6. Compute the breakdown:
     ```
     baseFare = pricingRule.baseFare
     distanceFare = distanceKm * pricingRule.pricePerKm
     timeFare = estimatedMinutes * pricingRule.pricePerMinute
     helperFee = requiresHelper ? pricingRule.helperFee : 0
     rawTotal = baseFare + distanceFare + timeFare + helperFee
     price = Math.max(rawTotal, pricingRule.minimumFare)
     ```
     Round every currency value the same way the old code did:
     `Math.round(value * 100) / 100`.
  7. Return `{ ok: true, estimate: { pickup, dropoff, distanceKm, breakdown } }`.

### `POST /api/pricing/estimate` (public, rate-limited)

Request body: `{ pickupAddress, dropoffAddress, vehicleTypeCode, cargoCategory, requiresHelper? }`.
Same rate-limit-before-parsing order as the current implementation (`checkRateLimit` first, `6`
requests per `60_000`ms window per caller IP, `429` with the existing message on rejection — do not
change `src/lib/rate-limit.ts`, it's unrelated to this pivot). On success, return
`{ distanceKm, ...breakdown }` (i.e. flatten `PriceBreakdown`'s fields alongside `distanceKm` at the
top level) — still never leak resolved lat/lng, matching the current endpoint's minimal-response
philosophy. On a validation error, `400` with the specific message. On `unresolved_address`, `422`
with `Could not locate address: <address>` (same shape as before). On `invalid_vehicle_type` or
`cargo_vehicle_mismatch`, `400` with a clear message (e.g. `"vehicleTypeCode must be a known vehicle type."` /
`"This cargo category cannot be booked with a MEDIUM_DUTY vehicle; it requires HEAVY_DUTY."` —
interpolate the actual mismatch for a useful error).

### `GET /api/vehicle-types` (public, no rate limit)

Returns:
```json
[
  {
    "code": "BOX_TRUCK",
    "label": "Box Truck",
    "category": "HEAVY_DUTY",
    "maxPayloadKg": 3500,
    "cargoLengthM": 4.5,
    "cargoWidthM": 2.1,
    "cargoHeightM": 2.2,
    "loadingAccessType": "TAIL_LIFT",
    "pricingRule": { "baseFare": 25, "pricePerKm": 2.4, "pricePerMinute": 0.35, "freeLoadingMinutes": 25, "overtimeRatePerMinute": 0.6, "helperFee": 20, "minimumFare": 35 }
  },
  ...
]
```
Order by `category` then `label` so Medium-Duty types list before Heavy-Duty (a reasonable default
for a picker UI — task-05/task-08 can group by category however fits their layout).

## Acceptance Criteria

- [ ] `src/lib/geo.ts` no longer exports or references `PACKAGE_TYPE_PRICE_PER_KM` or the old
      `calculatePrice`; geocoding functions are unchanged.
- [ ] `src/lib/pricing.ts` exports `parseQuoteFields`, `estimateDelivery`, and the types above,
      computing price from the seeded `PricingRule` data (verify: querying the same route/vehicle
      type twice with `requiresHelper: false` vs `true` produces a price difference equal to that
      type's `helperFee`; querying two different vehicle types on the same route produces different
      base fares).
- [ ] `src/lib/cargo.ts` exists with the eligibility map and labels; booking `FULL_RELOCATION` cargo
      against a `MEDIUM_DUTY` vehicle type is rejected with `cargo_vehicle_mismatch`.
- [ ] `src/lib/vehicle-types.ts` is deleted and nothing imports it.
- [ ] `POST /api/pricing/estimate` and `GET /api/vehicle-types` behave as specified above, verified
      live against the dev server (curl): a valid quote returns a real price; an unrecognized
      address returns `422`; an invalid `vehicleTypeCode` returns `400`; a cargo/vehicle mismatch
      returns `400`; 7 rapid estimate requests from the same caller trigger a `429` on the 7th;
      `GET /api/vehicle-types` returns exactly 10 entries matching task-01's seed data.
- [ ] `pnpm lint` and `pnpm typecheck` pass for every file this task touches or creates (the rest of
      the codebase may still fail to typecheck until later waves land — that's expected, not a
      regression caused by this task).

## Notes

- Do not touch `src/app/api/orders/route.ts` or the booking form — those are task-05's scope, even
  though they'll consume this task's `estimateDelivery`. Just make sure the function signature and
  behavior documented above is exactly what you ship, since task-05 is written assuming it.
- Do not touch anything under `src/app/api/logistics-company/` or `src/app/api/driver-profile/` —
  those are task-03/task-04.
