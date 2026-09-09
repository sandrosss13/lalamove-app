# Task 08: Claim API

## Status

complete

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

The fit predicate is **imported, not written**: `capabilityOf`, `loadFits` and
`widestCapability` from `src/lib/orders/vehicle-fit.ts` (task-06's module, which
this task must not modify) are the only definition of "fits" either route may
use.

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
trusting that the load was listed.**

**Both routes re-check with `src/lib/orders/vehicle-fit.ts` — the same module
task-06's `GET /api/loads` filters the board with. Neither route defines its own
fit predicate.** There must be exactly one definition of "fits" in the codebase.
An earlier revision of this task had each route carry a local `fitsCargo` that
measured the load against `VehicleTypeSpec` alone, and that is precisely the
divergence to avoid: `capabilityOf` prefers a vehicle's OWN driver-declared
`payloadKg`/`cargoLengthM`/`cargoWidthM`/`cargoHeightM` and falls back to the
class spec per field, and `model Vehicle` in `prisma/schema.prisma` records a
submit-time check forcing a declared `payloadKg` to be at or above its resolved
spec's `maxPayloadKg` (read that block for the authoritative statement of what
those columns mean — do not quote it, it is amended as their use grows). So
declared capacity is systematically at or above the spec, a spec-only re-check
is systematically stricter than the board, and the board would routinely list
loads that the claim then refuses with a `400` — the driver taps Accept and it
fails.

**The one deliberate asymmetry with the listing: the null pre-check.**
`loadFits` returns `false` when any load dimension is null, because unknown must
mean does-not-fit for a *listing* — hiding a load of unknown size costs nobody
anything, while sending a driver to one that turns out not to fit costs them the
trip. That rule is wrong for these routes, which are also the **legacy claim
path**: the driver route is the write path behind `GET /api/orders`, which
predates cargo capture and still returns every legacy `PENDING` order with null
weight and dimensions, and the company route has likewise always claimed them.
Applying the listing's rule here would make every pre-cargo order permanently
unclaimable by the same endpoint that has always claimed them. So:

- Order declares **no cargo at all** (all four columns null) → skip the fit
  check entirely; there is nothing to measure.
- Order declares **any** cargo → measure it with `loadFits`, including its
  all-or-nothing rule under which a partially declared load does not fit. That
  case cannot strand a board user, because the board does not list such a load
  either.

Document that asymmetry, and why it is deliberate, in both route files.

**Driver route:** add the order's four cargo columns to the existing `existing`
`findUnique` select, and **both** capacity sources to the existing `vehicle`
lookup — its own `payloadKg`/`cargoLengthM`/`cargoWidthM`/`cargoHeightM` *and*
`vehicleTypeSpec: { select: { maxPayloadKg: true, cargoLengthM: true,
cargoWidthM: true, cargoHeightM: true } }`, since `capabilityOf` resolves one
against the other. Immediately after the existing type-match `400`, add:

```ts
const declaredCargo: LoadDimensions = {
  weightKg: existing.cargoWeightKg,
  lengthM: existing.cargoLengthM,
  widthM: existing.cargoWidthM,
  heightM: existing.cargoHeightM,
};

const hasDeclaredCargo =
  declaredCargo.weightKg !== null ||
  declaredCargo.lengthM !== null ||
  declaredCargo.widthM !== null ||
  declaredCargo.heightM !== null;

if (
  hasDeclaredCargo &&
  !loadFits(declaredCargo, capabilityOf(vehicle, vehicle.vehicleTypeSpec))
) {
  return NextResponse.json(
    {
      error:
        "This vehicle can't carry this load's cargo — it exceeds the weight or size limit.",
    },
    { status: 400 },
  );
}
```

**Company route:** the existing lookup only proves *a* vehicle of the right type
exists in the fleet, and it must become a `findMany`. A single row was defensible
only while fit was measured against the class spec, where every vehicle of a type
resolves to identical figures; once each vehicle's own declared capacity is
preferred, two trucks of the same class no longer necessarily agree. Take the
per-axis maximum across the type-matching vehicles with `widestCapability` — the
same knowingly optimistic rule task-06 applies to a company's board (a company
names a real truck at dispatch and sees any mismatch there, at a desk, before
anything rolls; being *stricter* than the board is the failure that matters
here). `widestCapability` returns `null` for an empty fleet and only for an empty
fleet, so the existing "no vehicle of the required type" `400` falls out of the
same expression, unchanged in wording. Also add the order's cargo columns to the
existing `findUnique`:

```ts
const matchingVehicles = await prisma.vehicle.findMany({
  where: {
    companyId: company.id,
    vehicleTypeSpecId: existing.vehicleTypeSpecId,
  },
  select: {
    payloadKg: true,
    cargoLengthM: true,
    cargoWidthM: true,
    cargoHeightM: true,
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

const fleetCapability = widestCapability(
  matchingVehicles.map((vehicle) =>
    capabilityOf(vehicle, vehicle.vehicleTypeSpec),
  ),
);

if (fleetCapability === null) {
  return NextResponse.json(
    { error: "Your fleet has no vehicle of the type this delivery requires." },
    { status: 400 },
  );
}

// `declaredCargo` / `hasDeclaredCargo` exactly as on the driver route above.
if (hasDeclaredCargo && !loadFits(declaredCargo, fleetCapability)) {
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
      **resolved capability** (declared columns where present, spec as the
      per-field fallback) is smaller than the order's declared cargo on any axis
      gets `400` from the driver route, and the order remains `PENDING`.
- [ ] A company whose type-matching vehicles all fall short of the cargo on some
      axis gets the equivalent `400` from the company route.
- [ ] A vehicle whose **declared** `payloadKg`/dimensions exceed its class spec
      and are large enough for the load is **accepted**, not refused — the case
      the old spec-only check got wrong, and the one the board itself lists.
      Anything the board shows must be claimable.
- [ ] An order with `cargoWeightKg`/dimensions all `null` (a legacy,
      pre-cargo order) is still claimable by both routes when the vehicle type
      matches — the fit re-check does not regress existing behaviour for
      orders with no cargo data.
- [ ] An order declaring only *some* of its cargo columns is refused with the
      same `400` — `loadFits`' all-or-nothing rule, matching the board, which
      does not list such a load either.
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
