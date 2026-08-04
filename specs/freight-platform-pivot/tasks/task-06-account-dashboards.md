# Task 06: Provider dashboard route (`/dashboard`) for drivers and companies

## Status

pending

## Wave

3

## Description

Gives independent drivers and logistics companies a single dedicated route — `/dashboard` — as the
one place they manage their identity, fleet, and driver roster, separate from the client-facing
`/account` and `/orders` pages. This replaces the earlier plan of adding a `DRIVER`/`COMPANY` branch
directly onto `/account`: instead, `/account` becomes client-only and now redirects non-client
sessions to `/dashboard`. An independent driver manages their own vehicles (now via task-04's
reworked components); a company-affiliated driver sees a read-only note about their company instead
of vehicle management; a company gets a dashboard showing its identity, fleet, and driver roster.
Booking/order management (accept, claim, dispatch, delivery lifecycle) is explicitly **not** built
here — that's task-07, which extends the same route this task creates.

## Dependencies

**Depends on:** task-03-company-account.md, task-04-fleet-vehicle-management.md
**Blocks:** task-07-dispatch-and-fulfillment.md, task-09-provider-reporting.md

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

## Files to Create

- `src/app/dashboard/page.tsx` — the new route. Server component: get the session; if signed out,
  render a sign-in/sign-up prompt (mirror the existing pattern in `src/app/account/page.tsx`'s
  signed-out branch — same copy/link style, just headed "Dashboard" instead of "My account"). If
  `session.user.role === "CLIENT"`, `redirect("/account")` (clients have no reason to be here — this
  route is provider-only). If `"DRIVER"`, render `<DriverDashboard userId={session.user.id}
  userName={session.user.name} />`. If `"COMPANY"`, render `<CompanyDashboard
  userId={session.user.id} />`. Use `export const dynamic = "force-dynamic"` (session + Prisma
  access, same reason `/account` and `/orders` already set this).
- `src/components/dashboard/driver-dashboard.tsx` — server component, the independent/affiliated
  driver's dashboard body. This is a direct port of the current `DriverAccount` function in
  `src/app/account/page.tsx` (identity header + vehicle list/add form), with one addition: fetch
  `companyId` (and the company's name via the relation) alongside what's already fetched, e.g.:
  ```ts
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
    include: {
      company: { select: { companyName: true } },
      vehicles: { include: { vehicleTypeSpec: true } },
    },
  });
  ```
  If `driverProfile?.company` is set: render a note like "You're part of {companyName}'s fleet —
  vehicles are managed by your company." instead of the vehicle list/add form (don't render
  `vehicle-form.tsx`/vehicle cards for a company-affiliated driver at all; they have no vehicles of
  their own to manage). If `companyId` is null: render exactly what `DriverAccount` renders today,
  using task-04's reworked `vehicle-form.tsx`/`vehicle-card.tsx` (which expect a resolved
  vehicle-type label per task-04's documented interface change — pass it using the vehicle's
  `vehicleTypeSpec.label`, available via the `include` above). Export a named `DriverDashboard`
  function taking `{ userId: string; userName: string }`. Leave a natural place at the bottom of the
  component to add a "Deliveries" section later (task-07 will insert its own component call there —
  don't build a placeholder for it, just don't structure the JSX in a way that makes appending a
  sibling section awkward).
- `src/components/dashboard/company-dashboard.tsx` — server component, the company's dashboard body.
  Fetch the signed-in company's profile:
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
  as props — check that component's prop types when wiring this up, since task-04 wrote it and this
  task must match its real interface, not a guessed one.) Render: company identity header
  (companyName, city), a "Fleet" section using `company-vehicle-form.tsx` + `company-vehicle-card.tsx`
  (same pattern as the driver vehicle section), and a "Drivers" section rendering
  `company-driver-roster.tsx`. If the company hasn't completed their profile yet (`company` is
  `null`), show a message analogous to the existing driver branch's null-profile handling (check how
  `DriverAccount`/`ClientAccount` currently handle a missing profile for the exact tone/pattern to
  match) rather than crashing. Export a named `CompanyDashboard` function taking `{ userId: string }`.
  Same note as above: leave room at the bottom for task-07 to add a bookings section later, without
  pre-building a placeholder for it.

## Files to Modify

- `src/app/account/page.tsx` — remove the `DriverAccount` function and its usage entirely (it moves
  to `src/components/dashboard/driver-dashboard.tsx` above, functionally unchanged). Replace the
  existing `if (session.user.role === "DRIVER") { ... }` branch with a redirect covering both
  provider roles:
  ```ts
  import { redirect } from "next/navigation";
  // ...
  if (session.user.role !== "CLIENT") {
    redirect("/dashboard");
  }
  ```
  Everything below that check (the `ClientProfile`/orders fetch and render) is unchanged — `/account`
  is now effectively client-only. Keep the signed-out branch exactly as it is today.
- `src/components/auth-status.tsx` — the global header's session widget currently always shows a
  "My account" link. Make it role-aware: when `role === "CLIENT"`, keep "My account" linking to
  `/account` (unchanged); when `role !== "CLIENT"` (i.e. `DRIVER` or `COMPANY`), show a "Dashboard"
  link to `/dashboard` instead (same styling, just different `href`/label). Keep the signed-out
  branch (sign in / sign up links) unchanged.

## Technical Details

### Route-level role redirects

Both `/account` (this task) and `/orders` (task-07, since `/orders`' driver branch is task-07's
scope) redirect non-owning roles to where their content actually lives now:

| Route | `CLIENT` | `DRIVER` / `COMPANY` |
|---|---|---|
| `/account` | Unchanged (profile + own orders) | `redirect("/dashboard")` |
| `/orders` | Unchanged (own order list) | `redirect("/dashboard")` — task-07's change |
| `/dashboard` | `redirect("/account")` | Driver or company dashboard body |

Use Next.js's `redirect()` from `next/navigation` (a server-side redirect thrown from a Server
Component — the same primitive, not a client-side `router.push`).

### Driver-company-affiliation query

Already shown above — one query with an `include` for `company` and `vehicles.vehicleTypeSpec`.
Branch in the component: `driverProfile?.company ? <affiliated note> : <vehicle management>`.

## Acceptance Criteria

- [ ] An independent driver's `/dashboard` looks and behaves the way the pre-pivot `/account`
      driver branch did, just at the new URL and using the reworked vehicle-type picker/labels from
      task-04 (no functional regression).
- [ ] A company-affiliated driver's `/dashboard` shows their company name and does not show a
      vehicle-add form or their own vehicle list.
- [ ] A `COMPANY` session's `/dashboard` shows the company's identity, its fleet (add/remove
      vehicles working end-to-end), and its driver roster (add/remove drivers by email working
      end-to-end).
- [ ] A `COMPANY` session with no completed profile yet sees a sensible prompt, not a crash.
- [ ] A `CLIENT` session visiting `/dashboard` is redirected to `/account`; a `DRIVER` or `COMPANY`
      session visiting `/account` is redirected to `/dashboard`.
- [ ] The global header shows "My account" (→ `/account`) for `CLIENT` sessions and "Dashboard"
      (→ `/dashboard`) for `DRIVER`/`COMPANY` sessions.
- [ ] `pnpm lint`/`pnpm typecheck` pass.
- [ ] Verified live: sign up a test company, complete its profile, add a fleet vehicle, sign up a
      separate test independent driver, add that driver to the company's roster from the company's
      dashboard, confirm the driver's own `/dashboard` now shows the affiliated-note branch instead
      of their vehicle form, remove the driver from the roster, confirm their `/dashboard` reverts
      to normal vehicle management, confirm both `/account` redirects for both test accounts — then
      clean up all test data.

## Notes

- Do not modify `src/app/api/logistics-company/**` or `src/app/api/driver-profile/**` route logic —
  those are task-03/task-04's finished contracts; this task only calls them / queries the DB
  directly for display, per the existing pattern where dashboard pages are server components doing
  direct Prisma reads alongside client components that call the API routes for mutations.
- Do not build order-claim/dispatch/booking UI here even though it might feel like it belongs on the
  dashboard — that's task-07's scope. It will extend `driver-dashboard.tsx` and
  `company-dashboard.tsx` (both created by this task) with a bookings section, so leave both
  components easy to extend with an additional sibling section, but don't pre-build placeholders for
  it.
- Do not touch `src/app/orders/page.tsx` at all — its driver branch and redirect are task-07's scope,
  not this task's, even though it's conceptually similar to the `/account` change above.
