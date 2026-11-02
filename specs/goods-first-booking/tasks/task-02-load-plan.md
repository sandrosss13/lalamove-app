# Task 02: Load-plan module — derive the load from items and recommend a vehicle

## Status

complete

## Wave

1

## Description

A pure, client-safe module, `src/lib/orders/load-plan.ts`, turns a list of item lines into a **load plan**: total weight, item and packed volume, floor area of non-stackable items, the largest-item envelope, the derived cargo category, the derived body type, the handling tags and the suggested crew. A second function then ranks vehicle classes against that plan.

The booking form uses it to recommend a vehicle. `POST /api/orders` uses it to re-derive what goes on the order. One implementation, two callers. That is the rule `booking-fit.ts` and `dispatch-fit.ts` already follow.

## Dependencies

**Depends on:** none
**Blocks:** task-06, task-09

## Files to Modify

- `src/lib/orders/load-plan.ts` — new
- `tests/load-plan.spec.ts` — new
- `src/lib/vehicle-body.ts` — new, the moved `vehicleOffersBody` predicate
- `src/components/home/order-vehicle-types.ts` — re-export it

## Technical Details

### Implementation Steps

1. **Read first:** `src/lib/orders/booking-fit.ts` in full (especially `specCapability`, `oversizeAxes`, the `0`-height open-bed sentinel and why it must go through `capabilityOf`), `src/lib/cargo.ts` (`CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES`, `CARGO_MEASUREMENT_BOUNDS`), `tests/dispatch-fit.spec.ts` (header and style), and how `booking-fit.ts` types enum values without importing Prisma. Mirror that typing approach.

2. **No `server-only`, no Prisma import, no Prisma types in signatures.** Say so in the module header and say why.

3. **Types** (names indicative; fit them to the existing vocabulary):

   ```ts
   export type LoadLine = {
     quantity: number;
     unitWeightKg: number;
     lengthM: number; widthM: number; heightM: number;
     stackable: boolean;
     needsTwoPeople: boolean;
     requiredBody: ChassisTypeKey | null;
     handlingTags: HandlingTagKey[];
     cargoCategory: CargoCategoryKey;
   };

   export type LoadPlan = {
     totalWeightKg: number;
     itemVolumeM3: number;       // Σ qty × L×W×H
     packedVolumeM3: number;     // itemVolumeM3 × PACKING_FACTOR
     floorAreaM2: number;        // Σ over !stackable of qty × L×W
     envelope: LoadDimensions;   // per-axis max, each line normalised so L ≥ W
     cargoCategory: CargoCategoryKey;
     body: { kind: "derived"; body: ChassisTypeKey } | { kind: "conflict"; bodies: ChassisTypeKey[] };
     handlingTags: HandlingTagKey[];   // union, in enum order
     suggestedCrew: 1 | 2;             // 2 if any needsTwoPeople
   };
   ```

4. **Constants**, exported, each with a comment saying it is a tunable estimate and that action-required owns sign-off:
   - `WEIGHT_SAFETY_FACTOR = 1.1`
   - `PACKING_FACTOR = 1.4`
   - `OPEN_BED_NOTIONAL_HEIGHT_M = 2.0`

5. **`planLoad(lines: LoadLine[]): LoadPlan | null`.** Returns `null` for an empty list.
   - **Cargo category:** take the line categories, pick the one whose `CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES` set is **smallest**. Ties go to the category with the greatest total weight. Ties after that go to enum order.
   - **Body:** collect the non-null `requiredBody` values. None ⇒ `DRY_BOX`. Exactly one distinct value ⇒ that value. More than one ⇒ `conflict`.
   - **Over the platform maximum:** if `totalWeightKg` exceeds `CARGO_MEASUREMENT_BOUNDS.cargoWeightKg.max` (24,000 kg), set `overMaximum: true` on the plan. The form shows "This is more than one vehicle can carry. Split it into separate bookings." and the route refuses it. (33 heavy pallets come to 26,400 kg, so this is reachable.)

6. **Pallet and custom helpers** (so the picker and the route build lines the same way):
   - `PALLET_TYPES = { EUR: { lengthM: 1.2, widthM: 0.8 }, INDUSTRIAL: { lengthM: 1.2, widthM: 1.0 } }`
   - `PALLET_DEFAULT_HEIGHT_M = 1.2`
   - `PALLET_WEIGHT_PRESETS = { LIGHT: 150, MEDIUM: 400, HEAVY: 800 }`
   - `PALLET_CONTENTS`: what is on the pallets, chosen per pallet line:

     | key | cargo category | body | tags |
     |---|---|---|---|
     | `GENERAL` | `RETAIL_STOCK` | — | — |
     | `BUILDING` | `CONSTRUCTION_MATERIALS` | — | — |
     | `INDUSTRIAL` | `INDUSTRIAL_SUPPLIES` | — | — |
     | `CHILLED` | `RETAIL_STOCK` | `REFRIGERATED` | `COLD_CHAIN` |

     Without this, a pallet of cement would book into a van while the catalogue's `BLOCKS_PALLET` needs a heavy truck.
   - `palletLine(type, contents, count, heightM, weightKg): LoadLine`. Not stackable.
   - `CUSTOM_SIZE_PRESETS`: S (0.5×0.4×0.4, 10 kg), M (1.0×0.6×0.6, 30 kg), L (1.8×0.9×0.9, 60 kg), XL (2.2×1.0×1.2, 120 kg).
   - `customLine({ quantity, preset | exact }): LoadLine`. Stackable unless XL; cargo `FURNITURE_FURNISHINGS`.
   - Clamp every figure to `CARGO_MEASUREMENT_BOUNDS`.

7. **`assessFit(plan, spec): FitAssessment`**, with `spec` in the shape `specCapability` accepts plus `bodyTypes`:
   - `hardAxes`: `oversizeAxes(plan.envelope + totalWeight as the load, specCapability(spec))`. Exactly the server's existing check; reuse it, do not re-express it.
   - `soft`: an array of `"weight_margin"` (total × `WEIGHT_SAFETY_FACTOR` > payload), `"volume"` (packed volume > L × W × H, using `OPEN_BED_NOTIONAL_HEIGHT_M` where the capability's height is `Infinity`) and `"floor_area"` (floor area > L × W).
   - `bodyOk`: does the spec offer the plan's body. `vehicleOffersBody` currently lives in `src/components/home/order-vehicle-types.ts`, a `"use client"` module that imports React, so `load-plan.ts` **must not import it from there**. Move the predicate into a client-safe module (`src/lib/vehicle-body.ts`) and re-export it from `order-vehicle-types.ts` so existing callers are untouched. Do not duplicate it.
   - `verdict`: `"fits"` | `"may_not_fit"` (soft only) | `"cannot_fit"` (hard or body).

8. **`recommendVehicles(plan, specs, body)`.** `specs` must arrive already sorted cheapest-first and already filtered to serviceable and cargo-category-eligible classes; the form has both lists today.
   - Returns `{ recommended, oneSizeUp }`.
   - `recommended` is the first spec with verdict `fits` for `body`.
   - `oneSizeUp` is the next `fits` spec after it with a strictly larger `maxPayloadKg` **or** cargo volume, or `null`.
   - If nothing `fits`, `recommended` is the first `may_not_fit`, flagged as such. If nothing at all, both are `null`.

9. **`summariseItems(lines with labels, maxLength)`** → `"1 × Fridge, double door, 15 × Box, medium"`, truncated with `…` on a whole entry. Used by the route for `Order.itemQuantity`.

10. **`tests/load-plan.spec.ts`**, written in the no-browser, no-database style of `tests/dispatch-fit.spec.ts`. At minimum:
    - Empty list ⇒ `null`.
    - Weight and volume sum by quantity; envelope is the per-axis max after L ≥ W normalisation.
    - Category: furniture + building materials ⇒ `CONSTRUCTION_MATERIALS` (heavy-only is narrower).
    - Body: chilled ⇒ REFRIGERATED; rebar ⇒ OPEN_CHASSIS; both ⇒ conflict; a `CHILLED` pallet line ⇒ REFRIGERATED.
    - **Flatbed height sentinel:** a load with any height fits `FLATBED_TRUCK` on height, and its volume uses 2.0 m. This guards the regression `booking-fit.ts` warns about.
    - Recommendation on the seeded catalogue (copy the eleven specs' figures from `prisma/seed.ts` into a fixture):
      - 10 medium boxes ⇒ MPV or Minivan, whichever is cheaper by base fare in the fixture.
      - A double fridge + 3-seat sofa + 20 medium boxes ⇒ a van-class, not a truck. Assert the exact code the fixture produces, and print the plan in the test name so a reviewer can sanity-check it.
      - A 6 m timber length: assert the **fit reasons** directly, not via the category filter (which would pass for the wrong reason). Run `assessFit` against every spec ignoring category: Box Truck (4.5 m) `cannot_fit` on length, Curtainsider (6.0 m) `fits`.
      - A wardrobe (lying down) + double fridge fits `CLOSED_BOX_VAN`, and the fridge alone does not fit `CARGO_VAN` (height 1.6 m).
      - A paint bucket + sofa derives `FURNITURE_FURNISHINGS`, not `CONSTRUCTION_MATERIALS`.
      - 33 heavy pallets ⇒ `overMaximum`.
    - `one size up` is strictly bigger, never equal.
    - Weight safety: a load at 95 % of a class's payload is `may_not_fit`, not `cannot_fit`.

11. `pnpm lint`, `pnpm typecheck`, `pnpm test tests/load-plan.spec.ts`.

## Acceptance Criteria

- [ ] Module is client-safe and documents why
- [ ] Hard fit reuses `oversizeAxes` + `specCapability`; nothing re-expresses them
- [ ] Constants exported and commented as tunable
- [ ] Spec covers every rule above and passes
