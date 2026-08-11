# Task 03: Vehicle↔driver assignment routes

## Status

complete

## Wave

1

## Description

`DriverVehicleAssignment` (persistent driver↔vehicle pairing, distinct from the per-order `Order.driverId`/`Order.vehicleId`) already exists in the schema and is written by exactly one existing route (`drivers/register/route.ts`, when a company registers a brand-new driver with an optional vehicle) — but nothing lists, creates standalone, or unassigns these rows anywhere else in the app. The new Vehicles tab (task-12) needs to assign/reassign/unassign a driver to any existing fleet vehicle, and the Fleet/Drivers tabs (task-10, task-11) need to display the pairing. This task adds the two missing routes and extends the existing fleet-list route to include the pairing so the UI doesn't need a second round-trip.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-12-vehicles-tab.md (task-01's `getCompanyDashboardData` already reads assignments directly via Prisma for display — it does not call these routes — so task-01 has no dependency on this task; only the *mutating* Vehicles-tab UI in task-12 needs these routes live to test against)

**Context from dependencies:** None — this task only needs the existing `vehicles/route.ts` GET (reproduced below) and the exclusivity-check pattern already used in `drivers/register/route.ts` (reproduced below).

## Files to Create

- `src/app/api/logistics-company/vehicles/[id]/assignment/route.ts` — new `POST` (assign) and `DELETE` (unassign) route.

## Files to Modify

- `src/app/api/logistics-company/vehicles/route.ts` — extend the `GET` handler's `include` to also return each vehicle's active assignment.

## Technical Details

### Existing exclusivity check to reuse (from `drivers/register/route.ts`, do not modify that file)

```ts
// Ownership and availability are both verified before anything is written, so
// a bad `vehicleId` never leaves a half-registered driver behind.
const vehicle = await prisma.vehicle.findUnique({
  where: { id: vehicleId },
  select: {
    id: true,
    companyId: true,
    assignments: { where: { unassignedAt: null }, select: { id: true } },
  },
});

if (!vehicle || vehicle.companyId !== company.id) {
  return NextResponse.json({ error: "That vehicle was not found in your fleet." }, { status: 400 });
}

// "At most one active assignment per vehicle" has no database constraint
// behind it (see `DriverVehicleAssignment` in the schema), so it is enforced
// here.
if (vehicle.assignments.length > 0) {
  return NextResponse.json({ error: "This vehicle is already assigned to another driver." }, { status: 400 });
}

await tx.driverVehicleAssignment.create({ data: { driverProfileId: profile.id, vehicleId } });
```

The new `POST` route below applies the same "at most one active assignment per vehicle" check. It reuses `dispatch/route.ts`'s scoped-lookup style (404, not 403/400, for anything not owned by this company) rather than `drivers/register`'s `400` wording, since this route is a general-purpose assignment endpoint, not a registration flow — match the auth/ownership style of `claim`/`dispatch` here.

### 1. Modify `src/app/api/logistics-company/vehicles/route.ts`

Current `GET` handler (full file already read — only the `include` inside the `findMany` call changes):

```ts
const vehicles = await prisma.vehicle.findMany({
  where: { companyId: company.id },
  include: { vehicleTypeSpec: true },
  orderBy: { createdAt: "desc" },
});
```

Change the `include` to:

```ts
const vehicles = await prisma.vehicle.findMany({
  where: { companyId: company.id },
  include: {
    vehicleTypeSpec: true,
    assignments: {
      where: { unassignedAt: null },
      include: { driverProfile: { include: { user: { select: { id: true, name: true } } } } },
      take: 1,
    },
  },
  orderBy: { createdAt: "desc" },
});
```

This is purely additive — every existing field stays, this only adds `assignments` to each returned vehicle. Do not change anything else in this file (the `POST` handler, the validation helpers, etc. stay exactly as they are). Confirm via `grep -rn "logistics-company/vehicles" src` that no other caller destructures the response in a way this breaks (none does — the fleet list is only rendered by `company-dashboard.tsx`, which this feature replaces).

### 2. New file: `src/app/api/logistics-company/vehicles/[id]/assignment/route.ts`

```ts
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Validated shape of an assign request body. */
function parseAssignBody(body: unknown): { driverUserId: string } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }
  const { driverUserId } = body as Record<string, unknown>;
  if (typeof driverUserId !== "string" || driverUserId.trim() === "") {
    return { error: "driverUserId is required." };
  }
  return { driverUserId: driverUserId.trim() } as { driverUserId: string };
}

/**
 * POST /api/logistics-company/vehicles/[id]/assignment — assign a fleet vehicle
 * to a roster driver via `DriverVehicleAssignment`. Reuses the same
 * "at most one active assignment per vehicle" exclusivity check
 * `drivers/register/route.ts` already applies inline.
 *
 * To reassign a vehicle that already has an active assignment, the caller must
 * DELETE first — this route does not silently auto-unassign, so a reassignment
 * is always two explicit calls.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can assign vehicles." },
      { status: 403 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = parseAssignBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { id: vehicleId } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, companyId: company.id },
    select: { id: true, assignments: { where: { unassignedAt: null }, select: { id: true } } },
  });
  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }
  if (vehicle.assignments.length > 0) {
    return NextResponse.json(
      { error: "This vehicle already has an active assignment. Unassign it first." },
      { status: 400 },
    );
  }

  const driverProfile = await prisma.driverProfile.findFirst({
    where: { userId: parsed.driverUserId, companyId: company.id },
    select: { id: true },
  });
  if (!driverProfile) {
    return NextResponse.json({ error: "Driver not found." }, { status: 404 });
  }

  const assignment = await prisma.driverVehicleAssignment.create({
    data: { driverProfileId: driverProfile.id, vehicleId: vehicle.id },
  });

  return NextResponse.json(assignment, { status: 201 });
}

/**
 * DELETE /api/logistics-company/vehicles/[id]/assignment — unassign a fleet
 * vehicle's current driver. Sets `unassignedAt` rather than deleting the row,
 * matching the model's own doc comment ("reassignment keeps history").
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can unassign vehicles." },
      { status: 403 },
    );
  }

  const { id: vehicleId } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, companyId: company.id },
    select: {
      id: true,
      assignments: { where: { unassignedAt: null }, select: { id: true }, take: 1 },
    },
  });
  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  const active = vehicle.assignments[0];
  if (!active) {
    return NextResponse.json({ error: "This vehicle has no active assignment." }, { status: 404 });
  }

  const updated = await prisma.driverVehicleAssignment.update({
    where: { id: active.id },
    data: { unassignedAt: new Date() },
  });

  return NextResponse.json(updated, { status: 200 });
}
```

Note the `parseAssignBody` return type above has a small inconsistency in the sketch (`{ driverUserId: string }` vs. the `{ data: ... }` wrapper other routes use like `dispatch/route.ts`'s `parseDispatchBody`) — follow `dispatch/route.ts`'s exact `{ data: DispatchInput } | { error: string }` wrapper convention instead for consistency with the rest of the codebase; the sketch above is illustrative of the validation logic, not the exact wrapper shape.

## Acceptance Criteria

- [ ] `GET /api/logistics-company/vehicles` response now includes each vehicle's `assignments` array (0 or 1 active entries), with no other change to its shape.
- [ ] `POST /api/logistics-company/vehicles/[id]/assignment` creates a `DriverVehicleAssignment`, rejecting with `400` if the vehicle already has an active one, `404` for a vehicle or driver not owned by/on the roster of the caller's company.
- [ ] `DELETE /api/logistics-company/vehicles/[id]/assignment` sets `unassignedAt` on the active assignment (never deletes the row), `404` if none exists.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Manually verified: assign a roster driver to a fleet vehicle, confirm `GET /api/logistics-company/vehicles` reflects it, unassign, confirm it clears, reassign to a different driver succeeds.
