# Task 04: Vehicle Class Taxonomy — Five Classes, Shared by Both Flows

## Status

pending

## Wave

2

## Description

`src/lib/driver-onboarding/vehicle-classes.ts` is the single taxonomy the individual driver wizard already uses to render its class cards, gate them on licence category, and resolve a (class, chassis) pair back to a real `VehicleTypeSpec.code`. The business fleet design uses the same taxonomy with **five** classes rather than four: `TRAILER_TRUCK` is added at licence category CE, and `HEAVY_FREIGHT_TRUCK` moves from CE to **C**. This task grows that one file to five classes and adds the cargo body-type constant the fleet composition step (`task-11`) and the vehicle editor (`task-12`) render their three panels from.

This is deliberately a shared change, not a fork: `requirements.md` calls out that one taxonomy serves both flows and that letting them drift is the failure mode being avoided. That means this task **changes behaviour the individual driver wizard already ships** — see "This loosens an existing gate" below — and it touches three driver-flow files that would otherwise stop compiling or silently reject the new class. **Only this task may edit `src/lib/driver-onboarding/vehicle-classes.ts`** for the whole feature; every other task in this spec reads it.

## Dependencies

**Depends on:** task-01-schema-migration.md, task-02-trailer-vehicle-type-spec.md
**Blocks:** task-11-step2-fleet-composition.md, task-12-step3-vehicle-specifications.md, task-13-step4-drivers-assignment.md, task-14-step5-review-submit.md

**Context from dependencies:**

`task-01` adds all of the following to `prisma/schema.prisma` in one migration. Everything this task needs from it is the new `VehicleClass` enum, but the whole set is restated so no sibling task file has to be opened:

*`LogisticsCompany` gains seven columns* — five nullable detail columns and a `GeorgianCity[]` array filled in by the wizard, plus an activation timestamp — and the back-relation to its application. All are nullable or array-defaulted because production already holds company rows that predate this feature:

```prisma
registeredAddress String?
bankAccountIban   String?
contactName       String?
contactRole       String?
contactEmail      String?
/// Every city this fleet picks up in. A Postgres enum array rather than a join
/// table, following `DriverLicence.categories`.
citiesOfOperation GeorgianCity[]
/// Set when an admin activates the fleet (company verified AND at least one
/// vehicle approved). Null means "cannot dispatch" — enforced server-side in
/// task-21, not just hidden in the UI. Pre-existing companies are grandfathered
/// to a non-null value by the migration.
activatedAt       DateTime?

application       BusinessApplication?
```

Its existing columns are untouched: `id`, `userId @unique`, `companyName`, `vatId`, `phone @unique`, `city GeorgianCity` (retained as the company's **primary/registered** city, deliberately not folded into `citiesOfOperation`), `drivers`, `vehicles`, `orders`.

*New `VehicleClass` enum and `Vehicle.vehicleClass`* — the class the company actually declared, stored because with five classes the (class, chassis) → spec map is no longer uniquely invertible:

```prisma
enum VehicleClass {
  SMALL_VAN
  LARGE_VAN
  MEDIUM_TRUCK
  HEAVY_FREIGHT_TRUCK
  TRAILER_TRUCK
}

// on Vehicle:
vehicleClass       VehicleClass?                 // nullable, and deliberately never backfilled
/// Singular, because `BusinessApplicationVehicle.vehicleId` is `@unique`.
applicationVehicle BusinessApplicationVehicle?
```

*Application models:*

```prisma
enum BusinessApplicationStatus        { DRAFT PENDING ACTION_REQUIRED APPROVED }
enum CompanyReviewStatus              { PENDING VERIFIED FLAGGED }
enum BusinessApplicationVehicleStatus { PENDING APPROVED FLAGGED }

model BusinessApplication {
  id        String           @id @default(cuid())
  companyId String           @unique
  company   LogisticsCompany @relation(fields: [companyId], references: [id], onDelete: Cascade)

  reference String                    @unique          // "BIZ-40219" — prefix + 5 random digits
  status    BusinessApplicationStatus @default(DRAFT)

  draft          Json?
  draftStep      Int       @default(1)
  draftUpdatedAt DateTime?

  companyReviewStatus CompanyReviewStatus @default(PENDING)
  /// Set only when `companyReviewStatus` is FLAGGED; cleared on resubmission.
  companyFlagReason   String?

  firstSubmittedAt DateTime?
  lastSubmittedAt  DateTime?
  submissionCount  Int       @default(0)

  vehicles  BusinessApplicationVehicle[]
  createdAt DateTime                     @default(now())
  updatedAt DateTime                     @updatedAt

  @@index([status])
}

model BusinessApplicationVehicle {
  id                    String              @id @default(cuid())
  businessApplicationId String
  businessApplication   BusinessApplication @relation(fields: [businessApplicationId], references: [id], onDelete: Cascade)
  /// Nullable + SetNull: a company can remove a vehicle from its own fleet at any
  /// time through an existing, unrelated flow, and the review row must survive so
  /// the admin drawer can render "vehicle no longer on file". Mirrors
  /// `DriverApplication.vehicleId`.
  vehicleId             String?             @unique
  vehicle               Vehicle?            @relation(fields: [vehicleId], references: [id], onDelete: SetNull)

  /// Denormalised at submit, NOT NULL, so the queue, the drawer and the dispatch
  /// gate can read the declared class and body without a join a null `vehicleId`
  /// would break.
  vehicleClass VehicleClass
  chassisType  ChassisType

  status     BusinessApplicationVehicleStatus @default(PENDING)
  /// Set only when `status` is FLAGGED; cleared when the vehicle is corrected.
  /// One of the six design strings — a closed, server-validated list.
  flagReason String?
  decidedAt  DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([businessApplicationId])
}
```

There is **no `position` column**. A vehicle's 1-based row number is derived from `createdAt` ordering, not stored — any `orderBy: { position: ... }` is a bug. There is likewise **no compound `@@unique([businessApplicationId, vehicleId])`**: `vehicleId @unique` on its own is what lets the submit endpoint upsert per vehicle on a resubmission and preserve an existing `APPROVED` verdict instead of creating a second row.

*Two hand-appended partial unique indexes* closing the `DriverVehicleAssignment` exclusivity race:

```sql
CREATE UNIQUE INDEX "driver_vehicle_assignment_live_vehicle_unique"
  ON "DriverVehicleAssignment"("vehicleId") WHERE "unassignedAt" IS NULL;
CREATE UNIQUE INDEX "driver_vehicle_assignment_live_driver_unique"
  ON "DriverVehicleAssignment"("driverProfileId") WHERE "unassignedAt" IS NULL;
```

`task-02` seeds exactly one new `VehicleTypeSpec` row, idempotently by `upsert` on `code` in `prisma/seed.ts`: `code: "TRAILER_TRUCK"`, `category: HEAVY_DUTY`, `maxPayloadKg: 24000`, `cargoLengthM: 13.60`, `cargoWidthM: 2.48`, `cargoHeightM: 2.70`, plus a `PricingRule` with placeholder rates pending ops sign-off. **That string literal `"TRAILER_TRUCK"` is what the `specCodeByChassis` map below resolves to** — the class id and the spec code happen to be the same string, which is a coincidence of naming and not something to depend on structurally.

The `ChassisType` enum (`DRY_BOX` / `REFRIGERATED` / `OPEN_CHASSIS`) and `LicenceCategory` enum (`B` / `C` / `CE`) already exist in `@prisma/client` and are unchanged by this feature.

## Files to Modify

- `src/lib/driver-onboarding/vehicle-classes.ts` — grow `VehicleClassId` and `VEHICLE_CLASSES` from four classes to five, move `HEAVY_FREIGHT_TRUCK` to category C, add the `BODY_TYPES` constant and the body → classes helper, and rewrite the file's doc comment.
- `src/lib/driver-onboarding/draft-schema.ts` — add `"TRAILER_TRUCK"` to the `OnboardingDraftVehicleClassId` literal union, so an individual driver's saved draft can hold the new class.
- `src/app/api/driver-profile/onboarding/submit/route.ts` — add `"TRAILER_TRUCK"` to the `VEHICLE_CLASS_IDS` array.
- `src/components/driver-onboarding/steps/step-3c-technical-details.tsx` — add the `TRAILER_TRUCK` key to `MODELS_BY_CLASS`, which is a `Record<VehicleClassId, …>` and will not compile without it.

## Technical Details

### 1. `src/lib/driver-onboarding/vehicle-classes.ts` — the full new file body

The type stays structurally identical; only the union, the array and the doc comment change. Every copy string below is the design's final copy — verbatim, including the non-ASCII `·` separator, the en dashes in `800–1,500` and `1.5–7`, and `−20 °C` in the refrigerated description (a U+2212 minus sign, not a hyphen).

```ts
import type { ChassisType, LicenceCategory } from "@prisma/client";

/** The five vehicle classes the onboarding wizards offer — a presentation
 *  grouping over the existing `VehicleTypeSpec` catalogue. Order matches the
 *  design's card order, smallest first. */
export type VehicleClassId =
  | "SMALL_VAN"
  | "LARGE_VAN"
  | "MEDIUM_TRUCK"
  | "HEAVY_FREIGHT_TRUCK"
  | "TRAILER_TRUCK";

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
    samplesLine:
      "Renault Dokker · Fiat Doblò · Toyota Proace City · Ford Transit Connect",
    specCodeByChassis: {
      DRY_BOX: "MINIVAN",
      // No small refrigerated van in the catalogue — REFRIGERATED_VAN is a
      // 1,000 kg large van, well past this class's 800 kg ceiling.
      REFRIGERATED: null,
      // No small open-chassis van in the catalogue, and the design does not
      // sell vans as flatbeds on this platform.
      OPEN_CHASSIS: null,
    },
  },
  {
    id: "LARGE_VAN",
    name: "Large Van",
    chip: "CAT B",
    requiredLicenceCategory: "B",
    capacityLine: "800–1,500 kg · 4 pallets",
    samplesLine:
      "Fiat Ducato · Ford Transit · Mercedes-Benz Sprinter · Renault Master",
    specCodeByChassis: {
      DRY_BOX: "CARGO_VAN",
      REFRIGERATED: "REFRIGERATED_VAN",
      // No open-chassis van in the catalogue — FLATBED_TRUCK is a 5,000 kg
      // Cat C truck, not a Cat B van.
      OPEN_CHASSIS: null,
    },
  },
  {
    id: "MEDIUM_TRUCK",
    name: "Medium Truck",
    chip: "CAT C",
    requiredLicenceCategory: "C",
    capacityLine: "1.5–7 t · 8 pallets",
    samplesLine:
      "Hino 916 · Mitsubishi Fuso Canter · Isuzu NPR · Iveco Eurocargo",
    specCodeByChassis: {
      DRY_BOX: "BOX_TRUCK",
      REFRIGERATED: "REFRIGERATED_TRUCK",
      OPEN_CHASSIS: "FLATBED_TRUCK",
    },
  },
  {
    id: "HEAVY_FREIGHT_TRUCK",
    name: "Heavy Freight Truck",
    chip: "CAT C",
    // Moved from CE to C by the approved business design: a three-axle rigid
    // is a Category C vehicle in Georgia; CE is what an articulated
    // combination needs, which is now its own class below. See
    // `specs/business-fleet-onboarding/action-required.md`.
    requiredLicenceCategory: "C",
    capacityLine: "7–18 t · 16 pallets · 3 axles",
    samplesLine: "MAN TGM · MAN TGL · Volvo FL · Scania P-series",
    specCodeByChassis: {
      DRY_BOX: "LARGE_FREIGHT_TRUCK",
      // No refrigerated truck above 7 t in the catalogue —
      // REFRIGERATED_TRUCK tops out at 4,000 kg.
      REFRIGERATED: null,
      // No open-chassis truck above 7 t in the catalogue — FLATBED_TRUCK
      // tops out at 5,000 kg.
      OPEN_CHASSIS: null,
    },
  },
  {
    id: "TRAILER_TRUCK",
    name: "Trailer Truck",
    chip: "CAT CE",
    requiredLicenceCategory: "CE",
    capacityLine: "18–24 t · 33 pallets · articulated",
    samplesLine: "Mercedes-Benz Actros · Volvo FH · Scania R-series · MAN TGX",
    specCodeByChassis: {
      // The one spec row this feature adds (see `prisma/seed.ts`): 24,000 kg,
      // 13.60 × 2.48 × 2.70 m, HEAVY_DUTY. Without it the class would be
      // unreachable — every other seeded spec tops out at 10,000 kg.
      DRY_BOX: "TRAILER_TRUCK",
      // Refrigerated and open-chassis trailers are an explicit non-goal of
      // `specs/business-fleet-onboarding` — no spec backs them, so they lock
      // like any other unbacked cell rather than falling back to a rigid.
      REFRIGERATED: null,
      OPEN_CHASSIS: null,
    },
  },
];
```

`findVehicleClass`, `resolveVehicleTypeSpecCode` and `isClassLockedByLicence` keep their current bodies and doc comments unchanged — they are already written against `VEHICLE_CLASSES` generically and need no edit.

### 2. The resulting (body × class) map — 8 usable, 7 locked

| Class | Dry Box | Refrigerated | Open Chassis |
|---|---|---|---|
| Small Van (B) | `MINIVAN` | locked | locked |
| Large Van (B) | `CARGO_VAN` | `REFRIGERATED_VAN` | locked |
| Medium Truck (C) | `BOX_TRUCK` | `REFRIGERATED_TRUCK` | `FLATBED_TRUCK` |
| Heavy Freight Truck (C) | `LARGE_FREIGHT_TRUCK` | locked | locked |
| Trailer Truck (CE) | `TRAILER_TRUCK` *(new)* | locked | locked |

The design offers 13 of the 15 cells (it withholds only Small Van and Large Van under Open Chassis, on the grounds that "vans are not sold as flatbeds on this platform"). Intersecting that with the catalogue leaves **8**. A locked cell renders disabled with a short note; it never falls back to a near-miss spec, because a mismatched spec misprices the order and mis-matches the cargo. `MPV`, `CLOSED_BOX_VAN` and `CURTAINSIDER_TRUCK` remain real, bookable specs that no class maps to — they are still addable through the older back-office "add a vehicle" forms and are untouched here.

### 3. `BODY_TYPES` — the cargo body constant

Added to the same file, because "which classes does this body offer" is a question about the lock map and belongs next to it. The design's three panels in step 2, and the body label everywhere a vehicle is summarised, render from this.

```ts
export type BodyType = {
  id: ChassisType;
  /** Full label, used as a panel heading and a radio label. */
  label: string;
  /** Compact label for table rows, chips and summary lines. */
  shortLabel: string;
  /** One-line description shown under the panel heading. */
  description: string;
};

/** The three cargo body types, in the design's panel order. Reuses the
 *  existing `ChassisType` enum rather than introducing a second vocabulary —
 *  `Vehicle.chassisType` is exactly this value. */
export const BODY_TYPES: BodyType[] = [
  {
    id: "DRY_BOX",
    label: "Dry Box",
    shortLabel: "Dry Box",
    description: "Enclosed rigid body. General palletised and boxed cargo.",
  },
  {
    id: "REFRIGERATED",
    label: "Refrigerated Vehicle",
    shortLabel: "Refrigerated",
    description:
      "Temperature-controlled, −20 °C to +8 °C. Cooling unit service record required per vehicle.",
  },
  {
    id: "OPEN_CHASSIS",
    label: "Open Chassis",
    shortLabel: "Open Chassis",
    description:
      "Flatbed or curtain-side with drop sides. Oversized, construction and machinery loads.",
  },
];

export function findBodyType(id: ChassisType): BodyType {
  const found = BODY_TYPES.find((body) => body.id === id);
  if (!found) throw new Error(`Unknown body type: ${id}`);
  return found;
}
```

Only `REFRIGERATED` has a `shortLabel` that differs from its `label`; the other two repeat it deliberately so callers never have to branch on which field to read.

**`BODY_TYPES` and `findBodyType` are exported from this file and imported everywhere else — never redeclared.** `task-11` (the step-2 fleet composition panels) and `task-12` (the step-3 vehicle editor and its "as a dry box" footer) both render body labels, and both must `import { BODY_TYPES, findBodyType } from "@/lib/driver-onboarding/vehicle-classes"` rather than define a local `BODY_TYPES` array or a `BODY_LABEL` lookup of their own. A second copy is how the panel heading and the table chip end up disagreeing about what `REFRIGERATED` is called, and it is exactly the drift `requirements.md` says one shared taxonomy exists to prevent. The four fields (`id` / `label` / `shortLabel` / `description`) are the whole surface: a caller that wants a compact label reads `shortLabel`, a caller that wants a heading reads `label`, and nobody writes `chassisType === "REFRIGERATED" ? "Refrigerated" : …` inline. `task-20` (the admin drawer) is the one deliberate exception and may keep its own `CHASSIS_LABELS`, because the admin surface has its own copy conventions and does not import this feature's client constants.

### 4. `vehicleClassesForBodyType` — the offered-classes helper, deliberately without a consumer

The design describes the offered classes per body in prose ("all five", "all five", "medium, heavy, trailer only"). That prose is *not* the answer the UI needs: intersected with the lock map, the real answer is narrower. Derive it rather than restating it, so the two can never drift:

```ts
/** The classes a given cargo body actually offers — the design's per-body
 *  class list intersected with the catalogue's lock map. Derived from
 *  `specCodeByChassis` rather than restated as its own list, so a change to
 *  the map cannot leave a second copy of the truth behind.
 *
 *  Today this returns: DRY_BOX -> all five; REFRIGERATED -> Large Van and
 *  Medium Truck; OPEN_CHASSIS -> Medium Truck only. Eight cells in total.
 *
 *  INTENTIONALLY UNUSED by this feature — do not delete it as dead code, and
 *  do not go looking for the caller. Every screen that lists classes for a body
 *  needs to render the *locked* cells too (greyed, with a short note), not omit
 *  them, so `task-11`'s fleet composition grid iterates `VEHICLE_CLASSES` and
 *  tests `resolveVehicleTypeSpecCode(...) === null` per cell instead. This
 *  function is the machine-checkable form of the design's per-body prose: the
 *  acceptance criterion below pins 5 / 2 / 1, so if the lock map is ever edited
 *  in a way that contradicts the design's own description of what each body
 *  offers, that criterion fails and someone has to reconcile the two on
 *  purpose. It is also the correct helper for any future surface that genuinely
 *  wants to hide unavailable classes rather than grey them. */
export function vehicleClassesForBodyType(
  bodyType: ChassisType,
): VehicleClass[] {
  return VEHICLE_CLASSES.filter(
    (vehicleClass) => vehicleClass.specCodeByChassis[bodyType] !== null,
  );
}
```

### 5. Rewrite the file's doc comment

The current header block says two things that stop being true and must be corrected rather than left to rot:

- "Maps the onboarding wizard's **four** vehicle classes" → five, and it is no longer "the onboarding wizard's" but shared between the individual driver wizard and the business fleet wizard.
- "This feature deliberately adds **no new** `VehicleTypeSpec` rows" → exactly one was added, `TRAILER_TRUCK`, because the class is otherwise unreachable (every other seeded spec tops out at 10,000 kg). The surrounding reasoning still holds and must be kept: order matching keys on an exact `vehicleTypeSpecId` and the booking pickers treat `pricingRule` as non-nullable, which is *why* only one row was added and why it ships with a `PricingRule`.

Keep the rest of the header intact — the "null rather than a near-miss spec" paragraph, the "pure data, type-only Prisma import, safe on both sides of the boundary" paragraph, and the instruction that the submit endpoints must re-run this resolution server-side rather than trusting a spec code sent by the client.

Add one new paragraph recording the CE → C move on `HEAVY_FREIGHT_TRUCK` and pointing at `specs/business-fleet-onboarding/action-required.md`, so the next reader finds the decision instead of assuming a typo.

### 6. This loosens an existing gate — and three driver-flow files must be updated with it

`HEAVY_FREIGHT_TRUCK` moving from CE to C means **a driver holding only category C can now select Heavy Freight Truck**, where the shipped individual driver wizard required CE. No stored value changes and no data migration is needed — `DriverLicence.categories` and `Vehicle.vehicleTypeSpecId` are untouched — but the individual wizard's behaviour changes, and that is intentional under "one taxonomy, both flows". It is listed for ops confirmation in `specs/business-fleet-onboarding/action-required.md`; if ops rules that Heavy must stay at CE, only this file changes, and every consumer follows automatically.

Existing consumers, and what each needs:

- **`src/components/driver-onboarding/steps/step-3-chassis-class.tsx`** — the driver wizard's chassis-then-class screen. It maps over `VEHICLE_CLASSES` and calls `isClassLockedByLicence` / `resolveVehicleTypeSpecCode` per card, so it picks up the fifth card and the relaxed Heavy gate with **no code change**. Verify visually that five cards lay out correctly in its grid and that the "not available with this body type" lock still renders for the seven locked cells — a layout that assumed four cards is the only plausible breakage.
- **`src/app/api/driver-profile/onboarding/submit/route.ts`** — the submit route's server-side re-validation. `VEHICLE_CLASS_IDS` is a hand-written `VehicleClassId[]` array (not an exhaustive `Record`), so it **compiles fine while silently rejecting the new class**: a driver who picks Trailer Truck would fail submit with "class is not one of the offered vehicle classes". Add `"TRAILER_TRUCK"` to it. Its category check (`findVehicleClass(classId).requiredLicenceCategory` against the licence's categories, error `Your licence does not list category ${required}, which the ${name} class requires.`) needs no change — it reads the taxonomy, so the CE → C move flows through it automatically.
- **`src/components/driver-onboarding/steps/step-3c-technical-details.tsx`** — `MODELS_BY_CLASS` is typed `Record<VehicleClassId, [make: string, model: string][]>`, which is exhaustive over the union and **will fail `pnpm typecheck`** the moment `TRAILER_TRUCK` is added. Add the key with the design's seven tractor units, as `[make, model]` pairs matching the file's existing shape: `["Mercedes-Benz", "Actros"]`, `["Volvo", "FH"]`, `["Scania", "R-series"]`, `["MAN", "TGX"]`, `["DAF", "XF"]`, `["Renault", "T High"]`, `["Iveco", "S-Way"]`.
- **`src/lib/driver-onboarding/draft-schema.ts`** — `OnboardingDraftVehicleClassId` is a deliberately independent structural literal union (so a persisted draft's shape does not track the presentation constant). It is a *different file* from the business flow's `src/lib/fleet-onboarding/draft-schema.ts` created by `task-05`, and there is no collision. Add `"TRAILER_TRUCK"` to it so an individual driver who selects the new class can have that selection saved; without it the class is selectable but unsaveable.
- **`src/app/api/driver-profile/onboarding/route.ts`**, **`src/app/api/admin/driver-applications/route.ts`**, **`src/app/api/admin/driver-applications/[id]/route.ts`** — each holds a local `findVehicleClassNameBySpecCode` that scans `VEHICLE_CLASSES` to recover a class name from a stored spec code. All three keep working unchanged and now additionally resolve `TRAILER_TRUCK`. No edit needed; do not duplicate the helper a fourth time in this feature — the business flow reads `Vehicle.vehicleClass` directly instead, which is exactly why `task-01` adds that column.

Anything else that switches exhaustively on `VehicleClassId` (a `Record<VehicleClassId, …>`, a `switch` with a `never` fallthrough) surfaces as a `pnpm typecheck` failure. Run it and fix what it names; do not widen a type to silence it.

## Acceptance Criteria

- [ ] `VEHICLE_CLASSES` has exactly five entries in the order Small Van, Large Van, Medium Truck, Heavy Freight Truck, Trailer Truck, with the exact copy strings above (design-final, verbatim, non-ASCII characters preserved).
- [ ] `HEAVY_FREIGHT_TRUCK` has `chip: "CAT C"` and `requiredLicenceCategory: "C"`; `TRAILER_TRUCK` has `chip: "CAT CE"` and `requiredLicenceCategory: "CE"`.
- [ ] `resolveVehicleTypeSpecCode` returns the exact spec code for each of the 8 usable cells in the table above and `null` for each of the 7 locked cells.
- [ ] `resolveVehicleTypeSpecCode("TRAILER_TRUCK", "DRY_BOX")` returns `"TRAILER_TRUCK"`, and the spec row with that `code` exists after `task-02`'s seed has run.
- [ ] `vehicleClassesForBodyType` returns 5 classes for `DRY_BOX`, 2 for `REFRIGERATED` (Large Van, Medium Truck) and 1 for `OPEN_CHASSIS` (Medium Truck).
- [ ] `BODY_TYPES` (`id` / `label` / `shortLabel` / `description`) and `findBodyType` are exported from `src/lib/driver-onboarding/vehicle-classes.ts`, the three bodies are in design order with the design's exact descriptions, and `REFRIGERATED.shortLabel` is `"Refrigerated"`.
- [ ] `vehicleClassesForBodyType` is exported and its doc comment states in so many words that it has no consumer in this feature and why (task-11 greys locked cells rather than hiding them), so a later reader does not delete it as dead code.
- [ ] The file's doc comment no longer claims four classes, no longer claims that no `VehicleTypeSpec` row was added, and records the `HEAVY_FREIGHT_TRUCK` CE → C move with a pointer to `action-required.md`.
- [ ] `"TRAILER_TRUCK"` is present in `VEHICLE_CLASS_IDS` in the driver submit route and in `OnboardingDraftVehicleClassId` in the driver draft schema, and `MODELS_BY_CLASS` in `step-3c-technical-details.tsx` has a `TRAILER_TRUCK` key.
- [ ] The individual driver wizard still renders its class step, now with five cards, and a C-only licence no longer locks Heavy Freight Truck.
- [ ] No `VehicleTypeSpec` schema change and no seed edits are part of *this* task — it only references `task-02`'s `code` as a string literal.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This file is pure data and pure functions with a type-only `@prisma/client` import, so it stays safe to import from both client components and server routes. Every consumer keeps that property; do not add a runtime Prisma import to it.
- `BODY_TYPES` intentionally lives here rather than in a new `body-types.ts`: the only interesting question about a body type is which classes it offers, and that answer comes from `specCodeByChassis` in this file. Splitting them would put the lock map and its only real consumer in different modules. It is also why `task-11` and `task-12` import it from here instead of keeping their own copies — see §3.
- The class id `TRAILER_TRUCK` and the spec code `TRAILER_TRUCK` being the same string is a naming coincidence. Resolve through `resolveVehicleTypeSpecCode` everywhere; never treat the class id as a spec code directly, or the next class whose names diverge will break silently.
- If ops rejects the CE → C move (see `action-required.md`), revert `HEAVY_FREIGHT_TRUCK` to `chip: "CAT CE"` / `requiredLicenceCategory: "CE"` in this one file. Nothing else in either flow hard-codes the class → category relationship.
