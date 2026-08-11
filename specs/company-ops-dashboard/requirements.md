# Requirements: Company Ops Dashboard

## Summary

The logistics-company dashboard (`/dashboard` for role `COMPANY`, currently `src/components/dashboard/company-dashboard.tsx`) is a single light-themed page: fleet list, driver roster, and an open/claimed bookings list. It works but gives a company admin no overview, no revenue visibility, no searchable order/driver/vehicle management, and no way to see or manage the driver↔vehicle pairings that the `DriverVehicleAssignment` model already supports at the schema level but that no UI surfaces.

This feature replaces it with a tabbed, dark "ops console" dashboard — Overview, Orders, Revenue, Fleet, Drivers, Vehicles — modeled on a reference mockup the user supplied (a static HTML file, since discarded, not part of this repo). The mockup's layout and interaction patterns (sidebar tabs, slide-over drawers for order/driver detail and vehicle registration, toast notifications) are kept; its data is not — every number, list and status shown must come from real Prisma queries. Where the mockup showed something this app's schema has no way to back for real (star ratings, paid/pending payout status), that piece is left out of this pass rather than faked.

The result should feel like one cohesive SPA-style page (instant tab switching, no full navigation) built entirely from data fetched once per page load, consistent with how every other page in this codebase already works (a server component fetches, client components mutate via `fetch` + `router.refresh()`).

## Goals

- Give a company admin, at a glance, fleet-wide performance (today's completed deliveries, revenue, active drivers) without digging through separate sections.
- Make orders searchable/filterable/sortable, with a detail view that composes the app's existing claim → dispatch → start → complete → (now also) cancel lifecycle.
- Surface real revenue: a trend chart, a breakdown by vehicle type and by (driver-city) region, and computed per-driver earnings for a selected period.
- Make the fleet and driver roster searchable, and — for the first time in this app — let a company actually assign and unassign a driver to a specific vehicle through the UI, backed by the existing but currently-unused `DriverVehicleAssignment` model.
- Keep the rest of the app (driver dashboard, account pages, landing page) completely unaffected — this is a self-contained dark surface reachable only by `COMPANY`-role users at the existing `/dashboard` route.

## Non-Goals

- No schema migration. No `rating` field, no `Order.city`/region column, no payout-ledger model. Anything the current schema can't back is either derived (e.g. "region" from the assigned driver's city) or left out of the UI entirely (ratings, paid/pending payout status).
- No new npm dependencies. Tabs, drawers, and toasts are hand-rolled with Tailwind + CSS keyframes — no shadcn/ui, no chart library, no toast library.
- No pagination or server-side search/filter/sort. Every list is fetched in full (as every other list in this app already is) and filtered client-side — consistent with the zero-pagination convention already established everywhere else.
- No changes to the driver-facing dashboard, the client-facing account pages, or the marketing/landing page. No changes to `src/app/dashboard/page.tsx` (the role-branching entry point) — this feature only replaces what it renders for role `COMPANY`.
- No ability for a company to force another user's `isOnline` status. That stays self-service, tied to the driver's own geolocation beacon; the driver drawer shows it read-only.
- No automated tests are added by this spec (this repo has no test runner configured at all — flag to the user separately if route-level tests are wanted for the two new endpoints).

## Acceptance Criteria

- [ ] Signing in as a `COMPANY` user and visiting `/dashboard` renders the new dark tabbed dashboard instead of the old page (or the existing "finish your company profile" fallback if the company profile doesn't exist yet).
- [ ] All 6 tabs render real data pulled from Prisma — no hardcoded/fake values anywhere.
- [ ] The full order lifecycle still works end-to-end through the new UI: claim an open order → dispatch it to a roster driver + fleet vehicle → (as that driver, elsewhere in the app) start → complete; and a company can now also cancel a non-terminal order, which was not possible anywhere in the app before this feature.
- [ ] A company can assign a roster driver to a fleet vehicle and unassign them again from the Vehicles tab, and that pairing is reflected on the Fleet and Drivers tabs (assigned vehicle / assigned driver shown in both directions).
- [ ] `pnpm lint` and `pnpm typecheck` pass with no new errors after every wave.
- [ ] Visiting `/dashboard` as a `DRIVER`, or `/account` as a `CLIENT`, or the landing page, shows no trace of the new dark theme (no leaked CSS, no leaked fonts, no hidden light-theme header).

## Assumptions

- "Region" throughout the new dashboard means the *driver's* `GeorgianCity`, not a pickup/dropoff geography — the schema has no city/region field on `Order` or `Vehicle`, only on `DriverProfile` and `LogisticsCompany`. This is called out in the UI copy (e.g. "Region (by driver)") so it isn't mistaken for delivery geography.
- Data volumes stay small enough that fetching full unbounded lists per page load and filtering client-side is acceptable — true today (no pagination exists anywhere in this app) and not expected to change in this pass.
- "Deliveries today" and revenue figures use the server's local day boundaries via plain `Date` arithmetic (`new Date()` at request time) — no timezone-aware business-day logic is introduced, consistent with how the rest of the app handles dates.

## Technical Constraints

- Next.js 15 App Router, React 19, Prisma 6, Better Auth, Tailwind v4, plain CSS custom properties — no UI/state library beyond what's already installed.
- All new client-side mutation flows must follow the existing house pattern: `"use client"` component, local `useState` for submitting/error, `fetch()` to a route, inline error text, `router.refresh()` on success. No SWR, no React Query, no optimistic local state.
- Reuse existing mutation components (`ClaimOrderButton`, `CompanyDispatchForm`, `CompanyVehicleForm`, `CompanyRemoveVehicleButton`) unmodified in logic — only styling and an additive `onSuccess` callback prop change.
- Every new/extended Prisma query must be scoped to the caller's own `LogisticsCompany` (via `session.user.id` → `prisma.logisticsCompany.findUnique({ where: { userId } })`, the pattern used by every existing `logistics-company/**` route) — no cross-company data must ever be readable or writable through these endpoints.
- New API routes follow the existing hand-rolled validation and 404-not-403 (never confirm another company's data exists) conventions demonstrated in `claim/route.ts` and `dispatch/route.ts`.
