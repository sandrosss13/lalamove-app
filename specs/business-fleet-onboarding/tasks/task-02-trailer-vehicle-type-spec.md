# Task 02: Seed the `TRAILER_TRUCK` Vehicle Type Spec

## Status

pending

## Wave

1

## Description

The fleet wizard offers five vehicle classes, and the fifth — Trailer Truck, 18–24 t articulated, category CE — has nothing behind it. Every one of the ten seeded `VehicleTypeSpec` rows tops out at `LARGE_FREIGHT_TRUCK`'s 10,000 kg, so without a new row the entire Trailer Truck column locks in step 2 and the class is unreachable in both onboarding flows. This task adds exactly one row to `prisma/seed.ts`: `TRAILER_TRUCK`, 24,000 kg, 13.60 × 2.48 × 2.70 m, `HEAVY_DUTY`, with the `PricingRule` every seeded spec carries.

This is the only `VehicleTypeSpec` row this feature adds. Do not add rows for the refrigerated or open-chassis trailer combinations — those stay locked like any other unbacked cell (see requirements.md's Non-Goals). The row is small but its blast radius is not: the moment it exists it is a bookable, chargeable vehicle type on the public site, so read the pricing section below before picking numbers.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-04-vehicle-class-taxonomy.md

**Context from dependencies:** None — this is a Wave 1 task. It is fully independent of task-01: task-01 changes `prisma/schema.prisma`, this task changes `prisma/seed.ts`, and neither reads the other's output. `VehicleTypeSpec`, `PricingRule`, `VehicleCategory` and `LoadingAccessType` all already exist in the schema exactly as this task needs them; no schema change is part of this task.

Downstream, task-04 maps `TRAILER_TRUCK × DRY_BOX` in `src/lib/driver-onboarding/vehicle-classes.ts` to the string `"TRAILER_TRUCK"` — the `code` seeded here. That string is the contract between the two tasks: **`code` must be exactly `TRAILER_TRUCK`**, matching the naming of the ten existing codes (`LARGE_FREIGHT_TRUCK`, `REFRIGERATED_VAN`, …). The other two trailer cells (`REFRIGERATED`, `OPEN_CHASSIS`) resolve to `null` in that map and lock in the UI.

## Files to Modify

- `prisma/seed.ts` — one new entry appended to the `VEHICLE_TYPE_SEEDS` array.

## Technical Details

### 1. The new seed entry

Append this as the **last** element of `VEHICLE_TYPE_SEEDS`, directly after the `LARGE_FREIGHT_TRUCK` entry. Match the existing entries' shape and field order exactly — the array is typed `VehicleTypeSeed[]`, so a missing or misnamed field is a typecheck failure, and the nested `pricing` object is destructured off in `main()` (`const { pricing, ...spec } of VEHICLE_TYPE_SEEDS`) before the upsert, so it must stay nested under `pricing`, not flattened.

```ts
  {
    code: "TRAILER_TRUCK",
    label: "Trailer Truck",
    category: VehicleCategory.HEAVY_DUTY,
    maxPayloadKg: 24000,
    cargoLengthM: 13.6,
    cargoWidthM: 2.48,
    cargoHeightM: 2.7,
    loadingAccessType: LoadingAccessType.REAR_DOOR,
    pricing: {
      baseFare: 65,
      pricePerKm: 4.6,
      pricePerMinute: 0.65,
      freeLoadingMinutes: 40,
      overtimeRatePerMinute: 1.2,
      helperFee: 40,
      minimumFare: 90,
    },
  },
```

Write the numeric literals as `13.6` / `2.7`, not `13.60` / `2.70`. The design handoff states the dimensions to two decimals (13.60 × 2.48 × 2.70 m) and those are the same numbers, but the existing entries use plain JS numeric literals (`2.0`, `1.4`, `2.6`) and Prettier normalises trailing zeros away — `13.60` would be reformatted and fail `pnpm lint` on a `--check` run.

No other change to `prisma/seed.ts` is needed. Do not touch `main()`, the `VehicleTypeSeed` type, the existing ten entries, or the file's header comment (the "every rate below is an ILLUSTRATIVE PLACEHOLDER" warning already covers this row and stays accurate).

### 2. Why `loadingAccessType: REAR_DOOR`

The enum offers `REAR_DOOR | SIDE_DOOR | RAMP | TAIL_LIFT | OPEN_FLATBED`. `REAR_DOOR` is the only defensible value for a standard 13.6 m dry-box semi-trailer, and the reasoning matters because this field is displayed to clients choosing a vehicle:

- **`TAIL_LIFT` (what `LARGE_FREIGHT_TRUCK` uses) would be a false promise.** A tail lift means kerbside, ground-level loading with no dock. Tail lifts are a rigid-truck feature; on a 24 t articulated semi-trailer they are rare, heavy and expensive, and a client who books expecting kerbside loading and gets a trailer that can only back onto a dock has been mis-sold. This is the one wrong answer that actually costs someone a delivery.
- **`SIDE_DOOR` is a curtainsider claim.** `CURTAINSIDER_TRUCK` legitimately uses it; a dry-box trailer's sides are rigid panels.
- **`RAMP` describes a vehicle transporter or a low-loader, not a box trailer.**
- **`OPEN_FLATBED` is plainly wrong for a dry box** — it is what `FLATBED_TRUCK` uses, and the open-chassis trailer cell is locked precisely because no spec backs it.

`REAR_DOOR` says "loaded through the rear, at a dock" — which is what an articulated dry-box trailer is. The field is display-only in this codebase: `GET /api/vehicle-types` projects it, the booking picker (`src/components/home/order-vehicle-types.ts`) and `src/components/company-vehicle-card.tsx` render it through a label map, and nothing in `src/lib/pricing.ts` or the order-matching routes reads it. So it cannot mis-*match* an order — but it can mislead the client reading the picker, which is why the value still has to be right.

### 3. The pricing figures are placeholders and need ops sign-off

The spec figures (24,000 kg, 13.60 × 2.48 × 2.70, `HEAVY_DUTY`) come from the approved design handoff and are real. **The seven `pricing` numbers do not.** They are scaled by hand from `LARGE_FREIGHT_TRUCK` (10,000 kg → 24,000 kg, a 2.4× payload step) using the same sublinear progression the existing catalogue shows between `CURTAINSIDER_TRUCK` and `LARGE_FREIGHT_TRUCK` — roughly a 1.4–1.5× uplift on the money fields rather than a 2.4× one, plus ten extra free loading minutes because a 13.6 m trailer genuinely takes longer to load:

| Field | `LARGE_FREIGHT_TRUCK` | `TRAILER_TRUCK` (placeholder) |
|---|---|---|
| `baseFare` | 45 | 65 |
| `pricePerKm` | 3.5 | 4.6 |
| `pricePerMinute` | 0.5 | 0.65 |
| `freeLoadingMinutes` | 30 | 40 |
| `overtimeRatePerMinute` | 0.9 | 1.2 |
| `helperFee` | 30 | 40 |
| `minimumFare` | 60 | 90 |

Every figure is strictly above the corresponding `LARGE_FREIGHT_TRUCK` figure, which keeps the catalogue monotonic — the landing-page calculator and the booking picker both highlight the "best fit" type by comparing `pricingRule.baseFare` (`src/components/landing/landing-category-tiles.tsx:204`, `src/components/home/order-vehicle-types.ts`), so a trailer priced below a smaller truck would make the cheapest-eligible highlight nonsense.

**State this plainly in the pull request and do not treat sign-off as done.** `specs/business-fleet-onboarding/action-required.md` carries it as the first "Before Implementation" item: *"Sign off on the `TRAILER_TRUCK` pricing rule figures… Confirm the rates with whoever owns pricing before this reaches production."* Correcting them later is a one-line change plus a re-seed, since the seed upserts.

### 4. This row becomes bookable and chargeable the moment it exists

There is no draft, hidden or feature-flag state for a `VehicleTypeSpec`. `GET /api/vehicle-types` (`src/app/api/vehicle-types/route.ts`) is a **public, unauthenticated, unfiltered** `prisma.vehicleTypeSpec.findMany()` — no `where` clause of any kind. Everything downstream follows from that:

- The client booking form's vehicle picker and the landing page's quote calculator both build their option lists from that response, so Trailer Truck appears as a selectable option to every visitor as soon as the seed runs.
- `src/lib/pricing.ts` looks the spec up by id with `include: { pricingRule: true }` and quotes real money from `pricingRule` (`baseFare`, `pricePerKm`, `pricePerMinute`, `helperFee`, `minimumFare`, and `overtimeRatePerMinute` at completion). A client can be charged these numbers on the first order placed after the seed.
- `src/components/landing/landing-category-tiles.tsx:218` destructures `const { baseFare, pricePerKm } = vehicleType.pricingRule` with **no null check**. A `VehicleTypeSpec` seeded without a `PricingRule` would throw on the public landing page. This is why the `pricing` block is not optional and must ship in the same commit as the spec row — never seed the spec first and the rule later.

### 5. The seed is idempotent — re-run it freely

`main()` upserts on `VehicleTypeSpec.code`, and the nested `pricingRule` is itself an `upsert` inside the `update` branch (deliberately, per the in-file comment, "so a spec seeded before its pricing rule existed still gets one on a re-run"). Consequences worth knowing:

- Running `pnpm exec prisma db seed` twice does not create a second `TRAILER_TRUCK` row and does not duplicate its pricing rule.
- Changing a figure in `VEHICLE_TYPE_SEEDS` and re-seeding **retunes the existing row in place**, keeping its `id` — so existing `Vehicle.vehicleTypeSpecId` and `Order.vehicleTypeSpecId` references survive. That is what makes the ops sign-off in section 3 a cheap correction rather than a migration.
- The seed prints `Seeded ${count} vehicle type specs.` from a `count()` of the whole table, so after this task it prints **11**, not 1. That is the existing behaviour; do not change it.

Run it with `pnpm exec prisma db seed` after making the edit. `action-required.md` lists this under "During Implementation".

## Acceptance Criteria

- [ ] `prisma/seed.ts` has exactly one new `VEHICLE_TYPE_SEEDS` entry, appended last, with `code: "TRAILER_TRUCK"`, `label: "Trailer Truck"`, `category: VehicleCategory.HEAVY_DUTY`, `maxPayloadKg: 24000`, `cargoLengthM: 13.6`, `cargoWidthM: 2.48`, `cargoHeightM: 2.7`, `loadingAccessType: LoadingAccessType.REAR_DOOR`.
- [ ] Its nested `pricing` object carries all seven required fields with the values in the table above, and every one is strictly greater than `LARGE_FREIGHT_TRUCK`'s.
- [ ] No other entry in `VEHICLE_TYPE_SEEDS` is changed, added or reordered, and `main()`, the `VehicleTypeSeed` type and the file header are untouched.
- [ ] `pnpm exec prisma db seed` runs clean and reports `Seeded 11 vehicle type specs.`
- [ ] Running it a second time still reports 11 and leaves exactly one `TRAILER_TRUCK` row with exactly one `PricingRule` attached (idempotence check).
- [ ] `GET /api/vehicle-types` returns the new type with a non-null `pricingRule`, and the landing page and booking picker render without throwing.
- [ ] The pull request description states that the pricing figures are unsigned-off placeholders and links `specs/business-fleet-onboarding/action-required.md`.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Do **not** add `REFRIGERATED_TRAILER`, `FLATBED_TRAILER` or any other spec row. The other two trailer cells lock in the UI, which is the deliberate behaviour requirements.md's Non-Goals record: a locked cell is honest, whereas falling back to a mismatched spec misprices orders and mis-matches cargo.
- Do **not** add a `requiredLicenceCategory`, a vehicle-class column, or any other field to `VehicleTypeSpec`. The (class × chassis) → spec-code map lives entirely in a TypeScript constant owned by task-04, not in the database.
- Do not attempt to hide the new type from the public picker with a flag or a filter. There is no such mechanism today, adding one would touch the public booking path, and the honest fix for "we are not ready to sell this" is to hold the pull request until pricing is signed off — which is exactly what the `action-required.md` item is for.
- The `cargoHeightM: 0` sentinel documented on `VehicleTypeSpec` ("`0` means open / no height limit") does **not** apply here: this is a dry box with a real 2.70 m ceiling. `FLATBED_TRUCK` is the only row that uses the sentinel.
