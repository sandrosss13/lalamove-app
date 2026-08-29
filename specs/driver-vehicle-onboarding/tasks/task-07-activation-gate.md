# Task 07: Activation Gate — Enforce `DriverProfile.activatedAt`

## Status

complete

## Wave

2

## Description

`task-01` adds `DriverProfile.activatedAt` and backfills every existing driver to activated. This task does the two things that make the column actually mean something: (1) it stops the three server-side places a non-activated driver could otherwise act like an approved one — going online, seeing open orders, accepting one — and (2) it makes sure every driver who *doesn't* go through this feature's wizard (a `BUSINESS`-type independent sign-up, a company-created driver) still gets activated immediately at creation, since neither of those paths will ever produce an approved `DriverApplication`. This task ships independently of the wizard UI existing yet — the gate is meaningful the moment the column exists.

## Dependencies

**Depends on:** task-01-schema-migration.md (needs `DriverProfile.activatedAt`)
**Blocks:** task-20-onboarding-redirect-wiring.md

**Context from dependencies:** `task-01`'s migration backfills `activatedAt = now()` for every pre-existing `DriverProfile` row, so this task only has to worry about *new* rows created after the migration runs.

## Files to Modify

- `src/app/api/driver-profile/status/route.ts` — the online-toggle endpoint: reject going online while not activated.
- `src/app/api/orders/route.ts` — the driver's open-orders feed: exclude open orders entirely when not activated.
- `src/app/api/orders/[id]/accept/route.ts` — reject accepting an order while not activated.
- `src/app/api/driver-profile/route.ts` — `POST` (upsert): set `activatedAt` immediately for `BUSINESS`-type accounts, which never go through this feature's onboarding wizard.
- `src/app/api/logistics-company/drivers/register/route.ts` — set `activatedAt` immediately when a company admin creates a driver, since a company-affiliated driver never sees this wizard either.

## Technical Details

### 1. `status/route.ts` — reject going online while not activated

The route already loads the session and validates the body before touching the DB (see the file as it exists today). Add an activation check between session validation and the actual update — fetch the `DriverProfile` and check `activatedAt` **only when the request is trying to go online** (`isOnline: true`); going offline should always be allowed regardless of activation state, so a driver can never get stuck unable to take themselves offline.

```ts
if (isOnline) {
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { activatedAt: true },
  });

  if (!driverProfile) {
    return NextResponse.json({ error: "Driver profile not found." }, { status: 404 });
  }

  if (driverProfile.activatedAt === null) {
    return NextResponse.json(
      { error: "Your account isn't approved yet. Finish onboarding to go online." },
      { status: 403 },
    );
  }
}
```

Then proceed with the existing upsert/update logic unchanged.

### 2. `orders/route.ts` — exclude open orders for a non-activated driver

The driver branch currently builds `registeredVehicleTypeSpecIds` from `driverProfile.vehicles` and matches `PENDING`/unassigned orders against them. Add `activatedAt` to the same `findUnique` select, and short-circuit the open-orders half of the `OR` to nothing when not activated — the driver should still see `{ driverId: userId }` (their own past deliveries, if any exist from before this feature), just never *open* ones:

```ts
const driverProfile = await prisma.driverProfile.findUnique({
  where: { userId },
  select: {
    activatedAt: true,
    vehicles: { select: { vehicleTypeSpecId: true } },
  },
});

const registeredVehicleTypeSpecIds = [
  ...new Set((driverProfile?.vehicles ?? []).map((v) => v.vehicleTypeSpecId)),
];

where = {
  OR: [
    // A non-activated driver has nothing open to take — same reasoning as
    // the existing "no registered vehicle → nothing to take" case just
    // below, extended to cover "not yet approved" too.
    ...(driverProfile?.activatedAt
      ? [
          {
            status: OrderStatus.PENDING,
            driverId: null,
            vehicleTypeSpecId: { in: registeredVehicleTypeSpecIds },
          },
        ]
      : []),
    { driverId: userId },
  ],
};
```

### 3. `orders/[id]/accept/route.ts` — reject accepting while not activated

The route already loads `driverProfile` with `select: { id: true, companyId: true }` right after the role check, and already 403s when `companyId !== null`. Add `activatedAt` to the same `select` and the same style of check immediately after the existing `companyId` check:

```ts
const driverProfile = await prisma.driverProfile.findUnique({
  where: { userId: session.user.id },
  select: { id: true, companyId: true, activatedAt: true },
});

// ...existing !driverProfile / companyId checks, unchanged...

if (driverProfile.activatedAt === null) {
  return NextResponse.json(
    { error: "Your account isn't approved yet. Finish onboarding to accept deliveries." },
    { status: 403 },
  );
}
```

### 4. `driver-profile/route.ts` — activate `BUSINESS` accounts immediately

The existing `POST` handler upserts a `DriverProfile` from `parseCreateDriverProfileBody`'s output (`accountType`, `firstName`, `lastName`, `companyName`, `vatId`, `phone`, `city`). `BUSINESS` accounts don't go through this feature's wizard — only `INDIVIDUAL`/`INDIVIDUAL_ENTREPRENEUR` independent sign-ups do (see `task-20`'s redirect predicate) — so a `BUSINESS` account must be activated the moment it's created, or it would be permanently stuck non-activated with no application to ever approve. Add to both the `create` and `update` branches of the existing `prisma.driverProfile.upsert`:

```ts
const activatedAt = accountType === DriverAccountType.BUSINESS ? new Date() : undefined;

const driverProfile = await prisma.driverProfile.upsert({
  where: { userId: session.user.id },
  create: {
    userId: session.user.id,
    accountType,
    firstName,
    lastName,
    companyName,
    vatId,
    phone,
    city,
    activatedAt,
  },
  update: {
    accountType,
    firstName,
    lastName,
    companyName,
    vatId,
    phone,
    city,
    // Only touch activatedAt on create-path semantics for BUSINESS; leave it
    // alone on update so re-submitting this form never re-activates or
    // un-activates an INDIVIDUAL/INDIVIDUAL_ENTREPRENEUR profile that's
    // already mid-onboarding or already approved.
    ...(activatedAt ? { activatedAt } : {}),
  },
});
```

`activatedAt: undefined` in a Prisma `create`/`update` data object means "don't set this field" (falls through to the column default / leaves it unchanged) — confirm this is how the rest of this codebase already relies on `undefined`-omits-the-field Prisma behavior before assuming it here (it is; the pattern is used elsewhere in this file already for the account-type-conditional company fields).

### 5. `logistics-company/drivers/register/route.ts` — activate company-created drivers immediately

The existing `tx.driverProfile.create` (inside the transaction that also sets `mustChangePassword: true`) creates the profile with `accountType: DriverAccountType.INDIVIDUAL`. Add `activatedAt: new Date()` to that same `data` object — a company-created driver never sees this wizard (see `requirements.md`'s Non-Goals), so it must be activated at creation, same reasoning as the `BUSINESS` case above:

```ts
const profile = await tx.driverProfile.create({
  data: {
    userId: createdUserId,
    companyId: company.id,
    accountType: DriverAccountType.INDIVIDUAL,
    firstName,
    lastName,
    companyName: null,
    vatId: null,
    phone,
    city,
    activatedAt: new Date(),
  },
  select: { id: true },
});
```

## Acceptance Criteria

- [ ] `PATCH /api/driver-profile/status` with `{ isOnline: true }` returns 403 for a driver whose `activatedAt` is `null`, and still succeeds for `{ isOnline: false }` regardless of activation state.
- [ ] `GET /api/orders` for a non-activated driver returns only their own past deliveries (`driverId: userId` matches), never an open/unassigned order, even if they have a registered vehicle whose type matches one.
- [ ] `POST /api/orders/[id]/accept` returns 403 for a non-activated driver, with a message distinct from the existing company-affiliation 403.
- [ ] A new `BUSINESS`-type independent sign-up has a non-null `activatedAt` immediately after `POST /api/driver-profile` succeeds.
- [ ] A new company-created driver (`POST /api/logistics-company/drivers/register`) has a non-null `activatedAt` immediately after creation.
- [ ] Re-submitting `POST /api/driver-profile` for an already-existing `INDIVIDUAL`/`INDIVIDUAL_ENTREPRENEUR` profile does not change its `activatedAt` in either direction.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This task does not set `activatedAt` on approval — that's `task-17`'s `POST /api/admin/driver-applications/[id]/approve`, which this task's gate gives meaning to but does not itself implement.
- Do not gate `GET /api/logistics-company/orders` or the company dispatch flow — activation only applies to independent drivers acting on their own behalf; a company's dispatch to its own driver is unaffected (company-created drivers are activated at creation per step 5 above, so there's nothing to gate there in practice, but this task's changes should not touch that code path regardless).
