# Task 06: Company Details API — Legal Entity, Contact Person and Payout Account

## Status

pending

## Wave

2

## Description

`POST /api/logistics-company` today accepts four fields — `companyName`, `vatId`, `phone`, `city` — and upserts them onto the signed-in company's `LogisticsCompany` row, keyed on `userId`. Step 1 of the fleet wizard collects six more: registered address, one or more cities of operation, a contact person's name, role and email, and a payout IBAN. This task extends that one route to accept and persist all ten, with the design's validation bounds enforced server-side.

**This route stays `POST /api/logistics-company`, an upsert keyed on `userId`, returning `201` with the row.** It is an existing file being extended, not a new endpoint. There is no `PUT`, no `/onboarding/company` variant, and no second write path — see the note in *Files to Modify*.

The server is authoritative. `task-10` runs the same rules in the browser to produce inline field messages, but every one of them is re-checked here: the browser copy exists so a company sees which field is wrong before it round-trips, not so this route can trust it. A request that skips the UI entirely must be rejected with the same rules.

Two design decisions are settled here rather than deferred, because both are load-bearing for flows other tasks own:

1. **Which fields are required.** The four original fields are required on *every* call; the six new ones are validated only when the caller sends them. Section 2 gives the full reasoning.
2. **Clearing a company-level flag.** This route is the only thing that clears `companyFlagReason`, and without that write the `ACTION_REQUIRED` correction loop deadlocks. Section 6 specifies it.

## Dependencies

**Depends on:** task-01-schema-migration.md
**Blocks:** task-10-step1-company-details.md

**Context from dependencies:**

`task-01` adds all of the following to `prisma/schema.prisma` in one migration:

*`LogisticsCompany` gains seven columns* — five nullable detail columns and a `GeorgianCity[]` array filled in by this route, plus an activation timestamp — and the back-relation to its application. All are nullable or array-defaulted because the row is created at sign-up by `task-08` before the wizard runs, and because production already holds company rows that predate this feature:

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

Its existing columns are untouched: `id`, `userId @unique` (1:1 with `User` — one login per company), `companyName`, `vatId` (String, **not** unique — two entities can legitimately share nothing here, and the registry check is a human step), `phone @unique`, `city GeorgianCity`, `drivers`, `vehicles`, `orders`.

Note that `citiesOfOperation` is a Postgres enum **array** with no default in Prisma terms; an unset array reads back as `[]`, never `null`.

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

There is **no `position` column**. A vehicle's 1-based row number is derived from `createdAt` ordering, not stored. There is **no compound `@@unique([businessApplicationId, vehicleId])`** either — `vehicleId @unique` already covers it, and it is what lets the submit endpoint upsert per vehicle on a resubmission and preserve an existing `APPROVED` verdict instead of creating a second row.

*Two hand-appended partial unique indexes* closing the `DriverVehicleAssignment` exclusivity race:

```sql
CREATE UNIQUE INDEX "driver_vehicle_assignment_live_vehicle_unique"
  ON "DriverVehicleAssignment"("vehicleId") WHERE "unassignedAt" IS NULL;
CREATE UNIQUE INDEX "driver_vehicle_assignment_live_driver_unique"
  ON "DriverVehicleAssignment"("driverProfileId") WHERE "unassignedAt" IS NULL;
```

The `GeorgianCity` enum (63 values) is pre-existing and unchanged. Its browser-safe mirror with region labels is `GEORGIAN_CITY_OPTIONS` in `src/lib/georgian-cities.ts`, deliberately duplicated so `@prisma/client` stays out of the client bundle — `task-10`'s city picker reads that, this route reads `Object.values(GeorgianCity)`.

## Files to Modify

- `src/app/api/logistics-company/route.ts` — extend `CreateLogisticsCompanyInput` and `parseCreateLogisticsCompanyBody` with the six new fields plus tightened rules on the four existing ones, persist the supplied ones in the existing `upsert`, and clear a company-level flag in the same transaction (section 6).

**Do not create `src/app/api/logistics-company/onboarding/company/route.ts`.** That file does not exist and must not be added. Step 1 of the wizard posts to this route. One company-details write path, one set of rules, one place a flag gets cleared — a second endpoint would fork all three.

## Technical Details

### 1. What the route already does, and what stays

Read the file first. Its shape is not changing:

- `GET` — session → `401 { error: "Unauthorized." }`; `role !== "COMPANY"` → `403 { error: "Only logistics companies have a company profile." }`; then `findUnique({ where: { userId } })` and return the row, or a bare `null` when the profile does not exist yet (a valid state, not an error). The new columns come back with it automatically. **No change needed to `GET`** beyond confirming the response now carries the six new fields.
- `POST` — the same session and role guards (its 403 message differs and stays as it is: `"Only logistics companies can create a company profile."`), then `await request.json()` in a try/catch → `400 { error: "Request body must be valid JSON." }`, then `parseCreateLogisticsCompanyBody` checked with `if ("error" in parsed)` → 400, then an **upsert keyed on `userId`** so retries and re-submits are idempotent rather than an error.
- `isDuplicatePhoneError(error)` → `409 { error: "This phone number is already registered to another account." }`. **Keep this exactly as it is.** It inspects `error.meta?.target` for both the array and string shapes so a P2002 on `userId` (possible when two writes for the same session race) is not mislabelled as a phone conflict. `LogisticsCompany.phone` is `@unique` — one account per number — and that is unchanged.
- `nonEmptyString(value: unknown): string | null` — trims and returns the value only if it is a non-empty string. Reuse it; do not write a second trimming helper.

**No validation library.** The project deliberately uses none; every rule below is a hand-rolled check inside `parseCreateLogisticsCompanyBody`, returning `{ error: string }` on the first problem encountered.

### 2. The extended input type, and which fields are required

```ts
type CreateLogisticsCompanyInput = {
  /** The four originals. Required on every call. */
  companyName: string;
  vatId: string;
  phone: string;
  city: GeorgianCity;
  /**
   * The six wizard fields. `undefined` means "the caller did not send this",
   * which is a valid request and leaves the stored column untouched. A field
   * that *is* sent is fully validated — there is no half-accepted value.
   */
  registeredAddress?: string;
  citiesOfOperation?: GeorgianCity[];
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  bankAccountIban?: string;
};
```

**The four original fields are required on every call. The six new fields are validated only when the caller sends them.** This is a decision, not a gap, and it must not be "tightened" later:

- `task-08`'s sign-up form posts exactly four fields (`companyName`, `vatId`, `phone`, `city`) immediately after Better Auth creates the COMPANY account, because that is all the registration form collects. If this route required all ten, that call would 400, no `LogisticsCompany` row would ever be written, and **no company could reach the wizard at all** — the six fields the wizard collects would be unreachable because the wizard itself would be unreachable. The strictest possible route here is the one that makes the feature impossible.
- Step 1 of the wizard (`task-10`) posts all ten to this same route. Because the route is an upsert keyed on `userId`, that second call fills in the six columns the sign-up call left null. Same endpoint, same rules, one row.
- **Completeness before submit is `task-14`'s job, not this route's.** `POST /api/logistics-company/onboarding/submit` is the gate that refuses to move an application to `PENDING` while any of the ten is missing. That is the correct place for it: "is this company's profile finished?" is a question about the *application*, asked once, at the moment it matters — not a question this route can answer, since it legitimately serves a two-field-stage-of-life account and a complete one through the same door.

Absent, `null` and `undefined` are all "not sent" for the six. An **empty string is not** — a caller that sends `registeredAddress: ""` is sending the field and gets that field's 400. This keeps "I omitted it" and "I sent something invalid" distinguishable, so the wizard cannot silently blank a column it meant to fill.

A logistics company still has no account-type variants — the comment already in the file saying so holds for the four originals. Extend it rather than deleting it; do not let it claim all ten are unconditionally required.

### 3. The rules, in order, with their exact error strings

Validate in this order so the message a client gets is deterministic. Each returns `{ error: "…" }` and becomes a `400 { error }`.

Rules 1, 2, 10 and 11 (the four originals) run on every request. Rules 3 through 9 run **only when their field is present**; when it is absent the rule is skipped and nothing is written for that column.

| # | Field | When | Rule | Exact error string |
|---|---|---|---|---|
| 0 | body | always | must be a non-null object | `Request body must be a JSON object.` |
| 1 | `companyName` | always | non-empty string, **≥ 3 characters after trimming** | `companyName is required and must be at least 3 characters.` |
| 2 | `vatId` | always | non-empty string, **exactly 9 characters, all ASCII digits** (`/^\d{9}$/` on the trimmed value) | `vatId must be exactly 9 digits.` |
| 3 | `registeredAddress` | if present | non-empty string after trimming | `registeredAddress is required and must be a non-empty string.` |
| 4 | `citiesOfOperation` | if present | an array with **at least one** entry | `citiesOfOperation must be an array with at least one city.` |
| 5 | `citiesOfOperation` | if present | **every** entry a valid `GeorgianCity` value | `` citiesOfOperation must contain only valid cities: ${GEORGIAN_CITIES.join(", ")}. `` |
| 6 | `contactName` | if present | non-empty string that splits on whitespace into **at least two** non-empty parts | `contactName must be a full name — a first name and a surname.` |
| 7 | `contactRole` | if present | non-empty string after trimming | `contactRole is required and must be a non-empty string.` |
| 8 | `contactEmail` | if present | non-empty string matching the email shape below | `contactEmail must be a valid email address.` |
| 9 | `bankAccountIban` | if present | non-empty string, **≥ 18 characters after stripping all whitespace** | `bankAccountIban must be at least 18 characters.` |
| 10 | `phone` | always | non-empty string containing **10 to 15 digits** | `phone must contain between 10 and 15 digits.` |
| 11 | `city` | always | a valid `GeorgianCity` value | `` city must be one of: ${GEORGIAN_CITIES.join(", ")}. `` |

The error strings are unchanged between the two cases — a field that *is* sent is held to exactly the same rule whether it arrives from sign-up or from step 1. "If present" governs only whether the rule runs at all. Express it as a single guard per field, e.g.:

```ts
// `undefined` and `null` both mean "the caller did not send this field", which
// is valid: the sign-up form (task-08) creates the row with four fields and
// step 1 of the wizard (task-10) fills in the rest through this same upsert.
// An empty string is *not* "not sent" — it is a sent value that fails the rule.
if (record.registeredAddress !== undefined && record.registeredAddress !== null) {
  const registeredAddress = nonEmptyString(record.registeredAddress);
  if (registeredAddress === null) {
    return { error: "registeredAddress is required and must be a non-empty string." };
  }
  data.registeredAddress = registeredAddress;
}
```

`GEORGIAN_CITIES` is the existing module constant, `Object.values(GeorgianCity)` — it is already in the file.

The email check is a shape check, not a deliverability check. Define it once as a module constant next to `GEORGIAN_CITIES`:

```ts
/**
 * Shape check only — one `@`, something either side, and a dot in the domain.
 * Deliberately loose: a stricter pattern rejects valid addresses far more often
 * than it catches invalid ones, and whether the address actually receives mail
 * is a question no regex can answer. The reviewer contacting this person is the
 * real verification step (see the "Contact person unreachable" flag reason).
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

Digit counting for `phone`, `vatId` and the IBAN length must all operate on a normalised copy, not the raw input:

```ts
/** Digits only, for a length check that ignores spaces, dashes and brackets. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** All whitespace removed, for the IBAN length check the design specifies. */
function stripWhitespace(value: string): string {
  return value.replace(/\s+/g, "");
}
```

### 4. What is persisted, and in what form

The `upsert` keeps its shape — `where: { userId: session.user.id }`, with `create` carrying `userId` plus the validated fields and `update` carrying the same — and gains the six new columns in both branches.

**Only fields the caller actually sent are written.** Build the create/update payloads from the parsed input, spreading the optional six in conditionally rather than writing `undefined` for them. Prisma treats an explicit `undefined` in an `update` as "leave this column alone", so spreading is belt-and-braces; being explicit about it is what stops a later reader "simplifying" it into an unconditional write that would blank six columns on every four-field sign-up POST. Normalisation on the way in, for each field that is present:

- `companyName`, `registeredAddress`, `contactName`, `contactRole` — stored trimmed, otherwise verbatim. Do not title-case or otherwise rewrite a legal name.
- `vatId` — stored as the trimmed 9-digit string.
- `contactEmail` — stored trimmed and **lowercased**. Addresses are compared case-insensitively everywhere else in this codebase (see the `mode: "insensitive"` lookups in the driver-registration and admin-user routes); storing one casing avoids the same row looking like two.
- `bankAccountIban` — stored **whitespace-stripped and uppercased**. IBANs are conventionally written in groups of four for legibility and that grouping carries no information; storing one canonical form is what makes "is this the same account?" answerable. The UI is free to re-group it for display.
- `citiesOfOperation` — stored **de-duplicated, in the order the client sent them**, as a `GeorgianCity[]`. Deduplicate with a `Set` rather than rejecting duplicates: a repeated city is a UI slip, not an attack, and silently collapsing it is what a company expects. Order is preserved because the chips render in selection order.
- `phone` — stored **trimmed, exactly as typed**, unchanged from today's behaviour. Do *not* normalise it to digits-only here even though the validation counts digits: `phone` is `@unique`, existing rows hold whatever formatting they were created with, and normalising new writes would let a newly-canonical value collide with an existing differently-formatted row for the same number, or fail to collide when it should. Making the column canonical needs a backfill migration, and that is not this feature's to own.
- `city` — the `GeorgianCity` value as validated. It stays the company's **primary/registered** city and is retained precisely so nothing that already reads `LogisticsCompany.city` breaks; it is not folded into `citiesOfOperation`, and it is not required to appear in it (a company may be registered in one city and operate out of another).

Response stays **`201`** with the created/updated row, as today. It is 201 on both branches of the upsert — that is the route's existing behaviour and nothing here changes it; do not "correct" it to 200 on update.

### 5. The server is authoritative

Say so in the route's doc comment. `task-10`'s step-1 form computes the same rules as a pure function every render and shows them inline as `<p className="text-xs text-destructive">` on the first failed Continue — that exists so the company sees which field is wrong without a round trip, and its copy is written for a person ("Enter the company's full registered name") rather than for a developer. The strings in the table above are the backstop a hand-rolled request hits, and are what `readErrorMessage(response, fallback)` surfaces if the client's own check ever falls out of step with this one. Neither list may be deleted in favour of the other.

### 6. Clearing a company-level flag — the write that unblocks the correction loop

This route also **clears a company-level flag**, in the same transaction as the upsert.

**Why it has to live here.** The `ACTION_REQUIRED` correction loop is a three-way handshake and this is its missing third:

- `task-18`'s admin review flags the company block: `companyReviewStatus: "FLAGGED"`, `companyFlagReason: <one of the four closed-list reasons>`, and `task-18`'s request-changes moves the application to `ACTION_REQUIRED`.
- `task-15`'s status screen shows the flagged company card and sends the company back to step 1 to fix its details — and step 1 posts **here**.
- `task-14`'s resubmit **refuses while `companyFlagReason !== null`**, because a company that resubmits without touching the flagged detail should not re-enter the queue unchanged.

If nothing clears `companyFlagReason`, those three lock: the company fixes its details, the flag is still set, resubmit refuses, and the application can never leave `ACTION_REQUIRED`. There is no other code path that writes `companyFlagReason: null` — no admin action does it, and `task-14` reads it rather than clearing it. **This route is the only place the loop can be unblocked, because posting corrected details is the only event that means "the company has responded to the flag".** Any earlier text in this task saying "nothing here touches `BusinessApplication`" is wrong and has been removed.

**The exact rule.** After the upsert succeeds, inside the same `prisma.$transaction`:

```ts
// Read the caller's own application row by the company id the upsert returned.
// A company with no application row yet (created at sign-up, wizard not yet
// started — the BusinessApplication is allocated lazily by task-05's GET) has
// nothing to clear, and that is the common case for the sign-up call.
const application = await tx.businessApplication.findUnique({
  where: { companyId: logisticsCompany.id },
  select: { id: true, status: true, companyFlagReason: true },
});

if (
  application !== null &&
  application.status === "ACTION_REQUIRED" &&
  application.companyFlagReason !== null
) {
  await tx.businessApplication.update({
    where: { id: application.id },
    data: {
      companyReviewStatus: CompanyReviewStatus.PENDING,
      companyFlagReason: null,
    },
  });
}
```

Both conditions are required, and the write is a **no-op in every other state**. Spelled out, because "clear the flag whenever details are saved" is the tempting wrong version:

| Application state | What this route does |
|---|---|
| No `BusinessApplication` row at all | Nothing. The sign-up call and any pre-wizard POST land here. |
| `DRAFT` | Nothing. There is no verdict yet — `companyReviewStatus` is still its `PENDING` default and `companyFlagReason` is null, so there is nothing to clear and no queue state to disturb. |
| `PENDING` (under review) | **Nothing.** An admin may be looking at this row right now; silently resetting `companyReviewStatus` mid-review would discard a verdict in flight. `task-05`'s `PATCH` already refuses draft edits in this state for the same reason. |
| `ACTION_REQUIRED`, `companyFlagReason === null` | Nothing. Only vehicles were flagged; the company block was never the problem, and `companyReviewStatus` may legitimately already be `VERIFIED` — clearing it back to `PENDING` would throw away a verdict the admin does not need to make twice. |
| `ACTION_REQUIRED`, `companyFlagReason !== null` | **Clear it:** `companyReviewStatus: "PENDING"`, `companyFlagReason: null`. |
| `APPROVED` | Nothing. The application is decided. |

Notes on the write itself:

- `companyReviewStatus` goes to **`PENDING`**, never to `VERIFIED`. The company corrected its own details; only an admin decides they are now correct. `PENDING` is exactly "back in the queue, awaiting a verdict".
- The enum is `CompanyReviewStatus` — **never** `BusinessCompanyReviewStatus`. There is no `companyVerifiedAt` column; the verdict lives entirely in `companyReviewStatus`.
- **The application's `status` is not touched.** It stays `ACTION_REQUIRED` until `task-14`'s submit moves it to `PENDING`. This route clears the *blocker*; the company still has to press Resubmit, and vehicle-level flags may still be outstanding. Moving `status` here would put a half-corrected application back in the queue behind the company's back.
- One transaction with the upsert, so a company can never end up with corrected details and a stale flag, or a cleared flag and un-saved details. Wrap both in `prisma.$transaction(async (tx) => { … })` and keep the existing P2002/`isDuplicatePhoneError` catch **outside** it, around the whole call, so a duplicate phone still rolls the transaction back and still answers `409 { error: "This phone number is already registered to another account." }`.
- Nothing here touches `BusinessApplicationVehicle`. A flagged *vehicle* is corrected through `PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]` (`task-14`), which clears that row's own `status` / `flagReason` / `decidedAt`. Two flag kinds, two correction doors, no overlap.

## Acceptance Criteria

- [ ] `POST /api/logistics-company` accepts and persists `registeredAddress`, `citiesOfOperation`, `contactName`, `contactRole`, `contactEmail` and `bankAccountIban` alongside the four existing fields, in both the `create` and `update` branches of the upsert, and returns **201**.
- [ ] A POST carrying **only** `companyName`, `vatId`, `phone` and `city` succeeds and creates the row — this is `task-08`'s sign-up call and it must not 400.
- [ ] A follow-up POST carrying all ten updates the same row (upsert on `userId`) and fills in the six columns the first call left null; the four-field call is not required to blank them.
- [ ] Each of the six optional fields, when sent, is validated by its rule with its exact error string; when omitted (absent or `null`) the rule is skipped and the stored column is untouched. An empty string is a sent value and is rejected, not treated as omitted.
- [ ] Every rule in the table above is enforced with its exact error string and a 400, in the listed order.
- [ ] `citiesOfOperation`, when sent, rejects an empty array, a non-array, and any entry that is not a `GeorgianCity` value; a valid array is stored de-duplicated in the order sent.
- [ ] `vatId` accepts exactly nine digits and rejects eight, ten, and any value containing a non-digit.
- [ ] `bankAccountIban` accepts a value that reaches 18 characters only after its spaces are stripped, and is stored whitespace-free and uppercased.
- [ ] `contactEmail` is stored lowercased; `contactName` requires two whitespace-separated parts when sent.
- [ ] When the caller's `BusinessApplication` is `ACTION_REQUIRED` **and** `companyFlagReason !== null`, the same transaction sets `companyReviewStatus: "PENDING"` and `companyFlagReason: null`.
- [ ] That clearing write is a no-op when there is no application row, and when the application is `DRAFT`, `PENDING` or `APPROVED`, and when it is `ACTION_REQUIRED` with a null `companyFlagReason`.
- [ ] The application's own `status` is never written by this route; it stays `ACTION_REQUIRED` for `task-14`'s submit to move.
- [ ] `src/app/api/logistics-company/onboarding/company/route.ts` does not exist and was not created; no `PUT` handler was added anywhere.
- [ ] `phone` accepts 10 to 15 digits regardless of separators, and is stored exactly as typed after trimming.
- [ ] The P2002-on-`phone` handler still returns `409 { error: "This phone number is already registered to another account." }` and still distinguishes a `userId` collision from a `phone` collision.
- [ ] `GET /api/logistics-company` returns the six new fields on the profile row, and still returns a bare `null` for a company with no profile yet.
- [ ] 401 `{ error: "Unauthorized." }` without a session; 403 for a non-COMPANY role on both verbs, with each verb's existing message unchanged.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- The route stays `POST /api/logistics-company`, an **upsert keyed on `userId`**, returning **201**. That is what makes step 1 re-submittable: a company that goes back and edits its details in the wizard re-POSTs the whole object and gets the same row updated, not a duplicate or a 409. It is also what lets one endpoint serve both the four-field sign-up and the ten-field wizard write.
- `vatId` is deliberately not made unique by this task. Uniqueness would be a schema change (`task-01`'s territory), and "is this VAT ID real and does it belong to this entity?" is a registry lookup a human does during review — which is exactly why "VAT ID not found in the registry" is one of the four company flag reasons.
- Company *details* live on `LogisticsCompany`; the application row tracks the *review* of them (`companyReviewStatus`, `companyFlagReason`). This route owns both halves of one event: it writes the corrected details **and** clears the company-level flag that asked for them (section 6). It does **not** move the application's `status` — `task-14`'s resubmit is what takes it from `ACTION_REQUIRED` back to `PENDING`, once the company presses Resubmit and every vehicle flag is cleared too.
- There is no second write path for company details. `task-10`'s step-1 form posts here; `PUT /api/logistics-company/onboarding/company` does not exist and must not be created.
- Keep every existing comment in the file that still applies — particularly the ones explaining `isDuplicatePhoneError`'s `meta.target` handling and the "no account-type variants, every field is required" rationale. Extend them; do not replace them with shorter ones.
