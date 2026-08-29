# Task 07: Fleet Driver API — Roster, Create-with-Licence, Assign/Unassign with Category Gating

## Status

pending

## Wave

2

## Description

Step 4 of the wizard puts a named driver behind every vehicle, either by picking one off the company's roster or by creating the account there and then. Three company-scoped endpoints back it, and all three already exist in some form — this task extends them rather than adding a parallel set.

The load-bearing change is licence capture. A company-created driver today gets **no `DriverLicence` row at all** (`drivers/register/route.ts` creates `User` + `DriverProfile` and stops), which means the platform currently has nothing to check when asked "may this driver hold a Category CE vehicle?" — the gating rule in `requirements.md` is literally unenforceable. Capturing licence number, expiry and categories at creation is what makes it enforceable, on the server as well as in the UI.

## Dependencies

**Depends on:** task-01-schema-migration.md
**Blocks:** task-13-step4-drivers-assignment.md, task-14-step5-review-submit.md

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

Its existing columns are untouched: `id`, `userId @unique`, `companyName`, `vatId`, `phone @unique`, `city GeorgianCity` (retained as the company's **primary/registered** city, deliberately not folded into `citiesOfOperation`), `drivers`, `vehicles`, `orders`.

*New `VehicleClass` enum and `Vehicle.vehicleClass`* — this is the column the category gate reads:

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
  /// Nullable + SetNull: a company can remove a vehicle from its own fleet at
  /// any time through an existing, unrelated flow, and the review row must
  /// survive so the admin drawer can render "vehicle no longer on file".
  vehicleId             String?             @unique
  vehicle               Vehicle?            @relation(fields: [vehicleId], references: [id], onDelete: SetNull)

  /// Denormalised at submit so the queue, drawer and dispatch gate can read the
  /// declared class and body without a join a null `vehicleId` would break.
  vehicleClass VehicleClass
  chassisType  ChassisType

  status     BusinessApplicationVehicleStatus @default(PENDING)
  /// Set only when `status` is FLAGGED; cleared when the vehicle is corrected.
  flagReason String?
  decidedAt  DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([businessApplicationId])
}
```

There is **no `position` column**. A vehicle's 1-based row number is derived from `createdAt` ordering, not stored. There is **no compound `@@unique([businessApplicationId, vehicleId])`** either — `vehicleId @unique` covers it, and it is what lets the submit endpoint upsert per vehicle on a resubmission and preserve an existing `APPROVED` verdict instead of creating a second row.

***Two hand-appended partial unique indexes*** — the ones this task's exclusivity rules now lean on:

```sql
CREATE UNIQUE INDEX "driver_vehicle_assignment_live_vehicle_unique"
  ON "DriverVehicleAssignment"("vehicleId") WHERE "unassignedAt" IS NULL;
CREATE UNIQUE INDEX "driver_vehicle_assignment_live_driver_unique"
  ON "DriverVehicleAssignment"("driverProfileId") WHERE "unassignedAt" IS NULL;
```

Pre-existing and unchanged, but load-bearing here: `DriverLicence` has `driverProfileId @unique`, `licenceNumber`, `expiresAt`, `categories LicenceCategory[]` with `enum LicenceCategory { B C CE }`. `Vehicle` has `driverProfileId?` XOR `companyId?` enforced by the DB check constraint `vehicle_single_owner_check`, so a company vehicle physically cannot carry a `driverProfileId` — every driver↔vehicle pairing goes through `DriverVehicleAssignment`. `User.mustChangePassword` is `input: false` on the Better Auth additional field, settable only by a direct Prisma write.

`task-04` grows `src/lib/driver-onboarding/vehicle-classes.ts` to five classes and is the source of `findVehicleClass(classId).requiredLicenceCategory`: `SMALL_VAN` → B, `LARGE_VAN` → B, `MEDIUM_TRUCK` → C, `HEAVY_FREIGHT_TRUCK` → **C**, `TRAILER_TRUCK` → **CE**. This task reads that helper; it does not duplicate the mapping. `task-04` is a sibling in the same wave, so the two land together — if the five-class union is not yet present when this is implemented, still write the code against `findVehicleClass` and let `pnpm typecheck` be the join point.

## Files to Modify

- `src/app/api/logistics-company/drivers/register/route.ts` — accept and persist licence number, expiry and categories; pre-check the vehicle's required category before creating anything; return the driver's profile id and categories.
- `src/app/api/logistics-company/drivers/route.ts` — extend the roster `GET` with each driver's licence categories, expiry, and current live assignment.
- `src/app/api/logistics-company/vehicles/[id]/assignment/route.ts` — add the licence-category gate to `POST`, and handle a P2002 from the two new partial unique indexes gracefully on both verbs.

## Technical Details

### 1. `POST /api/logistics-company/drivers/register` — create the driver *with* a licence

Read the file before changing it. Everything below is an addition; nothing in its existing structure moves.

**The contract, stated once so nothing downstream has to guess:**

- Body: `{ email, firstName, lastName, phone, city, vehicleId?, licenceNumber, licenceExpiresAt, licenceCategories }`.
- **`email` is required.** It is not derived, not optional, and there is no "generated login" fallback. The route calls `auth.api.signUpEmail({ body: { email, name, password, role: "DRIVER" } })`, and Better Auth's email/password provider has nothing to create an account from without it. The existing parser already requires it and that check stays exactly as it is.
- The parser is **`parseRegisterDriverBody`** — the existing function, extended. Do not rename it and do not add a second parser beside it.
- A taken address is **`400 { error: "An account with that email address already exists." }`**, from the existing `mode: "insensitive"` `existingUser` pre-check that runs *before* `signUpEmail`. Not a 409 — the whole body is being rejected as unprocessable by the caller's own doing, and the existing route already answers 400 here. Keep it.
- 201 body:

```ts
{
  userId: createdUserId,
  driverProfileId: profile.id,
  name,
  email,
  phone,
  categories: licenceCategories,
  tempPassword,
  vehicleAssigned: vehicleId !== null,
}
```

`driverProfileId`, `phone` and `categories` are the three fields being added; the other five are today's shape and keep their exact names.

**The parts that must not change, and why:**

```ts
const TEMP_PASSWORD_CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TEMP_PASSWORD_LENGTH = 12;

function generateTempPassword(): string {
  return Array.from(
    { length: TEMP_PASSWORD_LENGTH },
    () => TEMP_PASSWORD_CHARSET[randomInt(TEMP_PASSWORD_CHARSET.length)],
  ).join("");
}
```

`randomInt` from `node:crypto`, not `Math.random`, because this value is a real credential until the driver changes it; the charset excludes visually ambiguous characters (`0`/`O`, `1`/`l`/`I`) because an admin reads it off-screen over the phone. **The prototype's 8-character `Math.random()` password (4 letters + 4 digits) is a design placeholder and must not be ported.** `requirements.md` says so explicitly.

```ts
const signUpResult = await auth.api.signUpEmail({
  body: { email, name, password: tempPassword, role: "DRIVER" },
});
```

**Never forward the incoming request's headers to `signUpEmail`.** Doing so makes Better Auth issue a session for the newly created driver and set its cookie on this response, silently signing the company out of its own account mid-wizard. `src/lib/auth.ts`'s `before` hook has an explicit `if (!ctx.request) return;` bail-out for exactly this headerless call — without it every company-created driver would be rejected by the host-split guard. Keep the existing `APIError` catch that surfaces Better Auth's own message verbatim with `error.statusCode ?? 400`, and rethrows anything that is not an `APIError`.

`mustChangePassword` is set by a **direct Prisma write inside the transaction** (`tx.user.update({ where: { id: createdUserId }, data: { mustChangePassword: true } })`), not through the sign-up payload, because the field is `input: false` on the Better Auth additional field and a client-supplied value would be ignored.

The `tempPassword` is returned **exactly once**, in the 201 body. It is never persisted in readable form. Do not log it, do not put it in an `AuditLog`, and do not include it in the error branch's `console.error`.

The transaction and its failure branch stay as they are, including the honest error message for the un-rollbackable `User`/`Account` rows: `"The driver account was created, but finishing setup failed. Contact support before retrying with the same email."` (500). The `existingUser` pre-check with `mode: "insensitive"` stays, returning `"An account with that email address already exists."` (400).

**The additions to `RegisterDriverInput`:**

```ts
type RegisterDriverInput = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: GeorgianCity;
  vehicleId: string | null;
  licenceNumber: string;
  /** Parsed and already known to be in the future. */
  licenceExpiresAt: Date;
  licenceCategories: LicenceCategory[];
};
```

New rules in `parseRegisterDriverBody`, appended after the existing ones and before the `vehicleId` check, each returning `{ error }` → 400:

| Field | Rule | Exact error string |
|---|---|---|
| `licenceNumber` | non-empty string after trimming | `licenceNumber is required and must be a non-empty string.` |
| `licenceExpiresAt` | a string that `new Date(value)` parses (`!Number.isNaN(date.getTime())`) | `licenceExpiresAt must be a valid ISO date.` |
| `licenceExpiresAt` | strictly after `new Date()` | `The licence expiry date must be in the future.` |
| `licenceCategories` | an array with at least one entry | `licenceCategories must be an array with at least one category.` |
| `licenceCategories` | every entry a valid `LicenceCategory` | `` licenceCategories must contain only: ${LICENCE_CATEGORIES.join(", ")}. `` |

Add `const LICENCE_CATEGORIES = Object.values(LicenceCategory);` next to the file's existing `GEORGIAN_CITIES`. De-duplicate the categories with a `Set` before storing — a repeated `"C"` is a UI slip, not an error worth a 400.

**The category pre-check.** `vehicleId` is optional (absent, `null` or `""` all mean "no vehicle yet"). When one *is* given, the existing block already verifies company ownership (`"That vehicle was not found in your fleet."`, 400 — reported as not-found rather than not-yours so a company cannot enumerate a competitor's fleet) and that it has no live assignment (`"This vehicle is already assigned to another driver."`, 400). Extend that same `select` to pull `vehicleClass` and add the gate:

```ts
const required = requiredCategoryForVehicle(vehicle);
if (required !== null && !licenceCategories.includes(required)) {
  return NextResponse.json(
    {
      error: `This vehicle needs category ${required}. Assign a different driver or vehicle.`,
    },
    { status: 400 },
  );
}
```

That string is the design's verbatim copy, with the real category interpolated. It is checked **before** `signUpEmail` runs, so a category mismatch never leaves a half-created account behind — the same reasoning the file's existing comment gives for checking ownership and availability up front.

**The `DriverLicence` write** goes inside the existing `prisma.$transaction`, immediately after the `driverProfile.create` that yields `profile.id`, and before the optional assignment insert:

```ts
await tx.driverLicence.create({
  data: {
    driverProfileId: profile.id,
    licenceNumber,
    expiresAt: licenceExpiresAt,
    categories: licenceCategories,
  },
});
```

One transaction, so a driver never lands on the roster without the licence that makes them assignable — which is the whole point of this change.

The transaction must **return `profile.id`** (`const { profileId } = await prisma.$transaction(...)` or equivalent), because the 201 body now carries it. Today the callback returns nothing and `profile` is scoped inside it.

#### `DriverProfile.activatedAt` is set to `new Date()` at creation. This is not optional.

The existing route already does this and the line **stays**. Say it loudly in the route comment, because it looks like a security hole and is not:

- A company-created driver **never sees the driver onboarding wizard**. They have no `DriverApplication`, they never submit one, and no admin ever reviews one. `activatedAt` is written by exactly one other thing in this codebase — the driver-application approval path — and that path will never run for this account. **Leaving `activatedAt` null therefore means null forever**: the driver can never go online, never see open orders, never accept one, and there is no screen anywhere that would let them or their company fix it. It is a permanent, silent lockout of every driver a fleet registers.
- Activating here is **not** a bypass of fleet review, because `activatedAt` on the *driver* is not what gates dispatch for a fleet. **`task-21`'s fleet gate is** — it reads `LogisticsCompany.activatedAt` (written only by `task-18`'s admin activate endpoint) and `Vehicle.applicationVehicle.status`, and refuses dispatch for an unapproved fleet regardless of how many activated drivers sit on its roster. An activated driver on an unactivated company still cannot be dispatched. The two timestamps answer different questions and only the company one is a review verdict.

The real route already writes `activatedAt: new Date()` with a comment giving this same reasoning. Do not "fix" it to null — a null here is a permanent, silent lockout, since a company driver has no wizard, no application and no approval path that would ever set it.

#### P2002 from the new partial unique indexes, inside this transaction

The optional `tx.driverVehicleAssignment.create` at the end of the transaction can now hit `driver_vehicle_assignment_live_vehicle_unique` — the vehicle's availability was checked before `signUpEmail` ran, and another request can claim it in between. (The driver-side index cannot fire here: the `DriverProfile` was created microseconds earlier in this same transaction and no other row can reference it.)

Today that surfaces as the transaction's catch-all 500 with `"The driver account was created, but finishing setup failed. Contact support before retrying with the same email."` — which is honest but tells the admin nothing about what actually happened, and sends them to support for a race they could resolve themselves. Discriminate it: catch a `P2002` naming `vehicleId` / `driver_vehicle_assignment_live_vehicle_unique` and answer `400 { error: "This vehicle is already assigned to another driver." }` — the **same verbatim string** the pre-check produces, for the same reason the assignment route gives in section 3b. Match the index name *or* the column list, both shapes, exactly as `isDuplicatePhoneError` does in `api/logistics-company/route.ts`.

The account has still been created at that point, so the message must not imply the whole request was rejected — append the existing route's honesty about the un-rollbackable `User`/`Account` rows, or keep the 400 and note in the route comment that the driver now exists unassigned and can be assigned from step 4. Either is acceptable; silently returning a 500 is not. `console.error` the P2002 before responding so the race stays observable.

Every other failure in that transaction keeps the existing 500 and its existing message verbatim.

### 2. `GET /api/logistics-company/drivers` — roster with eligibility

**The response is a bare JSON array — today's shape — and stays one.** `NextResponse.json(profiles.map(toRosterEntry), { status: 200 })`. It is **not** `{ drivers: [...] }`, not `{ data: [...] }`, and there is no envelope, count or pagination wrapper. Every consumer (`task-13`'s step-4 roster) reads `await response.json()` as an array directly. Wrapping it would be a breaking change to an existing endpoint for no gain, and the empty case is `[]`, not `{ drivers: [] }`.

The route already returns `{ userId, driverProfileId, name, email, phone, city, isOnline }` per entry, scoped to `companyId`, ordered by `createdAt asc`, and answers `[]` (200) for a company with no profile yet. Keep all of that. Extend `ROSTER_PROFILE_SELECT` and `RosterEntry` so the UI can compute eligibility without a second call — the entry shape becomes exactly `{ userId, driverProfileId, name, email, phone, city, isOnline, categories, licenceExpiresAt, currentAssignment }`:

```ts
type RosterEntry = {
  userId: string;
  driverProfileId: string;
  name: string;
  email: string;
  phone: string;
  city: GeorgianCity;
  isOnline: boolean;
  /** Empty when the driver has no licence on file — an older company-created
   *  account, predating licence capture. Such a driver is ineligible for every
   *  vehicle, which is correct rather than a bug to work around. */
  categories: LicenceCategory[];
  /** ISO, or null when there is no licence row. */
  licenceExpiresAt: string | null;
  /** The vehicle this driver currently holds, or null. Drives the design's
   *  "on 34 ABC 128" ineligibility note. */
  currentAssignment: {
    vehicleId: string;
    plateNumber: string;
  } | null;
};
```

Selected as `licence: { select: { categories: true, expiresAt: true } }` and `assignments: { where: { unassignedAt: null }, take: 1, select: { vehicle: { select: { id: true, plateNumber: true } } } }`, flattened by `toRosterEntry` exactly as the existing fields are. `take: 1` is safe now that the partial unique index guarantees at most one live row.

The route stays a plain list. Eligibility is *presented* by `task-13` (an ineligible row sits at 0.55 opacity with a red note, per the design) and *enforced* by the assignment route below — this endpoint hands over the facts, it does not filter.

### 3. `POST /api/logistics-company/vehicles/[id]/assignment` — the category gate

The route's existing structure stays: session → 401; `role !== "COMPANY"` → `403 { error: "Only logistics companies can assign vehicles." }`; JSON parse → 400; `parseAssignBody` requiring `driverUserId` (the driver's `User.id`, not their `DriverProfile.id`) → `{ error: "driverUserId is required." }`; company lookup, with a missing company reported as `404 { error: "Vehicle not found." }`; then one `prisma.$transaction` holding both exclusivity checks and the insert. Every lookup stays scoped to the caller's own company so another fleet's vehicle or another roster's driver is a 404, never a 403 — a 403 would confirm the id exists and let a caller enumerate a competitor's fleet and staff.

Two things change.

**a. The gate itself.** Extend the in-transaction `vehicle.findFirst` select with `vehicleClass: true`, and the `driverProfile.findFirst` select with `licence: { select: { categories: true } }`. After the driver is found and before the driver-side exclusivity check:

```ts
const required = requiredCategoryForVehicle(vehicle);
if (required !== null) {
  const held = driverProfile.licence?.categories ?? [];
  if (!held.includes(required)) {
    return {
      error: `This vehicle needs category ${required}. Assign a different driver or vehicle.`,
      status: 400,
    } as const;
  }
}
```

The same verbatim string as the register route, so a company sees one message for one rule regardless of which door it came through. A driver with **no licence row** holds no categories and therefore fails the gate — correct, and the reason licence capture had to come first.

`requiredCategoryForVehicle` is a small shared helper (duplicate it in both routes rather than inventing a `lib` module for six lines, matching how `findVehicleClassNameBySpecCode` is already duplicated across three admin/onboarding routes):

```ts
/**
 * The licence category a vehicle's class requires, or `null` when the class is
 * unknown. `Vehicle.vehicleClass` is nullable because rows written before this
 * feature have none — for those, the gate does not apply and the assignment is
 * allowed through. Refusing them instead would make every pre-existing fleet
 * vehicle permanently unassignable, which is a worse failure than the gate not
 * covering rows that predate the column.
 */
function requiredCategoryForVehicle(vehicle: {
  vehicleClass: VehicleClass | null;
}): LicenceCategory | null {
  return vehicle.vehicleClass
    ? findVehicleClass(vehicle.vehicleClass).requiredLicenceCategory
    : null;
}
```

`VehicleClass` (the Prisma enum) and `VehicleClassId` (the taxonomy's literal union) hold identical members, so `findVehicleClass` accepts the column value directly.

**b. P2002 from the new partial unique indexes.** The existing in-transaction pre-checks stay — they are what produce the good error messages:

- vehicle already taken → `"This vehicle already has an active assignment. Unassign it first."` (400)
- driver already holds one → `"This driver already has an active vehicle assignment. Unassign it first."` (400)

What changes is the honesty of the comment above them. Today the file explains at length that these rules have **no database constraint behind them** and that under READ COMMITTED the transaction narrows the race rather than closing it. `task-01`'s two partial unique indexes close it: the database now physically rejects a second live row for the same `vehicleId` or the same `driverProfileId`. Rewrite that comment to say so — and note that the pre-checks are kept anyway, because they are what turns "unique constraint violated" into a sentence a company can act on.

The code must then handle the losing side of the race gracefully instead of throwing a 500. Wrap the `create` and map a `P2002` back onto the same message and status the pre-check would have produced, discriminated by the index name:

```ts
// Postgres reports either the column list (an array) or the index name (a
// string), so both shapes are handled — the same technique
// `isDuplicatePhoneError` uses in `api/logistics-company/route.ts`.
function liveAssignmentConflict(error: unknown): "VEHICLE" | "DRIVER" | null
```

matching `driver_vehicle_assignment_live_vehicle_unique` / `vehicleId` → `"VEHICLE"`, and `driver_vehicle_assignment_live_driver_unique` / `driverProfileId` → `"DRIVER"`. Return the identical 400 and identical string as the corresponding pre-check: from the company's point of view the outcome is the same ("someone already has it"), and giving one condition two different messages depending on which microsecond it happened in would be a worse API. `console.error` the P2002 before responding, so the race staying observable does not depend on anyone noticing a status-code change.

**`DELETE`** (unassign) needs no logic change — it closes the vehicle's live assignment by stamping `unassignedAt` rather than deleting the row, so the vehicle keeps a record of who drove it and when. Two small updates: its `orderBy: { assignedAt: "desc" }, take: 1` defensive ordering can keep its comment, but note that the partial index now guarantees the single-row invariant it was hedging against; and its `"This vehicle has no active assignment."` (404) stays.

### 4. Where this rule is enforced, and where it is not

Three places must agree, and the wording above is shared by all of them:

1. **This task's register route** — pre-checked before account creation.
2. **This task's assignment route** — the enforcement point for the live fleet.
3. **`task-14`'s submit endpoint** — which writes the *initial* `DriverVehicleAssignment` rows, because the `Vehicle` rows do not exist until submit (`plateNumber` is globally unique and an abandoned draft must never permanently claim a real plate). It re-runs the same gate against the validated draft.

The draft records **intent only** and is not an enforcement point. In `FleetDraftV1` (`src/lib/fleet-onboarding/draft-schema.ts`, `task-05`) the pairing lives as **`driverProfileId` on the vehicle itself** — `draft.vehicles[i].driverProfileId`. **There is no `draft.assignments` section and no `FleetDraftAssignment` type**; any task file referring to one is out of date. `task-13`'s UI greys ineligible roster rows, which is presentation. Neither may be trusted by the server.

## Acceptance Criteria

- [ ] `POST /drivers/register` still requires `email` (validated by `parseRegisterDriverBody`, unchanged), and a duplicate address is still `400 { error: "An account with that email address already exists." }` from the pre-check that runs before `signUpEmail`.
- [ ] `POST /drivers/register` requires `licenceNumber`, a parseable `licenceExpiresAt` in the future, and a non-empty `licenceCategories` array of valid `LicenceCategory` values, each with its exact error string above and a 400.
- [ ] Its 201 body is exactly `{ userId, driverProfileId, name, email, phone, categories, tempPassword, vehicleAssigned }`, and the transaction returns the profile id the body needs.
- [ ] A successful registration creates the `DriverLicence` row inside the same transaction as the `DriverProfile`, so neither can exist without the other.
- [ ] `DriverProfile.activatedAt` is set to `new Date()` at creation, and the route comment explains why (no driver wizard for a company driver; `task-21`'s fleet gate is the real dispatch block).
- [ ] A P2002 on `driver_vehicle_assignment_live_vehicle_unique` from the register route's optional assignment insert produces the same 400 and the same `"This vehicle is already assigned to another driver."` message as its pre-check, not a bare 500.
- [ ] When `vehicleId` is supplied and the vehicle's class requires a category the driver's licence does not list, the request is rejected with `This vehicle needs category <CAT>. Assign a different driver or vehicle.` **before** any account is created.
- [ ] The temp password still comes from the `node:crypto` `randomInt` generator over the 56-character charset at length 12, is returned exactly once in the 201 body, and appears in no log line.
- [ ] `auth.api.signUpEmail` is still called without forwarding request headers, and `mustChangePassword` is still set by a direct Prisma write.
- [ ] `GET /drivers` still responds with a **bare JSON array**, not `{ drivers: [...] }`, and returns `categories`, `licenceExpiresAt` and `currentAssignment` per entry alongside the seven existing fields; a company with no profile still gets `[]`.
- [ ] `POST /vehicles/[id]/assignment` refuses a driver whose categories do not cover the vehicle's class, with the same verbatim message, and refuses a driver with no licence row at all.
- [ ] `POST /vehicles/[id]/assignment` still refuses a vehicle that already has a live assignment and a driver who already holds one, and now also converts a P2002 on either partial unique index into the same 400 and message rather than a 500.
- [ ] Another company's vehicle or another roster's driver is still reported as 404, never 403.
- [ ] The stale comment claiming `DriverVehicleAssignment` has no database constraint behind its exclusivity rules is corrected in every place it appears in the touched files.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- **Never forward request headers to `auth.api.signUpEmail`.** This is the single most breakable thing in this task: forwarding them signs the company out of its own account halfway through step 4, and the failure looks like an unrelated session bug. `action-required.md` carries a manual verification step for exactly this — create a driver from step 4 and confirm you are still signed in as the company afterwards.
- `mustChangePassword` cannot be set through the sign-up payload: it is `input: false` on the Better Auth additional field, so a value passed there is silently dropped. The direct Prisma write is not a stylistic choice.
- The temp password is a real credential. Returned once, never persisted readably, never logged — including in the transaction's failure branch, which logs the error only.
- Driver **invitations are out of scope** (`requirements.md`, Non-Goals): there is no email or SMS infrastructure in this codebase, so v1 is roster-pick and create-account-now only. The design's third tab, the `Invited` vehicle status and the "invitation sent · licence pending" driver state are removed, not stubbed. Do not add an `invited` flag "for later".
- The design's temp-password note card is kept verbatim by `task-13`: "Shown once when you save, for you to pass on. The driver must change it at first sign-in and upload their own licence photos before their first order." The first clause is enforced (`mustChangePassword`); the second is not — company vehicle and licence document upload is an explicit v1 non-goal, so no code blocks a first order on a missing licence photo. That gap is deliberate and worth a line in the route comment so nobody assumes an enforcement path exists.
- Existing company-created drivers have no `DriverLicence` row and will read back with `categories: []`, making them ineligible for every vehicle. That is the correct answer to "does this driver's licence cover Category C?" when no licence is on file. A company fixes it by creating the licence details; a backfill is an ops question, not a code path built here.
- **`DriverProfile.activatedAt` is written at creation and stays that way.** It is the single most likely thing for a reviewer to flag as wrong and revert. It is not a review bypass: `task-21` gates dispatch on `LogisticsCompany.activatedAt` (set only by `task-18`'s activate endpoint) and on each vehicle's `applicationVehicle.status`, so a fleet under review dispatches nothing no matter what its drivers' profiles say. Null here would be permanent, because nothing in the company path ever writes it later.
- This task is written against the three routes as they actually exist on disk. If you ever see these endpoints described differently — `{ drivers: [...] }`, a derived login instead of a required `email`, a null `activatedAt`, or a 409 for a duplicate account — that description is wrong. Verify against the real route before changing anything here.
