# Task 08: Claim API

## Status

pending

## Wave

2

## Description

Makes claiming a load safe under concurrency and safe for money and compliance,
for both account shapes the board serves. Extends the existing
`POST /api/orders/[id]/accept` (an independent driver claiming with one of
their own vehicles) and the existing
`POST /api/logistics-company/orders/[id]/claim` (a company claiming with its
account, no vehicle yet) so that both: re-check physical fit server-side rather
than trusting the board's listing snapshot, enrich the "someone else got there
first" response so the UI's dedicated dialog can name the load, gate a driver's
claim (not browse) on being online, and strip `Order.price` from what a claim
response returns. Nothing here changes who is *allowed* to claim what — the
existing roster-driver and unactivated-account 403s are preserved exactly.

## Dependencies

**Depends on:** task-01-schema-and-migration
**Blocks:** task-09-board-shell

**Context from dependencies:** task-01-schema-and-migration adds these
`Order` columns, all nullable, all declared by the client at booking on top of
the vehicle class they picked: `cargoWeightKg`, `cargoLengthM`, `cargoWidthM`,
`cargoHeightM` (the load's physical description), `handlingTags`
(`CargoHandlingTag[]`, never null — an empty array for a load with no special
requirements, six possible values including `HAZMAT`), `reference` (`NOT NULL
UNIQUE`, `GE-48210` form — this is what the lost-the-race dialog names the load
with), and `commissionRate` / `driverPayout` (both resolved and stored at
order-creation time, not computed here). It also adds `LoadRejection`, which
this task does not touch at all — rejecting and claiming are independent
actions on independent tables.

**CRITICAL MONEY RULE:** `Order.price` is what the **client** pays.
`Order.driverPayout` (the stored 85% share) is the only money figure a driver —
or a company, since the board has no role-specific UI — may ever be shown. Both
routes this task touches currently return the full `Order` row (via
`ORDER_PARTY_SELECT`, defined in `src/lib/order-response-select.ts`) on
success, which includes `price`. A grep of the codebase found no current
frontend consumer of `price` on either route's response (neither route is
wired to any UI yet), so removing it is safe today — but do not skip this step
on the assumption that it's cosmetic. It is the rule this entire feature exists
to enforce.

## Files to Modify

- `src/app/api/orders/[id]/accept/route.ts` — cargo-fit re-check, `isOnline`
  gate, enriched 409, price-free response
- `src/app/api/logistics-company/orders/[id]/claim/route.ts` — cargo-fit
  re-check, enriched 409, price-free response (extended in place — see
  **Decision: extend the existing claim route** below)

## Files to Create

None. See the decision below for why this task does not add a new
board-specific claim endpoint.

## Technical Details

### The atomic claim is non-negotiable

Both routes already do this correctly today — do not change this part, only
extend around it. `src/app/api/orders/[id]/accept/route.ts` claims with:

```ts
// Atomic claim: only rows that are still PENDING and unassigned are updated.
const { count } = await prisma.order.updateMany({
  where: { id, status: OrderStatus.PENDING, driverId: null },
  data: {
    driverId: session.user.id,
    vehicleId: vehicle.id,
    status: OrderStatus.ACCEPTED,
  },
});

if (count === 0) {
  return NextResponse.json(
    { error: "This delivery is no longer available." },
    { status: 409 },
  );
}
```

The comment immediately above that block in the source is the reasoning to
preserve verbatim: *"The claim is done with a single conditional `updateMany`
(status PENDING and driverId null in the `where`) rather than a read-then-write,
so two drivers racing for the same order can't both succeed: the database
applies at most one update and `count` tells us whether this request won."* The
company route's `updateMany` (`status: PENDING, companyId: null` in its
`where`) is the same pattern for the same reason. **Never** replace either with
a `findUnique` followed by an `update` — that reintroduces exactly the race
this code exists to close, because two concurrent requests could both read
`PENDING` before either writes.

Everything this task adds — the cargo-fit check, the `isOnline` gate — belongs
**before** this `updateMany`, as an additional precondition checked on the read
side. None of it belongs inside the `updateMany`'s `where`: that clause exists
to keep the compare-and-swap itself atomic and must stay minimal (status +
assignment columns only), not to become a general validation clause.

### The lost-the-race response

Today, `count === 0` on either route returns a bare
`{ error: "This delivery is no longer available." }` at `409`. The design has a
dedicated "Just claimed by another driver" dialog, so this response needs to be
mechanically distinguishable from every *other* failure this task adds (the
`isOnline` gate below also uses `409`-adjacent semantics but is not this
condition), and it needs enough data for that dialog to name the load.

Change the shape on both routes to:

```ts
if (count === 0) {
  return NextResponse.json(
    {
      error: "This load was just claimed by someone else.",
      code: "ALREADY_CLAIMED",
      reference: existing.reference,
    },
    { status: 409 },
  );
}
```

`existing.reference` comes from the same `findUnique` both routes already do
before the `updateMany` (to distinguish 404 "no such order" from 409 "not
available" — the conditional update alone can't tell those apart). Add
`reference: true` to that lookup's `select` on both routes; `reference` never
changes after creation, so reading it from the pre-claim lookup rather than
re-querying after the failed `updateMany` is correct, not stale.

`code` is new on these two routes — existing 403s on the same routes (roster,
activation) keep their plain `{ error }` shape; only the two responses a
concurrent, well-behaved client actually needs to branch on (`ALREADY_CLAIMED`
here, `DRIVER_OFFLINE` below) get a `code`.

### The `isOnline` gate (driver route only)

`DriverProfile.isOnline` exists with a working toggle
(`PATCH /api/driver-profile/status`) but today is read by no matching or claim
logic anywhere — a driver can be `isOnline: false` and still successfully
accept a delivery. This task closes that gap for **claiming only**.

**Decision: a driver may browse the board while offline; claiming requires
being online.** Drivers plan their day before starting it — checking what work
exists, what it pays, whether it's worth going online for, is exactly the kind
of look-before-you-leap the board's whole design (drawer, filters, sort by pay)
is built around. Blocking the *browse* on `isOnline` would make the board
useless for that, and nothing in task-06 (the listing endpoint) should filter
on it. Blocking the *claim* is different: a claim commits the order to this
driver right now, and `isOnline` is the one signal the product has that a
driver is actually available to act on it.

Add the check to `POST /api/orders/[id]/accept`, immediately after the existing
activation gate and before the order lookup (fail on account state before
spending a query on the order):

```ts
// Browsing the board doesn't require being online — a driver plans their day
// before starting it. Claiming does: `isOnline` is the one signal the product
// has that this driver is actually available to take the load right now.
if (!driverProfile.isOnline) {
  return NextResponse.json(
    {
      error: "You're offline. Go online to claim loads.",
      code: "DRIVER_OFFLINE",
    },
    { status: 403 },
  );
}
```

Add `isOnline: true` to the existing `driverProfile` `findUnique`'s `select`
(alongside `id`, `companyId`, `activatedAt`).

`403`, not `409`: this is a fact about the *caller's own account state*, the
same class of condition as the roster and activation gates immediately above
it in the same route (both also `403`), not a conflict with what another
request just did. The UI branches on `code === "DRIVER_OFFLINE"` to show "You're
offline — go online to claim?" with a retry, instead of the roster/activation
gates' dead-end message — this is exactly why `code` exists on this response
and not on those.

This gate does not apply to the company route: `LogisticsCompany` has no
`isOnline` concept (`src/lib/dashboard/hub/account.ts`'s `resolveHubAccount`
returns `isOnline: null, canToggleOnline: false` for every `COMPANY` session,
by design) — a fleet does not go offline the way one driver does.

### The company path: claim first, assign later

Per the design handoff's open question 1, resolved as *claim-first-assign-later*
because that is how fleets actually operate: a dispatcher takes a job off the
market before deciding which truck and driver run it.

**Decision: extend the existing claim route, do not create a new one.**
`POST /api/logistics-company/orders/[id]/claim` already does the entire
operation the board needs — atomic `PENDING → CLAIMED`, `companyId` set, no
vehicle named yet — with the same conditional-`updateMany` pattern this task
requires elsewhere. Building a second, board-specific claim endpoint next to it
would mean two implementations of the same atomic transition to keep in sync
forever, for a distinction (called from the board vs. called from wherever this
route is called from today) that does not change what the operation *does*.
Extend it in place with the cargo-fit re-check and price-free response
described below; nothing about its existing 401/403/400/404/409 behaviour for
non-board callers changes.

The claim sets `companyId` and moves the order to `CLAIMED` — this route
already does exactly that and needs no change to the `updateMany` itself. **No
new field or status value is needed for "needs assignment"**: `status ===
"CLAIMED"` *is* that state — a claimed order always has `companyId` set and
`driverId` still `null` until dispatch. A future "My loads" screen (not part of
this spec) shows a claimed load as needing assignment simply by querying
`status: "CLAIMED", companyId: <mine>`. The existing
`POST /api/logistics-company/orders/[id]/dispatch/route.ts` already performs
the `CLAIMED → ACCEPTED` transition, assigning both `driverId` and `vehicleId`
in one `update` (not a race, since the preceding `CLAIMED`-scoped `findFirst`
already established exclusive ownership) — this task does not touch dispatch at
all.

### Vehicle-type matching, and the physical fit re-check

Both routes already require the type match the design assumes:
`vehicle.vehicleTypeSpecId === order.vehicleTypeSpecId` (driver route, checked
against the caller's own chosen vehicle) or "the fleet has at least one vehicle
of the order's `vehicleTypeSpecId`" (company route). Keep both exactly as they
are — this task adds a **second**, independent check alongside them.

The board additionally applies a physical fit filter (weight and L/W/H) at
listing time (task-06). That filter runs against a snapshot: the load could be
re-weighed, the driver could switch vehicles between opening the board and
confirming, or a caller could hit this endpoint directly, bypassing the board
entirely. **The claim endpoint must re-check fit server-side rather than
trusting that the load was listed.** Add this pure check to both route files
(small enough, and with different enough surrounding types on each route, that
duplicating it beats introducing a shared module this task doesn't otherwise
need):

```ts
/**
 * Whether a vehicle *type's* payload and cargo-hold dimensions can physically
 * take this order's declared cargo. Matching always runs against
 * `VehicleTypeSpec`, never against a `Vehicle`'s own `payloadKg`/cargo columns
 * — those are driver-declared attestations captured for compliance review only
 * (see the doc comment on `Vehicle.payloadKg` in `prisma/schema.prisma`), and
 * `vehicleTypeSpec`'s figures are the single source of truth pricing and
 * matching both already use.
 *
 * Null cargo data is treated as "nothing to re-check" here, not as "does not
 * fit" — unlike the board's own `GET /api/loads` listing (task-06), which
 * hides a load with unknown fit rather than risk sending a driver on a wasted
 * trip. This route can't apply that same rule: it is also the write path for
 * `GET /api/orders`, which predates cargo capture and still returns every
 * legacy `PENDING` order with null weight/dimensions. Treating null as "does
 * not fit" here would make every one of those orders permanently unclaimable
 * by anyone, by the same endpoint that has always claimed them. The board
 * simply never shows a load in this state in the first place, so a driver
 * claiming *through the board* never exercises the null branch at all; a
 * caller hitting this endpoint outside the board (the pre-existing flow) keeps
 * working exactly as it does today.
 */
function fitsCargo(
  order: {
    cargoWeightKg: number | null;
    cargoLengthM: number | null;
    cargoWidthM: number | null;
    cargoHeightM: number | null;
  },
  spec: {
    maxPayloadKg: number;
    cargoLengthM: number;
    cargoWidthM: number;
    cargoHeightM: number;
  },
): boolean {
  if (order.cargoWeightKg !== null && order.cargoWeightKg > spec.maxPayloadKg) {
    return false;
  }
  if (order.cargoLengthM !== null && order.cargoLengthM > spec.cargoLengthM) {
    return false;
  }
  if (order.cargoWidthM !== null && order.cargoWidthM > spec.cargoWidthM) {
    return false;
  }
  // 0 on the spec means "open / no height limit" (an open flatbed has no cargo
  // box), per `VehicleTypeSpec.cargoHeightM`'s own doc comment — not a literal
  // zero-height ceiling.
  if (
    order.cargoHeightM !== null &&
    spec.cargoHeightM !== 0 &&
    order.cargoHeightM > spec.cargoHeightM
  ) {
    return false;
  }
  return true;
}
```

**Driver route:** add the order's four cargo columns to the existing `existing`
`findUnique` select, and the chosen vehicle's spec figures to the existing
`vehicle` lookup — change its `select` from `{ id: true, vehicleTypeSpecId: true
}` to also pull `vehicleTypeSpec: { select: { maxPayloadKg: true, cargoLengthM:
true, cargoWidthM: true, cargoHeightM: true } }`. Immediately after the
existing type-match `400`, add:

```ts
if (!fitsCargo(existing, vehicle.vehicleTypeSpec)) {
  return NextResponse.json(
    {
      error:
        "This vehicle can't carry this load's cargo — it exceeds the weight or size limit.",
    },
    { status: 400 },
  );
}
```

**Company route:** the existing `matchingVehicle` lookup only proves *a*
vehicle of the right type exists in the fleet; it needs the type's spec
figures too, and needs to keep searching if the first type-matching vehicle
doesn't fit (a fleet can own several vehicles of the same
`vehicleTypeSpecId`... though in practice a spec's dimensions are fixed per
type, so if one fails, all do — the loop below is defensive, not load-bearing).
Also add the order's cargo columns to the existing `findUnique`:

```ts
const matchingVehicle = await prisma.vehicle.findFirst({
  where: {
    companyId: company.id,
    vehicleTypeSpecId: existing.vehicleTypeSpecId,
  },
  select: {
    id: true,
    vehicleTypeSpec: {
      select: {
        maxPayloadKg: true,
        cargoLengthM: true,
        cargoWidthM: true,
        cargoHeightM: true,
      },
    },
  },
});

if (!matchingVehicle) {
  return NextResponse.json(
    { error: "Your fleet has no vehicle of the type this delivery requires." },
    { status: 400 },
  );
}

if (!fitsCargo(existing, matchingVehicle.vehicleTypeSpec)) {
  return NextResponse.json(
    {
      error:
        "Your fleet's vehicles of this type can't carry this load's cargo — it exceeds the weight or size limit.",
    },
    { status: 400 },
  );
}
```

### A HAZMAT warning, not a gate

If `order.handlingTags` includes `"HAZMAT"`, the response should surface that
carrier certification is required — but **nothing gates it**. State this
plainly for whoever builds the UI on top of this response: `DriverLicence` has
no certification field anywhere in the schema, so any licensed driver, or any
activated company, can claim a hazmat load today. This is a genuine compliance
exposure, not an oversight this task is meant to close — it is tracked in
`specs/driver-load-board/action-required.md` under "Gate hazmat loads on driver
certification." This task's only obligation is to make sure `handlingTags`
actually reaches the caller so the confirm dialog (a later wave) can read it
and show a warning; do not add any check that blocks a hazmat claim.

### Price-free response

On success, both routes currently do:

```ts
const order = await prisma.order.findUnique({
  where: { id },
  select: ORDER_PARTY_SELECT,
});
return NextResponse.json(order, { status: 200 });
```

`ORDER_PARTY_SELECT` (`src/lib/order-response-select.ts`) includes `price` —
correct for the lifecycle endpoints it was designed for, wrong for a claim
response reachable from the board. Replace the `select` on both routes' success
path with one that drops `price` and adds the fields the board actually needs:

```ts
const order = await prisma.order.findUnique({
  where: { id },
  select: { ...ORDER_PARTY_SELECT, price: false, driverPayout: true, reference: true, handlingTags: true },
});
```

Spreading `ORDER_PARTY_SELECT` and overriding `price: false` keeps this
resilient to that constant growing new fields later (they're included by
default) while guaranteeing `price` specifically is never one of them, rather
than hand-listing every field this task does want and silently drifting from
`ORDER_PARTY_SELECT` as it evolves.

### API Endpoints

- `POST /api/orders/[id]/accept` — body unchanged: `{ vehicleId: string }`.
  - `200` — `Order` shape as constructed above (`price` absent, `driverPayout`
    + `reference` + `handlingTags` present).
  - `401`/`403` (role) — unchanged.
  - `403 { error, code: "DRIVER_OFFLINE" }` — **new.**
  - `403` (roster) / `403` (unactivated) — unchanged messages.
  - `404` (`"Vehicle not found."`, no such driver profile or no such/foreign
    vehicle) / `404` (`"Order not found."`) — unchanged.
  - `400` (vehicle type mismatch) — unchanged.
  - `400` (cargo doesn't fit) — **new.**
  - `409 { error, code: "ALREADY_CLAIMED", reference }` — **enriched** (was a
    bare `{ error }`).

- `POST /api/logistics-company/orders/[id]/claim` — no body, unchanged.
  - `200` — `Order` shape as constructed above.
  - `401`/`403` (role) / `400` (no company profile) / `403` (unactivated) —
    unchanged.
  - `404` (`"Order not found."`) — unchanged.
  - `400` (no vehicle of the required type) — unchanged.
  - `400` (fleet's vehicles of that type don't fit the cargo) — **new.**
  - `409 { error, code: "ALREADY_CLAIMED", reference }` — **enriched.**

## Acceptance Criteria

- [ ] **Two concurrent `POST /api/orders/[id]/accept` (or two concurrent
      company claims) for the same `PENDING` order result in exactly one `200`
      and one `409` — never two `200`s, never two `409`s. Verify by firing both
      requests in parallel (e.g. `Promise.all`) against one seeded order and
      asserting the outcome pair, then asserting exactly one `Order` row now has
      `driverId`/`companyId` set.**
- [ ] The losing request's `409` body includes `code: "ALREADY_CLAIMED"` and
      `reference` equal to the order's actual `Order.reference`.
- [ ] A `DriverProfile` with `isOnline: false` gets `403 { code:
      "DRIVER_OFFLINE" }` from `POST /api/orders/[id]/accept` and the order is
      not claimed (`driverId` still `null` afterward).
- [ ] The same offline driver still gets a normal, unfiltered response from
      whatever endpoint lists open loads for them — this task does not touch
      any listing endpoint, only claim.
- [ ] A vehicle whose `vehicleTypeSpecId` matches the order but whose
      `vehicleTypeSpec` payload or L/W/H is smaller than the order's declared
      cargo gets `400` from the driver route, and the order remains `PENDING`.
- [ ] A company whose fleet has a type-matching vehicle that doesn't fit the
      cargo gets the equivalent `400` from the company route.
- [ ] An order with `cargoWeightKg`/dimensions all `null` (a legacy,
      pre-cargo order) is still claimable by both routes when the vehicle type
      matches — the fit re-check does not regress existing behaviour for
      orders with no cargo data.
- [ ] A successful claim's response body has no `price` key (assert with
      `!("price" in body)` or equivalent, not merely `body.price === undefined`)
      and does include `driverPayout`, `reference`, and `handlingTags`.
- [ ] A successful company claim leaves `status: "CLAIMED"`, `companyId` set,
      `driverId: null` — unchanged from current behaviour.
- [ ] `POST /api/logistics-company/orders/[id]/dispatch` (untouched by this
      task) still moves that same order `CLAIMED → ACCEPTED` afterward — a
      regression check that this task's changes to `claim` didn't disturb the
      state `dispatch` depends on.
- [ ] The existing roster-driver `403` and unactivated-driver `403` on
      `POST /api/orders/[id]/accept`, and the existing unactivated-company
      `403` on the claim route, still fire with their exact original messages.
- [ ] An order carrying `HAZMAT` in `handlingTags` is claimable by both routes
      with no additional check or block — a hazmat claim from an uncertified
      driver succeeds today, by design (see Notes).
- [ ] `pnpm check` passes.

## Notes

- **Hazmat is a genuine, tracked compliance gap, not a bug in this task.**
  `specs/driver-load-board/action-required.md` → "Gate hazmat loads on driver
  certification" is the record of it. Do not add gating logic here to "fix"
  it — that needs a certification field on `DriverLicence`, capture during
  onboarding, and admin verification, none of which exist yet, and a
  half-built gate (e.g. blocking on a field that doesn't exist) would be worse
  than the honest warning-only behaviour this task ships.
- **Why extend rather than duplicate the company claim route:** stated in full
  above under "The company path," repeated here because it's the one
  structural decision in this task that isn't a code snippet — a reviewer
  should be able to find the reasoning without reading the whole file. The
  short version: one atomic `PENDING → CLAIMED` transition, one implementation
  of it.
- **`driverId` on `Order` is a `User.id`, not a `DriverProfile.id`** —
  `session.user.id` is what the existing accept route already writes there; this
  task doesn't change that, just noting it since it's easy to mix up with
  `LoadRejection.driverProfileId` (task-07), which *is* a `DriverProfile.id`.
  They are deliberately different id spaces on different tables and this task
  does not reconcile them.
