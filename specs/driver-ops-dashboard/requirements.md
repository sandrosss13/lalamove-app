# Requirements: Driver Ops Dashboard

## Summary

The driver-facing dashboard (`/dashboard` for role `DRIVER`, currently `src/components/dashboard/driver-dashboard.tsx`) is a single light-themed page: a driver's own vehicles (if independent) plus an availability toggle and two order lists (open market + own deliveries). It works, but the user commissioned one dark "ops console" design (via Claude Design) meant to cover both the logistics-company dashboard and the driver dashboard — this spec is the driver-side half of that, matching `specs/company-ops-dashboard`'s visual language and component conventions exactly.

Unlike the company dashboard, this is not a case of missing backend capability — every mutation a driver dashboard needs (accept a delivery, start it, complete it, toggle online/offline, manage their own vehicle(s)) already has a working, tested API route and client component. The work here is restructuring the UI: a tabbed dark shell replacing the single scrolling page, with the existing mutation components composed into it largely unmodified.

## Goals

- Give a driver, at a glance, today's status: online/offline, any delivery currently in progress, and today's/this-month's earnings.
- Make available and assigned deliveries browsable in one searchable/filterable Deliveries tab, with a detail drawer that carries a driver through accept → start → (live tracking) → complete without leaving the dashboard.
- Show a driver their own earnings trend, computed the same way the company dashboard computes fleet-wide revenue, just scoped to one driver.
- Let an independent driver manage their own vehicle(s) (register, edit, remove) from a Vehicle tab; a company-rostered driver — whose fleet is owned and managed by their company — never sees that tab at all.
- Reuse the exact same dark theme, drawer/toast/shell chrome, and `onSuccess`-prop mutation-reuse convention already established by `specs/company-ops-dashboard`, rather than building a second, parallel design system.

## Non-Goals

- No new API routes. Everything needed already exists (`/api/orders/[id]/accept`, `/start`, `/complete`, `/api/driver-profile/status`, `/location`, `/api/driver-profile/vehicles`).
- No changes to `/orders/[id]/track` (the standalone tracking page) or to `/orders` (the client's own order list) — both stay exactly as they are. The order-tracking *component* (`OrderTrackingMap`) is reused, embedded inside the new drawer, but nothing about the standalone page changes.
- No duplication of the dark theme tokens or the generic drawer/toast/context chrome — this spec explicitly depends on `specs/company-ops-dashboard` having created those first (see the README's prerequisite note) and imports them directly.
- No pagination or server-side search/filter/sort — same zero-pagination convention as the rest of the app and as `company-ops-dashboard`.
- No changes to `src/app/dashboard/page.tsx` — this feature only replaces what it renders for role `DRIVER`.

## Acceptance Criteria

- [ ] Signing in as a `DRIVER` user and visiting `/dashboard` renders the new dark tabbed dashboard instead of the old page (or a lightweight fallback if the driver profile doesn't exist yet — a rare edge case since profile creation is part of sign-up).
- [ ] All tabs render real data pulled from Prisma — no hardcoded/fake values anywhere.
- [ ] An independent driver can still do everything they could before: toggle online/offline (with the geolocation beacon still running), accept an open delivery, start it, complete it, and register/edit/remove their own vehicle(s) — all through the new UI, all via the same underlying API routes as before.
- [ ] A company-rostered driver sees only their assigned deliveries (no "Available" section, no Vehicle tab) — matching today's behavior.
- [ ] `pnpm lint` and `pnpm typecheck` pass with no new errors after every wave.
- [ ] No dark-theme leakage into `/account`, `/orders`, the landing page, or the company dashboard's own fallback screens.

## Assumptions

- A driver has at most one active delivery (`ACCEPTED` or `IN_TRANSIT`) at a time — confirmed by the existing accept-route's exclusivity logic — so the Overview tab's "active delivery" card only ever needs to show zero or one order, never a list.
- Same date-boundary assumption as the company spec: "today"/"this month" use plain server-local `Date` arithmetic, no timezone-aware business-day logic.
- Data volumes (one driver's own orders/vehicles) are small enough that fetching full unbounded lists and filtering client-side is fine — this was already true of `driver-bookings.tsx` today.

## Technical Constraints

- Same stack as the company spec: Next.js 15 App Router, React 19, Prisma 6, Tailwind v4, no new npm dependencies.
- Reuse `AcceptOrderButton`, `DeliveryLifecycleActions`, `DriverStatusToggle`, `VehicleForm`, `VehicleCard`, `EditVehicleForm`, `RemoveVehicleButton`, `OrderTrackingMap` unmodified in logic (three of them get an additive optional `onSuccess` prop, per task-02).
- Import `OpsDashboardContext`, `OpsToast`, `OpsDrawerShell` from `src/components/dashboard/ops/` (created by `company-ops-dashboard`) rather than recreating them.
- Every new Prisma query scoped to `session.user.id` (the driver themselves) — this dashboard shows only the signed-in driver's own data, never another driver's.
