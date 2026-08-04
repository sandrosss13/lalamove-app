# Task 07: Order accept, claim, dispatch & fulfillment

## Status

pending

## Wave

3

## Description

Reworks how an order moves from `PENDING` to fulfilled under the new model, which now has two
supply-side paths: an **independent driver** accepts an open order directly with their own vehicle
(same shape as before this pivot, just using the new vehicle taxonomy), or a **logistics company**
claims an open order (`PENDING` → `CLAIMED`), then dispatches it internally to one of its own
drivers with one of its own fleet vehicles (`CLAIMED` → `ACCEPTED`). This task also adds the
missing start/complete lifecycle (`ACCEPTED` → `IN_TRANSIT` → `COMPLETED`) needed to capture waiting
time and apply the overtime fee, which did not exist before this pivot (orders previously had no
way to progress past `ACCEPTED`).

## Dependencies

**Depends on:** task-01-schema-and-seed.md, task-04-fleet-vehicle-management.md
**Blocks:** None

**Context from dependencies:** task-01 added `OrderStatus.CLAIMED` between `PENDING` and `ACCEPTED`,
`Order.companyId` (nullable), `Order.vehicleTypeSpecId`, `Order.inTransitAt`/`completedAt`/
`waitingMinutes`, and `Order.overtimeFee` (separate from the up-front `price`). task-04 built
`GET /api/logistics-company/vehicles` (a company's fleet, each with `vehicleTypeSpecId`) and
`GET /api/logistics-company/drivers` (a company's roster — `DriverProfile` rows with `companyId`
equal to the company's id). A company-affiliated driver's `DriverProfile.companyId` is set; an
independent driver's is `null`.

## Files to Modify

- `src/app/api/orders/[id]/accept/route.ts` — currently: driver posts `{ vehicleId }`, route looks
  up the vehicle scoped to the caller's own `DriverProfile`, checks its type matches the order's
  requested type, atomically claims via `updateMany({ where: { id, status: PENDING, driverId: null } })`.
  Add a guard at the top: if the caller's `DriverProfile.companyId` is set (i.e. they belong to a
  company), reject with `403` and a message like `"Drivers who belong to a company receive deliveries through their company's dispatch, not by accepting directly."`
  — company-affiliated drivers never call this endpoint; only independent drivers do. Otherwise keep
  the existing logic, just match `vehicle.vehicleTypeSpecId === order.vehicleTypeSpecId` instead of
  the old `vehicleType` field.
- `src/app/orders/page.tsx` — currently branches on `CLIENT`/`DRIVER`. Update the `DRIVER` branch:
  if the driver belongs to a company (`driverProfile.companyId` set), show only orders assigned to
  them (`driverId` equals their own id) — no open-order list, no accept button (they can't act on
  open orders per the guard above; the company does that on its own dashboard/route, see below). If
  independent (`companyId` null), behavior is unchanged from before this pivot (open orders matching
  their own registered vehicle types + their own assigned deliveries), just matched by
  `vehicleTypeSpecId` instead of the old `vehicleType` field (mirror whatever minimal field-name/type
  swap task-05 already made to `GET /api/orders`'s driver filter — check that file's current state
  before editing so you're building on top of it, not reverting it). Add a new top-level branch for
  `COMPANY` sessions on this same page (or a new route if that reads more cleanly — your call, but
  if you add a new route, don't leave the old `/orders` `COMPANY` case unhandled/crashing, redirect
  or link clearly) showing: open orders matching one of the company's fleet vehicle types with a
  "Claim" button, and the company's already-claimed/dispatched orders with their status.
- `src/app/orders/[id]/track/page.tsx` — the live tracking page. Minor update: it currently displays
  vehicle info (plate/make/model, from `order.vehicle`) — since `Vehicle` no longer has a flat
  `vehicleType` label available the old way, use the vehicle's `vehicleTypeSpec.label` wherever a
  type name was shown (check this file's current `include`/`select` and add `vehicleTypeSpec` to it).
  If the order has a `companyId`, optionally show the company's name too (not required, but a
  reasonable small addition — don't over-build this, it's a minor display update, not a new feature
  in this task).

## Files to Create

- `src/app/api/logistics-company/orders/route.ts` — `GET`: for the caller's `LogisticsCompany`,
  return `PENDING` orders whose `vehicleTypeSpecId` matches one of the company's fleet vehicle types
  (distinct set, same "match against what you actually have" logic the independent-driver path
  already uses, just sourced from the company's fleet instead of a single driver's own vehicles),
  plus orders already claimed/dispatched by this company (`companyId` equals the caller's company
  id, any status). `403` for non-`COMPANY` sessions.
- `src/app/api/logistics-company/orders/[id]/claim/route.ts` — `POST`, no body. Atomic claim
  mirroring the existing driver-accept pattern: `prisma.order.updateMany({ where: { id, status: "PENDING", companyId: null }, data: { companyId: <caller's company id>, status: "CLAIMED" } })`.
  Before that, verify the order's `vehicleTypeSpecId` matches one of the company's fleet vehicle
  types (400 if not — a company shouldn't be able to claim a job it has no vehicle for, same
  reasoning as the driver-side type-match check). `count === 0` on the update → `409`
  `"This delivery is no longer available."` (same message/status as the existing driver-accept
  endpoint's equivalent case). `404` if the order doesn't exist at all (existence-check-before-update
  pattern, same as the existing accept route).
- `src/app/api/logistics-company/orders/[id]/dispatch/route.ts` — `POST`, body
  `{ driverUserId: string, vehicleId: string }`. Requires the order to be `CLAIMED` by the caller's
  own company (404 if not found or not theirs — same leak-avoidance pattern used throughout this
  codebase's owner-scoped routes). Validate `driverUserId` refers to a driver on the caller's own
  roster (`DriverProfile.companyId` equals the caller's company id) — 404 if not (don't leak roster
  membership of other companies). Validate `vehicleId` refers to a vehicle in the caller's own fleet
  (`companyId` equals the caller's company id) and its `vehicleTypeSpecId` matches the order's — 404/
  400 respectively, mirroring the existing accept endpoint's checks. On success:
  `prisma.order.update({ where: { id }, data: { driverId: driverUserId, vehicleId, status: "ACCEPTED" } })`
  (a plain update, not a conditional `updateMany`, is fine here since the `CLAIMED`-by-this-company
  check above already established exclusive ownership of the next transition — there's no
  multi-company race the way there is for the initial claim).
- `src/app/api/orders/[id]/start/route.ts` — `POST`, no body. Transitions `ACCEPTED` → `IN_TRANSIT`,
  setting `inTransitAt: new Date()`. Caller must be the order's assigned driver (`order.driverId`
  equals the caller's user id) — `403` otherwise, `404` if the order doesn't exist,
  `409 "This delivery cannot be started right now."` if not currently `ACCEPTED`. This works
  identically whether the driver is independent or company-dispatched (`driverId` is set the same
  way either path).
- `src/app/api/orders/[id]/complete/route.ts` — `POST`, body `{ waitingMinutes: number }` (required,
  non-negative integer — hand-rolled validation matching this codebase's existing style). Transitions
  `IN_TRANSIT` → `COMPLETED`, setting `completedAt: new Date()`, `waitingMinutes`, and computing
  `overtimeFee`:
  ```
  const spec = await load the order's vehicleTypeSpec + pricingRule
  const overtimeMinutes = Math.max(0, waitingMinutes - pricingRule.freeLoadingMinutes)
  const overtimeFee = Math.round(overtimeMinutes * pricingRule.overtimeRatePerMinute * 100) / 100
  ```
  Persist `overtimeFee` on the order (leave `price` — the up-front quote — untouched; `overtimeFee`
  is additive and displayed separately, consistent with task-01's schema intent that `price` is the
  quoted total and `overtimeFee` is a distinct post-hoc line item). Same caller/status guards as the
  `start` route (`403` wrong driver, `404` missing, `409` wrong current status).

## Technical Details

### Company-affiliated driver guard (accept route)

```ts
const driverProfile = await prisma.driverProfile.findUnique({
  where: { userId: session.user.id },
  select: { id: true, companyId: true },
});
if (!driverProfile) {
  return NextResponse.json({ error: "Vehicle not found." }, { status: 404 }); // unchanged existing case
}
if (driverProfile.companyId !== null) {
  return NextResponse.json(
    { error: "Drivers who belong to a company receive deliveries through their company's dispatch, not by accepting directly." },
    { status: 403 },
  );
}
```

### `/orders` page — three-way branch summary

| Session | View |
|---|---|
| `CLIENT` | Unchanged — their own orders. |
| `DRIVER`, independent (`companyId` null) | Unchanged from pre-pivot behavior, matched by `vehicleTypeSpecId` — open orders matching their own vehicles + their own assigned deliveries, with the existing accept flow. |
| `DRIVER`, company-affiliated | Only their own assigned deliveries (`driverId` = self), read-only — no accept button, no open-order list. |
| `COMPANY` | Open orders matching fleet vehicle types with a "Claim" action; the company's claimed/dispatched orders (any status) with a "Dispatch" action shown only while `status === "CLAIMED"` (a form/picker choosing one of the company's own drivers and one of the company's own vehicles matching the order's type, posting to the `dispatch` endpoint above). |

## Acceptance Criteria

- [ ] An independent driver's accept flow works exactly as before this pivot, using the new vehicle
      taxonomy for the type-match check.
- [ ] A company-affiliated driver calling the accept endpoint directly gets `403` with the guard
      message above, even if they somehow had a vehicle (they won't, since task-04/06 never give
      them one, but the guard is the actual enforcement, not the absence of a vehicle).
- [ ] A company can claim a `PENDING` order matching its fleet (`PENDING` → `CLAIMED`,
      `companyId` set), a second company racing for the same order gets `409` on the loser, and
      claiming with no matching fleet vehicle type is rejected with `400`.
- [ ] A company can dispatch a `CLAIMED` order it owns to one of its own roster drivers with one of
      its own fleet vehicles (`CLAIMED` → `ACCEPTED`, `driverId`/`vehicleId` set); dispatching with a
      driver not on its roster, a vehicle not in its fleet, or a type-mismatched vehicle is rejected.
- [ ] The assigned driver (independent or company-dispatched) can start (`ACCEPTED` → `IN_TRANSIT`)
      and complete (`IN_TRANSIT` → `COMPLETED`) their own delivery; anyone else attempting either
      gets `403`; wrong-status attempts get `409`.
- [ ] Completing with `waitingMinutes` above the vehicle type's `freeLoadingMinutes` produces a
      non-zero `overtimeFee` computed at exactly `overtimeRatePerMinute` per minute over the buffer;
      at or under the buffer produces `overtimeFee: 0`.
- [ ] `/orders` renders the three-way (independent driver / company-affiliated driver / company)
      behavior described above without crashing for any role.
- [ ] `pnpm lint`/`pnpm typecheck` pass for every file this task touches or creates.
- [ ] Verified live end-to-end against the dev server: one full independent-driver accept→start→
      complete cycle, and one full company claim→dispatch→(driver)start→complete cycle, checking
      the DB state at each transition — then all test data (companies, drivers, clients, vehicles,
      orders) created for this is deleted afterward.

## Notes

- Do not touch `src/app/api/orders/route.ts` beyond what task-05 already did (that file's `POST`/
  booking-time `GET` filtering is task-05's scope) — this task adds new lifecycle endpoints, it
  doesn't re-touch order creation.
- Do not build any UI for editing `PricingRule`/`VehicleTypeSpec` — out of scope per
  `requirements.md`.
