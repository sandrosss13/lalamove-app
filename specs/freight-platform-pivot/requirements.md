# Requirements: Freight & Cargo Logistics Platform Pivot

## Summary

The app is pivoting from a general on-demand delivery platform (small parcels, documents, light
vehicles) into a commercial freight and cargo logistics marketplace — connecting shippers with
medium-duty and heavy-duty commercial vehicles, either owned by independent drivers or operated as
fleets by logistics companies. This is a full replacement of the existing package/vehicle model,
not an additional service tier.

The pivot touches the data model (new cargo taxonomy, vehicle specs, pricing rules, a new
logistics-company account type), the pricing engine (moving from a flat per-package rate to a
Bolt/Lalamove-style base fare + distance + time + handling-fee model), and every user-facing flow
that currently assumes small-parcel delivery (booking form, driver dashboard, landing page
calculator, order matching).

## Goals

- Replace `PackageType` (Document/Small/Medium/Large Parcel) with a `CargoCategory` taxonomy scoped
  to furniture, appliances, retail stock, event equipment, full relocations, industrial supplies,
  and construction materials.
- Replace the flat `VehicleType` enum + hardcoded UI option list with a database-backed
  `VehicleTypeSpec` reference table (category, max payload, cargo dimensions, loading access type)
  so vehicle specs and their pricing rules are data, not code.
- Introduce a real pricing engine: base fare (per vehicle type) + distance rate + time rate + a free
  loading/unloading buffer + an overtime waiting fee + an optional helper/mover fee + a minimum fare
  floor.
- Introduce `LogisticsCompany` as a first-class account type (its own login, role `COMPANY`) that
  owns a vehicle fleet and a roster of drivers, claims open orders, and dispatches them internally
  to one of its own drivers with one of its own vehicles.
- Keep independent drivers (no company affiliation) working the way they do today: they own their
  own vehicle(s) and accept open orders directly.
- Rework every existing flow that depended on the old model: booking form, driver/company
  dashboards, order accept/dispatch, the landing page's marketing copy and pricing calculator.
- Give drivers and logistics companies a single dedicated `/dashboard` route — separate from the
  client-facing `/account` and `/orders` — as the one place they manage their identity, fleet/
  roster, bookings, and reporting. `/account` and `/orders` become client-only and redirect
  `DRIVER`/`COMPANY` sessions to `/dashboard`.
- Give each provider (driver or company) reporting on their own data: an order-history table, an
  earnings/revenue summary, fleet & driver utilization (companies), and an Excel export of order
  history.

## Non-Goals

- **No live waiting-time timers or in-app chat/dispatch messaging.** Overtime is captured as a
  single `waitingMinutes` value entered when an order is completed, not tracked live minute-by-minute.
- **No admin UI for editing `PricingRule`/`VehicleTypeSpec` rows.** They are seeded via migration;
  changing them is a direct database edit for now, not a feature to build.
- **No payments/checkout.** Pricing computes a quote and a final price; charging a card is out of
  scope, same as before this pivot.
- **No multi-company driver membership.** A driver belongs to at most one `LogisticsCompany` at a
  time (`DriverProfile.companyId` is a single nullable FK, not a many-to-many).
- **No company-side driver invite emails/notifications.** A company adds a driver to its roster by
  looking them up by email (the driver must already have signed up independently as a `DRIVER`
  with no company); no invite/accept handshake.
- **No data migration for existing dev orders/vehicles.** Per the decision made during planning,
  existing dev-database rows in `Order` and `Vehicle` are wiped, not migrated, since their shape is
  incompatible with the new model and this is pre-launch data.
- **Exact pricing numbers are illustrative**, not real business figures — see
  `task-01-schema-and-seed.md` for the seeded placeholder rate table. Tuning real rates later is a
  data change, not a code change.
- **No visual charts/graphs.** Provider reporting starts as tables and summary totals
  (`task-09-provider-reporting.md`); charting is a deliberate future iteration, not part of this
  pivot. No charting library is added.
- **No cross-provider or admin reporting.** Each driver or company only ever sees their own order
  history, earnings, and (for companies) fleet/driver utilization — never another provider's data
  or a platform-wide view.

## Acceptance Criteria

- [ ] `PackageType` and the old flat `VehicleType` enum/UI option lists are fully removed from the
      codebase — no route, component, or lib references them.
- [ ] A client can book a delivery by picking a cargo category and a vehicle type (sourced from the
      seeded `VehicleTypeSpec` data), optionally requesting a helper, and receives a price computed
      from the new engine (base fare + distance + time + helper fee, floored at the minimum fare).
- [ ] A visitor can get the same kind of quote from the public landing-page calculator without
      signing up.
- [ ] A company can sign up, register fleet vehicles, add existing independent drivers to its
      roster by email, see open orders matching its fleet, claim one, and dispatch it to one of its
      own drivers with one of its own vehicles.
- [ ] An independent driver (no company) continues to see and accept open orders matching a vehicle
      type they personally registered, exactly as today, just using the new vehicle taxonomy.
- [ ] Completing a delivery accepts a waiting-time input and applies the overtime fee when it
      exceeds the vehicle type's free loading/unloading buffer.
- [ ] A signed-in driver or company reaches all of their provider tooling (identity, fleet/roster,
      bookings, reporting) at a single `/dashboard` route; hitting `/account` or `/orders` as a
      `DRIVER` or `COMPANY` redirects there instead.
- [ ] A driver or company can view their own order history, an earnings/revenue summary, and (for
      companies) fleet & driver utilization, and can export their order history to a real `.xlsx`
      Excel file.
- [ ] `pnpm check` (lint + typecheck) and `pnpm build` pass after every task, and the full flow has
      been exercised against the live dev database (then cleaned up) before this feature is
      considered done.

## Assumptions

- The existing dev Supabase Postgres database can have its `Order` and `Vehicle` tables truncated
  without concern (confirmed during planning — this is pre-launch data).
- The existing `User`/`Session`/`Account`/`Verification` (Better Auth) tables, `ClientProfile`
  model, and client-side flows are unaffected by this pivot except where explicitly called out.
- `GeorgianCity`, `DriverAccountType`, and `ClientAccountType` enums are unaffected and reused as-is.
- Supabase Storage (`vehicle-photos` bucket) and its env vars (`SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`) already exist and are reused for company fleet vehicle photos —
  no new bucket needed.
- LocationIQ geocoding (`src/lib/geo.ts`'s `geocodeAddress`/`haversineDistanceKm`) is reused
  unchanged; only pricing on top of the resulting distance changes.

## Technical Constraints

- Next.js App Router, TypeScript strict, Tailwind v4, Prisma + Postgres (Supabase), Better Auth.
  No new frontend framework or state-management library.
- No validation library — continue the hand-rolled `parseXBody` pattern already used throughout
  `src/app/api/**/route.ts`.
- No ORM other than Prisma; no new database.
- One new dependency, `exceljs`, for the Excel export requirement in `task-09-provider-reporting.md`
  — chosen over the `xlsx`/SheetJS npm package, whose npm-published builds have known unpatched
  security advisories. No other new frontend libraries (no charting, no table/grid library, no
  state-management library) are introduced by this pivot.
- Match existing code style: sparse doc comments (only genuine non-obvious WHY), Prettier config
  already in the repo (80-width, trailing commas).
- Every task must leave `pnpm check` and `pnpm build` passing before being considered complete.
