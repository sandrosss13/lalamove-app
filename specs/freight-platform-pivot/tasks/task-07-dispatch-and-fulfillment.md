# Task 07: Order accept, claim, dispatch & fulfillment (on `/dashboard`)

## Status

complete

## Wave

4

## Description

Reworks how an order moves from `PENDING` to fulfilled under the new model, which now has two
supply-side paths: an **independent driver** accepts an open order directly with their own vehicle
(same shape as before this pivot, just using the new vehicle taxonomy), or a **logistics company**
claims an open order (`PENDING` → `CLAIMED`), then dispatches it internally to one of its own
drivers with one of its own fleet vehicles (`CLAIMED` → `ACCEPTED`). This task also adds the missing
start/complete lifecycle (`ACCEPTED` → `IN_TRANSIT` → `COMPLETED`) needed to capture waiting time and
apply the overtime fee, which did not exist before this pivot. All of this provider-facing booking
UI now lives on the `/dashboard` route task-06 built (not `/orders` — `/orders` becomes purely the
client's own order list, and now redirects `DRIVER`/`COMPANY` sessions to `/dashboard`).

## Dependencies

**Depends on:** task-01-schema-and-seed.md, task-04-fleet-vehicle-management.md,
task-06-account-dashboards.md
**Blocks:** task-09-provider-reporting.md

**Context from dependencies:** task-01 added `OrderStatus.CLAIMED` between `PENDING` and `ACCEPTED`,
`Order.companyId` (nullable), `Order.vehicleTypeSpecId`, `Order.inTransitAt`/`completedAt`/
`waitingMinutes`, and `Order.overtimeFee` (separate from the up-front `price`). task-04 built
`GET /api/logistics-company/vehicles` (a company's fleet, each with `vehicleTypeSpecId`) and
`GET /api/logistics-company/drivers` (a company's roster — `DriverProfile` rows with `companyId`
equal to the company's id). A company-affiliated driver's `DriverProfile.companyId` is set; an
independent driver's is `null`. task-06 built the `/dashboard` route: `src/app/dashboard/page.tsx`
branches by role and renders `src/components/dashboard/driver-dashboard.tsx`
(`DriverDashboard({ userId, userName })`) or `src/components/dashboard/company-dashboard.tsx`
(`CompanyDashboard({ userId })`) — both server components already fetching the driver's/company's
identity, vehicles, and (for companies) roster. task-06 also made `/account` redirect non-`CLIENT`
sessions to `/dashboard` and left both dashboard components structured so an additional section can
be appended without restructuring them.

## Files to Create

- `src/components/dashboard/driver-bookings.tsx` — server component, `DriverBookings({ userId,
  companyId }: { userId: string; companyId: string | null })`. Fetches and renders this driver's
  booking activity:
  - If `companyId` is `null` (independent): open `PENDING` orders matching one of the driver's own
    registered vehicle types (`vehicleTypeSpecId` in the distinct set from their `Vehicle` rows,
    same "match against what you actually have" logic `/orders`' old driver branch used) with an
    accept flow (reuse/adapt `src/components/accept-order-button.tsx`'s pattern — it currently keys
    off the old `vehicleType` field; update it to `vehicleTypeSpecId` as part of this task, it's a
    small existing file, not a new one, but listed here since it needs the same field-name/type
    swap `/orders` did before this pivot), plus their own assigned deliveries (`driverId = userId`,
    any status) rendered via `OrderCard` with a `<DeliveryLifecycleActions>` (see below) for
    `ACCEPTED`/`IN_TRANSIT` ones.
  - If `companyId` is set (company-affiliated): only their own assigned deliveries (`driverId =
    userId`), no open-order list, no accept button (they can't act on open orders — the company does
    that on its own dashboard). Same `<DeliveryLifecycleActions>` rendering for
    `ACCEPTED`/`IN_TRANSIT` deliveries.
  - Also render `DriverStatusToggle` (existing component, unchanged) somewhere sensible in this
    section — it currently lives on `/orders`, move its usage here instead (don't duplicate it on
    both routes).
- `src/components/dashboard/company-bookings.tsx` — server component, `CompanyBookings({ companyId
  }: { companyId: string })`. Fetches and renders: open `PENDING` orders matching one of the
  company's fleet vehicle types (distinct set) with a "Claim" action (posting to the new claim
  endpoint below); the company's already-claimed/dispatched orders (`companyId` equals the caller's,
  any status) — while `status === "CLAIMED"`, render a dispatch form/picker (a client component,
  create it inline in this file or as a small sibling `company-dispatch-form.tsx` if that reads
  cleaner — your call) choosing one of the company's own roster drivers and one of the company's own
  fleet vehicles matching the order's `vehicleTypeSpecId`, posting to the dispatch endpoint below.
- `src/components/dashboard/delivery-lifecycle-actions.tsx` — `"use client"` component,
  `DeliveryLifecycleActions({ orderId, status }: { orderId: string; status: "ACCEPTED" |
  "IN_TRANSIT" })`. For `ACCEPTED`: a "Start delivery" button posting to
  `POST /api/orders/[id]/start`, then `router.refresh()` on success (same loading/error/refresh
  pattern as `src/components/remove-vehicle-button.tsx`/`driver-status-toggle.tsx`). For
  `IN_TRANSIT`: a small form with a `waitingMinutes` number input + "Complete delivery" button
  posting `{ waitingMinutes }` to `POST /api/orders/[id]/complete`, then `router.refresh()`. Surface
  the endpoint's error message on failure, same pattern as this codebase's other mutation components.
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
  is additive and displayed separately). Same caller/status guards as the `start` route (`403` wrong
  driver, `404` missing, `409` wrong current status).

## Files to Modify

- `src/app/api/orders/[id]/accept/route.ts` — currently: driver posts `{ vehicleId }`, route looks
  up the vehicle scoped to the caller's own `DriverProfile`, checks its type matches the order's
  requested type, atomically claims via `updateMany({ where: { id, status: PENDING, driverId: null } })`.
  Add a guard at the top: if the caller's `DriverProfile.companyId` is set (i.e. they belong to a
  company), reject with `403` and a message like `"Drivers who belong to a company receive deliveries through their company's dispatch, not by accepting directly."`
  — company-affiliated drivers never call this endpoint; only independent drivers do. Otherwise keep
  the existing logic, just match `vehicle.vehicleTypeSpecId === order.vehicleTypeSpecId` instead of
  the old `vehicleType` field.
- `src/app/orders/page.tsx` — this page becomes purely the client's own order list. Remove the
  entire driver branch (the `isDriver`/`driverProfile`/`registeredVehicleTypes`/accept-button logic)
  and the `DriverStatusToggle` usage (moved to `driver-bookings.tsx` above). Add, right after the
  session/signed-out check:
  ```ts
  import { redirect } from "next/navigation";
  // ...
  if (session.user.role !== "CLIENT") {
    redirect("/dashboard");
  }
  ```
  What remains is the existing `CLIENT` rendering (their own orders via `OrderCard`), unchanged.
- `src/app/orders/[id]/track/page.tsx` — the live tracking page. It currently displays vehicle info
  (plate/make/model, from `order.vehicle`) — since `Vehicle` no longer has a flat `vehicleType`
  label available the old way, use the vehicle's `vehicleTypeSpec.label` wherever a type name was
  shown (check this file's current `include`/`select` and add `vehicleTypeSpec` to it). If the order
  has a `companyId`, optionally show the company's name too (not required, but a reasonable small
  addition). If this page currently links back to `/orders` for a driver/company viewer, point that
  link at `/dashboard` instead (it should still point at `/orders` for a client viewer).
- `src/components/dashboard/driver-dashboard.tsx` (task-06's file) — append, at the bottom of the
  component's JSX, a rendering of the new bookings section:
  `<DriverBookings userId={userId} companyId={driverProfile?.companyId ?? null} />` (or restructure
  minimally if `driverProfile` isn't already in scope with that shape — it is, per task-06's fetch).
- `src/components/dashboard/company-dashboard.tsx` (task-06's file) — append, at the bottom of the
  component's JSX, a rendering of `<CompanyBookings companyId={company.id} />` (only when `company`
  is non-null — mirror however the existing null-profile branch is structured).
- `src/components/accept-order-button.tsx` — small update: the eligible-vehicles matching this
  component's caller does (comparing `vehicle.vehicleType === order.vehicleType`) needs to become
  `vehicle.vehicleTypeSpecId === order.vehicleTypeSpecId`, mirroring whatever field-name/type swap
  the codebase has already made elsewhere for this pivot. No other behavioral change.

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

### `/dashboard` bookings — role summary

| Session | Bookings section shows |
|---|---|
| `DRIVER`, independent (`companyId` null) | Open orders matching their own registered vehicle types with an accept flow, plus their own assigned deliveries with start/complete actions. |
| `DRIVER`, company-affiliated | Only their own assigned deliveries, read-only for acceptance (no open-order list, no accept button), with start/complete actions on those deliveries. |
| `COMPANY` | Open orders matching fleet vehicle types with a "Claim" action; the company's claimed/dispatched orders (any status) with a "Dispatch" action shown only while `status === "CLAIMED"`. |

### `/account`, `/orders`, `/dashboard` redirect matrix

See task-06's Technical Details for the full table — this task adds the `/orders` row (`DRIVER`/
`COMPANY` → `redirect("/dashboard")`); task-06 already added the `/account` row.

## Acceptance Criteria

- [ ] An independent driver's accept flow works exactly as before this pivot, using the new vehicle
      taxonomy for the type-match check, now surfaced on `/dashboard` instead of `/orders`.
- [ ] A company-affiliated driver calling the accept endpoint directly gets `403` with the guard
      message above, even if they somehow had a vehicle (they won't, since task-04/06 never give
      them one, but the guard is the actual enforcement, not the absence of a vehicle).
- [ ] A company can claim a `PENDING` order matching its fleet (`PENDING` → `CLAIMED`,
      `companyId` set) from its `/dashboard`, a second company racing for the same order gets `409`
      on the loser, and claiming with no matching fleet vehicle type is rejected with `400`.
- [ ] A company can dispatch a `CLAIMED` order it owns to one of its own roster drivers with one of
      its own fleet vehicles from its `/dashboard` (`CLAIMED` → `ACCEPTED`, `driverId`/`vehicleId`
      set); dispatching with a driver not on its roster, a vehicle not in its fleet, or a
      type-mismatched vehicle is rejected.
- [ ] The assigned driver (independent or company-dispatched) can start (`ACCEPTED` → `IN_TRANSIT`)
      and complete (`IN_TRANSIT` → `COMPLETED`) their own delivery from their `/dashboard`; anyone
      else attempting either gets `403`; wrong-status attempts get `409`.
- [ ] Completing with `waitingMinutes` above the vehicle type's `freeLoadingMinutes` produces a
      non-zero `overtimeFee` computed at exactly `overtimeRatePerMinute` per minute over the buffer;
      at or under the buffer produces `overtimeFee: 0`.
- [ ] `/orders` for a `DRIVER` or `COMPANY` session redirects to `/dashboard`; `/orders` for a
      `CLIENT` session is unaffected (their own order list, unchanged).
- [ ] `/dashboard` renders the three-way (independent driver / company-affiliated driver / company)
      bookings behavior described above without crashing for any role.
- [ ] `pnpm lint`/`pnpm typecheck` pass for every file this task touches or creates.
- [ ] Verified live end-to-end against the dev server: one full independent-driver accept→start→
      complete cycle, and one full company claim→dispatch→(driver)start→complete cycle, checking
      the DB state at each transition, all exercised from `/dashboard` — then all test data
      (companies, drivers, clients, vehicles, orders) created for this is deleted afterward.

## Notes

- Do not touch `src/app/api/orders/route.ts` beyond what task-05 already did (that file's `POST`/
  booking-time `GET` filtering is task-05's scope) — this task adds new lifecycle endpoints, it
  doesn't re-touch order creation.
- Do not build any UI for editing `PricingRule`/`VehicleTypeSpec` — out of scope per
  `requirements.md`.
- Do not build the reporting/earnings/Excel-export section — that's task-09, which extends
  `driver-dashboard.tsx`/`company-dashboard.tsx` further after this task lands.
