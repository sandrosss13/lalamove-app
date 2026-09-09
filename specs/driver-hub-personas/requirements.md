# Requirements: Driver Hub Personas

## Summary

The Driver Hub serves three genuinely different registered-driver account shapes, but today it treats them as barely two. `resolveHubAccount()` collapses every account to `HubAccountKind` — `"BUSINESS"` or `"INDIVIDUAL"` — and the third shape, a driver employed on a company's roster, is distinguished in exactly two places in the entire hub: the sidebar link filter (`hubNavForAccount`) and the Load Board's page guard. Everywhere else an employed driver is indistinguishable from an independent one.

The consequence is that four screens — Today, Earnings ("Wallet"), My orders and Performance — are byte-identical for all three shapes. Their data types (`HubTodayData`, `HubEarningsData`, `HubPerformanceData`) carry no account-shape field at all, so the UI layer could not branch on it even if it wanted to. Two concrete harms follow. A roster driver's Wallet sums `driverPayout` over orders assigned to them and labels the total as their earnings — but for an employed driver that money was paid to their employer, so the screen asserts something false. And a business account is served driver-shaped screens with company-scoped queries: its Today screen shows one arbitrary in-flight job rather than a count of the fleet's, its Performance card is headed "What affects your score", and neither Earnings nor Performance breaks anything down by driver or vehicle.

This feature introduces `HubPersona` as the hub's first-class account axis — `"INDEPENDENT" | "ROSTER" | "BUSINESS"` — derived once in `resolveHubAccount()` and threaded through every loader and screen. Nav visibility moves from two ad-hoc booleans to persona-keyed rules; Earnings becomes hidden and server-side unreachable for a roster driver; a roster driver can no longer register a personal vehicle their employer cannot see; and business accounts gain fleet rollups with per-driver and per-vehicle breakdowns built entirely from existing `Order` and `Vehicle` data.

## Goals

- Introduce `HubPersona` (`"INDEPENDENT" | "ROSTER" | "BUSINESS"`) on `HubAccount`, derived once in `resolveHubAccount()`, as the single axis every hub loader and screen branches on.
- Replace the `businessOnly` / `rosterHidden` boolean pair in `driver-hub-nav.ts` with persona-keyed visibility, so a fourth rule never needs a third boolean.
- Hide the Earnings ("Wallet") screen from roster drivers in the sidebar **and** redirect it server-side, so the hub stops reporting an employer's revenue as an employee's earnings.
- Stop a roster driver from registering a personal vehicle: the "Add vehicle" affordance disappears and `POST /api/driver-profile/vehicles` refuses them, rather than silently writing a `companyId: null` vehicle their employer cannot see.
- Give business accounts real fleet rollups from existing data: a jobs-in-progress count, a fleet-wide attention card, per-driver revenue on Earnings, and per-driver acceptance/completion on Performance.
- Replace second-person driver copy with fleet-appropriate copy wherever a business account reads it ("What affects your score", "Needs your attention", "Online hours", "Per online hour").
- Carry `persona` on `HubTodayData`, `HubEarningsData` and `HubPerformanceData` so the UI layer can branch at all.

## Non-Goals

- **No Prisma schema changes and no migrations.** Every differentiation in this spec is built from columns that exist today. Retiring the `sample.ts` mock data would require `OnlineSession`, `OrderRating`, `JobOffer`, `Payout` and `VehicleExpense` models; that is a separate feature.
- **Not de-mocking.** Sampled values stay sampled and stay badged with `<SampleNote />`. Where a sampled card is meaningless for a persona (the sidebar's "Weekly incentive" card for a salaried employee) it is hidden, not made real.
- **No unactivated / suspended / onboarding states.** `isActivated` is read by exactly one API route today and the hub has no "account under review" surface. That is a real P0 gap, but it is orthogonal to persona differentiation and belongs in its own spec. Note the current branch `fix/suspended-account-gate` already carries uncommitted suspension work at the auth layer.
- **No mobile shell work.** `driver-hub-sidebar.tsx` is a fixed 248px with no breakpoint and `driver-hub-shell.tsx` is `px-8` at every width — 312px of fixed chrome. Real, and out of scope here.
- **No header rebuild.** The design handoff's top nav bar, notifications bell, active-job pill and driver "My account" screen are a separate round of work. The one exception: the fleet jobs-in-progress *count* lands on the Today screen, not in the header.
- **No new tests.** Per project convention this spec adds none.
- **No changes to My orders (`jobs.ts` / `jobs-screen.tsx`).** It is 100% real data and its per-order shape reads correctly for all three personas.
- **No Load Board changes.** Its persona handling — roster redirect plus a `403` from `GET /api/loads` — is already correct.

## Acceptance Criteria

- [ ] `HubAccount.persona` exists, is one of `"INDEPENDENT" | "ROSTER" | "BUSINESS"`, and is derived in `resolveHubAccount()` from `kind` and `companyId` — `BUSINESS` when `kind === "BUSINESS"`, `ROSTER` when `kind === "INDIVIDUAL" && companyId !== null`, `INDEPENDENT` otherwise.
- [ ] `HubAccountKind` still exists and still means what it meant; `persona` is added alongside it, not in place of it, so the Vehicles and Loads screens that already consume `kind` keep compiling.
- [ ] A roster driver sees no "Wallet" link, and a hand-typed `/dashboard/earnings` redirects them to `/dashboard/today`.
- [ ] A roster driver sees no "Add vehicle" button, and `POST /api/driver-profile/vehicles` returns `403` for them.
- [ ] A business account's Today screen shows a count of jobs in progress across the fleet, not a single arbitrary job, and its attention card covers the fleet rather than one arbitrary vehicle.
- [ ] A business account's Earnings screen shows a per-driver revenue breakdown derived from real `Order` rows.
- [ ] A business account's Performance screen shows per-driver acceptance and completion derived from real `Order` rows, and no card is headed "What affects your score".
- [ ] The sidebar's sampled "Weekly incentive" card does not render for a roster driver or a business account.
- [ ] `HubTodayData`, `HubEarningsData` and `HubPerformanceData` each carry `persona`.
- [ ] `pnpm lint` and `pnpm typecheck` (or the project's equivalents) pass clean.
- [ ] `git grep` finds no remaining reference to `businessOnly` or `rosterHidden`.

## Assumptions

- **Confirmed, not assumed:** the three shapes are derived as described in the first acceptance criterion. `resolveHubAccount()` (`src/lib/dashboard/hub/account.ts:144-278`) sets `kind: "BUSINESS"` only for a `role === "COMPANY"` session, and a `BUSINESS` account's `companyId` names *its own* company. So `companyId !== null` alone is **not** the roster test — it must be conjoined with `kind === "INDIVIDUAL"`. Getting this backwards would hide the Load Board and the Wallet from fleet owners, who are entitled to both.
- **Confirmed, not assumed:** `DriverProfile.accountType` (`DriverAccountType`) is **not** this axis. A sole-proprietor driver registered as a business is still `kind: "INDIVIDUAL"` and, if they have no employer, persona `INDEPENDENT`. Branch on `persona`, never on `accountType`.
- **Assumed:** a roster driver has no legitimate need for a personal-earnings view. The decision taken in planning was to hide Earnings entirely rather than relabel it — the failure direction to avoid is showing an employee a currency figure that is not theirs.
- **Assumed:** a roster driver keeps My orders, Today, Performance and Vehicles. Only Earnings and the Load Board are withheld.
- **Decided, with the objection on record:** the Today screen's hero tile keeps its ₾ figure for a roster driver, even though it is the same `SUM(driverPayout + overtimeDriverPayout)` over the same scope that got the Wallet withheld. Hiding the Wallet and keeping this tile leaves the same overstatement on screen in a smaller place. This was raised during planning and the decision was to hold the feature to its approved scope rather than widen it; it is recorded here so a later reader knows it was weighed, not missed. Revisiting it costs two ternaries in `today.ts` and one screen branch.
- **Assumed:** fleet rollups are per-driver and per-vehicle, not per-city. A multi-city breakdown was considered and deliberately deferred.
- **Assumed:** business per-driver breakdowns may reuse the existing `Order.driverId` join already used by `drivers.ts`; no new index is required at the data volumes in play.

## Technical Constraints

- **Next.js App Router, Prisma, Better Auth, shadcn/ui, Tailwind.** Hub loaders are `server-only`; `HubAccount` and every `Hub*Data` object is handed straight into `"use client"` components, so every field must be plain serialisable data — no `Date`, no Prisma model instance.
- **`resolveHubAccount()` is React-`cache()`d.** Deriving `persona` there costs nothing per request; do not re-derive it ad hoc in screens.
- **The tenancy boundary is `hubOrderScope()`**, duplicated verbatim in `today.ts:248`, `earnings.ts:249`, `jobs.ts:249` and `performance.ts:197`. It fails closed via `UNMATCHABLE_COMPANY_ID` rather than letting `{ companyId: null }` read as `IS NULL` and match every unclaimed order. **Persona work must not weaken this.** If a task changes the clause, it changes it in all four — but no task in this spec should need to.
- **Nav filtering is cosmetic; page guards are the boundary.** Every screen withheld from a persona needs a server-side `redirect()` in its `page.tsx` *and*, where an API backs it, a matching refusal in the route handler. Hiding a link is never sufficient.
- **The sample-data convention is load-bearing.** Anything the schema cannot source lives in `src/lib/dashboard/hub/sample.ts` under a `sampled` sub-object and renders `<SampleNote />`. New persona-specific values must be real or must follow this convention — no unbadged invented numbers. Note that `src/app/api/dashboard/hub/earnings/export/route.ts` folds sampled figures into an XLSX where the badge cannot travel; do not widen that surface.
- **The six-tone status vocabulary in `hub-status.ts` is closed.** No screen may introduce a seventh tone.
- **Parallel-safety:** tasks within a wave must not modify overlapping files. The wave assignment in the README already guarantees this; do not move a task between waves without rechecking file ownership.
