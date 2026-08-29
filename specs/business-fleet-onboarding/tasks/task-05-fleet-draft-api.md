# Task 05: Fleet Draft & Status API

## Status

pending

## Wave

2

## Description

The read/write backbone the entire company-facing wizard is built on: one endpoint returning everything the wizard *or* the post-submission status screen needs to render (which of the two the client shows is driven by `status`, not by a second endpoint), a save endpoint for the in-progress draft, and a reset endpoint for "Start a new application". This is the direct counterpart of `src/app/api/driver-profile/onboarding/route.ts` for companies, and it must mirror that file's structure closely enough that a reader of one can read the other without re-learning anything.

Every wizard-side task in wave 4 (`task-10` through `task-15`) reads and writes through these three endpoints — none of them build their own. `task-09`'s draft context is the only client-side caller.

## Dependencies

**Depends on:** task-01-schema-migration.md
**Blocks:** task-09-fleet-wizard-shell.md

**Context from dependencies:**

`task-01` adds all of the following to `prisma/schema.prisma` in one migration:

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

Its existing columns are untouched: `id`, `userId @unique` (1:1 with `User` — one login per company), `companyName`, `vatId`, `phone @unique`, `city GeorgianCity` (retained as the company's **primary/registered** city, deliberately not folded into `citiesOfOperation`), `drivers`, `vehicles`, `orders`.

*New `VehicleClass` enum and `Vehicle.vehicleClass`:*

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

There is **no `position` column**. A vehicle's 1-based row number is derived from `createdAt` ordering and computed in the response, not stored — any `orderBy: { position: ... }` is a bug, including in this task's `include`. There is likewise **no compound `@@unique([businessApplicationId, vehicleId])`**: `vehicleId @unique` on its own is what lets the submit endpoint upsert per vehicle on a resubmission and preserve an existing `APPROVED` verdict instead of creating a second row.

Two consequences this task must honour. `vehicleId` is **nullable**, so the `GET` below returns it as `string | null` and every join through `vehicle` is optional — a row whose vehicle was removed still has a verdict to render. And `vehicleClass` / `chassisType` are non-null **on the review row itself**, so the response reads them from there rather than from the (nullable) joined `Vehicle`.

*Two hand-appended partial unique indexes* closing the `DriverVehicleAssignment` exclusivity race:

```sql
CREATE UNIQUE INDEX "driver_vehicle_assignment_live_vehicle_unique"
  ON "DriverVehicleAssignment"("vehicleId") WHERE "unassignedAt" IS NULL;
CREATE UNIQUE INDEX "driver_vehicle_assignment_live_driver_unique"
  ON "DriverVehicleAssignment"("driverProfileId") WHERE "unassignedAt" IS NULL;
```

Also relevant and pre-existing: `Vehicle` has `driverProfileId?` XOR `companyId?` enforced by the DB check constraint `vehicle_single_owner_check`, so a company vehicle physically cannot carry a `driverProfileId` — every driver↔vehicle pairing goes through `DriverVehicleAssignment`. `Vehicle.plateNumber` is globally `@unique`.

## Files to Create

- `src/lib/fleet-onboarding/draft-schema.ts` — the versioned draft shape, the single `parseFleetDraft()` narrowing point, the step bounds, the shared fleet-size and payload bounds (`FLEET_MIN_VEHICLES` / `FLEET_MAX_VEHICLES` / `FLEET_MAX_PER_CELL` / `MAX_DRAFT_JSON_LENGTH`, declared here and imported everywhere else), and the `generateBusinessApplicationReference()` reference generator. There is no separate `reference.ts`.
- `src/app/api/logistics-company/onboarding/route.ts` — `GET` (read / lazy-create) and `PATCH` (save draft).
- `src/app/api/logistics-company/onboarding/reset/route.ts` — `POST` (start a new application).

## Technical Details

### 1. `src/lib/fleet-onboarding/draft-schema.ts`

The whole in-progress wizard as one object across all five steps. Pure data and pure functions, no server-only imports, so the wizard's client components and the route handlers share the same types. Every field the company *types* is optional: the client sends whatever it has filled in so far on every save, and the save is a **whole-object replace, not a merge** — so a field the company clears really does disappear, which a deep merge would make impossible.

Literal unions are used rather than importing the Prisma enums, so a persisted draft's shape stays independent of the schema and of the presentation constants — a draft saved today must still parse if `vehicle-classes.ts`'s copy is retuned later. This is the same reasoning `src/lib/driver-onboarding/draft-schema.ts` records for `OnboardingDraftVehicleClassId`.

```ts
/** The current draft version. Bumping this is what a future migration branches on. */
export const FLEET_DRAFT_VERSION = 1;

/** The wizard's five steps; `draftStep` is rejected outside this range on save. */
export const FLEET_FIRST_STEP = 1;
export const FLEET_LAST_STEP = 5;

/** Fleet size bounds, enforced on Continue in step 2 and re-checked at submit. */
export const FLEET_MIN_VEHICLES = 2;
export const FLEET_MAX_VEHICLES = 40;
/** The design's per-cell stepper range. */
export const FLEET_MAX_PER_CELL = 40;
/** Cap on the serialised draft. See §4 for the reasoning. */
export const MAX_DRAFT_JSON_LENGTH = 64 * 1024;

/** Cargo body types the wizard offers, mirroring the `ChassisType` enum. */
export type FleetDraftChassisType =
  "DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS";

/** Vehicle classes the wizard offers, mirroring the `VehicleClass` enum. */
export type FleetDraftVehicleClassId =
  | "SMALL_VAN"
  | "LARGE_VAN"
  | "MEDIUM_TRUCK"
  | "HEAVY_FREIGHT_TRUCK"
  | "TRAILER_TRUCK";

export type FleetDraftCompany = {
  phone?: string;
  companyName?: string;
  vatId?: string;
  registeredAddress?: string;
  /** GeorgianCity enum value — the registered city, set at sign-up. */
  city?: string;
  /** GeorgianCity enum values. */
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
  vehicles?: FleetDraftVehicle[];
};
```

Copy that shape verbatim. Five points in it are load-bearing and are the ones a re-derivation gets wrong:

- **The company field names are the Prisma column names.** `registeredAddress`, `citiesOfOperation`, `contactName`, `bankAccountIban` — not `address`, not `operatingCities`, not `contactFullName`, not `payoutIban`. Step 1's form, task-06's `POST /api/logistics-company` body and `LogisticsCompany`'s own columns all use these spellings, so the draft can be handed between them without a rename layer. `city` is the single registered city, set at sign-up; `citiesOfOperation` is the dispatch catchment. Both exist and neither derives from the other.
- **Counts stay nested at `draft.fleet.counts`,** never flattened to `draft.fleet`. The rail tally is `Object.values(draft.fleet?.counts ?? {}).reduce((a, b) => a + b, 0)`, and `fleet` is an object so a later step-2 concern (a per-body note, a saved scroll position) has somewhere to live without another shape change.
- **The cell key is `` `${chassisType}:${classId}` ``** — one colon, enum values on both sides, e.g. `"REFRIGERATED:MEDIUM_TRUCK"`. The map is typed `Record<string, number>` rather than a template-literal union so a key written by an older client never makes a whole stored draft unparseable; absent keys mean zero. It is a flat string-keyed map rather than a nested `Record<chassis, Record<class, number>>` because only 8 of the 15 cells are usable — a nested record would either be sparse and lie about its own type, or dense and carry seven cells that must never be non-zero.
- **A vehicle's primary key is `id`, and its class field is `classId`.** Not `key`, not `vehicleClass`. `id` is a client-generated `crypto.randomUUID()`, stable across a step-2 count change (which adds and removes only at the tail of the affected group); a positional index would silently re-point a driver at a different vehicle the moment a count changed. `chassisType` and `classId` are **required** on a vehicle — a row only exists because step 2 generated it from a specific cell, so it always knows its cell — while everything the company types is optional. `prefillSource` (not `sourceModelLabel`) carries "Hino 916" for the editor footer and is absent when the specification was typed by hand.
- **There is no `assignments` section and no `FleetDraftAssignment` type.** The driver lives on the vehicle, as `driverProfileId` — a `DriverProfile.id`, not a `User.id`. A parallel `Record<vehicleKey, assignment>` was the earlier design and is deleted: it made every consumer join two collections by hand, it let a draft hold an assignment for a vehicle that no longer exists, and it duplicated driver name/phone/categories into the draft where they immediately went stale against the roster. Step 4 renders by reading `vehicle.driverProfileId` and looking the driver up in task-07's roster response, which is fetched anyway and is the only current source for name, phone and licence categories. If you find yourself writing `draft.assignments`, you are working from the superseded shape.

**This module is the single declaration point for the shared bounds.** `FLEET_MIN_VEHICLES`, `FLEET_MAX_VEHICLES`, `FLEET_MAX_PER_CELL` and `MAX_DRAFT_JSON_LENGTH` are declared here and **imported** by everything that needs them — `task-11`'s per-cell stepper and its "at least 2 vehicles" Continue gate, `task-12`'s vehicle table, `task-14`'s server-side re-check at submit, and this task's own `PATCH` body parser. No other file may declare `MIN_FLEET_SIZE` / `MAX_FLEET_SIZE` / `MAX_PER_CELL` or its own 64 KiB literal. They are here rather than in a constants file of their own because the bound and the shape it constrains belong together: `FLEET_MAX_VEHICLES` is a statement about `FleetDraftV1["vehicles"]`, and `MAX_DRAFT_JSON_LENGTH` is a statement about the serialised draft. A client and a server that disagree by one about the maximum fleet size produce a form that lets a company add a 41st vehicle and a submit that silently refuses it.

`parseFleetDraft` is the **single narrowing point** — the one place a `JsonValue` is allowed to become a `FleetDraftV1`, and the one place a future `version: 2` migration would branch. Nothing else in the feature may `as`-cast a draft:

```ts
/**
 * Parses a Prisma `JsonValue` into a `FleetDraftV1`, or `null` for anything
 * that isn't a plausible draft of this shape (missing/wrong `version`, not an
 * object, an array). Callers treat `null` exactly like "no draft yet" rather
 * than crashing — a draft that somehow got corrupted costs the company its
 * in-progress answers, not access to the wizard.
 *
 * Beyond `version`, the rest is shallow-trusted: this is our own
 * previously-saved data, every field is optional, and deep validation happens
 * at submit time (`task-14`) against the real business rules, not here.
 * Callers that accept a draft straight from the browser (`PATCH`) layer their
 * own structural checks on top before writing.
 */
export function parseFleetDraft(value: unknown): FleetDraftV1 | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.version !== FLEET_DRAFT_VERSION) {
    return null;
  }

  return record as FleetDraftV1;
}
```

And the reference generator, mirroring `generateApplicationReference` in the driver draft schema but with its own prefix so a support call can tell a company application from a driver one at a glance:

```ts
const REFERENCE_PREFIX = "BIZ-";
const REFERENCE_DIGITS = 5;

/**
 * A candidate application reference. Randomness, not a counter, so a reference
 * leaks nothing about how many companies have applied. 5 digits is only 100k
 * values, so a collision — while astronomically unlikely at this scale — is
 * possible: the caller must retry on the unique-constraint violation rather
 * than assume this returns something free.
 */
export function generateBusinessApplicationReference(): string {
  const value = Math.floor(Math.random() * 10 ** REFERENCE_DIGITS);
  return `${REFERENCE_PREFIX}${value.toString().padStart(REFERENCE_DIGITS, "0")}`;
}
```

### 2. `resolveCompanyContext(request)` — the shared guard

`GET`, `PATCH` and the reset route all need the same session → role → company → application resolution, so factor it into a discriminated union exactly as `resolveDriverContext` does, consumed as `if ("response" in context) return context.response;`:

```ts
type CompanyContext =
  { company: LogisticsCompanyWithApplication } | { response: NextResponse };

async function resolveCompanyContext(request: Request): Promise<CompanyContext>
```

In order:

1. `const session = await auth.api.getSession({ headers: request.headers });` — no session → `401 { error: "Unauthorized." }`
2. `session.user.role !== "COMPANY"` → `403 { error: "Only logistics companies have a fleet application." }`
3. `prisma.logisticsCompany.findUnique({ where: { userId: session.user.id }, include: companyInclude })` — no row → `404 { error: "Complete your company profile before onboarding." }`

The 404 is a 404 rather than an auto-created stub for the same reason `resolveDriverContext` gives: a company reaches onboarding only after sign-up has already created its `LogisticsCompany` (`task-08`), so "no company" means something upstream went wrong, not that this route should invent one out of required fields (`companyName`, `vatId`, `phone`, `city`) it does not have.

The include is declared once with `satisfies Prisma.LogisticsCompanyInclude` and reused for the payload type, so the whole `GET` response costs one round trip:

```ts
const companyInclude = {
  application: {
    include: {
      vehicles: {
        // There is no `position` column. Row order is `createdAt` ascending —
        // the order task-14's submit inserted them in, which is the order the
        // company listed them in step 3 — and the 1-based `position` in the
        // response is the index computed from this ordering. Never
        // `orderBy: { position: "asc" }`; it does not compile against the schema.
        orderBy: { createdAt: "asc" },
        include: {
          vehicle: {
            include: {
              assignments: {
                where: { unassignedAt: null },
                include: { driverProfile: { include: { licence: true } } },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.LogisticsCompanyInclude;
```

### 3. `GET /api/logistics-company/onboarding`

Guard as above. **Lazy creation on first GET**: if the company has no `BusinessApplication` row, create one (`status: "DRAFT"`, `draft: Prisma.DbNull`, `reference: generateBusinessApplicationReference()`). The row is created on first visit rather than at sign-up so the many companies that never start onboarding cost nothing.

Retry a colliding reference up to `REFERENCE_ATTEMPTS = 5` times, gated on a helper that inspects `error.meta?.target` so a P2002 on `companyId` — possible if two concurrent GETs both find no application and both try to create one — is not mislabelled as a reference collision and retried pointlessly. Postgres reports either the column list (an array) or the index name (a string); handle both. Copy `isDuplicateReferenceError` from the driver route verbatim apart from the field name. Any other failure logs and returns `500 { error: "Could not start your application. Please try again." }`.

Response `200`:

```ts
type FleetOnboardingGetResponse = {
  status: "DRAFT" | "PENDING" | "ACTION_REQUIRED" | "APPROVED";
  reference: string;
  /** Present only while status is DRAFT — the one state the draft is editable in. Null otherwise. */
  draft: FleetDraftV1 | null;
  draftStep: number;
  /** ISO, drives the welcome screen's resume banner. */
  draftUpdatedAt: string | null;
  companyReviewStatus: "PENDING" | "VERIFIED" | "FLAGGED";
  /** One of the four company flag reasons, or null. */
  companyFlagReason: string | null;
  /**
   * Per-vehicle verdicts, in table order. Empty until a first submit has written
   * the rows. Each entry is exactly `task-09`'s `FleetVehicleVerdict`, which
   * `task-09`'s context passes straight through to the wizard as
   * `vehicleVerdicts` — field for field, no adapter. Do not add, drop or rename
   * a field on either side without changing both.
   */
  vehicles: {
    /** `BusinessApplicationVehicle.id` — what task-18's admin verdict mutations address. */
    id: string;
    /** `Vehicle.id` — what task-15's Fix PATCH is keyed on. Null if the vehicle was removed. */
    vehicleId: string | null;
    /** 1-based, derived from `createdAt` ordering. Not a column. */
    position: number;
    status: "PENDING" | "APPROVED" | "FLAGGED";
    /** One of the six per-vehicle flag reasons, or null. */
    flagReason: string | null;
    chassisType: "DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS";
    vehicleClass: "SMALL_VAN" | "LARGE_VAN" | "MEDIUM_TRUCK" | "HEAVY_FREIGHT_TRUCK" | "TRAILER_TRUCK";
    plateNumber: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    colour: string | null;
    payloadKg: number | null;
    cargoLengthM: number | null;
    cargoWidthM: number | null;
    cargoHeightM: number | null;
    /** The live assignment's driver, or null if the vehicle has none. */
    driver: {
      driverProfileId: string;
      name: string;
      phone: string;
      categories: ("B" | "C" | "CE")[];
    } | null;
  }[];
  /** Present only once status !== "DRAFT"; null while still a draft. */
  submittedSummary: {
    companyName: string;
    vatId: string;
    registeredAddress: string;
    city: string;
    citiesOfOperation: string[];
    contactName: string;
    contactRole: string;
    contactEmail: string;
    phone: string;
    /** Masked to the last four characters — see the note below. */
    bankAccountIban: string;
    vehicleCount: number;
    /** Body-type label -> count, for the status screen's fleet line. */
    countsByBodyType: Record<string, number>;
  } | null;
};
```

Four things about the `vehicles[]` entries are deliberate and are the ones a re-derivation gets wrong:

- **Both ids are present, and they are not interchangeable.** `id` is the `BusinessApplicationVehicle.id`; it is what `task-18`'s admin verdict mutations address (`PATCH /api/admin/business-applications/[id]/vehicles/[vehicleId]` takes *this* value). `vehicleId` is the `Vehicle.id`; it is what `task-14`'s per-vehicle correction endpoint (`PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]`) is keyed on, which is what `task-15`'s "Fix" button calls. A response carrying only one of them makes one of those two surfaces impossible to build. `vehicleId` is `string | null` because the FK is nullable: when it is `null` the vehicle has been removed from the fleet, the row still renders its verdict, and the Fix button is disabled rather than pointing at nothing.
- **The full specification travels with every row, not just the flagged ones.** `plateNumber`, `make`, `model`, `year`, `colour`, `payloadKg` and the three cargo dimensions are all here because `task-15` seeds its Fix editor directly from this payload — it opens `task-12`'s vehicle editor dialog pre-filled with what was submitted, and there is no second endpoint that would return those figures. Omitting them turns the correction loop into "retype the whole vehicle from memory". They are individually nullable because `Vehicle` allows a half-specified row and a status screen must render one rather than crash.
- **`chassisType` and `vehicleClass` are non-null**, and they are read from the `BusinessApplicationVehicle` row's own denormalised columns, not from the joined `Vehicle`. That is precisely why those columns exist: the join is optional and returns nothing once `vehicleId` is null, but the queue, the status screen and the drawer must still say what the company declared and what was reviewed.
- **The driver is identified by `driverProfileId`**, matching the draft's `FleetDraftVehicle.driverProfileId` and `task-07`'s roster entries — not by `User.id`. Name, phone and categories come from the live assignment's `driverProfile` join, so they are current rather than whatever was cached at submit.

`draft` is `parseFleetDraft(application.draft)` when `status === "DRAFT"`, and `null` for every other status — see §4: the draft is writable only while `DRAFT`, so returning one in any other state would hand the client a document it cannot save, and the client would have no way to tell that from a savable one. An in-review or approved application has nothing to resume; an `ACTION_REQUIRED` one is corrected through the two targeted endpoints named in §4, not by editing the draft. `submittedSummary` is built from the **normalized rows** (`LogisticsCompany`'s own columns and the `BusinessApplicationVehicle` → `Vehicle` join), never from the draft: after submit the draft is no longer the source of truth, and a summary the company shows to itself must match exactly what the reviewer sees. Return `null` for it while `status === "DRAFT"`, and tolerate a half-written row with `?? ""` / `?? null` rather than crashing the whole status screen.

`bankAccountIban` is returned masked (`"•••• •••• •••• 4821"` — keep the last four characters, replace the rest). The wizard already has the full value in the draft while editing; the status screen only needs to confirm which account was submitted, and an unmasked payout account in a response body that is logged, cached or screen-shared is a needless disclosure.

### 4. `PATCH /api/logistics-company/onboarding`

Guard as above, plus: `404 { error: "No application to save. Load your application first." }` when the company has no application row.

**Writable only while `status === "DRAFT"`.** `PENDING`, `ACTION_REQUIRED` and `APPROVED` all → `400 { error: "An application under review can no longer be edited." }`. This matches the driver flow's DRAFT-only rule exactly; do not widen it.

`ACTION_REQUIRED` is **not** writable, and that is the point. Once a company has submitted, the normalized rows are the source of truth and the draft is a historical artefact: an admin is looking at `Vehicle` and `LogisticsCompany` rows, not at a JSON blob, so a correction that only edited the draft would change nothing the reviewer can see, and a resubmit that replayed the whole draft would silently overwrite fields the admin had already approved. The `ACTION_REQUIRED` correction loop therefore does not go through this endpoint at all. It goes through two targeted writes:

- **A flagged vehicle** → `PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]` (task-14), keyed on `Vehicle.id`, which updates that one vehicle and clears its own flag (`status: "PENDING"`, `flagReason: null`, `decidedAt: null`). Nothing else in the fleet is touched, so an already-`APPROVED` sibling keeps its verdict.
- **A flagged company block** → `POST /api/logistics-company` (task-06), which updates the company columns and, in the same transaction, clears `companyReviewStatus` back to `PENDING` and `companyFlagReason` to `null`.

One consequence for the wizard: when step 1's form is reached from a company-level flag, it seeds from **`submittedSummary`**, not from `draft` — the `GET` returns `draft: null` in that state, and `submittedSummary` is the normalized, reviewer-visible version of the same answers. `task-10` builds the form that way; do not add an `ACTION_REQUIRED` branch here to keep the draft alive for it.

Refusing `PENDING` and `APPROVED` has the same motivation it always did: an admin must never review one set of answers while the company silently edits another underneath them.

Body: `{ draftStep: number; draft: FleetDraftV1 }`, read through the standard `await request.json()` in a try/catch → `400 { error: "Request body must be valid JSON." }`, then a hand-rolled `parseSaveDraftBody(body: unknown): { data } | { error: string }` checked with `if ("error" in parsed)` → 400. **No validation library** — the project deliberately uses none. The checks, in order:

- Not a plain JSON object → `"Request body must be a JSON object."`
- `draftStep` not an integer within `FLEET_FIRST_STEP`–`FLEET_LAST_STEP` → `` `draftStep must be an integer between ${FLEET_FIRST_STEP} and ${FLEET_LAST_STEP}.` `` (i.e. "draftStep must be an integer between 1 and 5.")
- `parseFleetDraft(draft)` returns null → `"draft must be an object with version 1."`
- `draft.company` or `draft.fleet` present but not a plain object → `` `draft.${section} must be an object.` `` (two sections, not three — there is no `assignments`)
- `draft.vehicles` present but not an array → `"draft.vehicles must be an array."`
- `draft.vehicles` longer than `FLEET_MAX_VEHICLES` → `` `draft.vehicles must contain ${FLEET_MAX_VEHICLES} entries or fewer.` ``
- `JSON.stringify(parsedDraft).length > MAX_DRAFT_JSON_LENGTH` → `` `draft must serialise to ${MAX_DRAFT_JSON_LENGTH} characters or fewer.` ``

Field-level validation stays out of here on purpose: a half-filled draft is the normal case, and the real rules are enforced once, at submit (`task-14`).

`MAX_DRAFT_JSON_LENGTH` is **imported from `draft-schema.ts`** (§1), not redeclared here — it is a statement about the draft shape, and task-14 re-checks it at submit against the same constant:

```ts
import { MAX_DRAFT_JSON_LENGTH } from "@/lib/fleet-onboarding/draft-schema";
```

Same value and same reasoning as the driver route: `parseFleetDraft` shallow-trusts the body's shape by design, the value it returns is written verbatim into a `Json` column and echoed back on every `GET`, so without a cap an authenticated company could park an arbitrarily large blob there forever. A full 40-vehicle draft — each vehicle carrying its own specification and its `driverProfileId` — serialises to roughly 15 KB, so 64k is genuine headroom rather than a tight fit. Measured in UTF-16 code units, the same convention as the other `MAX_*_LENGTH` caps in this API, and measured on the *parsed* draft so unknown extra keys that survive `parseFleetDraft` count against it too.

The write is a **whole-object replace, not a merge**:

```ts
await prisma.businessApplication.update({
  where: { id: application.id },
  data: {
    draft: parsed.data.draft as Prisma.InputJsonValue,
    draftStep: parsed.data.draftStep,
    draftUpdatedAt: new Date(),
  },
});

return new NextResponse(null, { status: 204 });
```

The `as Prisma.InputJsonValue` narrowing is required and is not a shortcut: `FleetDraftV1` is a plain serialisable object, but Prisma's `InputJsonValue` is structural and does not accept a named optional-property type directly. Document that in a comment, as the driver route does.

Return `204` with no body — the client already holds exactly the state it just sent. Client-side debouncing is `task-09`'s responsibility, not this route's; note in the route's own comment that it is expected to be hit a few times a minute per company, not on every keystroke.

### 5. `POST /api/logistics-company/onboarding/reset`

Guard as above. **400 if `status !== "DRAFT"`** with `{ error: "A submitted application cannot be reset." }` — `requirements.md`'s Assumptions record that there is no "rejected, reapply from scratch" state in this design: an application is corrected and resubmitted in place, never recreated.

On success, one update: `draft: Prisma.DbNull`, `draftStep: FLEET_FIRST_STEP`, `draftUpdatedAt: null`. Return `204`.

`Prisma.DbNull`, never `null` and never `{ version: 1 }`. On a nullable `Json` column `DbNull` writes a SQL NULL while `Prisma.JsonNull` writes the JSON `null` literal — two different stored values, and only the SQL NULL makes `parseFleetDraft` see an absent draft. Writing an empty `{ version: 1 }` would be worse still: `parseFleetDraft` would accept it, the wizard would resume into a draft that exists but holds nothing, and the resume banner would offer to continue an application that was just thrown away. This is the same write the lazy `GET` uses when it creates the row.

Note in the handler what reset deliberately does **not** touch, because it is surprising and someone will ask:

- **Driver accounts created in step 4 are not deleted.** They are real `User` + `DriverProfile` + `DriverLicence` rows on the company's roster (`task-07`), created before submit precisely so category gating has something to check. Resetting the draft drops the *intent* to put them behind a vehicle; the accounts stay, and the company can pick them again from the roster.
- **No `Vehicle` rows exist yet to clean up.** Nothing writes to `Vehicle` before a successful submit — `plateNumber` is globally unique and an abandoned draft must never permanently claim a real plate.
- **No documents.** Company vehicle document upload is an explicit non-goal in v1, so there is no storage cleanup here, unlike the driver flow's reset.

## Acceptance Criteria

- [ ] `GET` creates a `BusinessApplication` on first call for a company that has none, with a unique `BIZ-` reference and `status: "DRAFT"`, retrying only on a reference collision and at most 5 times.
- [ ] `GET` returns `draft` only while `status === "DRAFT"` (null for `PENDING`, `ACTION_REQUIRED` and `APPROVED`), and `submittedSummary` only while `status !== "DRAFT"`.
- [ ] `GET` returns one `vehicles[]` entry per `BusinessApplicationVehicle`, ordered by `createdAt` ascending with `position` computed as the 1-based index — no `orderBy: { position: ... }` anywhere.
- [ ] Each `vehicles[]` entry carries **both** `id` (the `BusinessApplicationVehicle.id`) and `vehicleId` (the `Vehicle.id`, `string | null`), non-null `chassisType` and `vehicleClass` read from the review row's own columns, the full specification (`plateNumber`, `make`, `model`, `year`, `colour`, `payloadKg`, `cargoLengthM`, `cargoWidthM`, `cargoHeightM`), and a `driver` object keyed on `driverProfileId` or `null` — field for field identical to task-09's `FleetVehicleVerdict`.
- [ ] A row whose `vehicleId` is null still renders: the endpoint returns its verdict, flag reason, class and body without throwing on the missing `vehicle` join.
- [ ] `bankAccountIban` in `submittedSummary` is masked to its last four characters.
- [ ] `PATCH` accepts a save only while `status === "DRAFT"` and rejects it with 400 `"An application under review can no longer be edited."` while `PENDING`, `ACTION_REQUIRED` or `APPROVED`.
- [ ] `PATCH` rejects a `draftStep` outside 1–5, a draft whose `version` is not `1`, a non-object `company`/`fleet`, a non-array `vehicles`, more than 40 vehicles, and a draft serialising above 64 KiB — each with its exact message above and a 400.
- [ ] `FLEET_MIN_VEHICLES`, `FLEET_MAX_VEHICLES`, `FLEET_MAX_PER_CELL` and `MAX_DRAFT_JSON_LENGTH` are declared once, in `src/lib/fleet-onboarding/draft-schema.ts`, and the routes import them rather than restating a literal.
- [ ] `FleetDraftV1` has exactly `version`, `company`, `fleet`, `vehicles` — **no `assignments` key and no `FleetDraftAssignment` type** — and `FleetDraftVehicle` carries `id`, `classId`, `prefillSource` and `driverProfileId` under exactly those names.
- [ ] `PATCH` replaces the draft wholesale (a key removed by the client is gone from the stored row) and returns `204` with no body.
- [ ] `POST /reset` clears `draft` to `Prisma.DbNull` (not `null`, not `{ version: 1 }`), resets `draftStep` and `draftUpdatedAt`, returns `204`, and rejects with 400 when `status !== "DRAFT"`.
- [ ] All three routes 401 with `{ error: "Unauthorized." }` without a session, 403 with `{ error: "Only logistics companies have a fleet application." }` for a non-COMPANY role, and 404 with `{ error: "Complete your company profile before onboarding." }` when no `LogisticsCompany` row exists.
- [ ] `parseFleetDraft` is the only place in the codebase that narrows a stored draft; no route `as`-casts `application.draft` directly.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This task writes **nothing** to `Vehicle`, `DriverVehicleAssignment` or `BusinessApplicationVehicle`. Those rows are created once, at a successful submit (`task-14`), inside one transaction, from the validated draft. `GET` only *reads* whatever `BusinessApplicationVehicle` rows already exist.
- A vehicle's `driverProfileId` in the draft records *intent*, not a live pairing: the `Vehicle` row it would be assigned to does not exist until submit, so there is nothing to write a `DriverVehicleAssignment` against. `task-07`'s assign/unassign endpoints operate on the real, already-submitted fleet; `task-14`'s submit writes the initial rows. Both enforce the same two rules (licence category covers the vehicle's class; one live assignment per driver and per vehicle) — the draft is not, and must never be treated as, an enforcement point. In particular, nothing stops a draft from naming the same `driverProfileId` on two vehicles; submit is where that is caught.
- Keep the file layout parallel to `src/app/api/driver-profile/onboarding/route.ts`: module doc comment, constants, response types, the include + payload types, the context resolver, helpers, then `GET`, then the body parser, then `PATCH`. The two files should read as siblings.
- `draftStep` is clamped by *rejection*, not by silent coercion — a client sending step 9 gets a 400, not a quietly-stored 5. A silently clamped value is a bug the client never learns about.
