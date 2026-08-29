# Task 03: Make/Model Reference Data and the Body-Type Spec Function

## Status

pending

## Wave

1

## Description

Step 3 of the fleet wizard asks a company to specify every vehicle it declared in step 2 — make, model, year, plate, colour, payload and cargo hold dimensions — for up to 40 vehicles. Typing four capacity figures per vehicle from scratch, forty times, is where a registration flow dies. The design solves it by shipping a reference table of 31 real make/model rows grouped by vehicle class: pick "Hino 916", and payload and dimensions fill in, adjusted for the cargo body type the vehicle was declared under, with a footer naming the source ("Prefilled from Hino 916 as a dry box. Correct them to the real vehicle.").

This task creates `src/lib/fleet-onboarding/model-specs.ts`: the 31 rows verbatim, the class-level fallback figures, and a pure port of the prototype's `specFor` — payload scaled by a body factor and rounded to the nearest 10 kg, dimensions offset per body type with a 0.5 m floor, and the open-chassis drop-side height sentinel. It is data and pure functions only. It builds nothing visual; task-12 consumes it.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-12-step3-vehicle-specifications.md

**Context from dependencies:** None — this is a Wave 1 task with no upstream. It reads nothing from task-01 (schema) or task-02 (seed) and touches neither of their files.

One forward constraint matters and is handled inside this file (see Technical Details §2): the five-member `VehicleClassId` union is declared **locally** here rather than imported from `src/lib/driver-onboarding/vehicle-classes.ts`, because that file still declares only four classes until task-04 (Wave 2) widens it, and this task must typecheck on its own in Wave 1.

## Files to Create

- `src/lib/fleet-onboarding/model-specs.ts` — the 31 make/model reference rows, the class-level fallback figures, the body-type adjustment constants, and the pure spec-derivation functions.

## Technical Details

### 1. The module must be browser-safe

Task-12 imports this from a client component (the searchable make/model combobox in the step-3 editor runs in the browser). Follow the rule `src/lib/georgian-cities.ts` and `src/lib/driver-onboarding/vehicle-classes.ts` already establish:

- **Pure data and pure functions only.** No `prisma`, no `fetch`, no `next/*`, no `node:*`, no module-level side effects, no `"use client"` / `"use server"` directive.
- **The only import is type-only:** `import type { ChassisType } from "@prisma/client";`. A type-only import is erased at build time, so the server-only Prisma client never reaches the browser bundle. This is the same reasoning `georgian-cities.ts` records in its header ("duplicated here rather than imported from `@prisma/client` to keep the server-only Prisma client out of the browser bundle") — the difference being that `ChassisType` is used only in type position here, so a `import type` is enough and no value-level duplicate is needed.
- Because it is pure, the submit endpoint (task-14) can import the same module server-side and re-derive the prefill to sanity-check what the client sent, rather than trusting it. Do not add anything that would make that impossible.

### 2. The `VehicleClassId` union — declared locally, deliberately

```ts
/**
 * The five vehicle classes both onboarding flows offer.
 *
 * Deliberately re-declared here rather than imported from
 * `src/lib/driver-onboarding/vehicle-classes.ts`: that module still declares
 * four classes until task-04 widens it to five, and this module has to typecheck
 * on its own before that lands. The two unions must stay member-for-member
 * identical — once task-04 ships they are structurally the same type and
 * assignable in both directions, so a `VehicleClassId` read from the taxonomy
 * can be passed straight into `specForModel` with no adapter. Do not rename a
 * member on one side without renaming it on the other; these strings are also
 * the `VehicleClass` Prisma enum's member names.
 */
export type VehicleClassId =
  | "SMALL_VAN"
  | "LARGE_VAN"
  | "MEDIUM_TRUCK"
  | "HEAVY_FREIGHT_TRUCK"
  | "TRAILER_TRUCK";
```

Note the id rename from the prototype: the design's JS uses `heavy_truck` for what this codebase calls `HEAVY_FREIGHT_TRUCK` (the id already in `vehicle-classes.ts` and, after task-01, in the `VehicleClass` Prisma enum). Every `heavy_truck` key in the prototype becomes `HEAVY_FREIGHT_TRUCK` here. `small_van` → `SMALL_VAN`, `large_van` → `LARGE_VAN`, `medium_truck` → `MEDIUM_TRUCK`, `trailer_truck` → `TRAILER_TRUCK`.

### 3. Return type: **numbers**, formatted at the edge

The prototype's `specFor` returns strings (`payload: '5780'`, `len: '6.20'`) because its form fields are string-typed and it renders the result straight into an `<input value>`. **This port returns numbers.** Be explicit about it; do not "match the prototype" here. Four reasons:

1. **Everything downstream of the form is numeric.** `Vehicle.payloadKg` / `cargoLengthM` / `cargoWidthM` / `cargoHeightM` are `Float?` columns; the submit endpoint writes numbers. Strings would mean every consumer calls `Number(...)` and the module would have handed out a value it had already parsed once.
2. **Validation is numeric.** The bounds are payload 100–40,000 kg, each dimension `> 0` and `≤ 20 m`, and Trailer Truck length `≥ 8 m`. All three are comparisons; a string-returning module pushes the parse into every validator.
3. **The live "usable volume" line needs arithmetic.** Step 3's editor shows `Usable volume 35.7 m³ — used to match this vehicle with orders.`, which is `L × W × H`. Task-12 computes that from the returned numbers directly.
4. **A string return hides a float bug rather than fixing it.** `2.35 + (-0.16)` evaluates to `2.1899999999999995`. The prototype's `.toFixed(2)` masks it; a numeric return would leak it into the form and into the database unless the rounding is done properly. So this port rounds explicitly to the nearest centimetre — `Math.round(metres * 100) / 100` — inside `specForModel`, and the returned numbers are exact to two decimals by construction. That is strictly better than the prototype, not a deviation from it.

To keep the rendered output byte-identical to the design, the module also exports the two formatters the form fields use, so no caller re-invents them:

```ts
/** Renders a derived payload for a form field, e.g. `5780`. */
export function formatPayloadKg(value: number): string {
  return String(Math.round(value));
}

/** Renders a derived dimension for a form field, e.g. `6.20` — always two
 *  decimals, matching the design's mono-spaced dimension inputs. */
export function formatDimensionM(value: number): string {
  return value.toFixed(2);
}
```

Task-12's `useState` form fields stay string-typed (per the project's form convention) and are seeded with `formatPayloadKg(spec.payloadKg)` / `formatDimensionM(spec.cargoLengthM)`.

### 4. The full module

Write `src/lib/fleet-onboarding/model-specs.ts` as below. **The data table is verbatim from the design prototype's `MODELS` constant and must be copied exactly**, including the non-ASCII characters, which are load-bearing: `Doblò` (Fiat, U+00F2) and `Citroën` (U+00EB). `Ford / Trucks 1026` is also verbatim and not a typo — Ford Trucks is the brand name of Ford Otosan's commercial range, so `make: "Ford"`, `model: "Trucks 1026"`.

```ts
/**
 * Published make/model reference figures for the fleet onboarding wizard, and
 * the pure functions that adjust them for a cargo body type.
 *
 * Step 3 of the wizard asks a company to specify up to 40 vehicles. Picking a
 * make and model prefills payload and cargo dimensions from the table below,
 * adjusted for the body type the vehicle was declared under, so the company
 * corrects four figures instead of typing them. The prefill is a convenience:
 * every field stays editable, and a vehicle that is not in this table is
 * specified by hand.
 *
 * These are realistic reference values authored for the design handoff, NOT a
 * manufacturer database — the box payload and internal dimensions of the
 * standard cargo variant of each model, before body adjustment. They prefill a
 * figure a company then attests to on a compliance record, so a wrong number
 * becomes a wrong record: they are flagged for operations review in
 * `specs/business-fleet-onboarding/action-required.md`, and correcting one is a
 * change to this file alone.
 *
 * Pure data and pure functions with no server-only dependency (the
 * `@prisma/client` import is type-only, so it is erased at build time and never
 * reaches the browser bundle) — safe to import from client components and from
 * server routes alike, which is what lets the submit endpoint re-derive a
 * prefill server-side instead of trusting the one the client sent.
 */
import type { ChassisType } from "@prisma/client";

/**
 * The five vehicle classes both onboarding flows offer.
 *
 * Deliberately re-declared here rather than imported from
 * `src/lib/driver-onboarding/vehicle-classes.ts`: that module still declares
 * four classes until task-04 widens it to five, and this module has to typecheck
 * on its own before that lands. The two unions must stay member-for-member
 * identical — once task-04 ships they are structurally the same type and
 * assignable in both directions. These strings are also the `VehicleClass`
 * Prisma enum's member names.
 */
export type VehicleClassId =
  | "SMALL_VAN"
  | "LARGE_VAN"
  | "MEDIUM_TRUCK"
  | "HEAVY_FREIGHT_TRUCK"
  | "TRAILER_TRUCK";

/** A cargo capacity figure set: what a vehicle can carry and the internal
 *  dimensions of its hold. Metres and kilograms throughout. */
export type ModelSpec = {
  payloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
};

/** One published reference row: a make and model plus the capacity of its
 *  standard cargo variant, before any body-type adjustment. */
export type VehicleModelReference = ModelSpec & {
  make: string;
  model: string;
};

/**
 * 31 reference rows grouped by vehicle class. Order within each class is the
 * design's order and is what the make/model dropdown lists; the first row of a
 * class doubles as that class's default prefill (see `defaultSpecForClass`).
 */
export const MODEL_REFERENCES: Record<VehicleClassId, VehicleModelReference[]> =
  {
    SMALL_VAN: [
      { make: "Renault", model: "Dokker Van", payloadKg: 750, cargoLengthM: 1.9, cargoWidthM: 1.22, cargoHeightM: 1.21 },
      { make: "Fiat", model: "Doblò Cargo Maxi", payloadKg: 1000, cargoLengthM: 2.17, cargoWidthM: 1.23, cargoHeightM: 1.3 },
      { make: "Toyota", model: "Proace City L2", payloadKg: 1000, cargoLengthM: 2.16, cargoWidthM: 1.23, cargoHeightM: 1.24 },
      { make: "Ford", model: "Transit Connect L2", payloadKg: 900, cargoLengthM: 2.08, cargoWidthM: 1.22, cargoHeightM: 1.27 },
      { make: "Citroën", model: "Berlingo Van XL", payloadKg: 1000, cargoLengthM: 2.16, cargoWidthM: 1.23, cargoHeightM: 1.24 },
      { make: "Peugeot", model: "Partner Long", payloadKg: 1000, cargoLengthM: 2.16, cargoWidthM: 1.23, cargoHeightM: 1.24 },
    ],
    LARGE_VAN: [
      { make: "Fiat", model: "Ducato L3H2", payloadKg: 1500, cargoLengthM: 3.7, cargoWidthM: 1.87, cargoHeightM: 1.93 },
      { make: "Ford", model: "Transit L3H2", payloadKg: 1400, cargoLengthM: 3.49, cargoWidthM: 1.78, cargoHeightM: 1.89 },
      { make: "Mercedes-Benz", model: "Sprinter 315 L3H2", payloadKg: 1400, cargoLengthM: 3.62, cargoWidthM: 1.78, cargoHeightM: 1.94 },
      { make: "Renault", model: "Master L3H2", payloadKg: 1500, cargoLengthM: 3.73, cargoWidthM: 1.77, cargoHeightM: 1.89 },
      { make: "Volkswagen", model: "Crafter L3H3", payloadKg: 1450, cargoLengthM: 3.45, cargoWidthM: 1.83, cargoHeightM: 1.96 },
      { make: "Iveco", model: "Daily 35S L3H2", payloadKg: 1500, cargoLengthM: 3.54, cargoWidthM: 1.8, cargoHeightM: 1.9 },
    ],
    MEDIUM_TRUCK: [
      { make: "Hino", model: "916", payloadKg: 5500, cargoLengthM: 6.2, cargoWidthM: 2.35, cargoHeightM: 2.35 },
      { make: "Mitsubishi Fuso", model: "Canter 7C15", payloadKg: 4200, cargoLengthM: 5.6, cargoWidthM: 2.2, cargoHeightM: 2.25 },
      { make: "Isuzu", model: "NPR 75", payloadKg: 4500, cargoLengthM: 5.8, cargoWidthM: 2.3, cargoHeightM: 2.3 },
      { make: "Iveco", model: "Eurocargo 120E", payloadKg: 6800, cargoLengthM: 7.2, cargoWidthM: 2.45, cargoHeightM: 2.5 },
      { make: "Mercedes-Benz", model: "Atego 1018", payloadKg: 5000, cargoLengthM: 6.3, cargoWidthM: 2.4, cargoHeightM: 2.45 },
      { make: "Ford", model: "Trucks 1026", payloadKg: 5800, cargoLengthM: 6.8, cargoWidthM: 2.45, cargoHeightM: 2.5 },
    ],
    HEAVY_FREIGHT_TRUCK: [
      { make: "MAN", model: "TGM 18.290", payloadKg: 10500, cargoLengthM: 8.6, cargoWidthM: 2.45, cargoHeightM: 2.7 },
      { make: "MAN", model: "TGL 12.220", payloadKg: 6500, cargoLengthM: 7.2, cargoWidthM: 2.45, cargoHeightM: 2.6 },
      { make: "Volvo", model: "FL 280", payloadKg: 9500, cargoLengthM: 8.4, cargoWidthM: 2.45, cargoHeightM: 2.65 },
      { make: "Scania", model: "P 280", payloadKg: 10000, cargoLengthM: 8.5, cargoWidthM: 2.45, cargoHeightM: 2.7 },
      { make: "DAF", model: "LF 260", payloadKg: 8800, cargoLengthM: 8.2, cargoWidthM: 2.45, cargoHeightM: 2.65 },
      { make: "Mercedes-Benz", model: "Atego 1830", payloadKg: 9200, cargoLengthM: 8.3, cargoWidthM: 2.45, cargoHeightM: 2.65 },
    ],
    TRAILER_TRUCK: [
      { make: "Mercedes-Benz", model: "Actros 1845 LS", payloadKg: 24000, cargoLengthM: 13.6, cargoWidthM: 2.48, cargoHeightM: 2.7 },
      { make: "Volvo", model: "FH 460 4x2", payloadKg: 24000, cargoLengthM: 13.6, cargoWidthM: 2.48, cargoHeightM: 2.7 },
      { make: "Scania", model: "R 450 A4x2", payloadKg: 24000, cargoLengthM: 13.6, cargoWidthM: 2.48, cargoHeightM: 2.7 },
      { make: "MAN", model: "TGX 18.470", payloadKg: 24000, cargoLengthM: 13.6, cargoWidthM: 2.48, cargoHeightM: 2.7 },
      { make: "DAF", model: "XF 480 FT", payloadKg: 24000, cargoLengthM: 13.6, cargoWidthM: 2.48, cargoHeightM: 2.7 },
      { make: "Renault", model: "T High 480", payloadKg: 24000, cargoLengthM: 13.6, cargoWidthM: 2.48, cargoHeightM: 2.7 },
      { make: "Iveco", model: "S-Way AS440", payloadKg: 24000, cargoLengthM: 13.6, cargoWidthM: 2.48, cargoHeightM: 2.7 },
    ],
  };

/**
 * Class-level capacity envelope from the design's class cards — the figures a
 * class stands for when no specific model is in play. Unadjusted for body type,
 * like the model rows.
 *
 * `defaultSpecForClass` prefers the class's first model row (which is what the
 * prototype's `syncVehicles` uses when it generates a blank vehicle) and only
 * falls back to these; since every class currently has at least six model rows,
 * the fallback branch is unreachable today. It exists so the function stays
 * total if a class's model list is ever emptied, and because these are the
 * design's published class figures in their own right.
 */
export const CLASS_FALLBACK_SPECS: Record<VehicleClassId, ModelSpec> = {
  SMALL_VAN: { payloadKg: 800, cargoLengthM: 2.0, cargoWidthM: 1.2, cargoHeightM: 1.2 },
  LARGE_VAN: { payloadKg: 1400, cargoLengthM: 3.4, cargoWidthM: 1.7, cargoHeightM: 1.9 },
  MEDIUM_TRUCK: { payloadKg: 6000, cargoLengthM: 6.2, cargoWidthM: 2.4, cargoHeightM: 2.4 },
  HEAVY_FREIGHT_TRUCK: { payloadKg: 12000, cargoLengthM: 9.6, cargoWidthM: 2.45, cargoHeightM: 2.7 },
  TRAILER_TRUCK: { payloadKg: 24000, cargoLengthM: 13.6, cargoWidthM: 2.48, cargoHeightM: 2.7 },
};

/**
 * How a cargo body changes the published figures.
 *
 * A refrigerated body loses payload and internal space to insulation and the
 * cooling unit; an open deck carries slightly more, is slightly wider, and has
 * drop sides instead of a ceiling.
 *
 * `heightOffsetM: null` on `OPEN_CHASSIS` is a sentinel, not a zero offset: an
 * open deck has no cargo box, so its "height" is the drop-side height from
 * `DROP_SIDE_HEIGHT_M`, substituted outright rather than added to the model's
 * box height.
 */
const BODY_ADJUSTMENT: Record<
  ChassisType,
  {
    payloadFactor: number;
    lengthOffsetM: number;
    widthOffsetM: number;
    heightOffsetM: number | null;
  }
> = {
  DRY_BOX: { payloadFactor: 1, lengthOffsetM: 0, widthOffsetM: 0, heightOffsetM: 0 },
  REFRIGERATED: { payloadFactor: 0.92, lengthOffsetM: -0.25, widthOffsetM: -0.12, heightOffsetM: -0.16 },
  OPEN_CHASSIS: { payloadFactor: 1.05, lengthOffsetM: 0, widthOffsetM: 0.05, heightOffsetM: null },
};

/**
 * Drop-side height per class, used in place of a box height on an open chassis.
 *
 * The prototype keys this on three classes and defaults the rest to 0.50 m; it
 * is spelled out for all five here so the lookup is total and no default branch
 * is needed. The two van entries are unreachable through the wizard — the
 * (van × open chassis) cells are locked because no `VehicleTypeSpec` backs them
 * — but they keep the record exhaustive.
 */
const DROP_SIDE_HEIGHT_M: Record<VehicleClassId, number> = {
  SMALL_VAN: 0.5,
  LARGE_VAN: 0.5,
  MEDIUM_TRUCK: 0.5,
  HEAVY_FREIGHT_TRUCK: 0.6,
  TRAILER_TRUCK: 0.6,
};

/** Smallest cargo dimension the wizard will ever prefill, in metres. An offset
 *  can never drive a figure below this. */
const MIN_DIMENSION_M = 0.5;

/** Rounds to the nearest centimetre. Applied to every derived dimension so a
 *  binary-float artefact (2.35 + -0.16 === 2.1899999999999995) never reaches a
 *  form field or the database. */
function roundToCentimetre(metres: number): number {
  return Math.round(metres * 100) / 100;
}

/**
 * Derives the capacity figures to prefill for a vehicle of `classId` with a
 * `chassisType` body, from a published reference row (or from a class fallback —
 * both are `ModelSpec`-shaped).
 *
 * Payload is scaled by the body factor and rounded to the nearest 10 kg, since a
 * payload figure carrying single kilograms reads as a measurement rather than
 * the estimate it is. Length and width take a fixed offset; height takes an
 * offset for a closed body and the class's drop-side height for an open one.
 * Every dimension is floored at 0.5 m and rounded to the centimetre.
 *
 * Pure: same inputs, same output, no clock, no randomness, no I/O.
 */
export function specForModel(
  chassisType: ChassisType,
  classId: VehicleClassId,
  reference: ModelSpec,
): ModelSpec {
  const adjustment = BODY_ADJUSTMENT[chassisType];

  const cargoHeightM =
    adjustment.heightOffsetM === null
      ? DROP_SIDE_HEIGHT_M[classId]
      : roundToCentimetre(
          Math.max(
            MIN_DIMENSION_M,
            reference.cargoHeightM + adjustment.heightOffsetM,
          ),
        );

  return {
    payloadKg:
      Math.round((reference.payloadKg * adjustment.payloadFactor) / 10) * 10,
    cargoLengthM: roundToCentimetre(
      Math.max(
        MIN_DIMENSION_M,
        reference.cargoLengthM + adjustment.lengthOffsetM,
      ),
    ),
    cargoWidthM: roundToCentimetre(
      Math.max(
        MIN_DIMENSION_M,
        reference.cargoWidthM + adjustment.widthOffsetM,
      ),
    ),
    cargoHeightM,
  };
}

/**
 * The figures a freshly generated vehicle row starts with, before the company
 * picks a specific model — the class's first published model, adjusted for the
 * body type, matching the prototype's `syncVehicles`.
 */
export function defaultSpecForClass(
  chassisType: ChassisType,
  classId: VehicleClassId,
): ModelSpec {
  const reference: ModelSpec =
    MODEL_REFERENCES[classId][0] ?? CLASS_FALLBACK_SPECS[classId];

  return specForModel(chassisType, classId, reference);
}

/** Looks a reference row up by its exact make and model, case-insensitively —
 *  what a resumed draft uses to recover the row behind a stored make/model pair
 *  (e.g. to re-render the "Prefilled from …" footer). `null` when the company
 *  typed a vehicle that is not in the table, which is allowed. */
export function findModelReference(
  classId: VehicleClassId,
  make: string,
  model: string,
): VehicleModelReference | null {
  const normalisedMake = make.trim().toLowerCase();
  const normalisedModel = model.trim().toLowerCase();

  return (
    MODEL_REFERENCES[classId].find(
      (reference) =>
        reference.make.toLowerCase() === normalisedMake &&
        reference.model.toLowerCase() === normalisedModel,
    ) ?? null
  );
}

/** Substring filter over "<make> <model>" for the step-3 combobox, matching the
 *  prototype's filter. An empty query returns the class's full list. */
export function searchModelReferences(
  classId: VehicleClassId,
  query: string,
): VehicleModelReference[] {
  const normalised = query.trim().toLowerCase();
  if (normalised === "") return MODEL_REFERENCES[classId];

  return MODEL_REFERENCES[classId].filter((reference) =>
    `${reference.make} ${reference.model}`.toLowerCase().includes(normalised),
  );
}

/** Renders a derived payload for a form field, e.g. `5780`. */
export function formatPayloadKg(value: number): string {
  return String(Math.round(value));
}

/** Renders a derived dimension for a form field, e.g. `6.20` — always two
 *  decimals, matching the design's mono-spaced dimension inputs. */
export function formatDimensionM(value: number): string {
  return value.toFixed(2);
}
```

Prettier will reflow the one-line object literals in `MODEL_REFERENCES` and `CLASS_FALLBACK_SPECS` across several lines each. That is fine and expected — run `pnpm lint` (or the project's `format` script) and commit the reflowed result; do not hand-fight the formatter, and do not add a `prettier-ignore`.

### 5. Worked examples to check the port against

Verify these by hand (or in a scratch `node -e`) before opening the pull request. They are the cases that catch a mis-ported offset or a mis-ordered floor/round:

| Class | Body | Reference row | Expected `payloadKg` | `L × W × H` |
|---|---|---|---|---|
| `MEDIUM_TRUCK` | `DRY_BOX` | Hino 916 (5500, 6.20/2.35/2.35) | `5500` | `6.2 × 2.35 × 2.35` |
| `MEDIUM_TRUCK` | `REFRIGERATED` | Hino 916 | `5060` | `5.95 × 2.23 × 2.19` |
| `MEDIUM_TRUCK` | `OPEN_CHASSIS` | Hino 916 | `5780` | `6.2 × 2.4 × 0.5` |
| `TRAILER_TRUCK` | `DRY_BOX` | Actros 1845 LS (24000, 13.60/2.48/2.70) | `24000` | `13.6 × 2.48 × 2.7` |
| `SMALL_VAN` | `REFRIGERATED` | Dokker Van (750, 1.90/1.22/1.21) | `690` | `1.65 × 1.1 × 1.05` |

The third row is the sentinel case: the open-chassis height is `0.50` (the class's drop-side height), **not** `2.35` and not `2.35 + something`. The fifth row is the float case: `1.21 - 0.16` is `1.0499999999999998` in binary floating point, and `roundToCentimetre` is what makes it exactly `1.05`.

### 6. What this task does not do

- No React, no JSX, no component. Task-12 owns the combobox, the editor panel, the "Prefilled from Hino 916 as a dry box." footer and the "Usable volume 35.7 m³" line.

**These names are a frozen contract, not suggestions.** Task-12 imports `MODEL_REFERENCES`, `VehicleModelReference`, `ModelSpec`, `specForModel`, `defaultSpecForClass`, `formatPayloadKg` and `formatDimensionM` from `src/lib/fleet-onboarding/model-specs.ts` under exactly those spellings, and calls the two derivation functions with exactly this argument order — `specForModel(chassisType, classId, reference)` and `defaultSpecForClass(chassisType, classId)`, body type first in both. Do not rename the module to `model-reference.ts`, do not rename `MODEL_REFERENCES` to `MODELS_BY_CLASS`, do not rename `VehicleModelReference`/`ModelSpec` to `ModelReference`/`ResolvedSpec`, do not rename `specForModel` to `specForClass`, and do not swap `chassisType` and `classId` — every one of those breaks task-12.
- No colour list. The 12 colours are a step-3 UI concern owned by task-12.
- No `VehicleTypeSpec` lookup and no (class × chassis) lock map. That is task-04's `vehicle-classes.ts`; this module deliberately knows nothing about which cells are locked, so it will happily derive a spec for `SMALL_VAN × OPEN_CHASSIS` — a combination the UI never offers.
- No validation. The bounds (payload 100–40,000 kg, dimensions `> 0` and `≤ 20 m`, Trailer Truck length `≥ 8 m`) are enforced in task-12's form validator and re-checked server-side in task-14. This module only prefills.

## Acceptance Criteria

- [ ] `src/lib/fleet-onboarding/model-specs.ts` exists, its only import is `import type { ChassisType } from "@prisma/client";`, and it contains no `"use client"`/`"use server"` directive and no module-level side effects.
- [ ] `MODEL_REFERENCES` holds exactly 31 rows — 6 / 6 / 6 / 6 / 7 across `SMALL_VAN` / `LARGE_VAN` / `MEDIUM_TRUCK` / `HEAVY_FREIGHT_TRUCK` / `TRAILER_TRUCK` — matching the table above value for value and in the same order.
- [ ] The non-ASCII characters survive: the file contains `Doblò Cargo Maxi` and `Citroën`, and `Ford` / `Trucks 1026` is present as written.
- [ ] `CLASS_FALLBACK_SPECS` covers all five classes with the design's class-level figures.
- [ ] `specForModel` returns **numbers**, applies the payload factor with rounding to the nearest 10 kg, applies the length/width offsets, substitutes the class drop-side height for `OPEN_CHASSIS` rather than adding an offset, floors every dimension at 0.5 m, and rounds every dimension to the nearest centimetre.
- [ ] All five worked examples in §5 produce exactly the listed values.
- [ ] `defaultSpecForClass`, `findModelReference`, `searchModelReferences`, `formatPayloadKg` and `formatDimensionM` are exported with the signatures above.
- [ ] The pull request description notes that the 31 rows and the body-adjustment figures are unreviewed design reference values and links `specs/business-fleet-onboarding/action-required.md`.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- **These figures need an operations review before the feature is announced.** `action-required.md` carries it as a "Before Implementation" item: they prefill a payload and dimensions that a company then attests to, so a wrong figure becomes a wrong compliance record. They ship as a code constant precisely so ops can correct them by pull request — one file, no migration, no re-seed.
- Do not import `VehicleClassId` from `src/lib/driver-onboarding/vehicle-classes.ts`. That module declares four classes until task-04 lands in Wave 2, so a five-key `Record<VehicleClassId, …>` built against it fails `pnpm typecheck` on excess properties, and this task must pass typecheck on its own. Once task-04 ships, the two unions are structurally identical and interchangeable; if task-12 needs both in one file it aliases one on import.
- Do not touch `src/lib/driver-onboarding/vehicle-classes.ts` in this task — task-04 exclusively owns it.
- Do not move this module under `src/lib/driver-onboarding/`. It lives at `src/lib/fleet-onboarding/` alongside the rest of this feature's shared code (task-05's `draft-schema.ts` joins it there — that module owns the draft shape, the shared fleet-size bounds and the `generateBusinessApplicationReference()` reference generator; there is no separate `reference.ts`). The individual driver wizard does not prefill from a model table today; if it ever adopts one, the import crosses feature folders rather than the file moving.
- Keep the module free of anything that would make it server-only. Task-14's submit endpoint re-derives the prefill from this same module to sanity-check the client's figures, which only works because both bundles can import it.
