# Task 17: Admin Business Applications — Read APIs

## Status

pending

## Wave

5

## Description

The two read-only endpoints behind the back-office business application review surface: a paginated, status-filterable queue list, and one application in full. They are the exact counterparts of `src/app/api/admin/driver-applications/route.ts` and `src/app/api/admin/driver-applications/[id]/route.ts`, and must follow those two files closely enough that a reviewer of one recognises the other — same role gate, same `Exclude<…, "DRAFT">` status narrowing, same explicit `select` rather than `include`, same exported response types that the client imports type-only.

A business application differs from a driver application in one structural way that drives every decision below: it carries **two independent verdict tracks**. The company's own details (VAT id, registered address, payout account, contact person) are verified once as a whole, and every vehicle is cleared or flagged individually. The queue therefore shows the application status plus a `5/7` drivers-assigned figure, and the detail endpoint returns the company block, its review status and flag reason, and one entry per `BusinessApplicationVehicle` with its own status, flag reason and assigned driver.

## Dependencies

**Depends on:** task-01-schema-migration.md
**Blocks:** task-19-admin-business-queue-page.md, task-20-admin-business-detail-drawer.md

**Context from dependencies:**

task-01 adds the following. Everything this task queries is here — do not open task-01 to check.

```prisma
enum BusinessApplicationStatus { DRAFT PENDING ACTION_REQUIRED APPROVED }
enum CompanyReviewStatus { PENDING VERIFIED FLAGGED }
enum BusinessApplicationVehicleStatus { PENDING APPROVED FLAGGED }
enum VehicleClass { SMALL_VAN LARGE_VAN MEDIUM_TRUCK HEAVY_FREIGHT_TRUCK TRAILER_TRUCK }

model BusinessApplication {
  id                  String                      @id @default(cuid())
  companyId           String                      @unique
  company             LogisticsCompany            @relation(fields: [companyId], references: [id], onDelete: Cascade)
  /// "BIZ-40219" — 5 random digits, allocated on task-05's lazy GET.
  reference           String                      @unique
  status              BusinessApplicationStatus   @default(DRAFT)
  /// The company-level verdict track, independent of the per-vehicle one.
  companyReviewStatus CompanyReviewStatus         @default(PENDING)
  companyFlagReason   String?
  draft               Json?
  draftStep           Int                         @default(1)
  draftUpdatedAt      DateTime?
  firstSubmittedAt    DateTime?
  lastSubmittedAt     DateTime?
  submissionCount     Int                         @default(0)
  createdAt           DateTime                    @default(now())
  updatedAt           DateTime                    @updatedAt
  vehicles            BusinessApplicationVehicle[]

  @@index([status])
}

model BusinessApplicationVehicle {
  id                    String                           @id @default(cuid())
  businessApplicationId String
  businessApplication   BusinessApplication              @relation(fields: [businessApplicationId], references: [id], onDelete: Cascade)
  /// Nullable + SetNull: a company can remove a vehicle from its own fleet at
  /// any time through an existing, unrelated flow, and the review row must
  /// survive so the admin drawer can render "vehicle no longer on file" rather
  /// than vanishing a decided verdict. Mirrors `DriverApplication.vehicleId`.
  vehicleId             String?                          @unique
  vehicle               Vehicle?                         @relation(fields: [vehicleId], references: [id], onDelete: SetNull)
  /// Denormalised at submit so the admin queue, the drawer and the dispatch
  /// gate can read the declared class and body without a join that a null
  /// `vehicleId` would break.
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

`LogisticsCompany` gains (all nullable, because admin-created companies predating this feature have none):

```prisma
  registeredAddress String?
  citiesOfOperation GeorgianCity[]      // Postgres enum array, like DriverLicence.categories
  contactName       String?
  contactRole       String?
  contactEmail      String?
  bankAccountIban        String?
  /// Set by the admin activate endpoint (task-18). Null = cannot dispatch.
  activatedAt       DateTime?
  application       BusinessApplication?
```

`LogisticsCompany` already has: `id`, `userId @unique`, `companyName`, `vatId` (String, not unique), `phone @unique`, `city GeorgianCity` (the primary/registered city, retained), `drivers`, `vehicles`, `orders`.

`Vehicle` gains `vehicleClass VehicleClass?` and the **singular** back-relation `applicationVehicle BusinessApplicationVehicle?` — singular, not a list, because `BusinessApplicationVehicle.vehicleId` is `@unique`. It already has `plateNumber @unique`, `make`, `model`, `year`, `colour String?`, `chassisType ChassisType?`, `payloadKg Float?` (a `Float`, not an `Int` — `prisma/schema.prisma:518`), `cargoLengthM`/`cargoWidthM`/`cargoHeightM` (`Float?`), `photoUrls`, `companyId String?`, `vehicleTypeSpecId`.

There is **no `position` column** on `BusinessApplicationVehicle`. The detail endpoint's `orderBy: { createdAt: "asc" }` *is* the row order, and any 1-based row number a client shows is the array index it computes itself. An `orderBy: { position: … }` anywhere on this path is a bug.

Driver↔vehicle pairing is **always** `DriverVehicleAssignment { driverProfileId, vehicleId, assignedAt, unassignedAt DateTime? }` — a company-owned `Vehicle` physically cannot carry a `driverProfileId` (DB CHECK `vehicle_single_owner_check`). task-01 adds two partial unique indexes (`vehicleId`, `driverProfileId`, both `WHERE "unassignedAt" IS NULL`), so at most one open assignment exists per vehicle. `DriverProfile` has `firstName`, `lastName`, `phone`, `user { name }` and `licence DriverLicence? { licenceNumber, expiresAt, categories LicenceCategory[] }`.

Existing helpers this task uses:

```ts
const authorized = await authorizeAdminApi(["SUPER_ADMIN", "USER_MANAGER"]);
if (!authorized.ok) return authorized.response;
```

`authorizeAdminApi` comes from `@/lib/admin/api-auth`, reads the session from `next/headers` itself (it takes no `request`), and answers 401 `{ error: "Unauthorized." }` / 403 `{ error: "Forbidden." }`.

## Files to Create

- `src/app/api/admin/business-applications/route.ts` — `GET`, the paginated queue list.
- `src/app/api/admin/business-applications/[id]/route.ts` — `GET`, one application in full.

## Technical Details

### 1. Shared conventions for both routes

- `export async function GET(request: Request): Promise<NextResponse>` (the detail route takes `(_request: Request, { params }: { params: Promise<{ id: string }> })` — `params` is a promise in this Next.js version, `await` it).
- Role gate first, before reading the URL or the database:

  ```ts
  const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }
  ```

  Declare `ALLOWED_ROLES` in **each** route file rather than importing it from the other. That is the documented convention in the driver-application routes: a `route.ts` is a Next.js entry point, and the gate on each endpoint should be readable — and auditable — without following an import. Copy that reasoning into the doc comment.
- Every error body is `{ error: string }`. No validation library.
- Dates cross the wire as ISO strings (`.toISOString()`).
- Response types are `export type`d from the route module so task-19 and task-20 can `import type` them. That type-only import is erased at compile time, so no Prisma or Better Auth code reaches the browser bundle — this is what stops the table and the API drifting apart. Say so in a comment on the exported types.
- Both endpoints are read-only. Every verdict is written through task-18's endpoints.

### 2. `DRAFT` is invisible to reviewers

A `DRAFT` business application is an unsubmitted wizard draft: unvalidated, half-entered company data — VAT id, registered address, payout IBAN — that the company has not chosen to submit. It must never appear in the queue with or without a `?status=` filter, and the detail endpoint must answer for it **exactly** as it does for a nonexistent id (404 `{ error: "Application not found." }`), so the response cannot confirm that some id belongs to a real in-progress application.

```ts
export type AdminBusinessApplicationStatus = Exclude<
  BusinessApplicationStatus,
  "DRAFT"
>;
```

In the list route, state `not: "DRAFT"` unconditionally in the `where` and spread the optional filter over it, so the exclusion holds whatever `?status=` says (Prisma ANDs the two conditions of one enum filter):

```ts
function buildWhere(
  statusFilter: AdminBusinessApplicationStatus | null,
): Prisma.BusinessApplicationWhereInput {
  return {
    status: {
      not: "DRAFT",
      ...(statusFilter ? { equals: statusFilter } : {}),
    },
  };
}
```

Then re-check `if (application.status === "DRAFT") return [];` inside the row `flatMap` — that is what narrows Prisma's four-value enum to the three-value response union without a cast. The branch is unreachable in practice; keep the comment saying so.

### 3. `GET /api/admin/business-applications`

Query params, both optional and both forgiving (a malformed value falls back rather than 400-ing a read-only listing, matching `parsePage`/`parseStatusFilter` in the driver route):

| Param | Values | Default |
|---|---|---|
| `status` | `PENDING` · `ACTION_REQUIRED` · `APPROVED` | absent → every reviewable status |
| `page` | 1-based integer | `1` |

`const PAGE_SIZE = 25;` — matches every other admin listing.

Exact response shape:

```ts
/**
 * One application as the review queue's table renders it. Dates are ISO strings
 * because this crosses the wire; the page imports this type (type-only, so
 * nothing of this server module reaches the browser) rather than restating the
 * shape, which is what keeps the two from drifting.
 */
export type AdminBusinessApplicationRow = {
  /** `BusinessApplication.id` — the id the detail endpoint takes. */
  applicationId: string;
  /** The short human-readable code, e.g. "BIZ-40219". Rendered mono. */
  reference: string;
  companyName: string;
  /**
   * `LogisticsCompany.city` — the registered/primary city, as the raw
   * `GeorgianCity` enum value (e.g. "TBILISI"). The page maps it to a label
   * through `GEORGIAN_CITY_OPTIONS`.
   */
  primaryCity: string;
  /**
   * How many *other* cities of operation the company declared, i.e.
   * `citiesOfOperation` minus the primary city. The design's City column reads
   * "Tbilisi +2"; this is the `2`. Zero renders as a bare city name.
   */
  otherCitiesCount: number;
  /** `BusinessApplicationVehicle` rows on this application. */
  fleetSize: number;
  /**
   * Vehicles with a driver currently assigned, out of `fleetSize` — the
   * design's `5/7`. Counted from open `DriverVehicleAssignment` rows, which is
   * the only place a company vehicle's driver lives.
   */
  driversAssignedCount: number;
  status: AdminBusinessApplicationStatus;
  /** Shown as a second chip so the queue distinguishes "company still
   *  unverified" from "vehicles still pending". */
  companyReviewStatus: CompanyReviewStatus;
  /** `lastSubmittedAt` — when this application last landed in the queue. */
  submittedAt: string;
};

/** Body of `GET /api/admin/business-applications`. */
export type AdminBusinessApplicationListResponse = {
  items: AdminBusinessApplicationRow[];
  /** The page actually returned (1-based). */
  page: number;
  pageSize: number;
  /** Matching applications across every page, for the "N applications" summary. */
  total: number;
  /** Always at least 1, so an empty list still renders as "Page 1 of 1". */
  pageCount: number;
};
```

The query — one `count` and one `findMany` in a `Promise.all`, with an explicit `select`, so the listing costs two queries regardless of page size:

```ts
const [total, applications] = await Promise.all([
  prisma.businessApplication.count({ where }),
  prisma.businessApplication.findMany({
    where,
    select: {
      id: true,
      reference: true,
      status: true,
      companyReviewStatus: true,
      lastSubmittedAt: true,
      createdAt: true,
      company: {
        select: { companyName: true, city: true, citiesOfOperation: true },
      },
      vehicles: {
        select: {
          // Only whether a driver holds it — the row needs a count, not a name.
          vehicle: {
            select: {
              assignments: {
                where: { unassignedAt: null },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
    orderBy: [
      // Newest submission first — the reviewer works the queue from the top.
      // `nulls: "last"` because Postgres sorts NULLs first on DESC, which would
      // otherwise float a row with no submission timestamp above every real
      // application.
      { lastSubmittedAt: { sort: "desc", nulls: "last" } },
      // Deterministic tiebreak, so two applications submitted in the same
      // instant cannot swap places between two page requests.
      { id: "desc" },
    ],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  }),
]);
```

Derivations:

```ts
fleetSize: application.vehicles.length,
driversAssignedCount: application.vehicles.filter(
  (entry) => (entry.vehicle?.assignments.length ?? 0) > 0,
).length,
otherCitiesCount: application.company.citiesOfOperation.filter(
  (city) => city !== application.company.city,
).length,
submittedAt: (application.lastSubmittedAt ?? application.createdAt).toISOString(),
```

`otherCitiesCount` subtracts the primary city because step 1 lets a company tick its own registered city in the cities-of-operation list, and "Tbilisi +3" when only three cities were chosen would read as four. Filtering rather than `length - 1` also handles the company that did *not* tick its own city.

`submittedAt` falls back to `createdAt`: a submitted application always has `lastSubmittedAt`, and the fallback keeps one corrupt row from breaking the type contract for the whole page.

Answer `NextResponse.json(body, { status: 200 })`.

### 4. `GET /api/admin/business-applications/[id]`

Exact response shape — this is what the drawer in task-20 renders, field for field:

```ts
/** One vehicle on the application, as the drawer's fleet cards render it. */
export type AdminBusinessApplicationVehicle = {
  /** `BusinessApplicationVehicle.id` — the id the per-vehicle verdict endpoint takes. */
  applicationVehicleId: string;
  /** `Vehicle.id`, or null when the vehicle row was deleted after submit. */
  vehicleId: string | null;
  /** Raw `VehicleClass` enum value, e.g. "MEDIUM_TRUCK". */
  vehicleClass: string;
  /** The taxonomy's display name, e.g. "Medium Truck". */
  vehicleClassName: string;
  /** Raw `ChassisType` enum value: DRY_BOX · REFRIGERATED · OPEN_CHASSIS. */
  chassisType: string;
  /** Blank strings / nulls when `vehicleId` is null — see the note below. */
  make: string;
  model: string;
  year: number | null;
  colour: string;
  plateNumber: string;
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  status: BusinessApplicationVehicleStatus;
  flagReason: string | null;
  /**
   * The driver currently behind this vehicle, from the single open
   * `DriverVehicleAssignment`. Null when nobody holds it — which submit does not
   * allow, but an admin unassignment afterwards does.
   */
  driver: {
    driverProfileId: string;
    name: string;
    phone: string;
    /** Licence categories held, e.g. ["B", "C"]. Empty when no licence row. */
    categories: string[];
  } | null;
};

/** One application in full, as `/admin/business/applications` opens it. */
export type AdminBusinessApplicationDetail = {
  applicationId: string;
  reference: string;
  status: AdminBusinessApplicationStatus;
  /** `lastSubmittedAt`, falling back to `createdAt`. */
  submittedAt: string;
  submissionCount: number;
  company: {
    companyId: string;
    companyName: string;
    /** VAT / tax ID — 9 digits. */
    vatId: string;
    registeredAddress: string;
    /** `LogisticsCompany.city`, the registered/primary city (enum value). */
    primaryCity: string;
    /** `citiesOfOperation` as raw `GeorgianCity` enum values, in stored order. */
    citiesOfOperation: string[];
    contactName: string;
    contactRole: string;
    /** The company's main line — also its account login. */
    phone: string;
    /** The contact person's company email. */
    email: string;
    bankAccountIban: string;
    /** Set once the fleet is activated; null while under review. */
    activatedAt: string | null;
  };
  companyReviewStatus: CompanyReviewStatus;
  companyFlagReason: string | null;
  vehicles: AdminBusinessApplicationVehicle[];
  /** Pre-computed so the drawer's "3 approved, 1 flagged, 3 pending" header
   *  and task-18's activation rules read the same numbers the server did. */
  counts: {
    total: number;
    approved: number;
    flagged: number;
    pending: number;
  };
};
```

The query:

```ts
const application = await prisma.businessApplication.findUnique({
  where: { id },
  select: {
    id: true,
    reference: true,
    status: true,
    companyReviewStatus: true,
    companyFlagReason: true,
    submissionCount: true,
    lastSubmittedAt: true,
    createdAt: true,
    company: {
      select: {
        id: true,
        companyName: true,
        vatId: true,
        registeredAddress: true,
        city: true,
        citiesOfOperation: true,
        contactName: true,
        contactRole: true,
        phone: true,
        contactEmail: true,
        bankAccountIban: true,
        activatedAt: true,
      },
    },
    vehicles: {
      select: {
        id: true,
        vehicleId: true,
        vehicleClass: true,
        chassisType: true,
        status: true,
        flagReason: true,
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            colour: true,
            plateNumber: true,
            payloadKg: true,
            cargoLengthM: true,
            cargoWidthM: true,
            cargoHeightM: true,
            assignments: {
              where: { unassignedAt: null },
              select: {
                driverProfile: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    user: { select: { name: true } },
                    licence: { select: { categories: true } },
                  },
                },
              },
              // Defensive: the partial unique index makes two open rows
              // impossible, but the newest wins rather than an arbitrary one.
              orderBy: { assignedAt: "desc" },
              take: 1,
            },
          },
        },
      },
      // Stable order across reloads and across a verdict being recorded — the
      // reviewer works down the same list of cards all the way through.
      orderBy: { createdAt: "asc" },
    },
  },
});

if (!application || application.status === "DRAFT") {
  return NextResponse.json({ error: "Application not found." }, { status: 404 });
}
```

Null handling — mirror the driver detail route's rules exactly:

- Every nullable `LogisticsCompany` scalar (`registeredAddress`, `contactName`, `contactRole`, `contactEmail`, `bankAccountIban`) is serialised as `?? ""`. A submitted application has necessarily filled them; an empty string keeps a half-written row from breaking the whole drawer, and the drawer already renders `""` as the em-dash placeholder.
- `vehicle` being null is **not** an error: `vehicleId` is `SetNull`, so removing the vehicle leaves the review row standing. Emit `make: ""`, `model: ""`, `year: null`, `colour: ""`, `plateNumber: ""`, all dimensions null, `driver: null`, and keep `vehicleId: null` — task-20 uses `vehicleId === null` to render an explicit "vehicle no longer on file" card instead of a grid of blanks.
- `driver.name` is `[firstName, lastName]` joined on a space when non-empty, otherwise `user.name` (always populated). Never an empty string, so the drawer has nothing to fall back to itself.
- `categories: driverProfile.licence?.categories ?? []`.

`vehicleClassName` comes from the shared taxonomy in `@/lib/driver-onboarding/vehicle-classes` (grown to five classes by task-04):

```ts
function vehicleClassName(vehicleClass: VehicleClass): string {
  return (
    VEHICLE_CLASSES.find((entry) => entry.id === vehicleClass)?.name ??
    vehicleClass
  );
}
```

Falling back to the raw enum value rather than dropping the field: an unmapped class must be visible to the reviewer, not silently blank. Note that this is a **forward** lookup on `BusinessApplicationVehicle.vehicleClass`, so unlike the driver routes there is no need to reverse-map a `VehicleTypeSpec.code` back to a class — the declared class is stored, which is precisely why task-01 keeps it on the row.

`counts` is derived in application code from the same `vehicles` array:

```ts
const counts = {
  total: application.vehicles.length,
  approved: application.vehicles.filter((v) => v.status === "APPROVED").length,
  flagged: application.vehicles.filter((v) => v.status === "FLAGGED").length,
  pending: application.vehicles.filter((v) => v.status === "PENDING").length,
};
```

Answer `NextResponse.json(body, { status: 200 })`.

### 5. What these endpoints deliberately do not do

- No search param, no company-name filter. The queue is small and status-filtered; a search box is a separate change.
- No signed URLs. Business applications upload no documents in v1 (`requirements.md`, Non-Goals: cooling-unit service records) — there is no Supabase call on this path at all.
- No `DRAFT` access of any kind, including for a `SUPER_ADMIN`.
- No mutation. `PATCH`/`POST` live in task-18; do not add a verb to either of these files.

## Acceptance Criteria

- [ ] `GET /api/admin/business-applications` answers 401 for an anonymous caller, 403 for a signed-in admin whose `adminRole` is neither `SUPER_ADMIN` nor `USER_MANAGER`, and 200 for both allowed roles.
- [ ] The list never contains a `DRAFT` application, including with `?status=DRAFT` (which is treated as an unrecognised value and ignored).
- [ ] `?status=PENDING|ACTION_REQUIRED|APPROVED` filters correctly; an unrecognised `?status=` or `?page=` falls back rather than erroring.
- [ ] Each row carries `companyName`, `reference`, `primaryCity`, `otherCitiesCount`, `fleetSize`, `driversAssignedCount`, `status`, `companyReviewStatus` and `submittedAt`, and `otherCitiesCount` excludes the primary city.
- [ ] `driversAssignedCount` counts vehicles with an open `DriverVehicleAssignment`, and equals `fleetSize` for a freshly submitted application.
- [ ] `GET /api/admin/business-applications/[id]` returns 404 `{ error: "Application not found." }` for an unknown id **and** for a `DRAFT` application, with byte-identical bodies.
- [ ] The detail response carries every company field listed above, `companyReviewStatus` + `companyFlagReason`, one entry per `BusinessApplicationVehicle` with its `status`, `flagReason`, class/plate, body/model/year/payload, and its assigned driver's name, phone and licence categories.
- [ ] A vehicle whose `Vehicle` row has been deleted still appears, with `vehicleId: null` and blank specifications, instead of 500-ing.
- [ ] `counts.total === vehicles.length` and `approved + flagged + pending === total`.
- [ ] Both response types are exported and importable type-only from a client component with no runtime import of the route module.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Sorting the list by `lastSubmittedAt DESC NULLS LAST, id DESC` is not cosmetic: a non-deterministic order across paged requests silently shows some rows twice and skips others.
- `primaryCity` and `citiesOfOperation` cross the wire as raw enum values, not labels. Labelling is the client's job through `GEORGIAN_CITY_OPTIONS` in `@/lib/georgian-cities` — that module is the browser-safe mirror kept deliberately free of Prisma, and using it on the client is what stops the enum leaking into the bundle by another route.
- `companyReviewStatus` is on the **row** type as well as the detail type on purpose: a reviewer scanning the queue needs to see that a company is flagged without opening every drawer, and the design's Status column alone cannot express two independent tracks.
- Do not import `ALLOWED_ROLES`, `PAGE_SIZE` or the status union from the sibling route file. Restate them, as the driver routes do, with the same justifying comment.
