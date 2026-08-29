# Task 18: Admin Business Applications — Mutation APIs

## Status

pending

## Wave

5

## Description

The four endpoints that record a reviewer's decisions on a business fleet application: the company-level verdict, the per-vehicle verdict, "request changes" (send the application back to the company), and "activate fleet" (the terminal approval that actually lets the company dispatch). They are the counterparts of the driver flow's `documents/[docId]`, `request-changes` and `approve` endpoints, split one level further because a fleet application carries two independent verdict tracks — the company as a whole, and each vehicle on its own.

The two `PATCH` endpoints only record verdicts; neither moves the application's own status. That separation is deliberate and copied from the driver flow: a reviewer works through the company block and every vehicle card, then makes one of the two terminal decisions in the footer. Reviewer identity is never written to a column — every one of the four endpoints writes an `AuditLog` row through `writeAuditLog` with `authorized.context.actorId`, matching every existing admin mutation in this codebase.

## Dependencies

**Depends on:** task-01-schema-migration.md
**Blocks:** task-20-admin-business-detail-drawer.md, task-21-dispatch-gate-and-redirect.md

**Context from dependencies:**

task-01 adds the following. Everything this task writes is here — do not open task-01 to check.

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

There is **no `position` column** on `BusinessApplicationVehicle` — row order comes from `createdAt` ascending and any 1-based number is computed in the response. `Vehicle` gains `vehicleClass VehicleClass?` and the **singular** back-relation `applicationVehicle BusinessApplicationVehicle?` (singular because `vehicleId` is `@unique`).

`LogisticsCompany` gains `registeredAddress String?`, `citiesOfOperation GeorgianCity[]`, `contactName String?`, `contactRole String?`, `contactEmail String?`, `bankAccountIban String?`, **`activatedAt DateTime?`** and the back-relation `application BusinessApplication?`. `activatedAt` is the documented source of truth for "may this company dispatch"; task-21 gates the dispatch route on it. It is backfilled by task-01's migration onto every pre-existing company, so a grandfathered admin-created company is activated from day one.

Existing helpers:

```ts
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";

const authorized = await authorizeAdminApi(["SUPER_ADMIN", "USER_MANAGER"]);
if (!authorized.ok) return authorized.response;
// …
await writeAuditLog({
  actorId: authorized.context.actorId,
  action: "business_application.activate",
  entityType: "BusinessApplication",
  entityId: id,
  metadata: { companyId },
});
```

`writeAuditLog` is deliberately **not** wrapped in try/catch — an audit write that fails must fail its caller loudly rather than let a privileged mutation land untraced. Do not add one.

## Files to Create

- `src/app/api/admin/business-applications/[id]/company/route.ts` — `PATCH`, the company-level verdict.
- `src/app/api/admin/business-applications/[id]/vehicles/[vehicleId]/route.ts` — `PATCH`, one vehicle's verdict.
- `src/app/api/admin/business-applications/[id]/request-changes/route.ts` — `POST`, send the application back.
- `src/app/api/admin/business-applications/[id]/activate/route.ts` — `POST`, activate the fleet.

## Technical Details

### 0. Conventions every one of the four routes follows

1. Signature: `export async function PATCH|POST(request: Request, { params }: { params: Promise<{ … }> }): Promise<NextResponse>`. The two `POST` endpoints take no body, so their first parameter is `_request: Request`. `params` is a promise — `await` it.
2. Role gate first:

   ```ts
   const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

   const authorized = await authorizeAdminApi(ALLOWED_ROLES);
   if (!authorized.ok) {
     return authorized.response;
   }
   ```

   Declared per file, not imported from a sibling route — a `route.ts` is a Next.js entry point and its gate must be auditable without following an import. Keep that comment.
3. Body parsing (the two `PATCH` routes only):

   ```ts
   let rawBody: unknown;
   try {
     rawBody = await request.json();
   } catch {
     return NextResponse.json(
       { error: "Request body must be valid JSON." },
       { status: 400 },
     );
   }

   const parsed = parseCompanyVerdictBody(rawBody);
   if ("error" in parsed) {
     return NextResponse.json({ error: parsed.error }, { status: 400 });
   }
   ```

   Hand-rolled `parseXBody(body: unknown): { value: T } | { error: string }`. **No Zod** — the project deliberately uses no validation library.
4. Load the application, then answer 404 for a missing **or `DRAFT`** row:

   ```ts
   if (!application || application.status === "DRAFT") {
     return NextResponse.json({ error: "Application not found." }, { status: 404 });
   }
   ```

   A `DRAFT` application was never submitted, so it is not in the queue and there is nothing here for a reviewer to have opened. Answering identically to a nonexistent id also stops the response confirming that some id is a real company's in-progress draft.
5. `APPROVED` is terminal for all four endpoints:

   ```ts
   if (application.status === "APPROVED") {
     return NextResponse.json(
       { error: "This fleet has already been activated." },
       { status: 400 },
     );
   }
   ```

   Refused rather than treated as a no-op so a double-click cannot push `activatedAt` forward and rewrite when the fleet was actually activated.
6. Every error body is `{ error: string }`. Every success answers `NextResponse.json(body, { status: 200 })` with the exported response type below.
7. Every endpoint writes exactly one `AuditLog` row, after the database write succeeds.

### 1. `PATCH /api/admin/business-applications/[id]/company`

Request body:

```ts
type CompanyVerdict =
  | { verdict: "VERIFIED" }
  | { verdict: "FLAGGED"; reason: string };
```

i.e. `{ verdict: "VERIFIED" | "FLAGGED", reason?: string }` on the wire, with `reason` required — and required to be one of the four listed reasons — when flagging.

The four company flag reasons, **verbatim** from the design (`UI:UX/Business Fleet Onboard/design_handoff_business_onboarding/README.md`, "Admin — Business applications"):

```ts
/**
 * The four company-level flag reasons from the design, verbatim. Unlike the
 * driver-document endpoint, which accepts any non-empty string, this is a
 * closed list: the company reads the reason verbatim on its status screen and
 * the "Action required" screen keys its corrective copy off it, so a
 * free-typed reason would produce a screen with nothing actionable on it. The
 * drawer offers exactly these four as chips, and a chip click *is* the flag.
 */
const COMPANY_FLAG_REASONS: readonly string[] = [
  "VAT ID not found in the registry",
  "Address does not match registration",
  "Bank account not held by the entity",
  "Contact person unreachable",
];
```

Parser, with its exact messages:

```ts
function parseCompanyVerdictBody(
  body: unknown,
): { value: CompanyVerdict } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const { verdict, reason } = body as Record<string, unknown>;

  if (verdict === "VERIFIED") {
    return { value: { verdict: "VERIFIED" } };
  }

  if (verdict !== "FLAGGED") {
    return { error: 'verdict must be either "VERIFIED" or "FLAGGED".' };
  }

  if (typeof reason !== "string" || reason.trim() === "") {
    return { error: "A reason is required to flag the company's details." };
  }

  const trimmedReason = reason.trim();

  if (!COMPANY_FLAG_REASONS.includes(trimmedReason)) {
    return { error: "That is not one of the company flag reasons." };
  }

  return { value: { verdict: "FLAGGED", reason: trimmedReason } };
}
```

The write:

```ts
const updated = await prisma.businessApplication.update({
  where: { id },
  data:
    parsed.value.verdict === "VERIFIED"
      ? // Cleared, not left behind: a verified company still showing a stale
        // reason would keep its status screen asking for a correction.
        { companyReviewStatus: "VERIFIED", companyFlagReason: null }
      : { companyReviewStatus: "FLAGGED", companyFlagReason: parsed.value.reason },
  select: { companyReviewStatus: true, companyFlagReason: true },
});
```

Audit: `action: parsed.value.verdict === "VERIFIED" ? "business_application.company_verify" : "business_application.company_flag"`, `entityType: "BusinessApplication"`, `entityId: id`, `metadata: { companyId, ...(verdict === "FLAGGED" ? { reason } : {}) }`.

Response:

```ts
export type AdminBusinessCompanyReviewResponse = {
  companyReviewStatus: CompanyReviewStatus;
  companyFlagReason: string | null;
};
```

This endpoint does **not** touch `BusinessApplication.status`. Verifying the company is one input to activation, not activation itself.

### 2. `PATCH /api/admin/business-applications/[id]/vehicles/[vehicleId]`

`[vehicleId]` is a `BusinessApplicationVehicle.id`, **not** a `Vehicle.id` — the review row is what carries the verdict, and it outlives the vehicle (`vehicleId` is `SetNull`). Say so in the route's doc comment. The segment must be named `vehicleId` rather than `id` because Next.js forbids two dynamic segments with the same name on one path; `params` is therefore `Promise<{ id: string; vehicleId: string }>`.

Request body:

```ts
type VehicleVerdict =
  | { verdict: "APPROVED" }
  | { verdict: "FLAGGED"; reason: string };
```

The six per-vehicle flag reasons, **verbatim**:

```ts
const VEHICLE_FLAG_REASONS: readonly string[] = [
  "Plate does not match the documents",
  "Payload above the class limit",
  "Dimensions look wrong",
  "Vehicle too old for the platform",
  "Duplicate plate on another fleet",
  "Cooling unit record missing",
];
```

Parser messages, exactly:

- not an object → `"Request body must be a JSON object."`
- unknown verdict → `'verdict must be either "APPROVED" or "FLAGGED".'`
- flag with no/blank reason → `"A reason is required to flag a vehicle."`
- flag with an off-list reason → `"That is not one of the vehicle flag reasons."`

Scope the lookup to the application, so a vehicle id from another company's application 404s rather than being written:

```ts
const applicationVehicle = await prisma.businessApplicationVehicle.findFirst({
  where: { id: vehicleId, businessApplicationId: id },
  select: { id: true, vehicleId: true },
});

if (!applicationVehicle) {
  return NextResponse.json(
    { error: "Vehicle not found on this application." },
    { status: 404 },
  );
}
```

The write mirrors the company one — `{ status: "APPROVED", flagReason: null }` or `{ status: "FLAGGED", flagReason: reason }` — and returns:

```ts
export type AdminBusinessVehicleReviewResponse = {
  applicationVehicleId: string;
  status: BusinessApplicationVehicleStatus;
  flagReason: string | null;
};
```

Audit: `action: "business_application_vehicle.approve" | "business_application_vehicle.flag"`, `entityType: "BusinessApplicationVehicle"`, `entityId: applicationVehicle.id`, `metadata: { applicationId: id, vehicleId: applicationVehicle.vehicleId, ...(verdict === "FLAGGED" ? { reason } : {}) }`.

A vehicle whose `Vehicle` row is gone (`vehicleId: null`) is still reviewable — flagging it is exactly what a reviewer should do — so do not refuse on that.

### 3. `POST /api/admin/business-applications/[id]/request-changes`

No request body: what needs fixing is already recorded on the company row and the vehicle rows.

Load what the guard needs:

```ts
const application = await prisma.businessApplication.findUnique({
  where: { id },
  select: {
    id: true,
    status: true,
    companyId: true,
    companyReviewStatus: true,
    vehicles: { select: { status: true } },
  },
});
```

Guards, in order, with exact messages:

| Condition | Status | Message |
|---|---|---|
| missing or `DRAFT` | 404 | `"Application not found."` |
| `status === "APPROVED"` | 400 | `"This fleet has already been activated."` |
| `status === "ACTION_REQUIRED"` | 409 | `"Changes have already been requested on this application."` |
| company not `FLAGGED` **and** no vehicle `FLAGGED` | 409 | `"Flag the company's details or at least one vehicle before requesting changes."` |

```ts
const flaggedVehicleCount = application.vehicles.filter(
  (vehicle) => vehicle.status === "FLAGGED",
).length;
const hasSomethingToFix =
  application.companyReviewStatus === "FLAGGED" || flaggedVehicleCount > 0;
```

Requesting changes with nothing flagged would send the company an "Action required" screen listing nothing to fix — the same reason the driver flow refuses it.

The write is a single `update` to `{ status: "ACTION_REQUIRED" }`. Nothing else changes: approved vehicles keep their verdict across the round trip (an acceptance criterion in `requirements.md`), and the resubmit path in task-14 is what clears the flagged ones back to `PENDING` and returns the application to `PENDING`.

Audit: `action: "business_application.request_changes"`, `entityType: "BusinessApplication"`, `entityId: id`, `metadata: { companyId, companyReviewStatus, flaggedVehicleCount }`.

Response:

```ts
export type AdminBusinessRequestChangesResponse = {
  status: "ACTION_REQUIRED";
  /** So the drawer can label its button "Request changes (n)" consistently. */
  flaggedVehicleCount: number;
  companyFlagged: boolean;
};
```

### 4. `POST /api/admin/business-applications/[id]/activate`

No request body. This is the endpoint that actually lets a fleet work.

Load:

```ts
const application = await prisma.businessApplication.findUnique({
  where: { id },
  select: {
    id: true,
    status: true,
    companyId: true,
    companyReviewStatus: true,
    vehicles: { select: { status: true } },
  },
});
```

Guards, in this order, with **exact** refusal messages:

| # | Condition | Status | Message |
|---|---|---|---|
| 1 | missing or `DRAFT` | 404 | `"Application not found."` |
| 2 | `status === "APPROVED"` | 400 | `"This fleet has already been activated."` |
| 3 | `status !== "PENDING"` (i.e. `ACTION_REQUIRED`) | 409 | `"This application is still waiting on the company to resubmit."` |
| 4 | `companyReviewStatus !== "VERIFIED"` | 409 | `"Verify the company's details before activating the fleet."` |
| 5 | any vehicle `PENDING` | 409 | `` `${pendingCount} vehicle${pendingCount === 1 ? " is" : "s are"} still pending review. Decide every vehicle before activating the fleet.` `` |
| 6 | no vehicle `APPROVED` | 409 | `"At least one vehicle must be approved before activating the fleet."` |

Guard 3 is the direct analogue of the driver approve endpoint's `ACTION_REQUIRED` refusal, and for the same reason: the company's resubmit path in task-14 is the only place the fleet is re-validated server-side (plate uniqueness, licence expiry, category coverage). Correcting a flagged vehicle is an edit, not a resubmission, so activating straight out of `ACTION_REQUIRED` would put a fleet on the road whose licences may have expired during a round trip that can span days.

Guard 6 exists because activation with every vehicle flagged would mark the application `APPROVED` and set `activatedAt` on a company that still has nothing dispatchable, which is exactly the state the status screen's "you can start dispatching as soon as the company is approved and at least one vehicle passes" copy promises cannot happen.

The write — **one transaction**, because the two rows must never disagree:

```ts
await prisma.$transaction(async (tx) => {
  await tx.businessApplication.update({
    where: { id },
    data: { status: "APPROVED" },
  });

  await tx.logisticsCompany.update({
    where: { id: application.companyId },
    data: { activatedAt: new Date() },
  });
});
```

`LogisticsCompany.activatedAt` is what actually unblocks the company — task-21 gates the dispatch route on it — so it and the application's own status are written together. Splitting them would leave a window where the application reads as approved while the company is still gated, or worse, an activated company with an unapproved application. This is the same argument the driver approve endpoint makes for `DriverProfile.activatedAt`, and the same shape of transaction.

Audit: `action: "business_application.activate"`, `entityType: "BusinessApplication"`, `entityId: id`, `metadata: { companyId: application.companyId, approvedVehicleCount, flaggedVehicleCount }` — the company id is what ties this row to the activation it caused, since the `LogisticsCompany` write has no audit row of its own.

Response:

```ts
export type AdminBusinessActivateResponse = {
  status: "APPROVED";
  /** ISO timestamp written to `LogisticsCompany.activatedAt`. */
  activatedAt: string;
  approvedVehicleCount: number;
  flaggedVehicleCount: number;
};
```

Flagged vehicles are **not** cleared by activation. A fleet can go live with six approved vehicles and one permanently flagged one; task-21's per-vehicle gate is what keeps that seventh vehicle out of dispatch.

### 5. Status codes, deliberately

`400` is used for a malformed request and for the terminal-state refusal (mirroring the driver endpoints, which the drawer already renders inline). `409` is used for the four *state* refusals in request-changes and activate — the request is well-formed and the reviewer is allowed to make it, but the application is not in a state where it means anything. That is the distinction the drawer's disabled-button hints are built on, and both are surfaced identically as `{ error }` text, so a client never has to branch on the code.

## Acceptance Criteria

- [ ] All four endpoints answer 401 anonymously, 403 for a signed-in admin outside `SUPER_ADMIN`/`USER_MANAGER`, and 404 `{ error: "Application not found." }` for an unknown or `DRAFT` application.
- [ ] `PATCH .../company` with `{ verdict: "VERIFIED" }` sets `companyReviewStatus: "VERIFIED"` and nulls `companyFlagReason`.
- [ ] `PATCH .../company` with `{ verdict: "FLAGGED" }` and no reason → 400 `"A reason is required to flag the company's details."`; with an off-list reason → 400 `"That is not one of the company flag reasons."`; with any of the four listed reasons → 200 and the reason stored verbatim.
- [ ] `PATCH .../vehicles/[vehicleId]` accepts only the six listed vehicle reasons when flagging, rejects the rest with `"That is not one of the vehicle flag reasons."`, and 404s `"Vehicle not found on this application."` for a `BusinessApplicationVehicle` belonging to a different application.
- [ ] Neither `PATCH` changes `BusinessApplication.status`.
- [ ] `POST .../request-changes` 409s with `"Flag the company's details or at least one vehicle before requesting changes."` when nothing is flagged, and otherwise sets `ACTION_REQUIRED` without touching any vehicle verdict.
- [ ] `POST .../activate` produces each of the six refusals above under its own condition, with the exact strings.
- [ ] A successful activate sets `BusinessApplication.status = "APPROVED"` and `LogisticsCompany.activatedAt` in one transaction; killing the process between them is not possible by construction.
- [ ] Every successful mutation writes exactly one `AuditLog` row carrying `authorized.context.actorId`; no reviewer id is written to any column on either model.
- [ ] A second `activate` on an already-activated application answers 400 and does not move `activatedAt`.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Closed reason lists here versus free text in `driver-applications/[id]/documents/[docId]` is a deliberate divergence, justified above. If ops later needs an "Other" reason it should be added to the list with its own copy, not by reopening the field to free text.
- `MAX_FLAG_REASON_LENGTH` is not needed: a closed list bounds the length by construction. Do not port that constant.
- The two `POST` endpoints take no body at all — do not add a confirmation flag or a reviewer note field. A note belongs in the audit metadata, and nothing today collects one.
- Do not add a "deactivate fleet" or "reject application" endpoint. `requirements.md` is explicit that there is no rejected-reapply-from-scratch state: a flagged application is corrected and resubmitted in place.
- These routes are pure API; the drawer that drives them is task-20, and it must surface every `{ error }` above inline rather than swallowing it.
