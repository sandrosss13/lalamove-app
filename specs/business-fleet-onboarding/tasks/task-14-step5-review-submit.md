# Task 14: Step 5 — Review & Submit

## Status

pending

## Wave

4

## Description

Fills in the wizard's last step — four summary cards over everything the company has entered, each with an Edit link back to the step that owns it — and builds the feature's single write gate: `POST /api/logistics-company/onboarding/submit`. Until that endpoint succeeds, nothing this feature collects exists as a `Vehicle`, a `DriverVehicleAssignment` or a `BusinessApplicationVehicle` row. `Vehicle.plateNumber` is globally unique, and an abandoned draft must never permanently claim a real plate.

The endpoint takes **no request body**. It re-validates the company block, the fleet and every vehicle from the server's own saved state, resolves each vehicle's `VehicleTypeSpec` server-side from the (class, body) map, and writes everything in one transaction. It also serves the status screen's Resubmit button after an admin has sent the application back, on a path that only lets flagged items change and leaves approved vehicles' verdicts alone. The per-vehicle correction endpoint the status screen uses to make those changes is built here too, because it shares the same validator.

## Dependencies

**Depends on:** task-01-schema-migration.md, task-04-vehicle-class-taxonomy.md, task-07-fleet-driver-api.md, task-09-fleet-wizard-shell.md
**Blocks:** task-15-application-status-screen.md, task-21-dispatch-gate-and-redirect.md

`task-01` because this endpoint is the first writer of `BusinessApplicationVehicle` and of `Vehicle.vehicleClass` — it cannot compile, let alone run, before that migration lands. `task-07` because step 5's Drivers card reads its roster endpoint, and because the `DriverLicence` rows this endpoint validates against are created there.

**Context from dependencies:**

### `useFleetDraft()` — from `task-09` (`src/components/fleet-onboarding/fleet-draft-context.tsx`)

The wizard's single data hook. Throws outside `FleetDraftProvider`. Step components take **zero props**. Mirrors `src/components/driver-onboarding/onboarding-draft-context.tsx` (`draftRef`/`stepRef`/`statusRef` mirrors, `SAVE_DEBOUNCE_MS = 300` on edits, immediate save on `goToStep`, `saveSequence` guard, keepalive unmount flush, two-mode `load({ silent })`, `STATUS_POLL_INTERVAL_MS = 25_000`, polling only while `PENDING` or `ACTION_REQUIRED`).

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
  updateDraft: (patch: Partial<FleetDraftV1>) => void;
  goToStep: (step: number) => void;
  refetch: () => Promise<void>;
  resetApplication: () => Promise<boolean>;
  showToast: (message: string, tone?: "default" | "error") => void;
};

export function useFleetDraft(): FleetDraftState;
```

`vehicleVerdicts` and `submittedSummary` fill in only once this endpoint has run at least once; `task-15` is what renders them. This step reads neither.

The shell swaps the whole wizard for `task-15`'s status screen as soon as a refetched `status` is no longer `"DRAFT"`, so this step's submit button never has to navigate.

### `FleetDraftV1` — from `task-05`, re-exported through `task-09`

`src/lib/fleet-onboarding/draft-schema.ts`. Every field optional; a resumed draft can be half-filled. `parseFleetDraft(value: unknown): FleetDraftV1 | null` is the **single narrowing point** and returns `null` unless `version === 1`. The stored blob is capped, following `MAX_DRAFT_JSON_LENGTH = 64 * 1024` in the driver flow.

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
  /** Stable client-generated id from task-12. */
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
  /** "Hino 916" — names the prefill source in task-12's editor footer. */
  prefillSource?: string;
  /** `DriverProfile.id` of the assigned driver. Written by task-13;
   *  absent === unassigned. */
  driverProfileId?: string;
};

export type FleetDraftV1 = {
  version: 1;
  company?: FleetDraftCompany;
  fleet?: FleetDraftFleet;
  vehicles?: FleetDraftVehicle[];
};
```

The company field names matter here, because §3c's messages are keyed to them: `registeredAddress`, `citiesOfOperation`, `contactName`, `bankAccountIban` — never `cities`, `contactFullName` or `iban`. The counts are nested at `draft.fleet.counts`, the driver rides on the vehicle as `driverProfileId`, and there is **no `assignments` section** to read. Note also that the draft's `company` block is a **UI mirror only** — §3c validates the persisted `LogisticsCompany` columns, whose names are the same.

Vehicle order is fixed by `task-12`: groups enumerated body-major (`DRY_BOX`, `REFRIGERATED`, `OPEN_CHASSIS`) then class-minor (`SMALL_VAN`, `LARGE_VAN`, `MEDIUM_TRUCK`, `HEAVY_FREIGHT_TRUCK`, `TRAILER_TRUCK`), numbered 1-based and continuous over the flattened array. Steps 4 and 5 and the status screen all number by array index.

### The five-class taxonomy and the lock map — from `task-04` (`src/lib/driver-onboarding/vehicle-classes.ts`)

`task-04` grows the **shared** taxonomy to five classes. `HEAVY_FREIGHT_TRUCK` moves from CE to **C**; `TRAILER_TRUCK` is added at **CE**. Only `task-04` may edit that file. The module is pure data and pure functions with a type-only `@prisma/client` import, so it is safe in both a client component and a route handler.

```ts
export type VehicleClassId =
  | "SMALL_VAN" | "LARGE_VAN" | "MEDIUM_TRUCK"
  | "HEAVY_FREIGHT_TRUCK" | "TRAILER_TRUCK";

export const VEHICLE_CLASSES: VehicleClass[]; // in the order above
export function findVehicleClass(id: VehicleClassId): VehicleClass; // throws on unknown
export function resolveVehicleTypeSpecCode(
  classId: VehicleClassId, chassisType: ChassisType,
): string | null; // null === locked cell
```

| Class | `name` | `requiredLicenceCategory` |
|---|---|---|
| `SMALL_VAN` | Small Van | `B` |
| `LARGE_VAN` | Large Van | `B` |
| `MEDIUM_TRUCK` | Medium Truck | `C` |
| `HEAVY_FREIGHT_TRUCK` | Heavy Freight Truck | `C` |
| `TRAILER_TRUCK` | Trailer Truck | `CE` |

`specCodeByChassis` — 8 usable cells, 7 locked (`null`). The submit endpoint re-resolves through this map and treats a `null` as a hard rejection, never a fallback to a near-miss spec, which would misprice orders:

| Class | `DRY_BOX` | `REFRIGERATED` | `OPEN_CHASSIS` |
|---|---|---|---|
| `SMALL_VAN` | `MINIVAN` | `null` | `null` |
| `LARGE_VAN` | `CARGO_VAN` | `REFRIGERATED_VAN` | `null` |
| `MEDIUM_TRUCK` | `BOX_TRUCK` | `REFRIGERATED_TRUCK` | `FLATBED_TRUCK` |
| `HEAVY_FREIGHT_TRUCK` | `LARGE_FREIGHT_TRUCK` | `null` | `null` |
| `TRAILER_TRUCK` | `TRAILER_TRUCK` *(seeded by task-02)* | `null` | `null` |

### Schema — from `task-01`

```prisma
enum VehicleClass { SMALL_VAN LARGE_VAN MEDIUM_TRUCK HEAVY_FREIGHT_TRUCK TRAILER_TRUCK }
enum BusinessApplicationStatus { DRAFT PENDING ACTION_REQUIRED APPROVED }
enum CompanyReviewStatus { PENDING VERIFIED FLAGGED }
enum BusinessApplicationVehicleStatus { PENDING APPROVED FLAGGED }

model BusinessApplication {
  id                  String                    @id @default(cuid())
  companyId           String                    @unique
  company             LogisticsCompany          @relation(fields: [companyId], references: [id], onDelete: Cascade)
  /// "BIZ-40219". NOT nullable, and NOT allocated here — task-05's lazy GET
  /// allocates it when it first creates the row. This endpoint only reads it.
  reference           String                    @unique
  status              BusinessApplicationStatus @default(DRAFT)
  draft               Json?
  draftStep           Int                       @default(1)
  draftUpdatedAt      DateTime?
  companyReviewStatus CompanyReviewStatus       @default(PENDING)
  companyFlagReason   String?
  firstSubmittedAt    DateTime?
  lastSubmittedAt     DateTime?
  submissionCount     Int                       @default(0)
  vehicles            BusinessApplicationVehicle[]
  createdAt           DateTime                  @default(now())
  updatedAt           DateTime                  @updatedAt

  @@index([status])
}

model BusinessApplicationVehicle {
  id                    String                           @id @default(cuid())
  businessApplicationId String
  businessApplication   BusinessApplication              @relation(fields: [businessApplicationId], references: [id], onDelete: Cascade)
  /// Nullable + SetNull: a company can remove a vehicle from its own fleet at any
  /// time through an existing, unrelated flow, and the review row must survive so
  /// the admin drawer can render "vehicle no longer on file" rather than vanishing
  /// a decided verdict. Mirrors `DriverApplication.vehicleId`.
  vehicleId             String?                          @unique
  vehicle               Vehicle?                         @relation(fields: [vehicleId], references: [id], onDelete: SetNull)
  /// Denormalised at submit so the admin queue, the drawer and the dispatch gate
  /// can read the declared class and body without a join that a null `vehicleId`
  /// would break. NOT NULL — this endpoint must write both on every row it creates.
  vehicleClass          VehicleClass
  chassisType           ChassisType
  status                BusinessApplicationVehicleStatus @default(PENDING)
  flagReason            String?
  decidedAt             DateTime?
  createdAt             DateTime                         @default(now())
  updatedAt             DateTime                         @updatedAt

  @@index([businessApplicationId])
}
```

Four bindings this endpoint is written against:

- **The FK is `businessApplicationId`**, never `applicationId`.
- **`vehicleId` is `String? @unique` with `onDelete: SetNull`**, and there is no compound `@@unique([businessApplicationId, vehicleId])` — the single `@unique` already prevents two review rows for one vehicle.
- **There is no `companyVerifiedAt` column.** The company-level verdict lives in `companyReviewStatus` (`PENDING` / `VERIFIED` / `FLAGGED`), which `task-18` writes and `task-20` renders. Nothing in this task reads or writes a verification timestamp.
- **There is no `position` column.** A vehicle's 1-based row number is derived by ordering on `createdAt` ascending; any `orderBy: { position: … }` is a bug.

Pre-existing facts this endpoint depends on:

- `Vehicle` — `driverProfileId?` **XOR** `companyId?`, enforced by the DB CHECK constraint `vehicle_single_owner_check`: a company vehicle physically **cannot** carry a `driverProfileId`. Every driver↔vehicle pairing goes through `DriverVehicleAssignment`. Columns written here: `companyId`, `vehicleTypeSpecId`, `vehicleClass` *(new)*, `chassisType`, `plateNumber` *(`@unique`, always uppercased by writers)*, `make`, `model`, `year`, `colour`, `payloadKg`, `cargoLengthM`, `cargoWidthM`, `cargoHeightM`.
- `DriverVehicleAssignment` — `driverProfileId`, `vehicleId`, `assignedAt`, `unassignedAt DateTime?`. `task-01` adds the two partial unique indexes that close the long-documented exclusivity race, as hand-appended SQL: on `vehicleId` and on `driverProfileId`, both `WHERE "unassignedAt" IS NULL`.
- `LogisticsCompany` — `userId @unique` (one login per company), `companyName`, `vatId`, `phone @unique`, `city GeorgianCity` (retained as the registered/primary city), plus `task-01`'s additions, whose names are exact: `registeredAddress`, `bankAccountIban` (**never** `payoutIban`), `contactName` (**never** `contactFullName`), `contactRole`, `contactEmail`, `citiesOfOperation GeorgianCity[]`, `activatedAt`.
- `DriverLicence` — `driverProfileId @unique`, `licenceNumber`, `expiresAt`, `categories LicenceCategory[]`.
- `VehicleTypeSpec` — `code @unique`, `maxPayloadKg`, and a `pricingRule` the booking pickers treat as non-nullable.

## Files to Create

- `src/lib/fleet-onboarding/vehicle-validation.ts` — the server-side per-vehicle validator, shared by the two routes below.
- `src/app/api/logistics-company/onboarding/submit/route.ts` — `POST`, the write gate.
- `src/app/api/logistics-company/onboarding/vehicles/[vehicleId]/route.ts` — `PATCH`, correcting one flagged vehicle during an `ACTION_REQUIRED` round trip.

## Files to Modify

- `src/components/fleet-onboarding/steps/step-5-review-submit.tsx` — replace `task-09`'s stub with the real step.

## Technical Details

### 1. `steps/step-5-review-submit.tsx`

Reads everything from the in-memory draft. **The draft is not re-fetched here**: the debounced `PATCH` already saved exactly what the server is about to validate, so re-reading it would only put a spinner between the company and the button they came here to press. The one request the screen does make is the driver roster (below), because the draft stores only `driverProfileId` and a summary card cannot render an id. Nothing here is authoritative — every rule is re-checked by the endpoint.

**Intro**, in `text-[13.5px] leading-[1.5] text-muted-foreground`:

```
The company is reviewed as a whole. Individual vehicles can be sent back without holding up the rest of the fleet.
```

**Four cards**, each a `rounded-[13px] border border-border bg-card` section with a `bg-muted/40` header carrying the title and a right-aligned `Edit` button in `text-onboarding-accent`, and a `<dl>` of label/value rows. Copy the shape of `src/components/driver-onboarding/steps/step-4-review-submit.tsx` exactly, including the `EMPTY_VALUE = "—"` placeholder and the `sr-only` suffix on the Edit button (`Edit<span className="sr-only"> company</span>`).

| Card | Edit → | Rows |
|---|---|---|
| **Company** | `FLEET_SCREENS.company` | Company name · VAT / tax ID (`font-price`) · Registered address · Cities of operation · Contact · Company email · Phone · Payout account (`font-price`) |
| **Fleet** | `FLEET_SCREENS.fleet` | one row per body type with a non-zero total, then a bold `Total` row |
| **Vehicles** | `FLEET_SCREENS.vehicles` | one row per vehicle |
| **Drivers** | `FLEET_SCREENS.drivers` | one row per vehicle |

Row formatting:

- **Cities of operation** — city labels joined with `", "`, resolved through `GEORGIAN_CITY_OPTIONS` from `src/lib/georgian-cities.ts` (`"TBILISI"` → `Tbilisi`). Do not add a second city list; the design's 36 cities are all in the existing 63-value enum, and `Tsqaltubo` is the enum's `TSKALTUBO`.
- **Contact** — `{contactName} · {contactRole}`.
- **Fleet rows** — label is the body label (`Dry Box`, `Refrigerated`, `Open Chassis`), value is `{n} vehicle{s}` summed across that body's classes from `draft.vehicles`, not from `draft.fleet.counts`, so the card can never disagree with the vehicles the next card lists. Total row: `{n} vehicles`, value in `font-semibold`.
- **Vehicle rows** — label `{n}. {className} · {bodyLabel}`, value `{make} {model} · {plate} · {payload} kg` with the payload grouped via `toLocaleString("en-US")`.
- **Driver rows** — label is the plate (`font-price`) or `Vehicle {n}` when it has none, value `{name} · {categories.join(", ")}`. Driver names come from the roster fetched once on mount:

  ```ts
  const response = await fetch("/api/logistics-company/drivers");
  const roster = (await response.json()) as RosterEntry[];   // a BARE array
  const byProfileId = new Map(roster.map((entry) => [entry.driverProfileId, entry]));
  ```

  The path is `/api/logistics-company/drivers` — **not** `/api/logistics-company/fleet/drivers`, which does not exist — and the body is `task-07`'s bare array, not `{ drivers: [...] }`. Each entry exposes a flat `name` (already joined server-side; there is no `fullName`) and a flat `categories: ("B" | "C" | "CE")[]` (empty for a driver with no licence on file, in which case render the name alone). While it is loading, show `—`; on failure show the raw count rather than blocking the card. This fetch is read-only convenience — the endpoint below re-reads every driver from the database and trusts nothing rendered here.

**Submit.**

```ts
const response = await fetch("/api/logistics-company/onboarding/submit", { method: "POST" });
```

No body — the server validates its own saved state, so there is nothing left for this screen to send. On failure, read `{ error }` through the shared `readErrorMessage(response, fallback)` helper and render it as `<p role="alert" className="mb-3 text-[13px] text-destructive">` above the button. **Never `alert()`.** Fallback: `We couldn't submit your application. Check your connection and try again.`

On success, `await refetch()` and deliberately **leave `submitting` set**: the shell swaps this whole wizard for the status screen the moment the refetched status is no longer `DRAFT`, so the button stays disabled for the instant before it unmounts rather than flicking back to `Submit application`. Label: `Submit application` / `Submitting…`.

### 2. `src/lib/fleet-onboarding/vehicle-validation.ts`

Server-side only in practice, but written as pure functions with no Prisma client import so both routes can share it.

The fleet-size bounds are **imported, not redeclared** — `FLEET_MIN_VEHICLES` and `FLEET_MAX_VEHICLES` live once in `draft-schema.ts` (§8 of the frozen contracts) and a second pair named `MIN_FLEET_SIZE` / `MAX_FLEET_SIZE` is how the two drift:

```ts
import {
  FLEET_MAX_VEHICLES,
  FLEET_MIN_VEHICLES,
} from "@/lib/fleet-onboarding/draft-schema";

export const MIN_VEHICLE_YEAR = 1995;
export const MIN_PLATE_LENGTH = 4;
export const MIN_PAYLOAD_KG = 100;
export const MAX_PAYLOAD_KG = 40_000;
export const MAX_CARGO_DIMENSION_M = 20;
export const MIN_TRAILER_LENGTH_M = 8;

export type ValidatedVehicle = {
  classId: VehicleClassId;
  chassisType: ChassisType;
  /** Resolved from (class, body) HERE — never taken from the client. */
  specCode: string;
  plateNumber: string;   // trimmed and UPPERCASED
  make: string;
  model: string;
  year: number;
  colour: string;
  payloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
};

/**
 * One vehicle's field rules. `label` is how this vehicle is named in messages —
 * "Vehicle 3" from the submit path, the plate from the correction path.
 * Appends every failure to `problems` rather than returning at the first, so a
 * single pass reports the same first message a caller would see either way.
 *
 * DELIBERATE DUPLICATE, AND THE AUTHORITATIVE HALF. `validateFleetVehicle` in
 * `src/lib/fleet-onboarding/fleet-vehicles.ts` (task-12) applies the same rules
 * in the browser so the company sees a message under the field it belongs to.
 * That one is a courtesy; THIS one decides. Nothing the client reports is
 * trusted here, and neither module imports the other — the client half must
 * stay free of server-only imports. If a rule changes, change both.
 */
export function validateVehicleInput(
  input: unknown,
  label: string,
  now: Date,
  problems: string[],
): ValidatedVehicle | null;
```

Rules, in this fixed order, with the **exact** messages:

| Rule | Message |
|---|---|
| `chassisType` is a `ChassisType` | `{label}: choose a cargo body type.` |
| `classId` is one of the five | `{label}: choose a vehicle class.` |
| `resolveVehicleTypeSpecCode(classId, chassisType) !== null` | `{label}: that class isn't available with the selected body type.` |
| `make` non-empty after trim | `{label}: enter the vehicle's make.` |
| `model` non-empty after trim | `{label}: enter the vehicle's model.` |
| `year` an integer in `[1995, now.getFullYear()]` | `{label}: enter a manufacturing year between 1995 and {currentYear}.` |
| `plateNumber` trimmed, uppercased, `length >= 4` | `{label}: enter the licence plate.` |
| `colour` non-empty after trim | `{label}: choose the vehicle's colour.` |
| `payloadKg` finite, `[100, 40000]` | `{label}: maximum payload must be between 100 and 40,000 kg.` |
| each of L/W/H finite, `> 0`, `<= 20` | `{label}: check the dimensions — metres, not centimetres.` |
| `classId === "TRAILER_TRUCK"` → `cargoLengthM >= 8` | `{label}: a trailer truck's cargo length must be at least 8 m.` |

`now.getFullYear()` is computed from the single `now` the caller passes, never hard-coded — a request landing on 1 January must accept a vehicle built that year.

Uppercasing happens **before** the length check and before the write, so the globally unique `plateNumber` index only ever sees one canonical spelling of a plate.

### 3. `POST /api/logistics-company/onboarding/submit`

`export async function POST(request: Request): Promise<NextResponse>`. **Takes no request body and reads none.** Reading anything from the caller here would reintroduce exactly the trust this endpoint exists to remove. Every error body is `{ error: string }`.

#### 3a. Guard — `resolveFleetSubmitContext(request)`

Factored into a `resolveXContext` returning a discriminated union, consumed as `if ("response" in context) return context.response;` — the same shape the driver flow uses, and needed here because the `PATCH` route below shares most of it.

| Check | Status | Message |
|---|---|---|
| `await auth.api.getSession({ headers: request.headers })` is null | 401 | `Unauthorized.` |
| `session.user.role !== "COMPANY"` | 403 | `Only logistics companies have a fleet application.` |
| No `LogisticsCompany` for `userId` | 404 | `Complete your company profile before onboarding.` |
| No `BusinessApplication` for `companyId` | 404 | `Start the application first.` |
| `application.status === "PENDING"` | 400 | `This application has already been submitted.` |
| `application.status === "APPROVED"` | 400 | `This application has already been approved.` |

`PENDING` and `APPROVED` get separate messages on purpose: "already submitted" and "already approved" call for completely different next actions.

Select the company row's full field set and the application with its `vehicles: { select: { id, vehicleId, status, flagReason } }`.

#### 3b. One clock

```ts
const now = new Date();
const problems: string[] = [];
```

One `now` for every time-dependent rule — the year ceiling, every licence expiry, and the timestamps written below — so nothing can disagree about what day it is mid-request. Each `validate*` helper appends to `problems` rather than returning at the first failure, so all the checks run; the response still reports only `problems[0]`, which is this API's one-readable-message convention.

#### 3c. Company block — server-authoritative

Validated against the **persisted `LogisticsCompany` columns**, not against `draft.company`. `task-06`'s company details API is what writes them; the draft's `company` section is a UI mirror for resumability only, and validating it would let a hand-rolled `PATCH` to the draft endpoint route around `task-06`.

| Rule | Message |
|---|---|
| `companyName` ≥ 3 chars after trim | `Enter the company's registered name.` |
| `vatId` exactly 9 characters, digits only (`/^\d{9}$/`) | `The VAT or tax ID must be exactly 9 digits.` |
| `registeredAddress` non-empty | `Enter the company's registered address.` |
| `citiesOfOperation.length >= 1`, every entry a `GeorgianCity` | `Choose at least one city of operation.` |
| `contactName` splits into ≥ 2 words on whitespace | `Enter the contact person's full name — at least a first and last name.` |
| `contactRole` non-empty | `Enter the contact person's role.` |
| `contactEmail` matches a simple shape (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) | `Enter a valid company email address.` |
| `bankAccountIban` ≥ 18 chars after stripping every space | `Enter a valid IBAN for the payout account.` |
| `phone` 10–15 digits after stripping non-digits | `Enter a valid company phone number.` |

#### 3d. Fleet and vehicles — first-submit path

Input is `parseFleetDraft(application.draft)`. If it returns `null`:

- status is `ACTION_REQUIRED` → hand off to the resubmit path (§3g).
- otherwise → 400 `Fill in the wizard before submitting your application.`

Then, in order:

1. **Fleet size.** `vehicles.length < FLEET_MIN_VEHICLES` → `A business account needs at least two vehicles. Use the individual driver flow for a single vehicle.` `vehicles.length > FLEET_MAX_VEHICLES` → `An application can hold at most 40 vehicles.` The per-cell stepper's 0–40 range is a UI affordance; the **grand total** is what is enforced, and it is re-checked here rather than trusted from step 2.
2. **Per vehicle.** `validateVehicleInput(vehicle, `Vehicle ${index + 1}`, now, problems)` over the array in order.
3. **Plate uniqueness inside the application.** Build a `Map<uppercasedPlate, firstIndex>` while iterating; a repeat → 400 `Vehicles {a} and {b} both have the plate {plate}.` This is a 400, not a 409: it is a fixable inconsistency in what was submitted, not a collision with somebody else's data.
4. **Assignment.** `driverProfileId` present and non-empty for every vehicle → `Vehicle {n} has no driver. Every vehicle needs a named driver.`
5. **One driver, one vehicle.** No `driverProfileId` appears twice → `{fullName} is assigned to two vehicles. Each driver can hold one vehicle.`

Then one query for the referenced drivers:

```ts
const drivers = await prisma.driverProfile.findMany({
  where: { id: { in: [...driverIds] }, companyId: company.id },
  select: {
    id: true, firstName: true, lastName: true,
    licence: { select: { expiresAt: true, categories: true } },
  },
});
```

Filtering on `companyId` in the `where` rather than checking it afterwards is what makes "this driver is on somebody else's roster" indistinguishable from "this driver does not exist" — the company learns nothing about drivers it does not own.

| Rule | Message |
|---|---|
| every `driverProfileId` came back | `Vehicle {n}'s driver is no longer on your roster. Assign a different driver.` |
| `licence !== null` | `{fullName} has no licence on file. Add it before submitting.` |
| `licence.expiresAt > now` | `{fullName}'s licence has expired. Renew it before submitting.` |
| `licence.categories.includes(findVehicleClass(classId).requiredLicenceCategory)` | `{fullName}'s licence does not list category {required}, which the {className} class requires.` |

The licence-expiry rule is checked **as of submit time**, not as of when step 4 was filled in: a draft can sit for weeks.

If `problems.length > 0` → 400 `{ error: problems[0] }`.

#### 3e. Resolve the specs — server-side, never from the client

```ts
const codes = [...new Set(validated.map((v) => v.specCode))];
const specs = await prisma.vehicleTypeSpec.findMany({
  where: { code: { in: codes } },
  select: { id: true, code: true, maxPayloadKg: true },
});
```

A missing row means the seeded catalogue and `task-04`'s class map have drifted apart — a server fault, not a bad submission. `console.error` the code and the application id, then 500 `We couldn't submit your application. Please try again.`

Deliberately **no** payload-versus-spec-minimum rule here. The individual driver flow rejects a declared payload below the class spec's `maxPayloadKg` because one driver's single vehicle is the whole of their capacity claim; a fleet declares a range of real vehicles inside a class, and the design's own reference table has models legitimately below their class figure (a Mitsubishi Fuso Canter at 4,200 kg in a class whose spec says 6,000). Applying the driver rule here would reject the design's own data.

#### 3f. The transaction — first submit

Everything below happens inside one `prisma.$transaction(async (tx) => { … })`.

1. **`Vehicle` rows.** `tx.vehicle.create` per validated vehicle:

   ```ts
   {
     companyId: company.id,
     driverProfileId: null,        // the DB CHECK forbids both owners at once
     vehicleTypeSpecId: specByCode.get(v.specCode)!.id,
     vehicleClass: v.classId,      // new column from task-01
     chassisType: v.chassisType,
     plateNumber: v.plateNumber,   // already uppercased
     make: v.make, model: v.model, year: v.year, colour: v.colour,
     payloadKg: v.payloadKg,
     cargoLengthM: v.cargoLengthM,
     cargoWidthM: v.cargoWidthM,
     cargoHeightM: v.cargoHeightM,
   }
   ```

   `driverProfileId: null` is not an oversight and must not be "helpfully" set to the assigned driver: `vehicle_single_owner_check` forbids a row carrying both owners, and the write would fail. `vehicleClass` and `chassisType` are both written because with five classes the (class, body) → spec map is no longer uniquely invertible, and the fleet table, the status screen and the admin drawer all need the class the company actually declared.

2. **`DriverVehicleAssignment` rows.** `tx.driverVehicleAssignment.create({ data: { driverProfileId, vehicleId, assignedAt: now } })` per vehicle.

3. **`BusinessApplicationVehicle` rows.** One `tx.businessApplicationVehicle.create` per vehicle, created **in table order** so the `createdAt` ascending ordering everything else derives the 1-based row number from matches the order the company saw in steps 3 and 4:

   ```ts
   {
     businessApplicationId: application.id,   // NOT `applicationId`
     vehicleId: created.id,
     vehicleClass: v.classId,                 // NOT NULL — must be written
     chassisType: v.chassisType,              // NOT NULL — must be written
     status: "PENDING",
     flagReason: null,
     decidedAt: null,
   }
   ```

   `vehicleClass` and `chassisType` are denormalised onto the review row on purpose and are **not nullable**: `vehicleId` is `SetNull`, so a vehicle the company later removes from its fleet leaves this row with nothing to join to, and the admin queue, the drawer and the dispatch gate must still be able to say what was declared. Omitting either is a `NOT NULL` violation, not a defaulted column.

4. **The application.**

   ```ts
   await tx.businessApplication.update({
     where: { id: application.id },
     data: {
       status: "PENDING",
       // `Prisma.DbNull` writes a SQL NULL. A bare `null` is not accepted on a
       // nullable Json column, and `Prisma.JsonNull` would store the JSON `null`
       // literal, which reads back as a present-but-unparseable draft.
       draft: Prisma.DbNull,
       companyFlagReason: null,
       firstSubmittedAt: application.firstSubmittedAt ?? now,
       lastSubmittedAt: now,
       submissionCount: { increment: 1 },
     },
   });
   ```

   **`reference` is not in this payload.** The column is `String @unique` and **not nullable**: `task-05`'s lazy `GET` allocates it via `generateBusinessApplicationReference()` (`BIZ-` + 5 digits, with its own P2002 retry capped at 5 attempts) at the moment it first creates the `BusinessApplication` row, long before anyone reaches step 5. By the time this endpoint runs, `application.reference` is already a non-null string that the company may have quoted to support. This endpoint **reads** it for the response and never writes it, never re-issues it, and never treats it as nullable — there is no candidate generation, no `randomInt` import and no `isDuplicateReferenceError` here.

The transaction's failure handling therefore has one `P2002` to discriminate, not two:

```ts
try {
  await prisma.$transaction(/* … */);
} catch (error) {
  if (isDuplicatePlateError(error)) {
    return NextResponse.json(
      { error: "This plate number is already registered to another vehicle." },
      { status: 409 },
    );
  }
  console.error("Failed to submit a business fleet application:", error);
  return NextResponse.json(
    { error: "We couldn't submit your application. Please try again." },
    { status: 500 },
  );
}
```

Reuse `isDuplicatePlateError` from `src/app/api/driver-profile/vehicles/validation.ts`, which discriminates on `error.meta.target`. There is no retry loop: the only unique constraint this path can trip is the globally unique `plateNumber`, and retrying that would just collide again — it is the company's own input to fix.

A `P2002` on the assignment indexes cannot occur on the first-submit path (the vehicles are brand new and §3d already rejected a repeated driver), but it can on the resubmit path — see below.

**Response.** `NextResponse.json({ status: "PENDING", reference: application.reference }, { status: 200 })`.

#### 3g. Resubmission — the `ACTION_REQUIRED` path

`draft` is `null` on this path: a successful submit clears it, and `task-05`'s `PATCH` refuses to write a draft onto a non-`DRAFT` application. The normalized rows are the source of truth from the first submit onward. What can have changed since is a **flagged** vehicle (via §4's `PATCH`) and a **flagged** company block (via `POST /api/logistics-company`, `task-06`'s existing upsert route — it always writes the company columns, and additionally clears the flag when the application is `ACTION_REQUIRED`; it does not refuse in any state, because `task-08`'s sign-up posts to the same route).

The rule, stated precisely:

- **Only flagged vehicles and a flagged company block may change.** A vehicle whose `BusinessApplicationVehicle.status` is `APPROVED` or `PENDING` is not editable; §4 rejects a `PATCH` at it.
- **Approved vehicles keep their verdict.** Their `BusinessApplicationVehicle.status` stays `APPROVED` and their `decidedAt` is untouched. Resubmitting must **not** sweep every row back to `PENDING` — that is the whole point of per-vehicle review, and the status screen's own copy promises it ("approved vehicles keep their verdict").
- **Saving a flagged vehicle clears its flag** at the moment of saving, not at resubmit: §4's `PATCH` sets `status = "PENDING"`, `flagReason = null`, `decidedAt = null` in the same transaction as the `Vehicle` update. That is what lets the status screen's Resubmit button enable itself as the last flag is cleared.
- **`companyFlagReason` is cleared by `POST /api/logistics-company`** (`task-06`), on the same principle.

The resubmit handler therefore does not re-validate field formats — their inputs are frozen unless they went through §4 or `task-06`, both of which validate on the way in. It re-runs only what can have gone stale or been broken by an edit:

| Check | Status | Message |
|---|---|---|
| any `BusinessApplicationVehicle.status === "FLAGGED"` remains | 400 | `Fix the {n} flagged vehicle{s} before resubmitting.` |
| `companyFlagReason !== null` | 400 | `Correct the flagged company details before resubmitting.` |
| the application has no vehicles at all | 400 | `Your application is incomplete — contact support so we can restore it.` |
| every vehicle still has a live `DriverVehicleAssignment` | 400 | `Vehicle {plate} has no driver. Every vehicle needs a named driver.` |
| every assigned driver's licence is present and `expiresAt > now` | 400 | `{fullName}'s licence has expired. Renew it before submitting.` |
| every assigned driver's categories still cover `Vehicle.vehicleClass`'s requirement | 400 | `{fullName}'s licence does not list category {required}, which the {className} class requires.` |
| no driver holds two live assignments | 400 | `{fullName} is assigned to two vehicles. Each driver can hold one vehicle.` |

The last three are re-run because §4 lets a flagged vehicle's **class** change, and a class change can invalidate a pairing the first submit validated. The licence-expiry check is re-run because an action-required round trip can span days and nothing downstream would catch it: the admin's approve path reads vehicle verdicts only, so an expired licence would otherwise ride all the way to `APPROVED` and activate a driver who may not legally drive.

Then, in one `prisma.$transaction`:

```ts
await tx.businessApplication.update({
  where: { id: application.id },
  data: {
    status: "PENDING",
    lastSubmittedAt: now,
    submissionCount: { increment: 1 },
    // firstSubmittedAt untouched; reference was allocated by task-05's GET and
    // is never written here, on either path.
  },
});
```

No `BusinessApplicationVehicle` row is touched here. Response: `{ status: "PENDING", reference: application.reference }`, 200.

### 4. `PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]`

The status screen's **Fix** editor writes through this. It exists in this task rather than in `task-15` because it shares §2's validator with the submit endpoint and duplicating that validator is how the two would drift apart.

```ts
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
): Promise<NextResponse>;
```

Order, following the codebase's route convention:

1. Session → 401 `Unauthorized.`
2. Role → 403 `Only logistics companies have a fleet application.`
3. `await request.json()` in a `try/catch` → 400 `Request body must be valid JSON.`
4. `parseVehicleCorrectionBody(body: unknown): { data } | { error }`, checked with `if ("error" in parsed)` → 400. Hand-rolled; the project deliberately uses no validation library. Accepted keys: `classId`, `chassisType`, `make`, `model`, `year`, `plateNumber`, `colour`, `payloadKg`, `cargoLengthM`, `cargoWidthM`, `cargoHeightM`. Anything else is ignored — in particular a `vehicleTypeSpecId` sent by a client is never read.
5. Load `BusinessApplicationVehicle` by `vehicleId`, joined to its `Vehicle` and `BusinessApplication`, and require the application's `companyId` to be the caller's. Not found, or owned by another company → 404 `Vehicle not found.` (one message for both, so ownership is not probeable).
6. `application.status !== "ACTION_REQUIRED"` → 400 `This application isn't open for corrections.`
7. `row.status !== "FLAGGED"` → 400 `This vehicle wasn't flagged for correction.`
8. `validateVehicleInput(parsed.data, vehicle.plateNumber, now, problems)`; `problems.length > 0` → 400 `{ error: problems[0] }`.
9. Resolve the spec through `resolveVehicleTypeSpecCode` + a `vehicleTypeSpec.findUnique` — **server-side, never trusted from the client**, exactly as §3e. Missing → `console.error` + 500.

Then one transaction:

```ts
await prisma.$transaction(async (tx) => {
  await tx.vehicle.update({
    where: { id: vehicleId },
    data: {
      vehicleTypeSpecId: spec.id,
      vehicleClass: validated.classId,
      chassisType: validated.chassisType,
      plateNumber: validated.plateNumber,
      make: validated.make, model: validated.model,
      year: validated.year, colour: validated.colour,
      payloadKg: validated.payloadKg,
      cargoLengthM: validated.cargoLengthM,
      cargoWidthM: validated.cargoWidthM,
      cargoHeightM: validated.cargoHeightM,
    },
  });

  // Saving a flagged vehicle clears its flag.
  await tx.businessApplicationVehicle.update({
    where: { id: row.id },
    data: { status: "PENDING", flagReason: null, decidedAt: null },
  });
});
```

`companyId` and `driverProfileId` are **not** in the update payload: ownership never changes here, and re-asserting `driverProfileId: null` would be redundant with the CHECK constraint already holding it.

A `P2002` on `plateNumber` → 409 `This plate number is already registered to another vehicle.` Anything else → `console.error` + 500 `We couldn't save this vehicle. Please try again.`

**Response.** 200 with the updated row in the shape the status screen renders, so it can fold it in without a refetch:

```ts
{
  vehicle: {
    /** `BusinessApplicationVehicle.id`. */
    id: string;
    /** `Vehicle.id` — the id this PATCH was keyed on. */
    vehicleId: string;
    position: number;
    vehicleClass, chassisType, make, model, year,
    plateNumber, colour, payloadKg, cargoLengthM, cargoWidthM, cargoHeightM,
    status: "PENDING", flagReason: null,
    driver: { driverProfileId, name, phone, categories } | null,
  }
}
```

This is exactly one `FleetVehicleVerdict` — same field names, same split between `id` (the review row) and `vehicleId` (the vehicle), and `driver.name`, not `fullName` — so `task-15` can drop it straight into its `vehicleVerdicts` list.

## Acceptance Criteria

- [ ] Step 5 renders four cards — Company, Fleet, Vehicles, Drivers — each with an Edit link that navigates to steps 1, 2, 3 and 4 respectively.
- [ ] The Fleet card's per-body counts and total are derived from `draft.vehicles`, so they can never disagree with the Vehicles card.
- [ ] Submitting sends `POST /api/logistics-company/onboarding/submit` with no body and renders any `{ error }` inline; `alert()` appears nowhere.
- [ ] The endpoint reads no request body at all.
- [ ] Company fields, fleet total (2–40), and every per-vehicle rule — including the trailer's 8 m minimum — are re-validated server-side and rejected with the exact messages above.
- [ ] Every vehicle's `VehicleTypeSpec` is resolved server-side via `resolveVehicleTypeSpecCode`; a locked (class, body) cell is rejected outright and never falls back to a near-miss spec.
- [ ] A plate repeated inside the application is a 400; a plate colliding with another fleet's vehicle is a 409 from `P2002`.
- [ ] Unassigned vehicles, a driver outside the company, an expired licence as of submit time, a licence category that does not cover the class, and one driver on two vehicles are all rejected server-side.
- [ ] One transaction creates the `Vehicle` rows (`companyId` set, `driverProfileId` null, `vehicleClass` and `chassisType` written), the `DriverVehicleAssignment` rows and the `BusinessApplicationVehicle` rows, sets status `PENDING`, clears the draft with `Prisma.DbNull`, stamps `firstSubmittedAt`/`lastSubmittedAt` and increments `submissionCount`.
- [ ] Every `BusinessApplicationVehicle` row is created with `businessApplicationId` (never `applicationId`) and with its `vehicleClass` and `chassisType` written — both are `NOT NULL` — in table order, so the derived `createdAt` numbering matches what the company saw.
- [ ] The `BIZ-#####` reference is only ever **read** here — it is non-null on arrival, allocated by `task-05`'s lazy `GET`, and this endpoint neither generates nor writes it on either path.
- [ ] On the `ACTION_REQUIRED` path, resubmit is refused while any vehicle is still `FLAGGED` or `companyFlagReason` is set, and re-runs the licence-expiry, category and one-driver-one-vehicle checks.
- [ ] Resubmitting leaves every `APPROVED` `BusinessApplicationVehicle` row at `APPROVED` with its `decidedAt` intact — nothing is reset to `PENDING`.
- [ ] `PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]` accepts a correction only for a `FLAGGED` vehicle on an `ACTION_REQUIRED` application owned by the caller, re-resolves the spec server-side, and clears `status`/`flagReason`/`decidedAt` in the same transaction as the `Vehicle` update.
- [ ] Nothing is written to `Vehicle`, `DriverVehicleAssignment` or `BusinessApplicationVehicle` before a successful submit.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- **`PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]` is consumed by `task-15`.** Both are wave 4 and land together; `task-15` restates this contract inline and does not import from this task. Keep the response shape above stable.
- Driver **accounts** (`User` + `DriverProfile` + `DriverLicence`) are created earlier, by `task-07`'s endpoint from step 4, and are therefore not part of this transaction. That is what makes licence-category gating enforceable at all — a company-created driver previously got no `DriverLicence` row, so there was nothing to gate on. The requirements' phrase "creates … the `DriverLicence` rows for created drivers … in one transaction" is satisfied by `task-07`'s own transaction; what this endpoint must not create early is `Vehicle` and `DriverVehicleAssignment`, and it does not.
- The two partial unique indexes `task-01` adds to `DriverVehicleAssignment` (`vehicleId` and `driverProfileId`, both `WHERE "unassignedAt" IS NULL`) are what finally make one-driver-one-vehicle a real constraint rather than a documented race. Treat a `P2002` from them as a genuine conflict, not something to retry.
- `Prisma.DbNull` — not `null`, not `Prisma.JsonNull` — is the only correct way to clear the `draft` Json column. `JsonNull` stores the JSON `null` literal, which `parseFleetDraft` reads back as a present-but-unparseable draft and which would send a resubmitting company down the first-submit path.
- Errors are always `{ error: string }` and always report `problems[0]`, never an array. The client renders one inline message; that is this API's convention throughout.
- Server components that read this application need `export const dynamic = "force-dynamic"`; that is `task-21`'s concern, not this one.
