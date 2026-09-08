# Action Required: Driver Load Board

Manual steps and open decisions that need a human. The implementation proceeds
without them — each has a stated default — but several are cheap to change now
and expensive to change after drivers are using the board.

## Before Implementation

None outstanding. Both blocking decisions are settled: cargo weight and
dimensions are captured at booking (task-04), and the platform commission is a
flat 15% for every account type, taken from everything the client pays.

## During Implementation

- [ ] **Review the handling-tag vocabulary.** The design uses Fragile, Cold
      chain, Hazmat, Time critical, Upright only and Heavy item. These become a
      Prisma enum in task-01 and are therefore a migration to change. Confirm the
      list is right before task-01 lands, and confirm the filter panel should
      expose only the first three (as the design does) while all six render as
      pills.
- [ ] **Confirm the load reference format.** `GE-` plus a zero-padded sequence
      (`GE-48210`), from a Postgres sequence starting at 48200 so early
      references look established rather than advertising order volume. Change
      the prefix here if the brand name lands differently — see the unresolved
      brand-name TODOs in `src/lib/admin/home-page-content.ts`.

## After Implementation

- [ ] **Spec the notifications feature.** Deferred from the "Driver dashboard
      header alignment" handoff, whose prototypes show a bell with an unread
      count. Nothing backs it: there is no `Notification` model in
      `prisma/schema.prisma` and no notification code anywhere in `src/lib` or
      `src/app/api`. It needs a table, a read/unread model, write points at each
      order-lifecycle event, and a delivery mechanism — pair it with the Phase 2
      email/SMS work, since the same events should feed in-app, email and SMS
      from one place rather than three. task-09 deliberately renders no bell and
      no placeholder count in the meantime.


- [x] **Dispatcher login — decided: yes, as its own feature.** Confirmed that a
      company dispatcher needs their own login rather than sharing the company
      account's credentials. This is explicitly **out of scope for the load
      board** and needs its own spec: the schema has no `EmployeeRole` model and
      no employee accounts at all, and the five roles the driver hub's Employees
      screen documents (Fleet manager, Dispatcher, Accountant, Mechanic, Driver)
      live in `src/lib/dashboard/hub/sample.ts` as product content, not data.
      Until that feature ships, the `COMPANY` account holder is the dispatcher
      and is who this spec authorises — the load board needs no change when the
      dispatcher login later arrives beyond widening its authorisation check.

- [ ] **Reconsider the default table sort.** The design specifies `price`
      descending. That is cherry-picking encoded as a default: the highest-paying
      load gets every driver racing for it while cheap local jobs never move.
      Neither Uber nor Lalamove sorts by pay. Implemented as designed, but
      flipping the default to pickup proximity or urgency is a one-line change in
      the board's initial state and is strongly recommended once there is enough
      volume to see the effect.
- [ ] **Reconsider the rejected-list UI.** The design carries a rejected list,
      a footer toggle and Restore buttons in two places — four row states and a
      second table mode for something few drivers use. The underlying
      `LoadRejection` records are worth keeping regardless (they feed future
      acceptance-rate scoring); the *UI* could reduce to a 24-hour auto-expiring
      hide with no list. Implemented as designed.
- [ ] **Gate hazmat loads on driver certification.** Hazmat is an ADR licensing
      matter and `DriverLicence` has no certification field. This spec tags
      hazmat loads and shows a warning in the confirm dialog, but any licensed
      driver can claim one. Proper gating needs a certification field on
      `DriverLicence`, capture in the driver onboarding wizard, and admin
      verification — a follow-up feature, and a genuine compliance exposure until
      it exists.
- [ ] **Design the job sheet.** The drawer's "Open job sheet" button ships
      disabled because its destination does not exist. It is the natural next
      screen: client contact details, navigation handoff and proof of delivery.
      `ORDER_PARTY_SELECT` and the existing `canSeeStopContacts` redaction
      already provide its data.
- [ ] **Backfill or accept legacy orders.** Orders placed before this feature
      have null cargo weight and dimensions and are therefore hidden from every
      board by the fit filter. Confirm this is acceptable (they age out), or
      supply figures to backfill. Query
      `SELECT count(*) FROM "Order" WHERE status = 'PENDING' AND "cargoWeightKg" IS NULL;`
      before deploying to see how many live orders this affects.
- [ ] **Watch the live-update poll interval.** task-14 polls the board. Confirm
      the interval against real driver behaviour and Supabase connection limits,
      and consider moving to Supabase Realtime — `@supabase/supabase-js` is
      already a dependency, so this needs no new infrastructure.

---

> These items are also referenced in context within the relevant task files.
