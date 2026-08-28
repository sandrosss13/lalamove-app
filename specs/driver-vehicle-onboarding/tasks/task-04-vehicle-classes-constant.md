# Task 04: Vehicle Classes Constant — Onboarding Classes → Existing `VehicleTypeSpec` Codes

## Status

pending

## Wave

2

## Description

The design's onboarding wizard offers four vehicle classes (Small Van, Large Van, Medium Truck, Heavy Freight Truck), each gated by a licence category and, combined with a chassis body type chosen in the previous screen, resolving to a specific vehicle spec. This codebase's `VehicleTypeSpec` table already has 10 seeded rows used by booking, pricing, and order matching — **this feature does not add new rows to it**. Instead, this task adds a single TypeScript constant mapping (class, chassis type) pairs onto the existing spec codes that actually match. This is the piece that lets the onboarding wizard show 4 clean class cards without forking the vehicle taxonomy booking already depends on.

Not every (class, chassis) combination has a real matching spec in the current catalogue — where none exists, the constant marks it as unavailable rather than guessing, and the wizard (`task-11`) locks that combination in the UI with an explanation, the same visual treatment the design already uses for a licence-category lock.

## Dependencies

**Depends on:** task-01-schema-migration.md (needs the generated `LicenceCategory` and `ChassisType` enum types from `@prisma/client`)
**Blocks:** task-11-onboarding-step3-chassis-class.md, task-12-onboarding-step3c-technical-details.md, task-13-onboarding-step4-review-submit.md

**Context from dependencies:** `task-01` adds `LicenceCategory` (`B`/`C`/`CE`) and `ChassisType` (`DRY_BOX`/`REFRIGERATED`/`OPEN_CHASSIS`) to `@prisma/client`, and confirms the 10 existing `VehicleTypeSpec.code` values this task references (`MINIVAN`, `MPV`, `CARGO_VAN`, `CLOSED_BOX_VAN`, `REFRIGERATED_VAN`, `BOX_TRUCK`, `FLATBED_TRUCK`, `CURTAINSIDER_TRUCK`, `REFRIGERATED_TRUCK`, `LARGE_FREIGHT_TRUCK` — see `prisma/seed.ts`) are untouched by that task.

## Files to Create

- `src/lib/driver-onboarding/vehicle-classes.ts` — the mapping constant + resolver function.

## Technical Details

### The mapping, and why each cell is what it is

Matched against each existing spec's `maxPayloadKg`/`loadingAccessType`/`category` (from `prisma/seed.ts`) against the design's class definitions:

| Class | Licence category | Chassis: Dry Box | Chassis: Refrigerated | Chassis: Open Chassis |
|---|---|---|---|---|
| Small Van (up to 800kg) | B | `MINIVAN` | *locked — no small refrigerated van in the catalogue* | *locked — no small open-chassis van in the catalogue* |
| Large Van (800–1,500kg) | B | `CARGO_VAN` | `REFRIGERATED_VAN` | *locked — no open-chassis van in the catalogue* |
| Medium Truck (1.5–7t) | C | `BOX_TRUCK` | `REFRIGERATED_TRUCK` | `FLATBED_TRUCK` |
| Heavy Freight Truck (7t+) | CE | `LARGE_FREIGHT_TRUCK` | *locked — no heavy refrigerated truck above 7t in the catalogue* | *locked — no heavy open-chassis truck above 7t in the catalogue* |

`MPV`, `CLOSED_BOX_VAN`, and `CURTAINSIDER_TRUCK` are real, bookable specs but aren't reachable through this onboarding wizard's default mapping — they remain addable through the existing company/driver "add a vehicle" forms, unaffected by this feature. This asymmetry (some existing specs unreachable via onboarding, some onboarding combinations locked) is a real limitation of today's catalogue, not a bug — see `action-required.md` for the human sanity-check on this table, and treat it as a starting point for a future catalogue expansion rather than something to silently work around by fudging a capacity mismatch.

### `src/lib/driver-onboarding/vehicle-classes.ts`

```ts
import type { ChassisType, LicenceCategory } from "@prisma/client";

/** The four vehicle classes the onboarding wizard offers — a presentation
 *  grouping over the existing `VehicleTypeSpec` catalogue, not a new spec
 *  row. Order matches the design's card order. */
export type VehicleClassId = "SMALL_VAN" | "LARGE_VAN" | "MEDIUM_TRUCK" | "HEAVY_FREIGHT_TRUCK";

export type VehicleClass = {
  id: VehicleClassId;
  name: string;
  /** Mono category chip shown on the card, e.g. "CAT B". */
  chip: string;
  requiredLicenceCategory: LicenceCategory;
  /** Capacity line shown on the card, e.g. "Up to 800 kg · 2 pallets". */
  capacityLine: string;
  /** Sample-models line shown on the card. */
  samplesLine: string;
  /** (chassis type) -> existing VehicleTypeSpec.code, or null if this
   *  combination has no matching spec in the current catalogue and must be
   *  locked in the UI. */
  specCodeByChassis: Record<ChassisType, string | null>;
};

export const VEHICLE_CLASSES: VehicleClass[] = [
  {
    id: "SMALL_VAN",
    name: "Small Van",
    chip: "CAT B",
    requiredLicenceCategory: "B",
    capacityLine: "Up to 800 kg · 2 pallets",
    samplesLine: "Renault Dokker · Fiat Doblò · Toyota Proace City · Ford Transit Connect",
    specCodeByChassis: {
      DRY_BOX: "MINIVAN",
      REFRIGERATED: null,
      OPEN_CHASSIS: null,
    },
  },
  {
    id: "LARGE_VAN",
    name: "Large Van",
    chip: "CAT B",
    requiredLicenceCategory: "B",
    capacityLine: "800–1,500 kg · 4 pallets",
    samplesLine: "Fiat Ducato · Ford Transit · Mercedes-Benz Sprinter · Renault Master",
    specCodeByChassis: {
      DRY_BOX: "CARGO_VAN",
      REFRIGERATED: "REFRIGERATED_VAN",
      OPEN_CHASSIS: null,
    },
  },
  {
    id: "MEDIUM_TRUCK",
    name: "Medium Truck",
    chip: "CAT C",
    requiredLicenceCategory: "C",
    capacityLine: "1.5–7 t · 8 pallets",
    samplesLine: "Hino 916 · Mitsubishi Fuso Canter · Isuzu NPR · Iveco Eurocargo",
    specCodeByChassis: {
      DRY_BOX: "BOX_TRUCK",
      REFRIGERATED: "REFRIGERATED_TRUCK",
      OPEN_CHASSIS: "FLATBED_TRUCK",
    },
  },
  {
    id: "HEAVY_FREIGHT_TRUCK",
    name: "Heavy Freight Truck",
    chip: "CAT CE",
    requiredLicenceCategory: "CE",
    capacityLine: "7 t and above · 16+ pallets",
    samplesLine: "MAN TGM · MAN TGL · Volvo FL · Scania P-series",
    specCodeByChassis: {
      DRY_BOX: "LARGE_FREIGHT_TRUCK",
      REFRIGERATED: null,
      OPEN_CHASSIS: null,
    },
  },
];

export function findVehicleClass(id: VehicleClassId): VehicleClass {
  const found = VEHICLE_CLASSES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown vehicle class: ${id}`);
  return found;
}

/** Resolves a (class, chassis) pair to a real `VehicleTypeSpec.code`, or
 *  `null` if that combination isn't offered — callers (the class-selection
 *  step, and the submit-time server validation) must treat `null` as
 *  "not selectable", never fall back to a mismatched spec. */
export function resolveVehicleTypeSpecCode(
  classId: VehicleClassId,
  chassisType: ChassisType,
): string | null {
  return findVehicleClass(classId).specCodeByChassis[chassisType];
}

/** Whether a class card should render locked because the driver's licence
 *  doesn't include the class's required category. Does not account for the
 *  chassis-availability lock above — that's evaluated separately once a
 *  chassis type has been chosen, since chassis (step 3a) precedes class
 *  (step 3b) in the design's flow. */
export function isClassLockedByLicence(
  classId: VehicleClassId,
  heldCategories: LicenceCategory[],
): boolean {
  return !heldCategories.includes(findVehicleClass(classId).requiredLicenceCategory);
}
```

## Acceptance Criteria

- [ ] `VEHICLE_CLASSES` has exactly the 4 classes above, in that order, with the exact copy strings shown (they're the design's final copy — verbatim, not paraphrased).
- [ ] `resolveVehicleTypeSpecCode` returns the exact existing `VehicleTypeSpec.code` string for every non-locked cell in the table above, and `null` for every locked cell.
- [ ] `isClassLockedByLicence` returns `true` iff the driver's held categories don't include the class's `requiredLicenceCategory`.
- [ ] No `VehicleTypeSpec` schema change and no new seed rows are part of this task — it only reads the existing `code` values as string literals.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This file has no server/client boundary concerns — it's pure data and pure functions, safe to import from both a client component (`task-11`, `task-12`, `task-13`) and a server route (`task-13`'s submit endpoint, which must re-run this same resolution server-side rather than trusting whatever spec code the client sent).
- If the mapping in `action-required.md`'s sanity-check comes back with changes, only this file needs editing — no other task in this feature hard-codes a class/chassis/spec relationship.
