# Requirements: Driver Load Board

## Summary

A dashboard where drivers see client bookings ("loads") and claim them on a
first-come, first-served basis. One screen serves individual drivers, sole
proprietors and logistics-company accounts, with no role-specific UI. It is the
first real dispatch surface in the product: today a driver's only view of open
work is the plain listing behind `GET /api/orders`, which filters on vehicle
type alone and offers no way to decline, no sense of what the job pays them, and
no indication whether the load physically fits the vehicle they drive.

The design is fully specified at
`UI:UX/Order Dashboard/design_handoff_driver_load_board/` (high fidelity: final
colours, typography, spacing, states and copy). This spec implements that design
and supplies the two pieces of data model it assumes but the database does not
yet have.

**The two decisions that unblocked this spec:**

1. **Cargo weight and dimensions are added to `Order`.** The design's central
   rule — *"only loads that fit the signed-in driver's vehicle (max weight +
   L×W×H) are ever shown"* — has nothing to run against today: `Order` carries a
   `vehicleTypeSpecId` (the class the client picked) and no physical description
   of the load at all. The client now declares actual weight and L/W/H **on top
   of** the existing vehicle-class pick. The class still drives the price, so
   `src/lib/pricing.ts` and the estimate API are untouched; the new figures make
   the fit filter real and give us the data to move to a fully cargo-driven
   booking model later, with evidence.

2. **The platform takes 15% of everything the client pays; the driver sees only
   their 85%.** `Order.price` is what the *client* pays and must never be shown
   to a driver as earnings. Every figure on this board — the table's Price
   column, the drawer's headline, the confirm dialog's "You are paid", the per-km
   sub-line — is the driver's share. The rate and the resolved payout are
   **stored on the order at creation**, not computed at read time, so retuning
   the commission never rewrites what a historical job paid.

   **The commission applies to the whole client-paid amount, and this codebase
   spreads that amount across three columns, not one.** `Order.price` is only
   part of what a client pays:

   - `price` = `baseFare + distanceFare + timeFare + helperFee`, floored at the
     rule's `minimumFare` (`src/lib/pricing.ts`). `helperFee` is inside it, so it
     is commissioned by construction — do not subtract it a second time.
   - `serviceLevelAdjustment` is stored **beside** `price`, not folded into it
     (schema: "itemised rather than folded into `price`"). Positive for PRIORITY
     (+25% of fare), negative for POOLING (−10%).
     `POST /api/orders/[id]/pay` charges the client
     `roundCurrency(order.price + order.serviceLevelAdjustment)`.
   - `overtimeFee` is settled separately at completion, on top of both.

   So the quoted payout basis is **`roundCurrency(price +
   serviceLevelAdjustment)`** — not `price` alone, and not the unrounded sum:
   the pay route bills the client that same rounded figure, and at half-tetri
   tie-breaks the float dust in the addition changes the result on thousands of
   real inputs. Overtime carries its own commissioned column,
   `overtimeDriverPayout`. Total driver earnings for a job are
   `driverPayout + overtimeDriverPayout`.

   This matters more than it looks. On a 100 GEL PRIORITY fare the client pays
   125. Commissioning `price` alone would pay the driver 85 and leave the
   platform 40 — a 32% effective take, not 15%. Basing it on
   `price + serviceLevelAdjustment` pays the driver 106.25 and the platform
   18.75, which is the rule as stated.

   This also settles a question that was previously open in a *different* spec:
   `src/lib/pricing.ts` records "whether the adjustment reaches the driver, the
   platform, or is split" as undecided, tracked in
   `specs/client-dashboard-booking-and-payment/action-required.md`. The
   commission rule answers it — the driver receives 85% of the adjustment along
   with everything else the client pays, and bears 85% of a Pooling discount.

   This exposed a live bug rather than only shaping new work: the driver hub's
   Earnings screen currently sums `price + overtimeFee` — the full client total —
   and presents it to drivers as their own earnings. task-15 corrects it.

3. **Who accepts is decided by account type, not by who drives.** All three
   account types compete on one first-come-first-served board and the first to
   confirm claims the order: an individual driver, an individual entrepreneur
   (sole proprietor), and a logistics company. For a company it is the
   **company account — its dispatcher — that accepts or rejects**, never the
   employed driver behind the wheel; the company then assigns one of its drivers
   and a vehicle. An employed roster driver therefore has no accept/reject of
   their own and does not see the board.

## Goals

- Give every driver account type one board showing open client bookings, with
  accept and reject, at `/dashboard/loads` inside the existing driver hub shell.
- Only ever show a load the driver's vehicle can physically carry, filtered
  **server-side**, so a driver can neither see nor claim a load that does not fit.
- Make claiming safe under concurrency: the first confirm wins, and the loser
  gets a clear "just claimed" state rather than a silent failure.
- Show the driver what the job actually pays *them*, never the client's price.
- Capture cargo weight, dimensions, packaging, quantity, handling requirements,
  pickup window and delivery deadline at booking time.
- Record every rejection from day one, so acceptance-rate scoring can be built
  later on real data. Rejection data cannot be backfilled.

## Non-Goals

Explicitly out of scope. A well-meaning agent might otherwise build these:

- **No offer/cascade engine.** This is a first-come-first-served open board.
  There is no scoring, no countdown, no sequential offer, no auto-assignment.
  That is a later stage and depends on the rejection data this spec starts
  collecting.
- **No job sheet.** The drawer's "Open job sheet" button is designed but has no
  destination. Render it disabled with a tooltip; do not invent the screen.
  Client contact details and proof-of-delivery live there, not here.
- **No changes to pricing.** `src/lib/pricing.ts`, `POST /api/pricing/estimate`
  and the fare breakdown stay exactly as they are. Cargo weight and dimensions
  are declared data; they do not feed the quote.
- **No multi-stop.** The prototype shows a `stops: 3` load; the schema supports
  exactly one pickup and one dropoff. Render the stop count as a constant 2.
- **No cargo photos.** The drawer's three dashed tiles stay dashed placeholders —
  there is no cargo photo upload anywhere in the client booking flow to feed
  them. Do not add one.
- **No changes to `GET /api/orders`.** It backs the existing driver hub and the
  client's own order list. The board gets its own endpoint.
- **No roster-driver access.** A driver employed by a logistics company stays on
  the company-dispatch path and is redirected away from the board. See
  Assumptions.
- **No ADR/hazmat certification gating.** `DriverLicence` has no certification
  field. Hazmat loads are tagged and warned about, not gated. Flagged for
  follow-up in `action-required.md`.
- **No dark theme.** The design is light-mode only, matching the existing
  `data-admin-surface` token set the driver hub already uses.
- **No dispatcher login.** A company dispatcher having their own scoped account
  is confirmed as wanted and confirmed as a **separate feature** needing its own
  spec — there is no `EmployeeRole` model or employee account in the schema
  today. Here, the `COMPANY` account holder is the dispatcher. When that feature
  arrives, this board needs nothing beyond widening its authorisation check.

## Acceptance Criteria

- [ ] A client booking captures cargo weight, L/W/H, packaging, quantity,
      handling tags, pickup window and delivery deadline.
- [ ] Every new order is written with a human-readable reference (`GE-48210`
      form), a stored `commissionRate` and a stored `driverPayout`.
- [ ] `/dashboard/loads` renders the board for INDIVIDUAL drivers, sole
      proprietors and COMPANY accounts, inside the existing hub shell.
- [ ] A load whose weight exceeds the driver's vehicle payload, or whose L/W/H
      exceeds its cargo hold, is absent from the API response — not merely
      hidden by the client.
- [ ] The footer states how many loads were hidden by capacity.
- [ ] Every money figure a driver sees is the 85% payout. `Order.price` and
      `Order.overtimeFee` never reach a driver-facing surface — including the
      existing Earnings screen and its Excel export.
- [ ] Completing an order writes `overtimeDriverPayout` alongside `overtimeFee`,
      commissioned at the rate stored on that order.
- [ ] Two drivers confirming the same load concurrently: exactly one succeeds;
      the other sees the lost-the-race dialog.
- [ ] Reject hides a load from that driver's board only, is recorded in the
      database, and is reversible via the rejected list.
- [ ] Client contact details are absent from every unclaimed load's payload.
- [ ] A driver on a mobile breakpoint can open a load's full detail — including
      handling tags — before accepting it.
- [ ] `pnpm check` passes.

## Assumptions

- **Existing orders have no cargo data.** All new `Order` columns are nullable
  and every order placed before this feature has null weight and dimensions. The
  fit filter treats a load with unknown weight or dimensions as **not fitting**
  and hides it, rather than assuming it fits — the failure direction that costs a
  driver a wasted trip is the one to avoid. The footer's hidden-count therefore
  includes legacy orders, which is correct and self-correcting as they age out.
- **Roster drivers do not accept work — confirmed, not assumed.** The company's
  dispatcher accepts or rejects on the company's behalf; the employed driver
  behind the wheel receives an assignment, not an offer. `POST
  /api/orders/[id]/accept` already 403s any driver with a `companyId` and this
  spec preserves that, and hides the board's nav entry for them.
- **"Dispatcher" is not yet a login.** The driver hub's Employees screen
  documents five roles including Dispatcher, but `src/lib/dashboard/hub/employees.ts`
  states plainly that they live in `sample.ts` because there is no `EmployeeRole`
  model — the schema has no employee accounts at all. So today the dispatcher IS
  the `COMPANY` account holder, and that is who this spec authorises. A separate
  dispatcher login with scoped permissions needs an employee-account system that
  does not exist. See `action-required.md`.
- **A company claims with its account, not a specific truck.** Per the handoff's
  open question 1, resolved as *claim first, assign afterwards*. Fit filtering
  for a company therefore runs against the **widest capability in its fleet**,
  and a claimed load lands in "My loads" in a `needs assignment` state.
- **`DriverProfile.currentLat/currentLng` are frequently stale or null.** The
  distance-from-driver column degrades to `—` rather than being omitted, and is
  never used to filter — only to inform and sort.
- **The 15% rate is flat and global — confirmed, not assumed.** One rate for
  every account type: individual drivers, sole proprietors and logistics
  companies alike, on every vehicle class, in every city. It is a module
  constant rather than an admin setting. The rate is still stored per-order, so
  making it vary later is a pricing change rather than a migration, but nothing
  in this feature anticipates that.

## Technical Constraints

- **Next.js 15 App Router, React 19, Prisma, Tailwind v4, shadcn.** Follow the
  patterns already in the repo.
- **No validation library.** The API deliberately uses hand-rolled parse
  functions returning `{ data } | { error }`. Match
  `parseCreateOrderBody` in `src/app/api/orders/route.ts` exactly; do not
  introduce Zod.
- **The fit filter runs server-side.** Repeating it client-side for responsive
  UI is fine, but it must not be the only place it exists.
- **Claiming is an atomic conditional `updateMany`**, never a read-then-write.
  `src/app/api/orders/[id]/accept/route.ts:144` is the pattern to follow: the
  `where` carries the status and assignment preconditions, and `count === 0`
  means this request lost the race.
- **Contact redaction is per row, not per request.** `canSeeStopContacts` in
  `src/lib/orders/` already implements this; reuse it rather than writing a
  second rule.
- **`data-admin-surface` is load-bearing.** The board renders inside the driver
  hub shell, which sets it. Any element portalled outside that root (dialogs,
  drawers) must repeat `data-admin-surface=""` or the Lalamove `bg-accent` /
  `bg-muted` / border tokens resolve to the marketing palette.
- **Migrations are hand-authored SQL** under `prisma/migrations/` with a
  `YYYYMMDDHHMMSS_snake_case_name` directory. Follow the existing convention.
