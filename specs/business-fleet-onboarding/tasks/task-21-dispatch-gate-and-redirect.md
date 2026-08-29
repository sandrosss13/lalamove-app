# Task 21: Dispatch Gate & `/dashboard` Redirect Wiring

## Status

pending

## Wave

7

## Description

The final integration: the two places where the rest of the application learns that a business fleet has a review lifecycle. First, `/dashboard` has to route a COMPANY session into the wizard, into the status screen, or into the ops dashboard, depending on where its `BusinessApplication` has got to — today it unconditionally renders `<CompanyDashboard>`, which is the whole reason a company that has never registered a fleet would land on a console with nothing in it. Second, **the dispatch gate**: a company cannot put a delivery on the road until operations has activated it, and an individual vehicle cannot be dispatched unless its own review verdict is `APPROVED`. Both are acceptance criteria in `requirements.md` and neither has any enforcement today.

This is the task where the feature stops being a wizard and starts being a gate. Everything before it is data collection and review; this is what makes the review mean something. It also has to leave every pre-existing, admin-created logistics company working exactly as it does now — those companies have no `BusinessApplication` at all and must not be locked out by a feature they were never part of.

## Dependencies

**Depends on:** task-08-company-account-entry.md, task-14-step5-review-submit.md, task-15-application-status-screen.md, task-18-admin-applications-mutation-api.md
**Blocks:** None

**Context from dependencies:**

**From task-01 (schema, restated so no sibling file needs opening):**

```prisma
enum BusinessApplicationStatus { DRAFT PENDING ACTION_REQUIRED APPROVED }
enum CompanyReviewStatus { PENDING VERIFIED FLAGGED }
enum BusinessApplicationVehicleStatus { PENDING APPROVED FLAGGED }
enum VehicleClass { SMALL_VAN LARGE_VAN MEDIUM_TRUCK HEAVY_FREIGHT_TRUCK TRAILER_TRUCK }

model BusinessApplication {
  id                  String                      @id @default(cuid())
  companyId           String                      @unique
  company             LogisticsCompany            @relation(fields: [companyId], references: [id], onDelete: Cascade)
  reference           String                      @unique   // "BIZ-40219"
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

`LogisticsCompany` gains `registeredAddress String?`, `citiesOfOperation GeorgianCity[]`, `contactName String?`, `contactRole String?`, `contactEmail String?`, `bankAccountIban String?`, **`activatedAt DateTime?`** and `application BusinessApplication?`. `Vehicle` gains `vehicleClass VehicleClass?` and the back-relation `applicationVehicle BusinessApplicationVehicle?` — **singular**, because `BusinessApplicationVehicle.vehicleId` is `String? @unique`. That is what makes §3's gate expression (`vehicle.applicationVehicle !== null && vehicle.applicationVehicle.status !== "APPROVED"`) and §4's `vehicle.applicationVehicle?.status ?? null` typecheck; against a list back-relation neither would compile, and both would have to become `.some(…)` predicates with different semantics. There is also **no `position` column** on `BusinessApplicationVehicle` — nothing on this path orders by one.

`LogisticsCompany.activatedAt` is the documented source of truth for "may this company dispatch", exactly as `DriverProfile.activatedAt` already is for "may this driver go online". It is set by task-18's activate endpoint together with `BusinessApplication.status = "APPROVED"` in one transaction.

**From task-08** — the sign-up "Business" card creates a COMPANY account: `User.role = "COMPANY"` plus a `LogisticsCompany` row (`userId @unique`, one login per company). The company sign-in card is restored. So a brand-new company reaches `/dashboard` with a `LogisticsCompany` row and no `BusinessApplication`.

**From task-14** — `POST /api/logistics-company/onboarding/submit` creates the `Vehicle` rows, the `DriverLicence` rows for created drivers, the `DriverVehicleAssignment` rows **and** one `BusinessApplicationVehicle` per vehicle in a single transaction, and moves the application `DRAFT → PENDING` (or `ACTION_REQUIRED → PENDING` on a resubmit, clearing flagged vehicles back to `PENDING` while approved ones keep their verdict).

**From task-15** — `FleetApplicationStatusScreen` (exported from `src/components/fleet-onboarding/fleet-application-status-screen.tsx`) is rendered by the wizard shell for any application `status !== "DRAFT"`: pending, action-required and the approved "Your fleet is live." screen whose CTA is "Open the dispatch dashboard". The wizard route is `/dashboard/fleet-onboarding` (task-09), guarded by its own page-level check.

**Existing code this task edits:**

- `src/app/dashboard/page.tsx` — currently `if (session.user.role === "COMPANY") return <CompanyDashboard userId={session.user.id} />;` with no other company branch. The DRIVER branch below it is the pattern to mirror.
- `src/app/api/logistics-company/orders/[id]/dispatch/route.ts` — `POST`, `CLAIMED → ACCEPTED`. Session → `role !== "COMPANY"` 403 → JSON parse → `parseDispatchBody` → company lookup by `userId` → order lookup scoped to `companyId` + `status: CLAIMED` → driver lookup scoped to `companyId` → vehicle lookup scoped to `companyId` → spec-match check → `prisma.order.update`.
- `src/app/api/logistics-company/orders/[id]/claim/route.ts` — `POST`, `PENDING → CLAIMED` via a conditional `updateMany`.
- `src/lib/company-dashboard-data.ts` — `getCompanyDashboardData(userId)`; selects the company by `userId` (`id`, `companyName`, `vatId`, `phone`, `city`), then `prisma.vehicle.findMany({ where: { companyId }, include: { vehicleTypeSpec: true, assignments: { where: { unassignedAt: null }, … } } })` mapped to `OpsVehicle[]`.
- `src/components/dashboard/ops/drawers/order-detail-drawer.tsx` — builds the dispatch form's vehicle options with `fleet.filter((vehicle) => vehicle.vehicleTypeSpecId === order.vehicleTypeSpecId)`.

## Files to Modify

- `src/app/dashboard/page.tsx` — add the COMPANY onboarding branch before rendering `<CompanyDashboard>`.
- `src/app/api/logistics-company/orders/[id]/dispatch/route.ts` — add the company activation gate and the per-vehicle approval gate.
- `src/app/api/logistics-company/orders/[id]/claim/route.ts` — add the company activation gate.
- `src/lib/company-dashboard-data.ts` — expose `company.activatedAt` and per-vehicle `applicationStatus` / `dispatchable` on `OpsVehicle`.
- `src/components/dashboard/ops/drawers/order-detail-drawer.tsx` — offer only dispatchable vehicles in the dispatch form.
- `src/app/dashboard/fleet-onboarding/page.tsx` (task-09's file) — cross-reference comment only, if the guard's comment does not already point at `/dashboard`'s `shouldOnboard`.

## Technical Details

### 1. `/dashboard` routing for a COMPANY session

Replace the single COMPANY line with the same shape the DRIVER branch uses:

```tsx
if (session.user.role === "COMPANY") {
  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: {
      activatedAt: true,
      application: { select: { status: true } },
    },
  });

  // The counterpart to `/dashboard/fleet-onboarding`'s own defensive guard, but
  // not its exact mirror: this decides whether to *send* a company into the
  // fleet wizard, that one decides whether a company who navigated there under
  // their own steam may *see* it. The two agree everywhere except on an
  // activated company, whom this must never redirect and that page deliberately
  // still admits so the "Your fleet is live." screen stays reachable on a
  // reload. Keep the shared conditions below in sync with it.
  //
  // `activatedAt === null` is what keeps grandfathered companies out. Every
  // pre-existing `LogisticsCompany` was backfilled with an activation timestamp
  // by task-01's migration, and an admin-created company has no
  // `BusinessApplication` row at all — so `application?.status` alone reads
  // `undefined`, would satisfy `!== "APPROVED"`, and would drag a company that
  // never owed us an application into a wizard with no way back out.
  // `activatedAt` is the schema's documented source of truth for "is this
  // company activated"; the application status stays alongside it to cover the
  // mid-onboarding company whose row exists but is not approved yet.
  //
  // A COMPANY session with no `LogisticsCompany` row at all fails the first
  // condition and falls through to `CompanyDashboard`, which already owns the
  // "your company profile isn't set up yet" fallback for that interrupted
  // sign-up. The wizard's step 1 assumes a company row exists, so this must
  // never redirect ahead of that fallback.
  const shouldOnboard =
    company !== null &&
    company.activatedAt === null &&
    company.application?.status !== "APPROVED";

  if (shouldOnboard) {
    redirect("/dashboard/fleet-onboarding");
  }

  return <CompanyDashboard userId={session.user.id} />;
}
```

That single redirect covers all three of the non-activated cases, because `/dashboard/fleet-onboarding` is the one route and the shell picks what to render:

| `BusinessApplication` | `shouldOnboard` | What the company sees |
|---|---|---|
| none | true | `/dashboard/fleet-onboarding` → the wizard, from step 1 |
| `DRAFT` | true | `/dashboard/fleet-onboarding` → the wizard, resumed at `draftStep` |
| `PENDING` | true | `/dashboard/fleet-onboarding` → task-15's status screen (pending) |
| `ACTION_REQUIRED` | true | `/dashboard/fleet-onboarding` → task-15's status screen (action required) |
| `APPROVED` | false | the normal ops dashboard |

Do **not** add a second route for the status screen. task-15 renders it from the wizard shell for any `status !== "DRAFT"`, exactly as the driver flow does, and a separate `/dashboard/fleet-status` route would duplicate the guard and desynchronise the two.

**The asymmetry, stated explicitly** (this is the same asymmetry the driver flow documents at length in `src/app/dashboard/onboarding/page.tsx`): `shouldOnboard` here must return `false` for an approved company, while the wizard page's own guard must return *eligible* for one. They answer different questions. `shouldOnboard` decides whether to **send** a company into the wizard — sending an activated company there would trap them in an onboarding flow they have finished. The wizard page's guard decides whether a company who **arrived** there may see the page — and for an activated company the answer is yes, because that page is where task-15's "Your fleet is live." confirmation lives, and its "Open the dispatch dashboard" CTA is the exit back to `/dashboard`. Bouncing them would make that screen unreachable for a company that reloads or navigates back after activation, which is the whole point of it. If task-09's guard does not already carry this note, add the cross-reference comment; do not change its logic.

`src/app/dashboard/page.tsx` already has `export const dynamic = "force-dynamic"` and already calls `requireDashboardSession()` — the layout has handled no-session, `mustChangePassword` and the CLIENT bounce. Add nothing else.

### 2. The dispatch gate — company level

`src/app/api/logistics-company/orders/[id]/dispatch/route.ts`, in the existing company lookup:

```ts
const company = await prisma.logisticsCompany.findUnique({
  where: { userId: session.user.id },
  select: { id: true, activatedAt: true },
});

if (!company) {
  return NextResponse.json({ error: "Order not found." }, { status: 404 });
}

// The activation gate. `LogisticsCompany.activatedAt` is set only by the admin
// activate endpoint, which refuses unless the company's details are verified and
// at least one vehicle is approved — so this one column is the whole
// "is this fleet allowed on the road" question. Checked here and not only in the
// dashboard, because hiding a button does nothing about a direct POST.
if (company.activatedAt === null) {
  return NextResponse.json(
    {
      error:
        "Your fleet is still under review. Operations must activate the company before you can dispatch deliveries.",
    },
    { status: 403 },
  );
}
```

Note the existing route reports a missing company as a **404 "Order not found."**, deliberately, so a caller cannot enumerate other companies' orders. Keep that. The new activation refusal is a 403 with a specific message because it is the caller's *own* company and there is nothing to conceal.

Do the same in `src/app/api/logistics-company/orders/[id]/claim/route.ts`, immediately after its existing `if (!company)` branch:

```ts
if (company.activatedAt === null) {
  return NextResponse.json(
    {
      error:
        "Your fleet is still under review. Operations must activate the company before you can claim deliveries.",
    },
    { status: 403 },
  );
}
```

(Its company lookup currently selects `{ id: true }` — add `activatedAt: true`.)

Gating claim as well as dispatch is not scope creep: a claim takes an order **off the open market** into `CLAIMED`, where only its claimant can act on it. An unactivated company that could claim but not dispatch would strand real deliveries in a status nobody can move, which is worse than either gate on its own. The `requirements.md` acceptance criterion ("A company cannot dispatch until it is approved and at least one of its vehicles is approved") is satisfied by the dispatch gate; the claim gate is what keeps that satisfaction from having a side effect.

### 3. The dispatch gate — per vehicle

Still in the dispatch route, extend the existing vehicle lookup:

```ts
const vehicle = await prisma.vehicle.findFirst({
  where: { id: vehicleId, companyId: company.id },
  select: {
    id: true,
    vehicleTypeSpecId: true,
    // The review row for this vehicle, or null for a vehicle that predates
    // business applications (admin-created, or added through the fleet form).
    applicationVehicle: { select: { status: true } },
  },
});

if (!vehicle) {
  return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
}

// A vehicle that went through a fleet application has to have been approved:
// the fleet is cleared vehicle by vehicle, so an activated company can still
// hold a flagged or unreviewed one. A vehicle with no review row at all is
// grandfathered — see §5.
if (
  vehicle.applicationVehicle !== null &&
  vehicle.applicationVehicle.status !== "APPROVED"
) {
  return NextResponse.json(
    {
      error:
        "This vehicle hasn't been approved yet. Only approved vehicles can be dispatched.",
    },
    { status: 400 },
  );
}
```

Place this **before** the existing `vehicle.vehicleTypeSpecId !== order.vehicleTypeSpecId` check, so an unapproved vehicle is reported as unapproved rather than as a type mismatch when it happens to be both.

400 rather than 403 here: this is a fact about the vehicle named in the request body, which is a bad-request condition, and it sits alongside the existing type-mismatch 400 in the same block.

There is no per-vehicle gate on claim — claiming names no vehicle.

### 4. Surfacing it in the ops dashboard

The API gate is the boundary; the dashboard should not offer a button that can only fail.

In `src/lib/company-dashboard-data.ts`:

1. Add `activatedAt: true` to the company `select`, and to `CompanyDashboardData["company"]`:

   ```ts
   company: {
     id: string;
     companyName: string;
     vatId: string;
     phone: string;
     city: GeorgianCity;
     /** ISO timestamp, or null while the fleet is still under review. Null
      *  means every claim and dispatch call will be refused. */
     activatedAt: string | null;
   };
   ```

   Serialise with `company.activatedAt?.toISOString() ?? null` — this object is handed to a client component, so it must be plain-serialisable.

2. Add `applicationVehicle: { select: { status: true } }` to the existing `prisma.vehicle.findMany` include, and two fields to `OpsVehicle`:

   ```ts
   /**
    * This vehicle's fleet-application verdict, or null for a vehicle that
    * predates business applications (admin-created, or added through the
    * company's own fleet form). Null is not "unreviewed" — see `dispatchable`.
    */
   applicationStatus: "PENDING" | "APPROVED" | "FLAGGED" | null;
   /**
    * Whether the dispatch endpoint will accept this vehicle: it has no review
    * row at all (grandfathered), or its row is APPROVED. Computed here so the
    * console and the API cannot disagree about it.
    */
   dispatchable: boolean;
   ```

   ```ts
   applicationStatus: vehicle.applicationVehicle?.status ?? null,
   dispatchable:
     vehicle.applicationVehicle === null ||
     vehicle.applicationVehicle.status === "APPROVED",
   ```

3. In `src/components/dashboard/ops/drawers/order-detail-drawer.tsx`, add `dispatchable` to the existing filter:

   ```tsx
   vehicles={fleet
     .filter(
       (vehicle) =>
         vehicle.dispatchable &&
         vehicle.vehicleTypeSpecId === order.vehicleTypeSpecId,
     )
     .map(…)}
   ```

   `CompanyDispatchForm` already renders "None of your fleet vehicles match the type this delivery requires." when the list is empty, so a fleet whose only matching vehicle is flagged degrades to an explanatory empty state rather than a broken submit. Leave that copy alone — narrowing it would need a second reason string threaded through a component that today takes only options.

The Fleet tab may additionally show `applicationStatus` as a chip per vehicle. That is a nice-to-have and is **not** required by this task's acceptance criteria; if you add it, use the same three chip colours the admin queue uses and do not invent new tokens.

### 5. Grandfathering: companies with no `BusinessApplication`

Every `LogisticsCompany` that exists today was created by an internal admin, has no `BusinessApplication`, and is dispatching right now. The gate in §2 keys on `activatedAt`, which for those rows would be `NULL` — locking out every existing company on deploy. Two ways out:

**(a) Backfill `activatedAt` in task-01's migration.** One statement, once, at the moment the column is added.

**(b) A null-application escape hatch here.** Treat `activatedAt === null && application === null` as activated at every read site.

**Decision: (a), the migration backfill — and task-01 already carries it.** Nothing has to be added here or amended there; this section exists to record *why* the gate below is safe to write as an unconditional `activatedAt === null` check.

Why (a):

- It makes `activatedAt` mean exactly one thing everywhere: "operations has cleared this company". Option (b) makes it mean "cleared, *or* old enough that nobody checked", and every future reader has to know the second half. `DriverProfile.activatedAt` already carries the first meaning after the driver-onboarding migration backfilled it the same way; two `activatedAt` columns on two provider models with different semantics would be a trap.
- The escape hatch is a **default-open** rule. Any code path that forgets the extra `application` join grants dispatch rather than denying it. The backfill is default-closed: a missing join denies, which is the failure direction you want on a gate.
- It would have to be repeated at four read sites (dispatch, claim, `/dashboard`'s `shouldOnboard`, `getCompanyDashboardData`), and the `shouldOnboard` one is where it hurts most — a grandfathered company would otherwise be redirected into a wizard with no way out, since it satisfies `application?.status !== "APPROVED"` by having no application at all.
- The backfill is a one-line, idempotent, forward-only statement over a table with a handful of rows.

**Where the backfill lives (task-01, already written — do not repeat it):** the migration that adds `LogisticsCompany.activatedAt` carries, in the same generated migration file:

```sql
UPDATE "LogisticsCompany" SET "activatedAt" = "createdAt" WHERE "activatedAt" IS NULL;
```

`createdAt` rather than `now()` so the timestamp is not a lie about when the company started operating. It runs once, while the column is still `NULL` for every row, so it cannot touch a company activated later. This is the same technique and the same justification as the driver-onboarding migration's `DriverProfile.activatedAt` backfill.

**This task writes no migration.** Do not add a second one, and do not fall back to the escape hatch in (b): the semantics of `activatedAt` are settled — "operations has cleared this company" — and every read site below relies on that single meaning.

**Vehicles are grandfathered differently, and deliberately so.** A pre-existing company vehicle has no `BusinessApplicationVehicle` row and there is no column on `Vehicle` to backfill a verdict onto; manufacturing review rows for vehicles no reviewer ever looked at would fabricate a compliance record. So the per-vehicle rule *is* the null escape hatch — `applicationVehicle === null || status === "APPROVED"` — and that is acceptable here for the reason it was not acceptable for the company: it is contained to two expressions (§3 and §4), both written in this task, both against a relation that is `null` only for the pre-feature population, and every vehicle created by task-14's submit gets a row in the same transaction, so the "no row" case can never be produced by the new flow.

## Acceptance Criteria

- [ ] A COMPANY session with no `LogisticsCompany` row still reaches `<CompanyDashboard>` and its "your company profile isn't set up yet" fallback — it is not redirected.
- [ ] A COMPANY with a company row and no application, or a `DRAFT` application, is redirected from `/dashboard` to `/dashboard/fleet-onboarding`.
- [ ] A COMPANY with a `PENDING` or `ACTION_REQUIRED` application is redirected to `/dashboard/fleet-onboarding` and sees task-15's status screen there.
- [ ] A COMPANY with `activatedAt` set is **not** redirected and sees the ops dashboard; navigating to `/dashboard/fleet-onboarding` manually still shows the "Your fleet is live." screen.
- [ ] A grandfathered admin-created company (no `BusinessApplication`, `activatedAt` backfilled) sees the ops dashboard and can claim and dispatch exactly as before.
- [ ] `POST /api/logistics-company/orders/[id]/claim` answers 403 `"Your fleet is still under review. Operations must activate the company before you can claim deliveries."` for a company with `activatedAt === null`.
- [ ] `POST /api/logistics-company/orders/[id]/dispatch` answers 403 `"Your fleet is still under review. Operations must activate the company before you can dispatch deliveries."` for a company with `activatedAt === null`.
- [ ] The same endpoint answers 400 `"This vehicle hasn't been approved yet. Only approved vehicles can be dispatched."` for a `PENDING` or `FLAGGED` `BusinessApplicationVehicle`, even when the company is activated — and this check runs before the vehicle-type-match check.
- [ ] A vehicle with no `BusinessApplicationVehicle` row dispatches normally.
- [ ] `CompanyDashboardData.company.activatedAt` and `OpsVehicle.applicationStatus` / `OpsVehicle.dispatchable` are populated, and the order drawer offers only dispatchable vehicles.
- [ ] No new migration is added by this task — task-01's migration already carries the `LogisticsCompany.activatedAt` backfill, and this task only reads the column.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass, and a manual click-through of the full loop works: sign up as a company → wizard → submit → pending → admin verifies the company and flags one vehicle → request changes → company sees action required → fix and resubmit → admin approves all → activate → the company dispatches, and the flagged vehicle stays undispatchable until it is approved.

## Notes

- The activation gate is on the **company**, not on the application: reading `LogisticsCompany.activatedAt` costs no join, is the same column the admin endpoint writes, and keeps the gate working if the application row is ever archived. Never gate on `application.status === "APPROVED"` in the API layer — that is one indirection further from the thing that matters and would diverge for grandfathered rows.
- Do not gate `GET` reads. A company under review must still be able to open its dashboard; it simply cannot claim or dispatch. Blanking the console would remove the very screen that explains why.
- Do not gate the driver-side endpoints. A driver on an unactivated fleet's roster has no order to act on, because nothing was ever dispatched to them — adding a second gate there would duplicate the invariant without strengthening it.
- `requirements.md` states the acceptance criterion as "A company cannot dispatch until it is approved and at least one of its vehicles is approved". The "at least one vehicle approved" half is enforced upstream, in task-18's activate endpoint, which refuses to set `activatedAt` without it. Do not re-derive it here — one gate, one owner.
- This task touches `src/lib/company-dashboard-data.ts` and one ops component. It is wave 7 and runs alone, so there is no contention, but keep the edits to the fields listed above: the ops console is a large surface and this is not the task to refactor it.
