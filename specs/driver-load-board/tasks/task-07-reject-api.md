# Task 07: Reject / restore API

## Status

complete

## Wave

2

## Description

Adds the load board's "reject" and "restore" actions: `POST` and
`DELETE /api/loads/[id]/reject`. Rejecting a load hides it from the calling
account's own board and records a `LoadRejection` row that a later
acceptance-rate model will read; restoring removes that row and brings the load
back. This is the single most misunderstandable part of the feature, so state
it plainly here: **rejecting a load is not cancelling it.** The client's booking
is completely untouched — it stays `PENDING`, still visible and still claimable
by every other driver and company. Only the rejecting account's own view of the
board changes.

## Dependencies

**Depends on:** task-01-schema-and-migration
**Blocks:** task-09-board-shell

**Context from dependencies:** task-01-schema-and-migration adds the
`LoadRejection` model: `{ id, orderId, driverProfileId?, companyId?, createdAt }`,
with `@@unique([orderId, driverProfileId])` and `@@unique([orderId, companyId])`
as two separate unique indexes (Postgres treats NULL as distinct in a unique
index, so each index only constrains the rows where its own column is
non-null). **Exactly one** of `driverProfileId` / `companyId` is set on every
row, matching whichever kind of account did the rejecting — never both, never
neither. That same migration adds `Order.reference` (unique, `GE-48210` form),
`Order.driverPayout`/`Order.commissionRate`, and the cargo columns
(`cargoWeightKg`, `cargoLengthM`, `cargoWidthM`, `cargoHeightM`,
`packagingDescription`, `itemQuantity`, `handlingTags`, `pickupWindowStart`,
`pickupWindowEnd`, `deliveryDeadline`) — this task does not touch any of the
cargo columns, they are listed only so the schema shape is clear.

**CRITICAL MONEY RULE**, load-bearing across the whole feature and worth
restating here even though this task returns no money figures: `Order.price` is
what the **client** pays. `Order.driverPayout` (the stored 85% share) is the
only money figure a driver — or a company, which gets the same board with no
role-specific UI — may ever be shown. This task's responses do not include
either field, but if you find yourself adding one, it must be `driverPayout`,
never `price`.

## Files to Create

- `src/app/api/loads/[id]/reject/route.ts` — `POST` (reject/hide) and `DELETE`
  (restore) handlers

## Files to Modify

None.

## Technical Details

### Context you need: the two existing claim routes this mirrors

This task's authorisation exists to answer exactly one question — "which
account, of the two kinds the board serves, is calling?" — and the two existing
claim routes already answer it, for their own purposes, in a way this task
should copy rather than reinvent:

- `src/app/api/orders/[id]/accept/route.ts` resolves the caller to a
  `DriverProfile` via `prisma.driverProfile.findUnique({ where: { userId } })`,
  then applies two gates in this order:
  1. **Roster gate (403):** `driverProfile.companyId !== null` means this driver
     is employed by a logistics company and receives work through that
     company's dispatch, not directly. Its exact message: *"Drivers who belong
     to a company receive deliveries through their company's dispatch, not by
     accepting directly."*
  2. **Activation gate (403):** `driverProfile.activatedAt === null` means
     onboarding is not yet approved. Its exact message: *"Your account isn't
     approved yet. Finish onboarding to accept deliveries."*
  A driver profile that does not exist at all is a 404 with `"Vehicle not
  found."` in that route — for this task use a message that actually describes
  the missing thing, e.g. `"Driver profile not found."` (see below).

- `src/app/api/logistics-company/orders/[id]/claim/route.ts` resolves the
  caller to a `LogisticsCompany` via
  `prisma.logisticsCompany.findUnique({ where: { userId } })`, and applies one
  gate:
  1. **Activation gate (403):** `company.activatedAt === null`, message:
     *"Your fleet is still under review. Operations must activate the company
     before you can claim deliveries."*
  A company profile that does not exist at all is a **400** (not 404) in that
  route, message: *"Complete your company profile before claiming
  deliveries."* — an intentional asymmetry from the driver 404 that this task
  preserves rather than "fixes", since both routes are established precedent for
  the *actions* a caller takes on a load.

  Note that task-06's `GET /api/loads` does **not** follow that split: it answers
  **403** for either missing profile (*"Your driver profile isn't set up yet."* /
  *"Your company profile isn't set up yet."*), because a listing has no resource
  to call missing and no body to call malformed. This task follows its claim
  counterparts, not the listing, so that claim and reject never disagree about
  the same missing row — but say so in the code rather than claiming the three
  endpoints agree, because they do not.

This task applies exactly these gates, for both `POST` and `DELETE`: a `DRIVER`
session goes through the roster + activation checks above; a `COMPANY` session
goes through the activation check above; any other role, or no session, never
reaches a `LoadRejection` row.

**Plus the `mustChangePassword` gate task-06 applies**, in the same position
(immediately after the session check, before the role branch), with the same
`403` and the same message: *"Change your temporary password before viewing the
load board."* An account still on a company-issued temporary password cannot see
the board at all, so letting it *act* on the board's loads would be a way around
that gate — and a rejection is not a read: it writes a permanent `LoadRejection`
row that hides the load from the real account holder's board afterwards.

### Implementation Steps

1. Create `src/app/api/loads/[id]/reject/route.ts`.

2. Write one shared resolver at the top of the file that both `POST` and
   `DELETE` call — do not duplicate the gates in two handlers. It takes the
   `Request` and returns either the caller's owner reference or a
   `NextResponse` to return immediately:

   ```ts
   type RejectionOwner =
     | { kind: "DRIVER"; driverProfileId: string }
     | { kind: "COMPANY"; companyId: string };

   /**
    * Resolves the calling session to whichever kind of account rejects/restores
    * loads, applying the same gates `POST /api/orders/[id]/accept` and
    * `POST /api/logistics-company/orders/[id]/claim` already apply for their own
    * claim paths — a roster driver or an unactivated account has no board to
    * reject from in the first place, so it can't reject a load on it either.
    *
    * Returns a `NextResponse` directly on any failure so both handlers can just
    * `return` it, keeping the two routes' gates identical by construction
    * instead of by copy-paste discipline.
    */
   async function resolveRejectionOwner(
     request: Request,
   ): Promise<RejectionOwner | NextResponse> {
     const session = await auth.api.getSession({ headers: request.headers });
     if (!session) {
       return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
     }

     // Same gate, same position, same status and same wording as task-06's
     // `GET /api/loads`. See the note above for why acting on the board is
     // gated as tightly as viewing it.
     if (session.user.mustChangePassword) {
       return NextResponse.json(
         {
           error: "Change your temporary password before viewing the load board.",
         },
         { status: 403 },
       );
     }

     if (session.user.role === "DRIVER") {
       const driverProfile = await prisma.driverProfile.findUnique({
         where: { userId: session.user.id },
         select: { id: true, companyId: true, activatedAt: true },
       });

       if (!driverProfile) {
         return NextResponse.json(
           { error: "Driver profile not found." },
           { status: 404 },
         );
       }

       if (driverProfile.companyId !== null) {
         return NextResponse.json(
           {
             error:
               "Drivers who belong to a company receive deliveries through their company's dispatch, not by accepting directly.",
           },
           { status: 403 },
         );
       }

       if (driverProfile.activatedAt === null) {
         return NextResponse.json(
           {
             error:
               "Your account isn't approved yet. Finish onboarding to accept deliveries.",
           },
           { status: 403 },
         );
       }

       return { kind: "DRIVER", driverProfileId: driverProfile.id };
     }

     if (session.user.role === "COMPANY") {
       const company = await prisma.logisticsCompany.findUnique({
         where: { userId: session.user.id },
         select: { id: true, activatedAt: true },
       });

       if (!company) {
         return NextResponse.json(
           { error: "Complete your company profile before claiming deliveries." },
           { status: 400 },
         );
       }

       if (company.activatedAt === null) {
         return NextResponse.json(
           {
             error:
               "Your fleet is still under review. Operations must activate the company before you can claim deliveries.",
           },
           { status: 403 },
         );
       }

       return { kind: "COMPANY", companyId: company.id };
     }

     return NextResponse.json(
       { error: "Only drivers and logistics companies can use the load board." },
       { status: 403 },
     );
   }
   ```

3. Implement `POST`. No request body — the order id in the path and the
   session-resolved owner are the entire input, same reasoning
   `POST /api/logistics-company/orders/[id]/claim` gives for having none: there
   is nothing else to name.

   - Call `resolveRejectionOwner`; return immediately if it returned a
     `NextResponse`.
   - Load the order
     (`select: { id: true, status: true, driverId: true, companyId: true }`).
     Missing → 404 `"Load not found."`.
   - **A load is only rejectable while it is open, and "open" is defined exactly
     as task-06's `GET /api/loads` defines it for its `available` bucket:**
     `status === "PENDING"` **and** `driverId === null` **and**
     `companyId === null`. The status alone is not the same predicate. `PENDING`
     is *intended* to be the only status an unclaimed load ever has, but that is
     an invariant the claim routes maintain rather than one the database
     enforces, and here the two definitions disagreeing has a visible cost: a
     load the board never listed could be rejected, writing a permanent
     `LoadRejection` row against a load that was never on that board. Reading the
     assignment columns makes the two endpoints agree by construction rather than
     by an assumption about a status column. Still one positive check, so it
     keeps covering every other terminal or in-flight state (`CLAIMED`,
     `ACCEPTED`, `IN_TRANSIT`, `COMPLETED`, `CANCELLED`, `INITIATED`) without
     enumerating them. Not open → 409 `"This load is no longer open."`.
   - Attempt to create the `LoadRejection` row, `orderId` plus exactly one of
     `driverProfileId` / `companyId` depending on `owner.kind`. See
     **Idempotency** below for what happens when the row already exists.
   - Respond `200 { rejected: true }`.

4. Implement `DELETE` ("Restore to open loads" in the design).

   - Call `resolveRejectionOwner`; return immediately if it returned a
     `NextResponse`.
   - `deleteMany` the `LoadRejection` row scoped to `orderId` **and** the
     owner's own column (`driverProfileId` or `companyId` — never delete by
     `orderId` alone, that would let one account restore a rejection it never
     made). No order-status check: removing a rejection is always safe. If the
     order has since left `PENDING`, task-06's own `GET /api/loads` query
     already won't show it regardless of whether a `LoadRejection` row exists
     for it, so there is nothing to guard against here.
   - `deleteMany` matching zero rows is not an error — restoring a load that
     was never rejected ends in the same state (not rejected) as restoring one
     that was, so both cases return `200`. Respond
     `200 { restored: count > 0 }`.

### Idempotency

**Recommendation: catch the Prisma unique-violation (`P2002`) on `create`, do
not use `upsert`.**

```ts
import { Prisma } from "@prisma/client";

try {
  await prisma.loadRejection.create({
    data:
      owner.kind === "DRIVER"
        ? { orderId, driverProfileId: owner.driverProfileId }
        : { orderId, companyId: owner.companyId },
  });
} catch (error) {
  // A repeat reject of the same load by the same account hits the unique index
  // from task-01 (`@@unique([orderId, driverProfileId])` or
  // `@@unique([orderId, companyId])`). That's not a failure — the caller asked
  // for "this load is hidden from me" and it already is — so P2002 here is
  // success, not an error. Re-throw anything else: a different violation would
  // be a real bug this handler should not silently swallow.
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    throw error;
  }
}
```

Why this over `upsert`: `LoadRejection` has no field that a repeat reject
should ever change — `createdAt` is set once and never touched again, and there
is nothing else on the row. `upsert`'s `update` clause would therefore have to
be `{}`, which reads to a future maintainer as a bug (an update that updates
nothing) rather than as the deliberate "second call is a no-op" it actually is.
Catching `P2002` says exactly that, in a comment, at the one place it matters.
It is also one write on the happy path — `upsert` is implemented by Postgres as
an insert that falls back to an update on conflict, so there's no round-trip
cost either way; the choice here is about readability, not performance.

### API Endpoints

- `POST /api/loads/[id]/reject`
  - Auth: `DRIVER` (not on a company roster, activated) or `COMPANY`
    (activated). No request body.
  - `200 { rejected: true }` — created, or already existed (idempotent).
  - `401 { error }` — no session.
  - `403 { error }` — wrong role, roster driver, unactivated account, or a
    session still carrying `mustChangePassword`.
  - `400 { error }` — `COMPANY` session with no `LogisticsCompany` row yet.
  - `404 { error: "Driver profile not found." }` — `DRIVER` session with no
    `DriverProfile` row yet. (Note: `GET /api/loads` answers **403** for the same
    condition — see the gates section.)
  - `404 { error: "Load not found." }` — no such order.
  - `409 { error: "This load is no longer open." }` — order exists but is not
    open: not `PENDING`, or already carrying a `driverId` or `companyId`.

- `DELETE /api/loads/[id]/reject`
  - Auth: identical to `POST`.
  - `200 { restored: boolean }` — `true` if a row was actually removed, `false`
    if there was nothing to restore. Both are success.
  - Same `401`/`403`/`400`/`404` (profile-not-found) cases as `POST`. There is
    no 409 here — restoring is never blocked by order state.

## Acceptance Criteria

- [ ] `POST` creates a `LoadRejection` with exactly one of `driverProfileId` /
      `companyId` set, matching the calling account, and the other left `null`.
- [ ] A second `POST` for the same order by the same account returns `200
      { rejected: true }` and does not throw or 500 — verify by asserting only
      one `LoadRejection` row exists for that `(orderId, driverProfileId)` (or
      `companyId`) pair after two `POST` calls.
- [ ] `DELETE` removes the row; a subsequent `DELETE` for the same pair also
      returns `200 { restored: false }` rather than erroring.
- [ ] A driver with `DriverProfile.companyId !== null` gets `403` from `POST`
      with the exact roster message quoted above; no `LoadRejection` row is
      created.
- [ ] A driver with `DriverProfile.activatedAt === null` gets `403` from
      `POST` with the exact activation message quoted above.
- [ ] A `COMPANY` session with `LogisticsCompany.activatedAt === null` gets
      `403` from `POST`.
- [ ] A session with `mustChangePassword` set gets `403` from both verbs, with
      the exact message `GET /api/loads` uses, and no `LoadRejection` row is
      created or removed.
- [ ] `POST` against an order whose `status` is anything other than `PENDING`
      (e.g. `CLAIMED`, `ACCEPTED`, `COMPLETED`) returns `409`, and no
      `LoadRejection` row is created.
- [ ] `POST` against a `PENDING` order that nonetheless already has a `driverId`
      or a `companyId` also returns `409` — the same "open" predicate
      `GET /api/loads` uses for its `available` bucket, not the status alone.
- [ ] `POST`/`DELETE` against a non-existent order id return `404`.
- [ ] A `CLIENT` or unauthenticated caller gets `401`/`403` from both verbs.
- [ ] `pnpm check` passes.

## Notes

- **Rejection rows are kept forever, deliberately, even after the load is
  claimed by someone else.** They are not cleaned up when the order leaves
  `PENDING`, and nothing in this task (or in task-06, the board listing) reads
  them for any purpose beyond "did I reject this." Per `requirements.md`
  ("Record every rejection from day one, so acceptance-rate scoring can be
  built later on real data. Rejection data cannot be backfilled."), this table
  is the raw signal a future acceptance-rate model will be built from — a gap
  in it today can never be filled in retroactively, so nothing should ever
  delete a `LoadRejection` row except this task's own `DELETE` (the driver's or
  company's own explicit "restore").
- **The rejected-list UI is more than this API strictly needs.** The design
  carries a persistent rejected-list view with its own Restore buttons, which
  is why `DELETE` exists at all. The action-required review recommended
  reducing this to a 24-hour auto-expiring hide with no list, which would make
  `DELETE` largely unnecessary — but that is a UI-layer simplification, not a
  change to this API, and is out of scope here. It is implemented as designed
  and tracked in `specs/driver-load-board/action-required.md` under
  "Reconsider the rejected-list UI." This task's endpoints support either
  outcome: an auto-expiring UI would simply stop calling `DELETE` and instead
  let rows age out of relevance client-side, with no API change required.
