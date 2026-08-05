# Task 04: Fleet vehicle & driver-roster management

## Status

complete

## Wave

2

## Description

Builds the vehicle-ownership half of the company model: companies register fleet vehicles (owned by
the company, not any individual driver) and manage a roster of drivers by adding existing
independent drivers to their company by email. Also reworks the existing independent-driver vehicle
registration (`src/app/api/driver-profile/vehicles/`, built in an earlier iteration of this app) to
use the new `VehicleTypeSpec` taxonomy instead of the old flat `VehicleType` enum it currently
depends on, which no longer exists after task-01. This task builds APIs and reusable UI components
only — wiring them into the account dashboard pages is task-06 (and order-claim/dispatch that
consumes the roster/fleet data is task-07), both of which depend on this task's output.

## Dependencies

**Depends on:** task-01-schema-and-seed.md
**Blocks:** task-06-account-dashboards.md, task-07-dispatch-and-fulfillment.md

**Context from dependencies:** task-01 made `Vehicle.driverProfileId` and `Vehicle.companyId` both
optional (exactly one must be set, enforced by a DB `CHECK` constraint — the app layer must also
validate this clearly since a raw constraint violation is a bad UX), replaced `Vehicle.capacityKg`
with a required `vehicleTypeSpecId` FK to the new `VehicleTypeSpec` table (code/label/category/
maxPayloadKg/dimensions/loadingAccessType, 10 seeded rows), and added `DriverProfile.companyId`
(nullable FK to `LogisticsCompany`, `SetNull` on removal). The existing Supabase Storage upload
helper (`src/lib/supabase-storage.ts`, `uploadVehiclePhoto`/`deleteVehiclePhotos`) is unchanged and
reused for both company and driver vehicle photos — do not modify it.

## Files to Modify

- `src/app/api/driver-profile/vehicles/route.ts` — `GET`/`POST`. Currently validates `vehicleType`
  against the old flat enum and stores `capacityKg` directly; change to accept `vehicleTypeCode`
  (must match a `VehicleTypeSpec.code`) and drop `capacityKg` from the request entirely (payload
  capacity now comes from the referenced spec, not per-vehicle input). Everything else (multipart
  form parsing, plate-number validation/uniqueness/case-normalization, photo upload via
  `uploadVehiclePhoto`, the `isDuplicatePlateError` P2002 handling) stays structurally the same,
  just swap the vehicle-type validation source and drop the capacity field. Also add the ownership
  check: this endpoint always sets `driverProfileId` to the caller's own profile and leaves
  `companyId` null (independent-driver vehicles never have a company).
- `src/app/api/driver-profile/vehicles/[id]/route.ts` — `DELETE`. No behavioral change needed beyond
  whatever falls out of the `Vehicle` shape change (re-verify the owner-scoped lookup still works:
  it should now scope by `driverProfileId` matching the caller, same as before).
- `src/components/vehicle-form.tsx` — the driver's "add vehicle" form. Replace whatever sourced the
  old flat `VehicleType` option list (likely `VEHICLE_TYPE_GROUPS`/similar from the now-deleted
  `src/lib/vehicle-types.ts`) with a fetch to `GET /api/vehicle-types` (task-02's public endpoint) on
  mount, rendering a `<select>` grouped by `category` (`MEDIUM_DUTY`/`HEAVY_DUTY`) with each option
  showing the type's `label`. Remove the capacity input entirely (no longer a per-vehicle field —
  consider showing the selected type's `maxPayloadKg` as read-only informational text next to the
  picker instead, so the driver still sees what they're committing to).
- `src/components/vehicle-card.tsx` — the type label lookup this reads from (previously
  `vehicleTypeLabel` in the now-deleted `src/lib/vehicle-types.ts`) needs a new source. Either pass
  the full vehicle-type spec object down as a prop from the server component that renders the card
  (simplest — `src/app/account/page.tsx`, task-06's scope, already fetches the vehicle including its
  relation) or accept a `vehicleTypeLabel: string` prop computed by the caller. Update this file's
  prop shape accordingly and leave the actual data-fetching/wiring to task-06 — this task should
  change the component's *interface*, not assume how task-06 calls it, beyond documenting the new
  prop shape clearly enough that task-06 can wire it correctly (state that explicitly in this file's
  changes so task-06's author isn't guessing).

## Files to Create

- `src/app/api/logistics-company/vehicles/route.ts` — `GET`/`POST`, closely mirroring the reworked
  `src/app/api/driver-profile/vehicles/route.ts` above but scoped to the caller's `LogisticsCompany`
  instead of `DriverProfile`: `role !== "COMPANY"` → `403`; on `POST`, look up the caller's
  `LogisticsCompany` by `userId` (400 with `"Complete your company profile before adding a vehicle."`
  if it doesn't exist yet, mirroring the existing "complete your driver profile" message pattern);
  create the `Vehicle` with `companyId` set and `driverProfileId` left null. Same multipart parsing,
  plate uniqueness/case-normalization, duplicate-plate `409`, and Supabase photo upload as the driver
  version — this is close enough to the driver route that copy-and-adapt is the right approach, not
  a shared abstraction (the project's existing style favors small, direct route handlers over
  premature shared abstractions — see how `client-profile`/`driver-profile` routes already duplicate
  similar validation helpers rather than sharing them).
- `src/app/api/logistics-company/vehicles/[id]/route.ts` — `DELETE`, owner-scoped to the caller's
  `LogisticsCompany`, same 404-not-403 pattern as the existing driver vehicle delete (don't leak
  existence of other companies' vehicles), best-effort Supabase photo cleanup.
- `src/app/api/logistics-company/drivers/route.ts` — `GET` (list the company's roster — drivers
  where `companyId` equals the caller's company id) and `POST` (add a driver to the roster). `POST`
  body: `{ driverEmail: string }`. Look up a `User` by that email; validate: must exist, must have
  `role === "DRIVER"`, must have a `DriverProfile` (400 `"This driver hasn't completed their driver profile yet."`
  if not), must not already belong to a company (400 `"This driver already belongs to a company."` if
  `driverProfile.companyId` is already set — including belonging to *this* caller's own company, to
  keep the error message simple and consistent). On success, `prisma.driverProfile.update` setting
  `companyId` to the caller's company id; return the updated roster entry (driver's name/email/
  phone — whatever's useful for a roster list UI, task-06's concern to render).
- `src/app/api/logistics-company/drivers/[userId]/route.ts` — `DELETE`, removes a driver from the
  caller's roster: verify the target `DriverProfile.companyId` equals the caller's company id (404
  if not — same not-403 leak-avoidance pattern), then set `companyId` to `null` (the driver keeps
  their account, just becomes independent again, per task-01's `SetNull` relation choice). Does not
  delete the `DriverProfile` or `User`.
- `src/components/company-vehicle-form.tsx` — company's "add vehicle" form, same shape as the
  reworked `src/components/vehicle-form.tsx` (fetch `GET /api/vehicle-types`, grouped select, no
  capacity input) but posting to `/api/logistics-company/vehicles` instead.
- `src/components/company-vehicle-card.tsx` — same shape as the updated `vehicle-card.tsx` interface
  (accepts a resolved type label, not a raw enum) but for a company-owned vehicle.
- `src/components/company-driver-roster.tsx` — `"use client"` component: an "Add driver" form (email
  input + submit, posting to `POST /api/logistics-company/drivers`, surfacing the specific error
  messages above), and a list of current roster entries each with a "Remove" button (calling
  `DELETE /api/logistics-company/drivers/[userId]`), following the same loading/error/
  `router.refresh()` pattern already established in this codebase's other client components (e.g.
  `src/components/remove-vehicle-button.tsx`, `src/components/driver-status-toggle.tsx`).

## Technical Details

### Ownership validation (both vehicle POST routes)

Even though the DB has a `CHECK` constraint as a backstop, each route should construct the `Vehicle`
create call so it's structurally impossible to violate: the driver route always sets
`{ driverProfileId: <caller's id>, companyId: null }`; the company route always sets
`{ driverProfileId: null, companyId: <caller's id> }`. Neither route should ever accept ownership as
client input.

### `vehicleTypeCode` validation

Both vehicle `POST` routes validate `vehicleTypeCode` by checking it matches an existing
`VehicleTypeSpec.code` (a DB lookup, not a static enum `includes` check like the old `VehicleType`
validation — there is no static list anymore, it's seeded data). A not-found code is a `400` with
`"vehicleTypeCode does not match a known vehicle type."`.

## Acceptance Criteria

- [ ] Independent drivers can still add/remove their own vehicles exactly as before, now picking
      from the real `VehicleTypeSpec` list instead of the old flat enum, with no capacity input.
- [ ] A company can add/remove fleet vehicles the same way, scoped to their own `LogisticsCompany`.
- [ ] A company can add an existing independent driver to its roster by email (verified: the
      target's `DriverProfile.companyId` is set afterward) and remove them (verified: `companyId`
      goes back to `null`, the driver/account/profile itself is untouched).
- [ ] Attempting to add a driver who doesn't exist, isn't a `DRIVER` role, has no driver profile
      yet, or already belongs to a company each produce the specific `400` messages above, not a
      generic failure.
- [ ] Duplicate plate numbers are rejected with `409` on both the driver and company vehicle routes.
- [ ] `pnpm lint`/`pnpm typecheck` pass for every file this task touches or creates.
- [ ] Verified live against the dev server: sign up a test company and a test independent driver,
      exercise add/remove vehicle on both, add/remove the driver to/from the roster, confirm the DB
      state at each step, then delete all test data created.

## Notes

- Do not wire any of these new components into `src/app/account/page.tsx` — task-06 owns that
  integration. This task's components should be fully functional in isolation (correct props,
  correct API calls) but not yet imported/rendered anywhere.
- Do not build the order-claim/dispatch flow that will eventually read this roster/fleet data —
  that's task-07. This task only needs to produce correct, queryable data (a company's vehicles and
  drivers), not consume it for dispatch decisions.
