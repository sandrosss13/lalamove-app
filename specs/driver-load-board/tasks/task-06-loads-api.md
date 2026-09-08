# Task 06: `GET /api/loads`

## Status

complete

## Wave

2

## Description

Creates the load board's single data source: `GET /api/loads`. This is the
most important endpoint in the feature — everything downstream (the board
shell, the table, the drawer, the dialogs) renders exactly what this route
returns and nothing else. It resolves the signed-in driver or company account,
runs the eligibility filter **server-side** — the vehicle class the client
booked *and* the physical fit, both satisfied by one registered vehicle — so a
load this account could not actually claim is absent from the response rather
than merely hidden by the client,
excludes loads this account has rejected (while exposing them separately so
the UI's rejected list can restore them), and reshapes every row so that
`Order.price` — the client's total — never appears, replacing it with
`Order.driverPayout`, the driver's 85% share. It also redacts stop contacts
per row using the same reasoning the two existing order-listing endpoints
already apply, and adds two fields the approved design does not show but the
board cannot work well without: distance from the driver to the pickup, and
the load's age.

## Dependencies

**Depends on:** task-01-schema-and-migration, task-02-payout-and-reference, task-03-vehicle-fit
**Blocks:** task-09-board-shell

**Context from dependencies:**

**task-01-schema-and-migration** added the physical description of a load to
`Order`, plus a rejection table. On `Order`: `reference` (`String @unique`,
`GE-48210` form — a human-readable id, since `Order.id` is a cuid nobody can
read aloud); `cargoWeightKg`, `cargoLengthM`, `cargoWidthM`, `cargoHeightM`
(all `Float?` — the load's physical description, declared by the client on
top of the vehicle class they picked; **null on every order placed before
this feature existed**, and on any order whose client skipped the field);
`packagingDescription`, `itemQuantity` (`String?`); `handlingTags`
(`CargoHandlingTag[]`, defaults to `[]`, never null); `pickupWindowStart`,
`pickupWindowEnd`, `deliveryDeadline` (all `DateTime?`); `commissionRate`
(`Float @default(0.15)`) and `driverPayout` (`Float @default(0)`, already
resolved and stored at order creation — **this endpoint reads the stored
column, it does not recompute payout from `price`**). The enum
`CargoHandlingTag` has exactly six values: `FRAGILE`, `COLD_CHAIN`, `HAZMAT`,
`TIME_CRITICAL`, `UPRIGHT_ONLY`, `HEAVY_ITEM`. `Order` also gained a composite
index `@@index([status, driverId, companyId])` specifically for this board's
hot query — use it by filtering on exactly those three columns together. The
new model `LoadRejection { id, orderId, driverProfileId?, companyId?,
createdAt }` records one account hiding one order from its own board; exactly
one of `driverProfileId`/`companyId` is set per row, with a unique index on
each of `(orderId, driverProfileId)` and `(orderId, companyId)` so an account
can reject a given order at most once.

**task-02-payout-and-reference** created `src/lib/orders/payout.ts` and
`src/lib/orders/reference.ts`. This task does **not** call `driverPayoutFor`
or `formatOrderReference` — those run at order-creation time (task-05) and
their results are already sitting in the `Order.driverPayout` and
`Order.reference` columns by the time this endpoint reads them. This task is
listed as depending on task-02 only because it reads those two columns, whose
shape and meaning task-02's file documents.

**task-03-vehicle-fit** created `src/lib/orders/vehicle-fit.ts`, exporting:
`capabilityOf(vehicle, spec)` — builds a capability object (payload and
L×W×H) from one vehicle and its `VehicleTypeSpec`; `loadFits(load,
capability)` — true only if the load's weight and all three dimensions are
each within the capability, and **false whenever any of the load's four
physical fields is null** (unknown is treated as not-fitting, never as
fitting); `widestCapability(capabilities)` — reduces several vehicles'
capabilities to one representing the largest payload and each largest
dimension across them; `fitsAnyVehicle(load, capabilities)` — true if the
load fits at least one of several capabilities. Treat this description as
the contract; if task-03's actual exports differ in a small way (parameter
order, an extra field), follow what task-03 actually shipped — this task's
job is to call those functions, not to redefine them.

**One correction to make before writing code — and note that this correction
was itself corrected once.** An earlier draft of this task said to build every
capability from `vehicleTypeSpec` alone, on the strength of a `model Vehicle`
comment describing `payloadKg`/`cargoLengthM`/`cargoWidthM`/`cargoHeightM` as
compliance-display-only. **That is no longer what the schema says**, because
Wave 1 (task-01) amended that comment as part of this very feature. Read the
current block on `model Vehicle` in `prisma/schema.prisma` rather than any
quotation of it: those columns remain compliance-only for *pricing* (which
still reads `vehicleTypeSpec` alone) and for *dispatch matching* (which keys on
`vehicleTypeSpecId`), but the comment now states plainly that `capabilityOf`
reads them for the load board, "preferring the declared value and falling back
to the spec when it is null", because "the fit filter is about the truck that
actually turns up, so the vehicle's own declared capacity is the more accurate
figure there." The same comment records the submit-time server check that makes
those declarations trustworthy: a vehicle's `payloadKg` must be at or above its
resolved spec's `maxPayloadKg`, so a vehicle cannot be registered under a class
it physically cannot meet.

So every call to `capabilityOf` in this task passes **both** the vehicle and
its spec — `capabilityOf(vehicle, vehicle.vehicleTypeSpec)` — and the `select`
must therefore include the vehicle's own four columns alongside the nested
`vehicleTypeSpec` ones. Do not pass a stub of nulls in the vehicle position:
that silently reverts the board to class-average matching and hides loads a
driver's actual truck can carry, which is the precise failure the fit filter
exists to prevent. It is also invisible in local testing — `prisma/seed.ts`
seeds the `VehicleTypeSpec` catalogue only and creates no `Vehicle` rows, so
overrides appear solely on vehicles registered through onboarding.

## Files to Create

- `src/app/api/loads/route.ts` — the `GET` handler, its request/response
  types, and its route-local select/redaction helpers

## Files to Modify

None. This is a new endpoint at a new path; `src/app/api/orders/route.ts`'s
existing `GET` (the DRIVER branch described in the Description above) is
explicitly out of scope and must not be touched.

## Technical Details

### Context you need

**Session and account resolution.** Use `auth.api.getSession({ headers:
request.headers })`, exactly as every other route handler in this codebase
does — never `next/headers`' `headers()` directly in a route handler.

For the account itself, reuse `resolveHubAccount` from
`src/lib/dashboard/hub/account.ts` rather than re-deriving the same
`DriverProfile`/`LogisticsCompany` lookups a third time. It already resolves
the signed-in user into `{ kind: "BUSINESS" | "INDIVIDUAL", userId,
driverProfileId: string | null, companyId: string | null, canToggleOnline:
boolean, ... }` (`kind` is `"BUSINESS"` for a `COMPANY` session and
`"INDIVIDUAL"` for a `DRIVER` session). Three things about it matter here:

1. It is built on top of `requireDashboardSession()`, which calls
   `redirect()` on a signed-out session, a forced-password-change session, or
   a `CLIENT` session. A `redirect()` thrown inside a route handler is the
   wrong answer to a `fetch()` call — the browser would follow it — so do
   **not** call `resolveHubAccount()` first. Follow the exact pattern already
   in production at `src/app/api/dashboard/hub/earnings/export/route.ts`:
   check the session, `mustChangePassword`, and the role yourself first (as
   plain `401`/`403` JSON responses), and only call `resolveHubAccount()`
   once none of those early exits can fire — at that point its internal
   `requireDashboardSession()` call cannot redirect either, because you have
   already ruled out every condition it redirects on.
2. `account.companyId` on an `INDIVIDUAL` (driver) account is
   `DriverProfile.companyId` — the fleet a roster driver belongs to, or
   `null` for an independent driver/sole proprietor. This is exactly the
   field the roster-driver refusal (below) needs; do not query
   `DriverProfile` again to get it.
3. `account.canToggleOnline` on an `INDIVIDUAL` account is computed inside
   `resolveHubAccount` as `driverProfile.activatedAt !== null` — read that
   function's source before relying on this, but as written today it is an
   exact, reusable proxy for "this driver is activated." Reuse it instead of
   a second `DriverProfile` query for `activatedAt`; if `resolveHubAccount`
   is ever changed to compute `canToggleOnline` differently, this endpoint
   would need a real `activatedAt` read instead, so leave a comment saying
   so.

**Distance.** `src/lib/geo.ts` already exports `haversineDistanceKm(a:
LatLng, b: LatLng): number` and `type LatLng = { lat: number; lng: number }`.
Use it; do not write a second haversine.

**Contact redaction.** `src/app/api/orders/route.ts` and
`src/app/api/logistics-company/orders/route.ts` each define their own
route-local `canSeeStopContacts` predicate and their own route-local
`*_SELECT` column allowlist, and `src/lib/order-response-select.ts`'s doc
comment explains why deliberately: the two listing endpoints "serve
non-parties too... and must be free to withhold more than" the shared
`ORDER_PARTY_SELECT` used by the lifecycle (accept/claim/dispatch) endpoints.
This is a third listing endpoint with its own non-party audience (a
driver/company browsing loads it has not claimed), so **follow the same
convention**: a route-local select constant and a route-local
`canSeeStopContacts`, not an import from either existing file (neither
function is exported) and not a new shared module (nothing asked for one).
The one difference from both existing predicates: this endpoint serves two
account kinds behind one session, so the predicate needs to check "is this
order assigned to *my* account" where "my account" means `driverId ===
account.userId` for a driver or `companyId === account.companyId` for a
company — a small merge of the two existing checks, not a copy of either
alone. Keep the same heavy WHY-focused doc comment style both existing
functions use — explain *why* an unclaimed load withholds contacts, not just
that it does.

**The roster-driver refusal.** `src/app/api/orders/[id]/accept/route.ts`
already refuses a roster driver (`driverProfile.companyId !== null`) with:

```
"Drivers who belong to a company receive deliveries through their company's dispatch, not by accepting directly."
```

This endpoint is a listing, not an action, so adapt the wording rather than
reusing it verbatim (e.g. "...not through the open load board.") but keep
the *reasoning* identical, and return the same `403`. This is a deliberate
scoping choice, not an oversight: see requirements.md's Assumptions
("Roster drivers keep current behaviour... This is a deliberate scoping
choice... See `action-required.md`") and action-required.md's "Decide
whether employed roster drivers get the board" item, which records the
default (no) and the alternative (a per-company opt-in toggle) as an open
business decision, not a technical one. Cite both files in the code comment
next to this check.

**Eligibility is two tests, not one — and they must land on the same
vehicle.** (Coordinator decision, made during review of the shipped route; it
supersedes the "fit filter" language elsewhere in this file, which described
only the physical half.)

A load is eligible for an account only if that account has at least one
registered vehicle that **both** (a) has `vehicleTypeSpecId ===
order.vehicleTypeSpecId` and (b) whose resolved capability passes `loadFits`.
The same vehicle must satisfy both. A driver with a matching-class van and a
big-enough truck of some other class can fulfil with neither.

*Why the class test belongs here at all.* The client picks a vehicle class on
the booking form, is priced on it and pays for it; `Order.vehicleTypeSpecId` is
that commercial promise recorded. Fulfilling in a different class delivers
something other than what was bought, so **both** claim routes already require
the claiming vehicle's class to equal the order's —
`src/app/api/orders/[id]/accept/route.ts` refuses with *"This vehicle's type
doesn't match what this delivery requires."* (400) and
`src/app/api/logistics-company/orders/[id]/claim/route.ts` with *"Your fleet has
no vehicle of the type this delivery requires."* (400). Those requirements are
correct and **stay where they are** — this endpoint does not replace them.
Filtering only on physical fit here meant the board offered loads that Accept
then refused: the driver taps, gets a 400, and learns nothing actionable. The
board's job is to show only work that can actually be claimed, so it applies the
same constraint the claim will.

The two tests answer different questions and neither subsumes the other: the
class is the commercial contract, the physical fit is the reality check on the
specific truck that would turn up (a `Vehicle`'s own declared capacity, which
`capabilityOf` prefers over the class average, can differ within one class).

*Implementation shape.* Group the account's vehicles into capabilities keyed by
`vehicleTypeSpecId` (`Map<string, VehicleCapability[]>`), then run the fit test
only against `get(order.vehicleTypeSpecId)`. A class with no vehicle is absent
from the map, which reads as "nothing to claim that load with". Two independent
passes over a flat capability list would pass the mixed-fleet driver above and
is the specific bug to avoid. **For a COMPANY this also means `widestCapability`
must be computed over the class-matching subset, never the whole fleet** —
widening across the whole fleet reintroduces exactly the mismatch being fixed (a
fleet of vans plus one heavy truck would claim van-class loads against the
truck's payload, and the company claim route, which measures the class-matching
vehicle, would refuse).

**No query parameters.** The design's city/drop-city selects, the weight
slider, and the handling-tag chips are client-side filters layered on top of
the server-side vehicle-fit filter (`requirements.md`'s Technical
Constraints: "The fit filter runs server-side. Repeating it client-side for
responsive UI is fine, but it must **not be the only place it exists**" —
implying the reverse is fine: filters that are *only* client-side are fine
for everything that is not the fit filter). This endpoint accepts no query
string and returns every fitting, non-rejected candidate; task-09/task-10
apply city, weight-ceiling, handling-tag and sort filtering to the response
in the browser. Do not add query-parameter filtering here — it is out of
scope for this task and would duplicate logic the later tasks own.

### Implementation Steps

1. Create `src/app/api/loads/route.ts` with `import "server-only";` as the
   first statement (this module talks to Prisma and reads the session, so it
   must never reach a client bundle — mirror every other route handler and
   server module in the codebase).

2. **Authorise**, in this order, returning as soon as one check fires:
   - No session → `401 { error: "Unauthorized." }`.
   - `session.user.mustChangePassword` → `403`. Use wording distinct from the
     role check below so a stuck-on-temp-password driver isn't told they lack
     permission.
   - `session.user.role` is neither `"DRIVER"` nor `"COMPANY"` → `403 {
     error: "Only drivers and logistics companies can view the load board."
     }`. (This also correctly excludes `CLIENT` and every back-office role;
     `CLIENT` never reaches `requireDashboardSession()`'s redirect here
     because this check runs first.)
   - Call `const account = await resolveHubAccount();`. If `account === null`
     (session role is right but the matching `DriverProfile`/
     `LogisticsCompany` row does not exist — onboarding interrupted
     part-way, mirroring the same `null` case `resolveHubAccount`'s own doc
     comment describes) → `403 { error: "Your driver profile isn't set up
     yet." }` for a `DRIVER` session, or the company equivalent for
     `COMPANY`. Match the wording already used for this exact case in
     `src/app/api/dashboard/hub/earnings/export/route.ts`.

3. **Roster-driver refusal**, `DRIVER` sessions only (`account.kind ===
   "INDIVIDUAL"` and `session.user.role === "DRIVER"`): if
   `account.companyId !== null`, return `403` with the adapted message
   described above.

4. **Not-yet-activated driver → empty board**, `DRIVER` sessions only: if
   `account.canToggleOnline === false` (see the reuse note above), return
   `200` immediately with `{ available: [], mine: [], rejected: [],
   hiddenByCapacityCount: 0 }`. Do not run any of the queries below for this
   case — there is nothing to compute.

5. **Load each account's fleet capability, keyed by vehicle class.** Every
   `select` below must also include `vehicleTypeSpecId: true` on the vehicle
   itself, and the resulting capabilities must be grouped by it — see
   "Eligibility is two tests" above. The snippets in this step predate that
   decision and show the ungrouped flat list; keep their `capabilityOf` call
   shape and add the grouping.
   - `DRIVER` (independent, already known not to be a roster driver):
     ```ts
     const vehicles = await prisma.vehicle.findMany({
       where: { driverProfileId: account.driverProfileId! },
       select: {
         // The class this vehicle may claim work in.
         vehicleTypeSpecId: true,
         // The vehicle's own declared capacity — `capabilityOf` prefers these
         // and falls back to the spec per field. See the correction above for
         // why omitting them breaks the filter.
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
     const capabilities = vehicles.map((v) => capabilityOf(v, v.vehicleTypeSpec));
     ```
     (Adjust the exact call to `capabilityOf`'s real signature once task-03
     lands — the point is: one capability per registered vehicle, resolved from
     that vehicle's own declared figures with its `vehicleTypeSpec` as the
     per-field fallback.) A driver with **zero** registered
     vehicles has an empty `capabilities` array; treat that the same as "no
     load fits" (skip straight to an empty `available` list with
     `hiddenByCapacityCount` equal to the full open-candidate count) rather
     than calling `fitsAnyVehicle` with nothing to check against.
   - `COMPANY`:
     ```ts
     const fleet = await prisma.vehicle.findMany({
       where: { companyId: account.companyId! },
       select: {
         // Same as the driver branch: the class first, then the vehicle's own
         // declared capacity, with the spec as the per-field fallback.
         vehicleTypeSpecId: true,
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
     const capabilities = fleet.map((v) => capabilityOf(v, v.vehicleTypeSpec));
     const widest = capabilities.length > 0 ? widestCapability(capabilities) : null;
     ```
     **Superseded in one respect:** `widest` is computed **per
     `vehicleTypeSpecId`**, over the class-matching subset of the fleet, not
     once over the whole fleet as written above. The reasoning below for
     *`widestCapability` rather than `fitsAnyVehicle`* is unchanged; only the
     population it widens over is narrowed. See "Eligibility is two tests".

     **Why `widestCapability` and not `fitsAnyVehicle` for a company:** per
     requirements.md's Assumptions and the design handoff's "Open questions
     carried out of design" #1, a company claims a load with its *account*,
     not a specific truck — the vehicle/driver assignment happens afterwards,
     from the job sheet (out of scope here; the claim itself is task-08).
     At claim time there is no specific vehicle yet to test the load against,
     so this endpoint has to make an optimistic guess about what the fleet
     *could* carry: the single largest payload and largest each-dimension
     across every fleet vehicle, taken independently per axis. This is
     deliberately optimistic — a real fleet may have one vehicle with the
     largest payload and a different one with the largest cargo box, and
     `widestCapability` will synthesise a capability no single truck actually
     has. That is an accepted, documented trade-off of claim-first-assign-
     later, not a bug: the alternative (picking a specific vehicle at claim
     time) was one of the two options the design left open and unresolved,
     and this task picks the other one. State this trade-off in a doc
     comment next to the `COMPANY` branch, not just here. A company with an
     empty fleet gets `widest === null`, treated the same as "no load fits."

6. **Query the candidate orders.** One `findMany` covering both the open
   market and this account's own assignments, filtered afterward in
   memory rather than with a second round trip (the whole result set for one
   account is small enough that an extra `where` branch just to avoid one
   filter pass is not worth the query complexity):
   ```ts
   const myAssignmentFilter: Prisma.OrderWhereInput =
     account.kind === "INDIVIDUAL"
       ? { driverId: account.userId }
       : { companyId: account.companyId! };

   const orders = await prisma.order.findMany({
     where: {
       OR: [
         { status: OrderStatus.PENDING, driverId: null, companyId: null },
         myAssignmentFilter,
         {
           status: { in: [OrderStatus.CLAIMED, OrderStatus.ACCEPTED] },
           updatedAt: { gte: new Date(Date.now() - CLAIMED_VISIBILITY_WINDOW_MS) },
           NOT: myAssignmentFilter,
         },
       ],
     },
     select: LOADS_SELECT, // see Code Snippets — never a bare `select`-less findMany
     orderBy: { createdAt: "desc" },
   });
   ```
   The third `OR` branch is the transient "just claimed by someone else"
   visibility window — see the Status Mapping section below for why it
   exists and how it is used. `updatedAt` is safe to key this on because the
   atomic claim update (task-08, following the exact pattern
   `src/app/api/orders/[id]/accept/route.ts:144` already uses) sets `status`,
   `driverId`/`companyId` and (implicitly, via Prisma's `@updatedAt`)
   `updatedAt` in the same single `updateMany` — so `updatedAt` on a newly
   `CLAIMED`/`ACCEPTED` row *is* the claim instant.

   Add:
   ```ts
   const CLAIMED_VISIBILITY_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
   ```
   as a named, documented constant (not a magic number inline) — say in its
   comment that this is deliberately short and independent of task-14's poll
   interval; task-14 should read this constant's value (or a duplicate kept
   in sync) rather than guessing a compatible number.

7. **Fetch this account's rejections** as a `Set<string>` of `orderId`:
   ```ts
   const rejections = await prisma.loadRejection.findMany({
     where:
       account.kind === "INDIVIDUAL"
         ? { driverProfileId: account.driverProfileId! }
         : { companyId: account.companyId! },
     select: { orderId: true },
   });
   const rejectedOrderIds = new Set(rejections.map((r) => r.orderId));
   ```

8. **Classify every returned order into exactly one bucket**, in this order
   of precedence (an order can only match one, but the precedence matters
   for the "mine + also rejected in the past" edge case — being claimed by
   someone else takes precedence over a stale rejection row, since rejecting
   an order does not un-assign it from whoever holds it):
   - **mine** — matches `myAssignmentFilter` (this account holds it),
     **and** its status is one of `CLAIMED`, `ACCEPTED`, `IN_TRANSIT` — see
     the Status Mapping section for why `COMPLETED`/`CANCELLED` orders are
     excluded even though they still technically "belong" to this account.
   - **available, fitting** — `status === PENDING`, unassigned, fits this
     account's capability (see step 9), **and** `!rejectedOrderIds.has(id)`.
   - **available, transient-claimed** — matched the third `OR` branch in
     step 6 (someone else, recently). Not fit-filtered (see Status Mapping)
     and not rejection-filtered (a load this account already rejected has no
     business reappearing just because someone else claimed it — exclude it
     from this bucket the same as from the fitting bucket).
   - **rejected** — `status === PENDING`, unassigned, **and**
     `rejectedOrderIds.has(id)`. Not fit-filtered (see Notes) — a driver's
     rejected list is a record of what they hid, not a live claimability
     check.
   - Anything else (an order this account neither holds nor could claim nor
     rejected, e.g. `PENDING` but outside the visibility window and assigned
     to someone else, or a terminal-status order belonging to someone else)
     is simply dropped — it is not part of this account's board at all.

9. **Eligibility-filter the "available, fitting" candidates** (only that
   bucket — see step 8). Two tests, class first, both against the same
   vehicle — see "Eligibility is two tests" above. Resolve each candidate to
   one of three outcomes rather than a boolean, because the two ways of
   failing are reported differently:
   - **wrong class** — the account has no vehicle registered under
     `order.vehicleTypeSpecId`. Drop the load. **Do not count it.**
   - **over capacity** — it has such a vehicle, but no class-matching vehicle
     passes the fit test (`fitsAnyVehicle` over the class-matching
     capabilities for a `DRIVER`; `loadFits` against that class's
     `widestCapability` for a `COMPANY`). Drop the load and count it toward
     `hiddenByCapacityCount`.
   - **eligible** — into `available`.

   The over-capacity count includes every order with a null
   `cargoWeightKg`/`cargoLengthM`/`cargoWidthM`/`cargoHeightM`, since
   `loadFits` already treats null as not-fitting (see task-03's contract
   above) and every order placed before this feature has all four null. This
   is intentional and self-correcting as legacy orders age out — say so in a
   comment, and see requirements.md's Assumptions for the same point made
   about the fit filter generally.

   **Why wrong-class loads are dropped silently rather than counted
   separately** (coordinator decision): `hiddenByCapacityCount` is rendered by
   task-10's footer as *"N loads hidden — over your vehicle capacity or
   dimensions"*, and that copy has to stay true of everything it counts. A
   load booked as a refrigerated truck is not "over the capacity" of a van —
   it is work the account was never eligible for, and folding it in would
   promise that a bigger vehicle unlocks loads it would not. A second counter
   was the alternative and was rejected for now: "17 loads exist for vehicle
   classes you don't operate" is closer to the size of the market than to a
   fact about this account, and it would dwarf the capacity figure on any real
   board. If product later wants it surfaced, that is a new response field with
   its own copy, not a redefinition of this one.

   A consequence worth expecting: an account with **zero** registered vehicles
   now returns an empty board with `hiddenByCapacityCount: 0` (every load is
   wrong-class, since the account has no class at all), where the earlier
   fit-only design returned the full open-candidate count. That is the honest
   answer — nothing is hidden by *capacity* when no vehicle has been
   registered — and it supersedes step 5's parenthetical and the two
   acceptance criteria noted below.

10. **Redact contacts per row** with the route-local `canSeeStopContacts`
    (step-8's bucket already tells you whether a row is "mine"; reuse that
    rather than re-deriving it) — null the six contact columns rather than
    omitting them, exactly as both existing listing endpoints do, so every
    row keeps one shape.

11. **Shape the money and distance fields** per row (see Code Snippets for
    the full `LoadBoardItem` type):
    - `driverPayout: order.driverPayout` — read directly, never recomputed.
    - `ratePerKm: order.distanceKm > 0 ? round2(order.driverPayout /
      order.distanceKm) : null` — guard the division; `distanceKm` should
      always be positive in practice but a stray `0` must not produce
      `Infinity` in a JSON response.
    - `pickupDistanceKm`: `null` unless the account has both
      `currentLat`/`currentLng` (read them alongside the capability query for
      a `DRIVER`; a `COMPANY` account has no single location, so this is
      always `null` for a `COMPANY` session — say so in the type's doc
      comment) **and** the order has both `pickupLat`/`pickupLng`; otherwise
      `haversineDistanceKm({ lat: ..., lng: ... }, { lat: order.pickupLat,
      lng: order.pickupLng })`.
    - `status`: the per-row `"available" | "claimed" | "mine"` from step 8's
      bucket (transient-claimed → `"claimed"`).

12. Assemble and return:
    ```ts
    return NextResponse.json<LoadBoardResponse>(
      { available, mine, rejected, hiddenByCapacityCount },
      { status: 200 },
    );
    ```

### City fields in the response

`Order.pickupCity` and `Order.dropoffCity` (added by task-01, resolved at
booking by task-05) are nullable `GeorgianCity` enum values. The board's two
city dropdowns filter on them, and the UI builds its dropdown options from the
distinct cities actually present in this response — so they must be returned on
every row.

Return them as **display labels**, not raw enum members: `"Tbilisi"`, not
`"TBILISI"`. `src/lib/format-city.ts` already does this mapping — reuse it
rather than writing a second one. Return `null` for a load whose city could not
be resolved; the UI renders those under no city and they are excluded whenever a
city filter is active.

Both are additive to the response shape defined below; add `pickupCity` and
`dropoffCity` (each `string | null`) to the per-load type.

### Code Snippets

```ts
/**
 * The `Order` columns this endpoint may read, and the only ones it may
 * return. Mirrors `ORDER_LIST_SELECT` in src/app/api/orders/route.ts and
 * `COMPANY_ORDER_LIST_SELECT` in
 * src/app/api/logistics-company/orders/route.ts — a third, route-local
 * allowlist rather than a shared one, per the reasoning in
 * src/lib/order-response-select.ts's doc comment (this endpoint serves
 * non-parties too, and must be free to withhold more than the shared
 * lifecycle-endpoint list does).
 *
 * `price`, `baseFare`, `distanceFare`, `timeFare`, `helperFee`,
 * `overtimeFee` and `serviceLevelAdjustment` are ALL deliberately absent.
 * `price` is what the client pays; every other field in that list is a
 * component that sums toward it. None of them may reach a driver — see the
 * GET handler's own doc comment for why this is the single most important
 * rule in this file. `savedCardId` and `purchaseOrderRef` are absent for the
 * same reason they are absent from every other listing endpoint: no
 * consumer of a dispatch surface has business with either.
 */
const LOADS_SELECT = {
  id: true,
  reference: true,
  cargoCategory: true,
  description: true,
  bodyType: true,
  helperCount: true,
  scheduledAt: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  distanceKm: true,
  cargoWeightKg: true,
  cargoLengthM: true,
  cargoWidthM: true,
  cargoHeightM: true,
  packagingDescription: true,
  itemQuantity: true,
  handlingTags: true,
  pickupWindowStart: true,
  pickupWindowEnd: true,
  deliveryDeadline: true,
  driverPayout: true,
  serviceLevel: true,
  vehicleTypeSpecId: true,
  status: true,
  driverId: true,
  companyId: true,
  vehicleId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Whether the requesting account may see one order's stop contacts.
 *
 * A stop contact is a named person and a phone number, collected so whoever
 * turns up at pickup/dropoff knows who to ask for. An account earns them
 * only once it holds the job — the open market this endpoint also lists
 * belongs to nobody yet, and a driver or company browsing it has committed
 * to nothing. Handles both account kinds behind one session: a driver's
 * "mine" is `driverId`, a company's is `companyId` — see
 * src/app/api/orders/route.ts and src/app/api/logistics-company/orders/
 * route.ts for the single-audience versions of this same rule this one
 * merges.
 *
 * Takes the NARROWED scope, not the `HubAccount`. On a `HubAccount` both ids
 * are `string | null`, so the BUSINESS branch would compare `order.companyId`
 * against a possibly-null `companyId` — and an open, unclaimed order has
 * `companyId: null`, so `null === null` would report the entire open market as
 * this account's own and hand out every client's stop contacts. The caller
 * 403s on a null `companyId` first, so it cannot happen today, but that makes
 * the safety incidental to the order of two distant statements. A scope whose
 * `companyId` is `string` makes the dangerous comparison unreachable instead.
 */
function canSeeStopContacts(
  order: { driverId: string | null; companyId: string | null },
  scope: LoadBoardScope, // { kind: "INDIVIDUAL"; userId; driverProfileId } | { kind: "BUSINESS"; companyId }
): boolean {
  return scope.kind === "INDIVIDUAL"
    ? order.driverId === scope.userId
    : order.companyId === scope.companyId;
}

/**
 * One row of the load board response.
 *
 * `driverPayout` and `ratePerKm` are the ONLY money figures here — there is
 * no `price` field on this type and there must never be one. See the GET
 * handler's doc comment.
 */
export type LoadBoardItem = {
  id: string;
  reference: string;
  status: "available" | "claimed" | "mine";
  cargoCategory: string;
  description: string | null;
  bodyType: string | null;
  helperCount: number;
  scheduledAt: string | null;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  pickupContactDetails: string | null;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  dropoffContactDetails: string | null;
  distanceKm: number;
  /** NOT in the approved design — see the GET handler's doc comment. */
  pickupDistanceKm: number | null;
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  packagingDescription: string | null;
  itemQuantity: string | null;
  handlingTags: string[]; // CargoHandlingTag[]
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryDeadline: string | null;
  driverPayout: number;
  ratePerKm: number | null;
  serviceLevel: string;
  vehicleTypeSpecId: string;
  driverId: string | null;
  companyId: string | null;
  vehicleId: string | null;
  /** NOT in the approved design — see the GET handler's doc comment. */
  createdAt: string;
  /** The claim instant for a `"claimed"` row; the UI derives "N min ago" from this. */
  updatedAt: string;
};

export type LoadBoardResponse = {
  available: LoadBoardItem[];
  mine: LoadBoardItem[];
  rejected: LoadBoardItem[];
  hiddenByCapacityCount: number;
};
```

### API Endpoints

- `GET /api/loads`

  **Auth:** Better Auth session required. Role must be `DRIVER` or
  `COMPANY`. A `DRIVER` with a non-null company affiliation is refused. No
  request body. **No query parameters** — see "No query parameters" above.

  **Responses:**

  | Status | Body | When |
  |---|---|---|
  | 200 | `LoadBoardResponse` (see below) | Authorised, whether or not there is anything to show |
  | 401 | `{ error: string }` | No session |
  | 403 | `{ error: string }` | Password-change pending; role is neither `DRIVER` nor `COMPANY`; profile row missing; `DRIVER` belongs to a company |

  **200 response body** — `LoadBoardResponse`:

  | Field | Type | Notes |
  |---|---|---|
  | `available` | `LoadBoardItem[]` | Claimable by this account — a single registered vehicle both matches `order.vehicleTypeSpecId` and passes `loadFits` — `PENDING` and unassigned or (transiently) just claimed by someone else, not rejected by this account. Newest first. |
  | `mine` | `LoadBoardItem[]` | Assigned to this account, status `CLAIMED`/`ACCEPTED`/`IN_TRANSIT`. Newest first. Not fit-filtered. |
  | `rejected` | `LoadBoardItem[]` | Still `PENDING` and unassigned, and this account has a `LoadRejection` row for it. Not fit-filtered. |
  | `hiddenByCapacityCount` | `number` | Count of `PENDING`, unassigned, non-rejected candidates that matched a registered vehicle's class but failed the **physical fit** test — the footer's "N loads hidden — over your vehicle capacity or dimensions." Includes every legacy order with null cargo data. **Excludes wrong-class loads, which are counted nowhere** (see step 9). |

  **`LoadBoardItem`** — one row, present in exactly one of the three arrays
  above (see Status Mapping): full field-by-field table in Code Snippets
  above. Every field there that is not `id`/`reference`/`status` is a direct
  or derived `Order` column; none of `price`, `baseFare`, `distanceFare`,
  `timeFare`, `helperFee`, `overtimeFee`, `serviceLevelAdjustment`,
  `savedCardId`, `purchaseOrderRef`, or `clientId` is ever present.

### Status mapping

The design's three row states — `available`, `claimed`, `mine` — map from
`OrderStatus` plus assignment as follows:

- `PENDING` + `driverId`/`companyId` both null → **available**.
- Assigned to *this* account (`driverId === account.userId` for a driver,
  `companyId === account.companyId` for a company), status `CLAIMED`,
  `ACCEPTED` or `IN_TRANSIT` → **mine**. `COMPLETED` and `CANCELLED` orders
  belonging to this account are deliberately **excluded from every array** —
  they are job history, already served by the existing driver-hub jobs and
  earnings screens (see the "job sheet" note in `src/lib/order-response-
  select.ts`'s comment on `getHubJobs`), not open-board concerns. Leaving
  them in `mine` would make that array grow without bound as an account
  completes work.
- Assigned to a **different** account should generally not appear at all —
  a driver has no legitimate use for another driver's claimed work — with
  one deliberate, narrow exception: a load that flips from `available` to
  claimed-by-someone-else **within the last `CLAIMED_VISIBILITY_WINDOW_MS`**
  (2 minutes) is still returned, inside `available`, with `status:
  "claimed"`. This exists so the UI (task-14, live updates) can update that
  row in place — "opacity 0.6, a grey 'Claimed' pill, actions removed" per
  the design — instead of the row silently vanishing out from under a driver
  who may have it selected or mid-interaction with. After the window elapses
  the row simply stops being returned; by then the UI has already rendered
  the transition and, per the design's stated behaviour for live updates,
  is expected to keep its own client-side memory of a row it already
  showed rather than re-deriving row presence from this endpoint's absence
  alone on every single poll.

## Acceptance Criteria

- [ ] Every row carries `pickupCity` and `dropoffCity` as display labels
      (`"Tbilisi"`, not `"TBILISI"`) or null, formatted via `src/lib/format-city.ts`.

- [ ] An order whose `cargoWeightKg` exceeds every one of the driver's
      registered vehicles' `vehicleTypeSpec.maxPayloadKg` (or whose
      dimensions exceed all of them) is **absent** from `available`, `mine`
      and `rejected` alike — not present with a flag, not present with a
      warning, simply not in the response.
- [ ] An order whose `vehicleTypeSpecId` matches none of this account's
      registered vehicles is **absent** from `available` — the same load the
      claim route would refuse with "This vehicle's type doesn't match what
      this delivery requires." is never offered in the first place.
- [ ] A driver with a class-matching van (too small for the load) **and** a
      big-enough truck of a different class does **not** see the load: the two
      tests must be satisfied by one vehicle, not two.
- [ ] A COMPANY whose fleet holds vans of the order's class and one heavier
      truck of another class does **not** see a load that only the heavier
      truck could carry — `widestCapability` is computed over the
      class-matching subset, never the whole fleet.
- [ ] A wrong-class load does **not** increment `hiddenByCapacityCount`.
- [ ] The string `"price"` does not appear as a key anywhere in the JSON
      response for any row, and neither do `baseFare`, `distanceFare`,
      `timeFare`, `helperFee`, `overtimeFee` or `serviceLevelAdjustment`.
- [ ] An `available` row whose `driverId`/`companyId` do not match the
      caller has `pickupContactName`, `pickupContactPhone`,
      `pickupContactDetails`, `dropoffContactName`, `dropoffContactPhone`
      and `dropoffContactDetails` all `null` — present as keys, set to
      `null`, not omitted.
- [ ] No session → `401`. Session with `role: "CLIENT"` → `403`.
- [ ] `DRIVER` session with `DriverProfile.companyId` non-null → `403`, with
      an error message whose reasoning matches (need not be word-for-word)
      `src/app/api/orders/[id]/accept/route.ts`'s roster-driver refusal.
- [ ] `DRIVER` session with `DriverProfile.activatedAt` null → `200` with
      `{ available: [], mine: [], rejected: [], hiddenByCapacityCount: 0 }`.
- [ ] An order this account has a `LoadRejection` row for is absent from
      `available` and present in `rejected`.
- [ ] `hiddenByCapacityCount` counts a `PENDING`, unassigned order with
      `cargoWeightKg: null` (and every other cargo field null) as hidden —
      provided the account has a vehicle of that order's class, without which
      the order is wrong-class and counted nowhere.
- [ ] `pickupDistanceKm` is `null` when the account has no
      `currentLat`/`currentLng`, or the order has no
      `pickupLat`/`pickupLng`, or the account is a `COMPANY`; otherwise it
      equals `haversineDistanceKm` between the two points.
- [ ] `createdAt` is present on every row.
- [ ] A `COMPANY` account with an empty fleet gets an empty `available` list
      and `hiddenByCapacityCount: 0` — **amended by the class filter**: an
      account with no vehicles has no class, so every candidate is wrong-class
      rather than over-capacity. The earlier criterion here expected the full
      open-candidate count; see step 9.
- [ ] A load claimed by a *different* account inside the visibility window
      appears in `available` with `status: "claimed"`; the same load, once
      the window has passed (simulate by backdating `updatedAt` in a test
      fixture, or by mocking the window constant down), no longer appears
      in the response at all.
- [ ] `pnpm check` passes.

## Notes

- **This file's single most important rule:** `Order.price` is what the
  *client* pays. The driver earns 85% of it, stored separately in
  `Order.driverPayout`. Every money figure in this response must trace back
  to `driverPayout`. Leaking `price` to a driver-facing surface would show
  them a number that is wrong **in their favour** — the worst direction to
  be wrong in, because it sets an expectation the driver will act on and the
  platform will then have to walk back.
- The rejected list is intentionally **not** fit-filtered. It is a record of
  what this account chose to hide, not a live claimability check; if an
  account's fleet has changed since a rejection (a vehicle sold, a new one
  added), that is surfaced naturally the moment they hit Restore and the
  load reappears — or fails to reappear — in `available`, not by this
  endpoint pre-emptively hiding the Restore option.
- `CLAIMED_VISIBILITY_WINDOW_MS` is this task's own decision, not specified
  by the design or requirements — the design's prototype fakes a live claim
  with a hardcoded 6-second timer and no real "how long should this stay
  visible" answer exists yet. Two minutes is a starting guess generous
  enough to survive a slow poll interval; action-required.md already flags
  the live-update poll interval itself as needing a real answer from
  production traffic, and this constant should be revisited alongside it.
- `widestCapability` for a `COMPANY` account is optimistic by construction —
  see step 5's code-comment requirement. Do not read this as a bug to fix;
  it is the documented cost of the claim-first-assign-later model
  requirements.md and the design handoff both resolve open question 1 with.
  Its optimism is now bounded to one vehicle class: it widens over the fleet's
  vehicles **of the order's class only**. Widening over the whole fleet is a
  bug, not optimism — it would offer loads the company claim route refuses.
- The class filter here does **not** replace the claim routes' own class
  checks, and those must not be removed. A listing is a snapshot; the claim is
  what commits, and a caller can reach the claim endpoints without going
  through the board at all. Both layers are load-bearing, for the same reason
  the physical fit is re-checked at claim time.
- Do not add pagination. The board is not expected to carry enough live
  orders at once to need it, and neither existing listing endpoint
  (`GET /api/orders`, `GET /api/logistics-company/orders`) paginates either.
