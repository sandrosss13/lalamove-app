# Task 12: Step 3 — Vehicle Specifications

## Status

pending

## Wave

4

## Description

Fills in the wizard's third step: the numbered vehicle table generated from step 2's fleet counts, and the 640px editor dialog that specifies one vehicle. This is where the company turns "4 dry box medium trucks" into four real vehicles with plates, colours, payloads and cargo dimensions. Picking a make/model from the searchable dropdown prefills payload and dimensions from the published reference figures (`task-03`), adjusted for the cargo body type, and the editor names that source in its footer so the company knows which numbers it is being asked to correct.

The step also owns the **generation and preservation algorithm**: the vehicle array is derived from `draft.fleet.counts`, and when a count changes, already-filled vehicles in the affected (body × class) group survive — only the tail of that group grows or shrinks. Nothing here writes to the database. Every value lives in the draft until `task-14`'s submit endpoint validates and persists it.

## Dependencies

**Depends on:** task-09-fleet-wizard-shell.md, task-04-vehicle-class-taxonomy.md, task-03-model-reference-data.md
**Blocks:** task-15-application-status-screen.md *(which imports this task's vehicle editor dialog)*

**Context from dependencies:**

### `useFleetDraft()` — from `task-09` (`src/components/fleet-onboarding/fleet-draft-context.tsx`)

The wizard's single data hook. Throws outside `FleetDraftProvider`. Step components take **zero props** and read everything from it. Mirrors `src/components/driver-onboarding/onboarding-draft-context.tsx` (`draftRef`/`stepRef`/`statusRef` mirrors, `SAVE_DEBOUNCE_MS = 300` on edits, immediate save on `goToStep`, `saveSequence` guard, keepalive unmount flush, two-mode `load({ silent })`, `STATUS_POLL_INTERVAL_MS = 25_000`).

```ts
export const FLEET_SCREENS = {
  company: 1, fleet: 2, vehicles: 3, drivers: 4, review: 5,
} as const;

/** One vehicle's review row, as `task-05`'s GET returns it. */
export type FleetVehicleVerdict = {
  /** `BusinessApplicationVehicle.id` — what task-18's admin verdict mutations address. */
  id: string;
  /** `Vehicle.id` — what task-15's Fix PATCH is keyed on. Null if the vehicle was removed. */
  vehicleId: string | null;
  /** 1-based, derived from `createdAt` ordering. Not a column. */
  position: number;
  status: "PENDING" | "APPROVED" | "FLAGGED";
  flagReason: string | null;
  chassisType: FleetDraftChassisType;
  vehicleClass: FleetDraftVehicleClassId;
  plateNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  colour: string | null;
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  driver: {
    driverProfileId: string;
    name: string;
    phone: string;
    categories: ("B" | "C" | "CE")[];
  } | null;
};

export type FleetSubmittedSummary = {
  companyName: string;
  vatId: string;
  registeredAddress: string;
  city: string;
  citiesOfOperation: string[];
  contactName: string;
  contactRole: string;
  contactEmail: string;
  phone: string;
  /** Masked to the last four characters, e.g. "•••• •••• •••• 4821". */
  bankAccountIban: string;
  vehicleCount: number;
  countsByBodyType: Record<string, number>;
};

export type FleetDraftState = {
  loading: boolean;
  loadError: string | null;
  saveError: string | null;
  saving: boolean;
  status: "DRAFT" | "PENDING" | "ACTION_REQUIRED" | "APPROVED" | null;
  reference: string | null;
  companyReviewStatus: "PENDING" | "VERIFIED" | "FLAGGED" | null;
  companyFlagReason: string | null;
  vehicleVerdicts: FleetVehicleVerdict[];
  submittedSummary: FleetSubmittedSummary | null;
  draftStep: number;
  draftUpdatedAt: string | null;
  draft: FleetDraftV1;
  /** Section-level merge (NOT a deep merge); `version` re-pinned last. */
  updateDraft: (patch: Partial<FleetDraftV1>) => void;
  goToStep: (step: number) => void;
  refetch: () => Promise<void>;
  resetApplication: () => Promise<boolean>;
  showToast: (message: string, tone?: "default" | "error") => void;
};

export function useFleetDraft(): FleetDraftState;
```

`vehicleVerdicts` is empty while `DRAFT`; it and `submittedSummary` are what `task-15` renders. This step reads neither — it is listed here because the hook surface is one shape and every step restates it identically.

### `FleetDraftV1` — from `task-05`, re-exported through `task-09`

`src/lib/fleet-onboarding/draft-schema.ts`. Every field optional; a resumed draft can be half-filled. `parseFleetDraft()` is the single narrowing point and returns `null` unless `version === 1`.

```ts
export const FLEET_DRAFT_VERSION = 1;

export const FLEET_MIN_VEHICLES = 2;
export const FLEET_MAX_VEHICLES = 40;
export const FLEET_MAX_PER_CELL = 40;
export const MAX_DRAFT_JSON_LENGTH = 64 * 1024;

export type FleetDraftChassisType = "DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS";
export type FleetDraftVehicleClassId =
  | "SMALL_VAN" | "LARGE_VAN" | "MEDIUM_TRUCK" | "HEAVY_FREIGHT_TRUCK" | "TRAILER_TRUCK";

export type FleetDraftCompany = {
  phone?: string;
  companyName?: string;
  vatId?: string;
  registeredAddress?: string;
  city?: string;                    // the registered city, set at sign-up
  citiesOfOperation?: string[];
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  bankAccountIban?: string;
};

export type FleetDraftFleet = {
  /** Key is `${chassisType}:${classId}`, e.g. "REFRIGERATED:MEDIUM_TRUCK". */
  counts?: Record<string, number>;
};

export type FleetDraftVehicle = {
  /** Stable client-generated id (crypto.randomUUID()). Survives count changes. */
  id: string;
  chassisType: FleetDraftChassisType;
  classId: FleetDraftVehicleClassId;
  make?: string;
  model?: string;
  year?: number;
  plateNumber?: string;
  colour?: string;
  payloadKg?: number;
  cargoLengthM?: number;
  cargoWidthM?: number;
  cargoHeightM?: number;
  /** "Hino 916" — names the prefill source in the editor footer. Absent for free text. */
  prefillSource?: string;
  /** `DriverProfile.id` of the assigned driver. */
  driverProfileId?: string;
};

export type FleetDraftV1 = {
  version: 1;
  company?: FleetDraftCompany;
  fleet?: FleetDraftFleet;
  /** Written and owned exclusively by THIS step, apart from `driverProfileId`,
   *  which `task-13` writes and this step must never drop. */
  vehicles?: FleetDraftVehicle[];
};
```

Two bindings this step leans on: the counts are **nested** at `draft.fleet.counts` (never a flat `draft.fleet`), and `prefillSource` is a **string** — the make and model joined with a space, e.g. `"Hino 916"` — not an object. `FLEET_MAX_PER_CELL` and `FLEET_MAX_VEHICLES` are declared in `draft-schema.ts` (task-05) and imported from there — never re-declared in this task's modules.

### The five-class taxonomy and the lock map — from `task-04` (`src/lib/driver-onboarding/vehicle-classes.ts`)

`task-04` grows the **shared** taxonomy from four classes to five. `HEAVY_FREIGHT_TRUCK` moves from CE to **C**; `TRAILER_TRUCK` is added at **CE**. Only `task-04` may edit that file.

```ts
export type VehicleClassId =
  | "SMALL_VAN"
  | "LARGE_VAN"
  | "MEDIUM_TRUCK"
  | "HEAVY_FREIGHT_TRUCK"
  | "TRAILER_TRUCK";

export const VEHICLE_CLASSES: VehicleClass[]; // in the order above
export function findVehicleClass(id: VehicleClassId): VehicleClass; // throws on unknown
export function resolveVehicleTypeSpecCode(
  classId: VehicleClassId,
  chassisType: ChassisType,
): string | null; // null === locked cell
```

| Class | `chip` | `requiredLicenceCategory` | `capacityLine` |
|---|---|---|---|
| `SMALL_VAN` — Small Van | `CAT B` | `B` | Up to 800 kg · 2 pallets |
| `LARGE_VAN` — Large Van | `CAT B` | `B` | 800–1,500 kg · 4 pallets |
| `MEDIUM_TRUCK` — Medium Truck | `CAT C` | `C` | 1.5–7 t · 8 pallets |
| `HEAVY_FREIGHT_TRUCK` — Heavy Freight Truck | `CAT C` | `C` | 7–18 t · 16 pallets · 3 axles |
| `TRAILER_TRUCK` — Trailer Truck | `CAT CE` | `CE` | 18–24 t · 33 pallets · articulated |

`specCodeByChassis` — 8 usable cells, 7 locked (`null`):

| Class | `DRY_BOX` | `REFRIGERATED` | `OPEN_CHASSIS` |
|---|---|---|---|
| `SMALL_VAN` | `MINIVAN` | `null` | `null` |
| `LARGE_VAN` | `CARGO_VAN` | `REFRIGERATED_VAN` | `null` |
| `MEDIUM_TRUCK` | `BOX_TRUCK` | `REFRIGERATED_TRUCK` | `FLATBED_TRUCK` |
| `HEAVY_FREIGHT_TRUCK` | `LARGE_FREIGHT_TRUCK` | `null` | `null` |
| `TRAILER_TRUCK` | `TRAILER_TRUCK` *(seeded by task-02)* | `null` | `null` |

`task-04` also owns the cargo body constant, in the same file. **Import it — do not declare a local `BODY_TYPES` or `BODY_LABEL` map here.**

```ts
export type BodyType = {
  id: ChassisType;
  /** Full label, used as a panel heading and a radio label. */
  label: string;
  /** Compact label for table rows, chips and summary lines. */
  shortLabel: string;
  description: string;
};

export const BODY_TYPES: BodyType[];          // DRY_BOX, REFRIGERATED, OPEN_CHASSIS
export function findBodyType(id: ChassisType): BodyType;  // throws on unknown
```

`shortLabel` is `Dry Box` / `Refrigerated` / `Open Chassis` — that is what this step's table rows, group headings and dialog copy render. `label` differs only for `REFRIGERATED`, which spells out as `Refrigerated Vehicle`.

### `specForModel()` and the 31-row table — from `task-03` (`src/lib/fleet-onboarding/model-specs.ts`)

Pure data + pure functions, no Prisma value import (the `ChassisType`/`VehicleClassId` imports are type-only), so it is safe in a client component.

```ts
/** Capacity figures: what a vehicle carries and the internal size of its hold. */
export type ModelSpec = {
  payloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
};

/** One published reference row — the standard dry-box variant's figures. */
export type VehicleModelReference = ModelSpec & {
  make: string;
  model: string;
};

export const MODEL_REFERENCES: Record<VehicleClassId, VehicleModelReference[]>;

/** A published row (or a class fallback) adjusted for the cargo body type. */
export function specForModel(
  chassisType: ChassisType,
  classId: VehicleClassId,
  reference: ModelSpec,
): ModelSpec;

/** The class-level default, used when no model has been picked. */
export function defaultSpecForClass(
  chassisType: ChassisType,
  classId: VehicleClassId,
): ModelSpec;

/** Form-field renderers: `5780` and `6.20`. Seed the string-typed inputs with these. */
export function formatPayloadKg(value: number): string;
export function formatDimensionM(value: number): string;
```

**The argument order is `(chassisType, classId, reference)`** — body first, class second. There is no `model-reference.ts`, no `MODELS_BY_CLASS`, no `ModelReference`, no `ResolvedSpec` and no `specForClass`; a call written with the class first will typecheck against neither signature.

The 31 rows — `[make, model, payloadKg, L, W, H]`. Non-ASCII is load-bearing (`Doblò`, `Citroën`), and `Ford / Trucks 1026` is the Ford Trucks brand written verbatim:

```
SMALL_VAN (6)
  Renault / Dokker Van            /  750 / 1.90 1.22 1.21
  Fiat / Doblò Cargo Maxi         / 1000 / 2.17 1.23 1.30
  Toyota / Proace City L2         / 1000 / 2.16 1.23 1.24
  Ford / Transit Connect L2       /  900 / 2.08 1.22 1.27
  Citroën / Berlingo Van XL       / 1000 / 2.16 1.23 1.24
  Peugeot / Partner Long          / 1000 / 2.16 1.23 1.24
LARGE_VAN (6)
  Fiat / Ducato L3H2              / 1500 / 3.70 1.87 1.93
  Ford / Transit L3H2             / 1400 / 3.49 1.78 1.89
  Mercedes-Benz / Sprinter 315 L3H2 / 1400 / 3.62 1.78 1.94
  Renault / Master L3H2           / 1500 / 3.73 1.77 1.89
  Volkswagen / Crafter L3H3       / 1450 / 3.45 1.83 1.96
  Iveco / Daily 35S L3H2          / 1500 / 3.54 1.80 1.90
MEDIUM_TRUCK (6)
  Hino / 916                      / 5500 / 6.20 2.35 2.35
  Mitsubishi Fuso / Canter 7C15   / 4200 / 5.60 2.20 2.25
  Isuzu / NPR 75                  / 4500 / 5.80 2.30 2.30
  Iveco / Eurocargo 120E          / 6800 / 7.20 2.45 2.50
  Mercedes-Benz / Atego 1018      / 5000 / 6.30 2.40 2.45
  Ford / Trucks 1026              / 5800 / 6.80 2.45 2.50
HEAVY_FREIGHT_TRUCK (6)
  MAN / TGM 18.290                / 10500 / 8.60 2.45 2.70
  MAN / TGL 12.220                /  6500 / 7.20 2.45 2.60
  Volvo / FL 280                  /  9500 / 8.40 2.45 2.65
  Scania / P 280                  / 10000 / 8.50 2.45 2.70
  DAF / LF 260                    /  8800 / 8.20 2.45 2.65
  Mercedes-Benz / Atego 1830      /  9200 / 8.30 2.45 2.65
TRAILER_TRUCK (7) — all 24000 / 13.60 2.48 2.70
  Mercedes-Benz / Actros 1845 LS · Volvo / FH 460 4x2 · Scania / R 450 A4x2
  MAN / TGX 18.470 · DAF / XF 480 FT · Renault / T High 480 · Iveco / S-Way AS440
```

Body-type adjustment inside `specForModel` / `defaultSpecForClass` (payload rounds to the nearest 10 kg, every dimension floors at 0.50 m and is fixed to 2 decimals):

| Body | Payload | Length | Width | Height |
|---|---|---|---|---|
| `DRY_BOX` | ×1 | — | — | — |
| `REFRIGERATED` | ×0.92 | −0.25 m | −0.12 m | −0.16 m |
| `OPEN_CHASSIS` | ×1.05 | — | +0.05 m | **replaced by** the drop-side height: 0.50 m (medium), 0.60 m (heavy, trailer), 0.50 m otherwise |

Class-level fallbacks used by `defaultSpecForClass` before any body adjustment — payload kg + `[L, W, H]`:

```
SMALL_VAN           800   [2.00, 1.20, 1.20]
LARGE_VAN           1400  [3.40, 1.70, 1.90]
MEDIUM_TRUCK        6000  [6.20, 2.40, 2.40]
HEAVY_FREIGHT_TRUCK 12000 [9.60, 2.45, 2.70]
TRAILER_TRUCK       24000 [13.60, 2.48, 2.70]
```

## Files to Create

- `src/lib/fleet-onboarding/fleet-vehicles.ts` — ordering constants, the generation/preservation algorithm, the per-vehicle validator and the readiness predicate. Pure, no React, no Prisma value imports.
- `src/components/fleet-onboarding/vehicle-editor-dialog.tsx` — the 640px editor `Dialog`, a **separate module with `VehicleEditorDialog` and `VehicleEditorValues` as named exports**, written props-driven and context-free so `task-15` can import it and reuse it on the status screen.

## Files to Modify

- `src/components/fleet-onboarding/steps/step-3-vehicle-specifications.tsx` — replace `task-09`'s stub with the real step.

## Technical Details

### 1. `src/lib/fleet-onboarding/fleet-vehicles.ts`

Its imports, in full — every shared constant comes from the module that owns it, and none of them is re-declared here:

```ts
import type { ChassisType } from "@prisma/client";
import {
  FLEET_MAX_PER_CELL,
  FLEET_MAX_VEHICLES,
  FLEET_MIN_VEHICLES,
  type FleetDraftVehicle,
} from "@/lib/fleet-onboarding/draft-schema";
import {
  findBodyType,
  findVehicleClass,
  resolveVehicleTypeSpecCode,
  type VehicleClassId,
} from "@/lib/driver-onboarding/vehicle-classes";
```

#### Ordering — the one rule the whole feature numbers by

```ts
/** Cargo body types, in the order the step-2 panels are stacked. */
export const BODY_ORDER = ["DRY_BOX", "REFRIGERATED", "OPEN_CHASSIS"] as const;

/** Vehicle classes, in `VEHICLE_CLASSES` order. */
export const CLASS_ORDER: VehicleClassId[] = [
  "SMALL_VAN",
  "LARGE_VAN",
  "MEDIUM_TRUCK",
  "HEAVY_FREIGHT_TRUCK",
  "TRAILER_TRUCK",
];

/** The draft's count key for one (body × class) cell. */
export function cellKey(chassisType: ChassisType, classId: VehicleClassId): string {
  return `${chassisType}:${classId}`;
}
```

Groups are enumerated **body-major, class-minor**: all fifteen cells are visited as `DRY_BOX × SMALL_VAN`, `DRY_BOX × LARGE_VAN`, … `DRY_BOX × TRAILER_TRUCK`, then the `REFRIGERATED` five, then the `OPEN_CHASSIS` five. Cells with a zero count — and the seven locked cells, which can never hold a count — contribute nothing.

The `#` column is **1-based over the flattened array**, continuous across group boundaries: with 4 dry-box medium trucks and 3 refrigerated large vans, the medium trucks are 1–4 and the vans are 5–7. Steps 4 and 5 and the status screen all number the same way, by array index, so a vehicle carries one number everywhere.

#### Generation and preservation

```ts
/**
 * Rebuilds the vehicle list from the step-2 counts, preserving every
 * already-specified vehicle in each (body × class) group and adding or removing
 * only at that group's tail.
 *
 * `existing` is read in array order, which is the order a previous run of this
 * same function produced, so the filter below is stable: a preserved vehicle
 * keeps its position relative to its group-mates, and therefore keeps its
 * number unless a group *before* it changed size.
 */
export function reconcileFleetVehicles(
  counts: Record<string, number>,
  existing: FleetDraftVehicle[],
): FleetDraftVehicle[] {
  const next: FleetDraftVehicle[] = [];

  for (const chassisType of BODY_ORDER) {
    for (const classId of CLASS_ORDER) {
      // A locked cell resolves to null and can never carry a count; guarded
      // anyway so a hand-edited draft cannot smuggle one in.
      if (resolveVehicleTypeSpecCode(classId, chassisType) === null) continue;

      const raw = counts[cellKey(chassisType, classId)] ?? 0;
      const count = Number.isInteger(raw)
        ? Math.min(Math.max(raw, 0), FLEET_MAX_PER_CELL)
        : 0;
      if (count === 0) continue;

      const group = existing.filter(
        (vehicle) =>
          vehicle.chassisType === chassisType && vehicle.classId === classId,
      );

      if (group.length >= count) {
        // Shrink: keep the FIRST `count`, drop from the tail. The company
        // filled them in top-down, so the tail is the least-invested end.
        next.push(...group.slice(0, count));
      } else {
        // Grow: every survivor, then blanks appended after them.
        next.push(...group);
        for (let index = group.length; index < count; index += 1) {
          next.push(createBlankVehicle(chassisType, classId));
        }
      }
    }
  }

  return next;
}

function createBlankVehicle(
  chassisType: ChassisType,
  classId: VehicleClassId,
): FleetDraftVehicle {
  // `driverProfileId` is left ABSENT rather than set to null — the canonical
  // `FleetDraftVehicle` types it `driverProfileId?: string`, and absent is what
  // task-13 reads as unassigned.
  return { id: crypto.randomUUID(), chassisType, classId };
}
```

Consequences to implement deliberately, not by accident:

- **A vehicle's `id` is stable for its whole life.** Renumbering is a display artefact of array position; the id is what step 4's driver assignment and the editor's open-row state hang off, so neither is lost when an earlier group grows.
- **A cell dropped to zero drops its vehicles entirely**, including any driver they carried. That is the intended reading of "removes at the tail" when the tail is the whole group.
- **`driverProfileId` rides along on the preserved object.** Never rebuild a survivor — push the existing object reference through unchanged.
- Reconciliation is **idempotent**: running it on its own output returns an equal array.

#### Who runs it

This step is the **only** writer of `draft.vehicles`. Step 2 (`task-11`) writes `draft.fleet.counts` and nothing else. On mount and whenever `draft.fleet.counts` changes, this step reconciles and writes back **only if the result differs** from `draft.vehicles`:

```ts
useEffect(() => {
  const reconciled = reconcileFleetVehicles(
    draft.fleet?.counts ?? {},
    draft.vehicles ?? [],
  );
  if (sameVehicleList(reconciled, draft.vehicles ?? [])) return;
  updateDraft({ vehicles: reconciled });
}, [draft.fleet?.counts, draft.vehicles, updateDraft]);
```

`sameVehicleList` compares length and then `id` pairwise — reference equality is not enough (a resumed draft is a fresh parse) and a deep compare would re-run on every keystroke. Guarding the write is what stops the effect from looping through `updateDraft`.

#### Validation and readiness

```ts
export const MIN_VEHICLE_YEAR = 1995;
export const MIN_PLATE_LENGTH = 4;
export const MIN_PAYLOAD_KG = 100;
export const MAX_PAYLOAD_KG = 40_000;
export const MAX_DIMENSION_M = 20;
/** A tractor unit plus a standard semi-trailer is never shorter than this. */
export const MIN_TRAILER_LENGTH_M = 8;

export type VehicleFieldKey =
  | "makeModel" | "year" | "plate" | "colour" | "payload" | "dimensions";

export type VehicleFieldErrors = Partial<Record<VehicleFieldKey, string>>;

/**
 * Every failing field at once, in the fixed order below, so a caller can report
 * "the first message" deterministically. Pure: `currentYear` and `otherPlates`
 * are passed in rather than read here.
 *
 * DELIBERATE DUPLICATE. This is the client-side half of a pair. The
 * authoritative server-side twin is `validateVehicleInput` in
 * `src/lib/fleet-onboarding/vehicle-validation.ts` (task-14), which re-checks
 * the same rules against the saved draft on submit and against the corrected
 * body on `PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]`.
 * Nothing this function returns is trusted there. The two are kept apart on
 * purpose — this one reports per-FIELD keys for inline messages, that one
 * accumulates prefixed sentences into a `problems[]` array — so if a rule
 * changes, change BOTH, and treat the server's version as the definition.
 */
export function validateFleetVehicle(
  vehicle: FleetDraftVehicle,
  currentYear: number,
  otherPlates: Map<string, number>, // UPPERCASED plate -> that vehicle's 1-based number
): VehicleFieldErrors;

export function isVehicleReady(
  vehicle: FleetDraftVehicle,
  currentYear: number,
  otherPlates: Map<string, number>,
): boolean; // Object.keys(validateFleetVehicle(...)).length === 0

/** The fixed order the table and the toast read errors in. */
export const VEHICLE_FIELD_ORDER: VehicleFieldKey[] = [
  "makeModel", "year", "plate", "colour", "payload", "dimensions",
];
```

Rules and their **exact** messages:

| Field | Rule | Message |
|---|---|---|
| `makeModel` | `make` and `model` both non-empty after trim | `Select or type the make and model.` |
| `year` | present | `Enter the year of manufacture.` |
| `year` | integer, `1995 <= year <= currentYear` | `Year must be between 1995 and {currentYear}.` |
| `plate` | present | `Enter the licence plate.` |
| `plate` | `length >= 4` after trim | `That plate looks incomplete.` |
| `plate` | not held by another vehicle in this fleet | `That plate is already used by vehicle {n}.` |
| `colour` | present | `Select the vehicle colour.` |
| `payload` | present | `Enter the maximum payload in kg.` |
| `payload` | `100 <= payload <= 40000` | `Payload must be between 100 and 40,000 kg.` |
| `dimensions` | all three present and `> 0` | `Give length, width and height in metres.` |
| `dimensions` | all three `<= 20` | `Check the dimensions — metres, not centimetres.` |
| `dimensions` | `classId === "TRAILER_TRUCK"` → `cargoLengthM >= 8` | `A trailer truck's cargo length must be at least 8 m.` |

`currentYear` is computed as `new Date().getFullYear()` **per render**, never captured once and never hard-coded — a wizard left open across midnight on 31 December must not reject a new vehicle's year. Today that evaluates to 2026, which is the design's stated ceiling.

The duplicate-plate check is a client-side courtesy over what the server enforces for real: `Vehicle.plateNumber` is globally `@unique`, and `task-14`'s submit re-checks both in-fleet duplicates (400) and cross-fleet collisions (409 on `P2002`).

### 2. The vehicle table — `steps/step-3-vehicle-specifications.tsx`

Built on `src/components/ui/table` (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`). The step's subtree already sits inside the wizard's `data-onboarding-surface` element.

**Step header.** Above the table, a right-aligned mono counter in the design's label style:

```
{readyCount} of {totalCount} specified
```

e.g. `4 of 7 specified`. Rendered in `font-price`, with `aria-live="polite"` so it announces as rows are completed.

**Columns**, in order: `#` · `Class & body` · `Make / model` · `Plate` · `Payload` · `Status`.

**Grouping.** Rows are grouped by body then class, matching `reconcileFleetVehicles`'s enumeration. Each group with at least one vehicle is introduced by a full-width heading row — a `TableRow` holding one `TableCell` with `colSpan={6}` — reading `Dry Box · Medium Truck` in the label style on `bg-muted/40`. The `#` column keeps counting across the headings.

Body labels come from `task-04`'s `BODY_TYPES` — `findBodyType(chassisType).shortLabel`, which is `Dry Box` / `Refrigerated` / `Open Chassis`. **Do not declare a local `BODY_LABEL` map**; a second copy of these three strings is exactly how the step and the step-2 panels drift apart:

```ts
import { findBodyType } from "@/lib/driver-onboarding/vehicle-classes";

const bodyLabel = findBodyType(vehicle.chassisType).shortLabel;
```

**Cell contents.**

| Column | Content | Empty |
|---|---|---|
| `#` | 1-based index, `font-price` | — |
| Class & body | `findVehicleClass(classId).name` on the first line, `BODY_LABEL[chassisType]` under it in `text-muted-foreground` | — |
| Make / model | `${make} ${model}` | `—` |
| Plate | `plateNumber`, `font-price font-semibold tracking-[0.12em]` | `—` |
| Payload | `${payloadKg.toLocaleString("en-US")} kg`, `font-price` | `—` |
| Status | pill (see below) | — |

**Status pill.** 20px radius, 11px mono uppercase.

- Ready — `border-transparent` on `color-mix(in oklch, oklch(0.5 0.13 145) 12%, var(--card))` with `oklch(0.5 0.13 145)` text.
- Incomplete — `border-transparent bg-muted text-muted-foreground`; once Continue has been pressed and this row is still incomplete, it switches to the destructive tint (`bg-destructive/10 text-destructive`) and the whole `TableRow` gains `bg-destructive/5`.

**Opening the editor.** The entire row is clickable: give the `TableRow` `role="button"`, `tabIndex={0}`, `cursor-pointer`, an `onClick`, and an `onKeyDown` handling `Enter` and `Space` (with `preventDefault` on Space so the page does not scroll). Set `aria-label` to `Specify vehicle {n}, {className} {bodyLabel}`.

**Continue.** `handleContinue` recomputes `validateFleetVehicle` for every vehicle in table order:

- If all pass → `goToStep(FLEET_SCREENS.drivers)`.
- Otherwise → set `showErrors`, do **not** navigate, and raise `showToast(firstMessage, "error")` where `firstMessage` is the first message of the first failing vehicle, read through `VEHICLE_FIELD_ORDER`. This is deliberately **not** the generic `Fix the highlighted fields to continue.` used on the form steps: on a table step the failing field is inside a closed dialog, so a message pointing at "highlighted fields" would point at nothing. Prefix it with the row so the company knows where to look — `Vehicle 3: That plate looks incomplete.`

**Back** returns to `FLEET_SCREENS.fleet`. Both buttons use the shared chrome (primary CTA class from the shell; Back is the bordered muted variant).

**Empty state.** If the reconciled list is empty (a company that reached step 3 with no counts — reachable only by a rail jump the shell already guards with `Declare your fleet first.`), render a bordered card reading `No vehicles yet. Go back and set how many you run in each combination.` with a button back to step 2, and no Continue.

### 3. The editor — `src/components/fleet-onboarding/vehicle-editor-dialog.tsx`

**Its own module, with `VehicleEditorDialog` and `VehicleEditorValues` both named exports.** It is *not* an internal component of `step-3-vehicle-specifications.tsx` and must not be declared inside that file: `task-15`'s status screen imports it from this path to power its per-vehicle **Fix** button, and a component nested in a step file is unreachable from there.

**Props-driven and context-free on purpose.** Step 3 supplies an `onSave` that writes the draft; `task-15`'s status screen supplies one that `PATCH`es the correction endpoint. The component itself knows about neither — no `useFleetDraft()`, no `fetch`, no router.

```ts
export type VehicleEditorValues = {
  make: string;
  model: string;
  /** "Hino 916", or null for free text — matches `FleetDraftVehicle.prefillSource`. */
  prefillSource: string | null;
  year: number | undefined;
  plateNumber: string;
  colour: string;
  payloadKg: number | undefined;
  cargoLengthM: number | undefined;
  cargoWidthM: number | undefined;
  cargoHeightM: number | undefined;
};

export function VehicleEditorDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Row number shown in the title; 1-based. */
  index: number;
  classId: VehicleClassId;
  chassisType: ChassisType;
  initial: VehicleEditorValues;
  /** Plates held by the OTHER vehicles: UPPERCASED plate -> that vehicle's number. */
  otherPlates: Map<string, number>;
  /** Resolves false to keep the dialog open (e.g. the server rejected it). */
  onSave: (values: VehicleEditorValues) => boolean | Promise<boolean>;
  /** Inline error under the footer, for a caller whose save hit the network. */
  saveError?: string | null;
  saving?: boolean;
}): React.ReactElement;
```

**Shell.** `DialogContent` with `className="w-full sm:max-w-[640px] ..."` (the primitive defaults to `sm:max-w-sm`, so the override is required) and `data-onboarding-surface=""` — the content portals to `document.body`, outside the wizard's surface element, exactly as the driver flow's upload dialog does. `DialogTitle` reads `Vehicle {index} — {className}`; `DialogDescription` reads `{bodyLabel} · needs licence category {requiredCategory}`. Radius 16px (`rounded-2xl`) per the design's modal radius. The body scrolls (`max-h-[calc(100dvh-6rem)] overflow-y-auto`) so a short viewport can still reach the footer.

**State.** One `useState` per field, held as **strings** so a half-typed `6.` survives a keystroke and an emptied field reads as empty rather than snapping to zero — the same shape as `step-3c-technical-details.tsx`'s `FormValues`. Re-seeded from `initial` whenever the dialog opens: put `key={`${vehicleId}:${open}`}` on the component from the caller, or reset in an effect keyed on `open`. Errors stay hidden until the first failed Save (`showErrors` boolean).

Shared chrome, verbatim:

```
FIELD_CLASS = "h-[46px] rounded-[10px] border-border bg-card px-[13px] text-[15px] focus-visible:border-onboarding-accent focus-visible:ring-onboarding-accent/15 md:text-[15px]"
LABEL_CLASS = "text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase"
ERROR_CLASS = "text-xs text-destructive"
```

Never write a red border class on `Input` — set `aria-invalid` and let the primitive's `aria-invalid:` variants do it. Non-input controls (the colour swatches) carry `border-destructive bg-card` explicitly.

#### 3a. Make and model — hand-rolled searchable dropdown

**Hand-rolled, not `Popover`.** A Radix Popover nested inside a Radix Dialog fights the dialog over focus containment and outside-press handling. Use a `relative` wrapper holding the `Input` and an absolutely positioned list (`absolute top-full left-0 z-20 mt-1.5 w-full max-h-[236px] overflow-y-auto rounded-[10px] border border-border bg-card`), following the city-picker idiom in `src/components/driver-onboarding/steps/step-1-auth-personal.tsx`: `useState` for `query` / `open` / `activeIndex`, manual `onKeyDown` for ArrowDown / ArrowUp / Enter / Escape, and `scrollIntoView({ block: "nearest" })` on the `[data-active="true"]` option. Arrow movement is **clamped, not wrapped**. `Enter` is only swallowed when it actually picks a row, so `Enter` on free text still submits the form. Close on Escape and on a click outside the wrapper (a `pointerdown` listener on `document`, torn down on unmount).

**Filtering.** `MODEL_REFERENCES[classId]` filtered by a case-insensitive substring match on `` `${make} ${model}` `` against the trimmed query. Empty query shows the whole class list.

**Option row.** Make in `text-sm font-semibold`, model in `text-[13px] text-muted-foreground` beside it, and the **published** spec pushed right in `font-price text-[12px] text-muted-foreground`:

```
{payloadKg.toLocaleString("en-US")} kg · {L} × {W} × {H} m
```

e.g. `5,500 kg · 6.20 × 2.35 × 2.35 m`. These are the row's own dry-box figures from `MODEL_REFERENCES` — **not** the body-adjusted ones. The company is being shown what the manufacturer publishes; the adjustment happens when it lands in the fields.

**Empty result.** `No match. Type the make and model manually.` — free text is accepted, and the submit endpoint does not re-check make/model against this table either.

**Picking a row** writes, in one state update:

```ts
const spec = specForModel(chassisType, classId, row);
setMake(row.make);
setModel(row.model);
setQuery(`${row.make} ${row.model}`);
setPrefillSource(`${row.make} ${row.model}`);   // a string, e.g. "Hino 916"
setPayload(formatPayloadKg(spec.payloadKg));
setLength(formatDimensionM(spec.cargoLengthM));
setWidth(formatDimensionM(spec.cargoWidthM));
setHeight(formatDimensionM(spec.cargoHeightM));
```

Prefilled payload and dimensions stay **freely editable** — a prefill is a starting point, not a fact about this vehicle.

**Typing in the box** splits free text into make/model on the first run of whitespace (`"Mitsubishi Fuso Canter"` → make `Mitsubishi`, model `Fuso Canter`; picking the row instead keeps the correct two-word make) and **clears `prefillSource`**, because the footer would otherwise credit a model that is no longer in the box. Editing payload or a dimension by hand does **not** clear it — the footer's own copy invites exactly that correction.

#### 3b. Year, plate, colour, payload, dimensions

| Field | Control | Notes |
|---|---|---|
| Year | `Input` `inputMode="numeric" maxLength={4}`, `font-price`, placeholder `2021` | digits-only filter on change; **not** `type="number"` (no spinner, no scroll-to-change) |
| Licence plate | `Input`, placeholder `34 ABC 128`, `font-price text-[16px] font-semibold tracking-[0.12em]`, `autoCapitalize="characters" autoComplete="off" spellCheck={false}` | **uppercased in state** on every change, not via `text-transform`, so the stored value is the one on screen |
| Colour | 12 swatch buttons, `grid grid-cols-2 gap-2 sm:grid-cols-4` | required |
| Maximum payload (kg) | `Input` `inputMode="numeric"`, `font-price` | digits-only filter |
| Cargo hold L / W / H (m) | three `Input`s `inputMode="decimal"`, `font-price`, in a `sm:grid-cols-3` | digits-and-one-decimal-point filter: everything after the first `.` keeps its digits but loses further points, so `2.4.0` becomes `2.40` rather than being rejected |

Year and plate sit side by side in a `sm:grid-cols-2`; their inline messages render **below** the pair so neither input's height jumps.

The twelve colours, verbatim, stored **by name** and rendered as a 16px dot with a `border-foreground/15` ring (the White swatch would otherwise be invisible):

```ts
const COLORS: [name: string, hex: string][] = [
  ["White",  "#ffffff"], ["Silver", "#c9ccd1"], ["Grey",   "#8a8f96"], ["Black",  "#1a1a1c"],
  ["Blue",   "#2f5fb8"], ["Navy",   "#1e2a4a"], ["Red",    "#c0392b"], ["Green",  "#2f7a4a"],
  ["Yellow", "#e8c33a"], ["Orange", "#e0691c"], ["Beige",  "#ded3bd"], ["Brown",  "#6b4a2f"],
];
```

Swatch button states: selected → `border-onboarding-accent bg-onboarding-accent/5`; invalid (after a failed Save, nothing selected) → `border-destructive bg-card`; otherwise `border-border bg-card hover:bg-muted`. Each is `type="button"` with `aria-pressed`, inside a `fieldset` whose `legend` carries `LABEL_CLASS`.

#### 3c. Live volume line

Directly under the three dimension inputs, `aria-live="polite"`:

```
Usable volume {(L * W * H).toFixed(1)} m³ — used to match this vehicle with orders.
```

e.g. `Usable volume 35.7 m³ — used to match this vehicle with orders.` Shown the moment all three parse, **before** they pass validation — watching the number move is how a centimetres-for-metres typo gets caught. Until then, show the hint `Length × width × height of the usable load space.`

#### 3d. Footer source line

Rendered **only** when `prefillSource !== null`, in `text-xs text-muted-foreground` above the action row:

```
Prefilled from {prefillSource} {BODY_PHRASE[chassisType]}. Correct them to the real vehicle.
```

`prefillSource` is the whole `"Hino 916"` string, not an object — there is nothing to destructure.

```ts
const BODY_PHRASE = {
  DRY_BOX: "as a dry box",
  REFRIGERATED: "as a refrigerated vehicle",
  OPEN_CHASSIS: "as an open chassis",
} as const;
```

Which renders exactly the design's line for the canonical case: `Prefilled from Hino 916 as a dry box. Correct them to the real vehicle.`

#### 3e. Actions

A `DialogFooter` with **Save vehicle** (primary CTA chrome, `h-12 rounded-[11px] bg-onboarding-accent …`) and **Cancel** (bordered muted). Save runs `validateFleetVehicle` over the assembled values:

- Failures → `setShowErrors(true)`, reveal every inline message, and raise the caller's toast with the **first** message in `VEHICLE_FIELD_ORDER`. The dialog stays open.
- Success → `await onSave(values)`; if it resolves `true`, `onOpenChange(false)`.

`saveError` renders as `<p role="alert" className="text-[13px] text-destructive">` above the buttons; `saving` disables Save and swaps its label to `Saving…`. Step 3 passes neither (its save is synchronous); `task-15` passes both.

### 4. Wiring step 3 to the editor

```ts
const [editingId, setEditingId] = useState<string | null>(null);
const [editorOpen, setEditorOpen] = useState(false);
```

`editingId` is kept while the dialog animates closed so its copy does not blank mid-transition; `editorOpen` is what opens and closes it.

`onSave` maps over `draft.vehicles`, replaces the matching `id` with the merged values, and calls `updateDraft({ vehicles: next })` — spreading the existing vehicle first so `driverProfileId`, `chassisType` and `classId` survive. Returns `true`. Then `showToast("Vehicle {n} saved.")`.

`otherPlates` is built once per render from every vehicle except the one being edited:

```ts
const otherPlates = new Map<string, number>();
draft.vehicles?.forEach((vehicle, index) => {
  if (vehicle.id === editingId) return;
  const plate = vehicle.plateNumber?.trim().toUpperCase();
  if (plate) otherPlates.set(plate, index + 1);
});
```

## Acceptance Criteria

- [ ] The table is generated from `draft.fleet.counts`, grouped body-major then class-minor, with a continuous 1-based `#` across group headings.
- [ ] Raising a count appends blank vehicles at that group's tail; lowering it removes from that group's tail; every already-filled vehicle in the group keeps its values, its `id` and its assigned driver.
- [ ] Dropping a cell to zero removes exactly that cell's vehicles and nothing else.
- [ ] `reconcileFleetVehicles` is idempotent, and the reconciling effect writes only when the result differs — no render loop.
- [ ] The header counter reads `{ready} of {total} specified` and updates as rows become Ready.
- [ ] A row opens a 640px dialog (`sm:max-w-[640px]`) carrying `data-onboarding-surface`, openable by click, Enter and Space.
- [ ] The make/model dropdown is hand-rolled (no `Popover`), filters to the vehicle's class, shows each option's published spec as `5,500 kg · 6.20 × 2.35 × 2.35 m`, and supports ArrowUp/ArrowDown/Enter/Escape with a clamped highlight.
- [ ] Picking a model writes `specForModel(chassisType, classId, row)` into payload, length, width and height, and those fields remain editable afterwards.
- [ ] Typing free text into the make/model box clears the prefill source; editing a payload or dimension field does not.
- [ ] Year enforces 1995 to `new Date().getFullYear()`; plate uppercases as you type and requires ≥ 4 characters; colour is required from the 12 named swatches; payload enforces 100–40,000 kg; each dimension is > 0 and ≤ 20 m; a `TRAILER_TRUCK` length below 8 m is rejected with the exact message.
- [ ] A plate already used by another vehicle in the fleet is rejected with `That plate is already used by vehicle {n}.`
- [ ] The live line reads `Usable volume 35.7 m³ — used to match this vehicle with orders.` and updates while typing.
- [ ] The footer line appears only after a model is picked and reads `Prefilled from Hino 916 as a dry box. Correct them to the real vehicle.`
- [ ] Continue is refused unless every vehicle is Ready, and the toast carries the first failing field's message prefixed with its row (`Vehicle 3: That plate looks incomplete.`), never the generic form-step string.
- [ ] Every value survives a page reload via the draft.
- [ ] `VehicleEditorDialog` and `VehicleEditorValues` are named exports of their **own** module, `src/components/fleet-onboarding/vehicle-editor-dialog.tsx`, importable by `task-15` without pulling in the step component.
- [ ] The step imports `MODEL_REFERENCES`, `specForModel`, `defaultSpecForClass`, `formatPayloadKg` and `formatDimensionM` from `src/lib/fleet-onboarding/model-specs.ts`, calling `specForModel` as `(chassisType, classId, reference)`.
- [ ] Body labels come from `task-04`'s `BODY_TYPES` / `findBodyType`, and the per-cell and fleet-size bounds from `draft-schema.ts`'s `FLEET_MAX_PER_CELL` / `FLEET_MAX_VEHICLES` / `FLEET_MIN_VEHICLES` — no local `BODY_LABEL`, no inline `40`.
- [ ] `validateFleetVehicle` carries the comment naming `validateVehicleInput` (task-14) as its authoritative server-side twin.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- **`src/components/fleet-onboarding/vehicle-editor-dialog.tsx` is shared with `task-15`.** Both are wave 4. It is a standalone module exporting `VehicleEditorDialog` and `VehicleEditorValues` — never a component declared inside the step file, which `task-15` could not reach. Keep it strictly props-driven — no `useFleetDraft()`, no fetch, no router — because the status screen mounts it outside the wizard and hands it a network-backed `onSave`. If `task-15` is implemented first, build it against the props contract above and let this task's file satisfy it.
- **`validateFleetVehicle` here and `validateVehicleInput` in `task-14`'s `src/lib/fleet-onboarding/vehicle-validation.ts` are a deliberate pair, not an accident to be de-duplicated.** This one is client-side and returns per-field keys so each message can render under its own input; that one is server-side, is **authoritative**, and accumulates prefixed sentences. Neither imports the other — the client module must stay free of any server-only import, and the server must never trust a client verdict. Say so in a comment in both files, and change both whenever a rule changes.
- The live volume line keeps the design's `used to match this vehicle with orders` **as written**, which is a deliberate divergence from the individual driver flow, where the same line was rewritten to `shown to the review team…` because a driver's declared dimensions are compliance-facing overrides that matching never reads. Here the claim is closer to true — `task-14` resolves and stores a real `vehicleTypeSpecId` per vehicle, and matching keys on that — but the *declared* dimensions still are not what matching reads. The business design's copy is authoritative per the handoff's "High fidelity" note; the 31 reference rows behind it are already flagged for ops review in `action-required.md`, and this line should be reviewed in the same pass.
- Nothing here writes to the database. `Vehicle.plateNumber` is globally unique, and an abandoned draft must never permanently claim a real plate — that is why the rows are only created by `task-14`'s submit.
- Do not add a red border class to any `Input`. The `aria-invalid:` variants on the primitive already own that, and a hand-written border fights them.
- `crypto.randomUUID()` is available in every browser this app targets and in Node 19+, so `createBlankVehicle` needs no polyfill; it is only ever called client-side.
