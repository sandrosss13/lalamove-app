# Task 06: Account dashboards for drivers and companies

## Status

pending

## Wave

3

## Description

Wires the new company account (task-03) and fleet/roster management components (task-04) into
`/account`, and updates the existing driver dashboard branch to reflect company affiliation: an
independent driver manages their own vehicles as before (now via task-04's reworked components); a
company-affiliated driver sees a read-only note about their company and doesn't manage vehicles
themselves (the company does); a company gets a brand-new dashboard branch showing its identity,
fleet, and driver roster.

## Dependencies

**Depends on:** task-03-company-account.md, task-04-fleet-vehicle-management.md
**Blocks:** None

**Context from dependencies:** task-03 built `GET`/`POST /api/logistics-company` (a company's own
profile, `{ companyName, vatId, phone, city }`, `null` if not yet completed) and added `COMPANY` as
a sign-up role. task-04 built: `GET`/`POST /api/logistics-company/vehicles` +
`DELETE /api/logistics-company/vehicles/[id]` (fleet vehicles, owned by the company, using the new
`VehicleTypeSpec` taxonomy); `GET`/`POST /api/logistics-company/drivers` +
`DELETE /api/logistics-company/drivers/[userId]` (roster management by driver email); reworked
`src/components/vehicle-form.tsx`/`vehicle-card.tsx` for independent drivers (now sourcing vehicle
types from `GET /api/vehicle-types` instead of a static list, no capacity input); and new
`src/components/company-vehicle-form.tsx`, `src/components/company-vehicle-card.tsx`,
`src/components/company-driver-roster.tsx` for companies. `DriverProfile.companyId` (nullable, set
by a company adding the driver to its roster) is how a driver's affiliation is determined.

## Files to Modify

- `src/app/account/page.tsx` — currently branches on `session.user.role`: signed-out, `CLIENT`
  (profile form + orders, unaffected by this task), and a `DRIVER` branch (`DriverAccount` component:
  identity summary + vehicle list/add form). Two changes:
  1. **`DRIVER` branch**: fetch `driverProfile.companyId` (already selectable via the existing
     `prisma.driverProfile.findUnique` call in this branch, just add `companyId: true` — or
     `include` the `company` relation for its name if you want to display it) alongside what's
     already fetched. If `companyId` is set: fetch the company's `companyName` (via the relation)
     and render a note like "You're part of {companyName}'s fleet — vehicles are managed by your
     company." instead of the vehicle list/add form (don't render `vehicle-form.tsx`/vehicle cards
     for a company-affiliated driver at all; they have no vehicles of their own to manage). If
     `companyId` is null: render exactly what's there today, just using task-04's reworked
     `vehicle-form.tsx`/`vehicle-card.tsx` (which now expect a resolved vehicle-type label per
     task-04's documented interface change — pass it from this server component using the vehicle's
     `vehicleTypeSpec.label`, already available via the relation you'll need to `include` when
     fetching the driver's vehicles).
  2. **New `COMPANY` branch**: mirror the structure of the existing `DRIVER`/`CLIENT` branches (a
     server component, e.g. `CompanyAccount`, fetching the signed-in company's profile via
     `prisma.logisticsCompany.findUnique` including `vehicles` (with `vehicleTypeSpec`) and
     `drivers` (with enough fields to render a roster list — name, email, phone)). Render: company
     identity header (companyName, city), a "Fleet" section using `company-vehicle-form.tsx` +
     `company-vehicle-card.tsx` (same pattern as the driver vehicle section, adapted), and a
     "Drivers" section rendering `company-driver-roster.tsx`. If the company hasn't completed their
     profile yet (`logisticsCompany` is `null`), show a message analogous to the existing driver
     branch's null-profile handling (check how that currently reads, if anything, or the client
     `ClientAccount`'s null-clientProfile handling for the exact tone/pattern to match) rather than
     crashing.

## Technical Details

### Driver-company-affiliation query

In the existing `DriverAccount` server component (or equivalent after your edits), the
`driverProfile` fetch needs `companyId` and, when non-null, the company's name. Simplest: one query
with an `include`:
```ts
const driverProfile = await prisma.driverProfile.findUnique({
  where: { userId },
  include: {
    company: { select: { companyName: true } },
    vehicles: { include: { vehicleTypeSpec: true } },
  },
});
```
Then branch in the component: `driverProfile?.company ? <affiliated note> : <vehicle management>`.

### Company dashboard query

```ts
const company = await prisma.logisticsCompany.findUnique({
  where: { userId },
  include: {
    vehicles: { include: { vehicleTypeSpec: true } },
    drivers: { select: { userId: true, firstName: true, lastName: true, phone: true, user: { select: { email: true } } } },
  },
});
```
(Adjust the `drivers` select to whatever `company-driver-roster.tsx` from task-04 actually expects
as props — check that component's prop types when wiring this up, since this task didn't write it
and must match its real interface, not a guessed one.)

## Acceptance Criteria

- [ ] An independent driver's `/account` looks and behaves as it did before this pivot, just with
      the reworked vehicle-type picker/labels from task-04 (no functional regression).
- [ ] A company-affiliated driver's `/account` shows their company name and does not show a
      vehicle-add form or their own vehicle list.
- [ ] A `COMPANY` session's `/account` shows the company's identity, its fleet (add/remove vehicles
      working end-to-end), and its driver roster (add/remove drivers by email working end-to-end).
- [ ] A `COMPANY` session with no completed profile yet sees a sensible prompt, not a crash.
- [ ] `pnpm lint`/`pnpm typecheck` pass.
- [ ] Verified live: sign up a test company, complete its profile, add a fleet vehicle, sign up a
      separate test independent driver, add that driver to the company's roster from the company's
      dashboard, confirm the driver's own `/account` now shows the affiliated-note branch instead of
      their vehicle form, remove the driver from the roster, confirm their `/account` reverts to
      normal vehicle management — then clean up all test data.

## Notes

- Do not modify `src/app/api/logistics-company/**` or `src/app/api/driver-profile/**` route logic —
  those are task-03/task-04's finished contracts; this task only calls them / queries the DB
  directly for display, per the existing pattern where `/account` is a server component doing direct
  Prisma reads alongside client components that call the API routes for mutations.
- Do not build order-claim/dispatch UI here even though it might feel like it belongs on the company
  dashboard — that's task-07's scope (it may add its own section to this page or a separate route;
  check task-07's file list if curious, but this task should not preemptively add placeholders for
  it).
