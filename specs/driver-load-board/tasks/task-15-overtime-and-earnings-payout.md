# Task 15: Overtime payout and earnings-screen commission fix

## Status

pending

## Wave

2

## Description

Two things, caused by one decision: **the platform's 15% commission is taken
from everything the client pays, including overtime.** Part 1 makes
`POST /api/orders/[id]/complete` settle the driver's 85% share of `overtimeFee`
at the same moment it computes `overtimeFee` itself, using the commission rate
stored on the order rather than the current global constant. Part 2 fixes a
live bug this decision exposes: the Driver Hub's Earnings screen currently sums
`price + overtimeFee` — the full amount the *client* pays — and shows it to
drivers (and to logistics companies, who use the same screen) as their own
earnings. With a 15% commission that figure is overstated by roughly 17.6%.
Both parts matter together: without Part 1, `overtimeDriverPayout` stays `0`
forever and Part 2's corrected sum would silently drop every driver's overtime
earnings to zero.

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-02-payout-and-reference.md
**Blocks:** None

**Context from dependencies:** task-01's migration added three columns to
`Order` that this task relies on: `commissionRate` (`Float @default(0.15)`,
the rate that applied to this specific order, stored so retuning the global
rate never rewrites what a historical job paid), `driverPayout` (`Float
@default(0)`, the driver's 85% of `price`, resolved and stamped at order
creation — task-05, not this task, writes it and it is never touched again)
and `overtimeDriverPayout` (`Float @default(0)`, the driver's 85% of
`overtimeFee`, deliberately kept in its own column rather than folded into
`driverPayout` — see "Why `driverPayout` is never recomputed" below). The
migration backfilled `driverPayout = ROUND(price * 0.85, 2)` and
`overtimeDriverPayout = ROUND(overtimeFee * 0.85, 2)` for every pre-existing
order, so both columns are populated (at the default 0.15 rate) even for jobs
completed before this feature shipped.

task-02 created `src/lib/orders/payout.ts`, exporting:

- `PLATFORM_COMMISSION_RATE = 0.15` — the module constant. Never read directly
  by this task; the rate this task uses is always the one stored on the order.
- `driverPayoutFor(amount: number, commissionRate: number =
  PLATFORM_COMMISSION_RATE): number` — returns `amount * (1 - commissionRate)`,
  rounded to 2 decimal places via a private `Math.round(value * 100) / 100`
  helper (the same rounding shape as this route's own local `roundCurrency`).
  It takes an *amount*, not specifically a price, so the same function prices
  both `Order.price` (at booking, by task-05) and `Order.overtimeFee` (at
  completion, by this task).
- `totalDriverEarnings(order: { driverPayout: number; overtimeDriverPayout:
  number }): number` — returns `roundCurrency(driverPayout +
  overtimeDriverPayout)`. This is the one function every earnings surface
  (screens, exports, future payout runs) must use to compute "what this job
  paid the driver" — never a manual `+` of the two columns, so no call site can
  forget one term.

## Files to Create

None.

## Files to Modify

- `src/app/api/orders/[id]/complete/route.ts` — after computing `overtimeFee`,
  also compute `overtimeDriverPayout` from it using the order's own
  `commissionRate`, and write both columns in the same `prisma.order.update`
  call. Requires selecting `commissionRate` on the `order` lookup, which the
  current `select` does not include.
- `src/lib/dashboard/hub/earnings.ts` — change the raw-SQL aggregation from
  `SUM("price" + "overtimeFee")` to `SUM("driverPayout" +
  "overtimeDriverPayout")`, and correct every doc comment that describes the
  old formula as the driver's (or company's) earnings. Four occurrences (line
  numbers below are current-file references, not directions to search
  elsewhere).
- `src/components/driver-hub/screens/earnings-screen.tsx` — correct one doc
  comment that states the aggregation formula.
- `src/components/driver-hub/screens/earnings-breakdown-card.tsx` — correct
  one doc comment (the `grossFares` prop's JSDoc) that states the aggregation
  formula.

No other file needs a code change. `src/app/api/dashboard/hub/earnings/export/
route.ts` and every other `earnings-*.tsx` component (`earnings-payouts-card
.tsx`, `earnings-filter-bar.tsx`, `earnings-export-button.tsx`,
`earnings-format.ts`) consume `HubEarningsData` (or values derived from it)
rather than querying or re-deriving money themselves, so fixing
`getHubEarnings()` fixes them transitively — see "Verification: the export
route and the other screen files" below for how to confirm this rather than
assume it.

## Technical Details

### Part 1 — Settle the driver's overtime share at completion

#### Why `order.commissionRate`, never `PLATFORM_COMMISSION_RATE`

`Order.commissionRate` exists specifically so that a rate change between
booking and completion cannot apply two different rates to one job. Consider a
job booked when the global rate was 0.15, still in transit when an admin
retunes `PLATFORM_COMMISSION_RATE` to, say, 0.18, and then completed: if
completion read the *current* constant, the same order's `driverPayout`
(85% of `price`, stamped at booking) and `overtimeDriverPayout` (would-be 82%
of `overtimeFee`, computed at completion) would silently disagree about what
rate this job runs at. Reading `order.commissionRate` — the value task-05
stamped onto this specific row at booking, permanently — guarantees both
figures for one order are always computed at the one rate that applied to it,
regardless of when a global retune happens to land relative to the job's
lifecycle. This is precisely the reasoning documented in task-01's schema
comment on `Order.overtimeDriverPayout` and task-02's own code comment showing
the two call sites side by side — implement it exactly as shown there:

```ts
// At booking (task-05):
driverPayout = driverPayoutFor(price, PLATFORM_COMMISSION_RATE)

// At completion (this task), using the rate STORED on the order, never the
// current constant — a rate change between booking and completion must not
// apply two different rates to one job:
overtimeDriverPayout = driverPayoutFor(overtimeFee, order.commissionRate)
```

#### Why `driverPayout` is not recomputed or mutated at completion

`driverPayout` keeps exactly one stable meaning for the life of an order: what
the job was quoted to pay, which is the same figure the load board showed the
driver at the moment they decided to take it (task-06's `GET /api/loads`
surfaces it; `POST /api/orders/route.ts`, via task-05, stamps it once at
creation). Completion must never write to it, for two reasons stated
explicitly so a future maintainer does not "helpfully" merge the two figures:

1. **A figure that silently grew after completion would make two screens
   disagree about the same job.** The load board showed the driver a number
   before they accepted; if that same column then changed value after the job
   finished, the board's historical number and the earnings screen's number
   for that exact job would no longer match, with no visible reason why.
2. **The two payouts have different lifecycles.** `driverPayout` is knowable
   in full at booking (it is `price`'s 85%, and `price` never changes after
   quoting). `overtimeDriverPayout` is not knowable until the job is done — it
   depends on `waitingMinutes`, reported only at completion. Folding a
   not-yet-knowable figure into an already-settled one is exactly what the
   separate column exists to avoid.

Total driver earnings for a completed order are `driverPayout +
overtimeDriverPayout`, computed via task-02's `totalDriverEarnings()` helper
— this route does not need to call it (it returns the two columns separately
via `ORDER_PARTY_SELECT`, unchanged by this task), but every earnings surface
that *displays* a driver's total for a job must.

#### Implementation Steps

1. Open `src/app/api/orders/[id]/complete/route.ts`. Add an import for
   `driverPayoutFor` from `@/lib/orders/payout`:

   ```ts
   import { driverPayoutFor } from "@/lib/orders/payout";
   ```

2. In the `prisma.order.findUnique` call (around line 79), add
   `commissionRate: true` to the top-level `select`, alongside the existing
   `id`, `driverId`, `status` and `vehicleTypeSpec` fields:

   ```ts
   const order = await prisma.order.findUnique({
     where: { id },
     select: {
       id: true,
       driverId: true,
       status: true,
       commissionRate: true,
       vehicleTypeSpec: {
         select: {
           pricingRule: {
             select: { freeLoadingMinutes: true, overtimeRatePerMinute: true },
           },
         },
       },
     },
   });
   ```

3. Immediately after the existing `overtimeFee` computation (the block using
   `overtimeMinutes` and `roundCurrency`), compute the driver's share of it
   using the rate just selected off `order`:

   ```ts
   const overtimeDriverPayout = driverPayoutFor(
     overtimeFee,
     order.commissionRate,
   );
   ```

   Do not call `driverPayoutFor(overtimeFee)` with the default argument
   omitted — that would silently fall back to `PLATFORM_COMMISSION_RATE`,
   which is exactly the bug described above. Always pass `order.commissionRate`
   explicitly.

4. Add `overtimeDriverPayout` to the same `prisma.order.update` call that
   already writes `overtimeFee`, so the two are written atomically — an order
   can never carry a non-zero `overtimeFee` with a stale (default `0`)
   `overtimeDriverPayout`, whether from a crash between two writes or from a
   future refactor accidentally splitting them into two calls:

   ```ts
   const updated = await prisma.order.update({
     where: { id },
     data: {
       status: OrderStatus.COMPLETED,
       completedAt: new Date(),
       waitingMinutes,
       overtimeFee,
       overtimeDriverPayout,
     },
     select: ORDER_PARTY_SELECT,
   });
   ```

5. Update the route's top-of-file doc comment (currently describing only
   `overtimeFee`) to also mention `overtimeDriverPayout`, e.g. append: "The
   driver's 85% share of that fee is resolved in the same step, at the
   commission rate stored on the order — never the current global rate — and
   written to `overtimeDriverPayout` in the same update, so the two can never
   diverge."

Note: `ORDER_PARTY_SELECT` (`src/lib/order-response-select.ts`) does not
currently include `driverPayout`, `overtimeDriverPayout` or `commissionRate`
in its column list, so the JSON this route returns will not itself echo the
new figure back to the caller. That select is shared by six lifecycle
endpoints beyond this one (accept, start, claim, dispatch, cancel) and
changing its column list is a decision with a wider blast radius than this
task — leave it untouched. Nothing in the codebase currently reads
`driverPayout` or `overtimeDriverPayout` from any of those endpoints'
responses, so this is not a regression; it is out of scope here.

### Part 2 — Fix the Earnings screen

This is a live bug the commission decision exposes, not a new feature: the
Earnings screen has been showing every driver (and every logistics company,
which renders through this exact same code path — see "The company Revenue
tab" below) the client's full payment as if it were their own income.

#### The aggregation change

In `src/lib/dashboard/hub/earnings.ts`, the raw SQL query inside
`getHubEarnings()` (around line 541) reads:

```sql
SELECT ...,
       COUNT(*)::int AS jobs,
       SUM("price" + "overtimeFee") AS fares
FROM "Order"
...
```

Change the summed expression to:

```sql
SELECT ...,
       COUNT(*)::int AS jobs,
       SUM("driverPayout" + "overtimeDriverPayout") AS fares
FROM "Order"
...
```

Keep the result column aliased `fares` and keep every other clause (`WHERE`,
`GROUP BY`, `ORDER BY`) exactly as they are — this is a one-expression change,
not a rewrite of the query. The rounding this file already applies to the
result (`roundCurrency()`, called once per day row and again on the range
total in `getHubEarnings()`) stays exactly as it is: `driverPayout` and
`overtimeDriverPayout` are `Float` columns exactly as `price` and
`overtimeFee` are, so summing them across many rows carries the same
binary-fraction dust the file's own `roundCurrency()` doc comment already
explains ("Prices are `Float` columns, so summing them accumulates
binary-fraction dust; money crossing this boundary is rounded to the cent it
will be printed at."). Do not touch that helper or remove any of its call
sites — the concern is identical for the new columns.

#### The doc comments to correct

`src/lib/dashboard/hub/earnings.ts`'s own doc comments repeatedly assert the
old, wrong formula as fact and even call it "the honest headline" — in this
codebase's convention, doc comments are load-bearing documentation, so leaving
them stale after fixing the code would be worse than the bug: a future reader
would trust the comment over the corrected SQL and "fix" it back. Four
occurrences, all in this file:

1. **Lines 16–18** (inside the file's top `## Real vs sample` doc-comment
   section):
   ```
   Everything at the top level of `HubEarningsData` is `SUM(price + overtimeFee)`
   over real `COMPLETED` orders.
   ```
   Replace with wording naming the corrected formula and its meaning, e.g.:
   ```
   Everything at the top level of `HubEarningsData` is `SUM(driverPayout +
   overtimeDriverPayout)` over real `COMPLETED` orders — each order's stored
   85% share, not what the client paid for it.
   ```

2. **Line 162**, the `HubEarningsDay.fares` field doc:
   ```ts
   /** `SUM(price + overtimeFee)` for that day. */
   ```
   Replace with:
   ```ts
   /** `SUM(driverPayout + overtimeDriverPayout)` for that day — the driver's
    * (or company's) earned share, never the client's price. */
   ```

3. **Line 187**, the `HubEarningsData.grossFares` field doc:
   ```ts
   /** `SUM(price + overtimeFee)` over the whole range. The honest headline. */
   ```
   Replace with:
   ```ts
   /** `SUM(driverPayout + overtimeDriverPayout)` over the whole range — what
    * was actually earned, not what the client paid. The honest headline. */
   ```

4. **Line 541**, the SQL comment/expression itself — covered by the
   aggregation change above.

Also re-read the surrounding prose at lines 25–27 ("Note in particular that
`sampled.rangeTotal` is sampled even though most of it is real — it folds
estimated tips and incentives into real fares. The honest number to headline
is `grossFares`.") — the word "fares" there still reads correctly once
`grossFares` means the driver's earned share rather than the client's price,
so no change is needed there, but confirm this reading rather than skipping
the paragraph.

`src/components/driver-hub/screens/earnings-screen.tsx`, line 45 (inside the
component's `## Real versus sampled` doc comment):
```
Real: the range itself, gross fares, the job count, the average per job, and
every bar on the chart — all `SUM(price + overtimeFee)` over completed
orders.
```
Replace the formula reference, e.g.:
```
Real: the range itself, gross fares, the job count, the average per job, and
every bar on the chart — all `SUM(driverPayout + overtimeDriverPayout)` over
completed orders: each job's earned share, not the client's price.
```

`src/components/driver-hub/screens/earnings-breakdown-card.tsx`, line 68, the
`EarningsBreakdownCardProps.grossFares` field doc:
```ts
/** Real: `SUM(price + overtimeFee)` over the range. */
```
Replace with:
```ts
/** Real: `SUM(driverPayout + overtimeDriverPayout)` over the range — the
 * driver's (or company's) earned share, not the client's price. */
```

#### Verification: the export route and the other screen files

The task brief for this work asked specifically to check
`src/app/api/dashboard/hub/earnings/export/route.ts` and every
`earnings-*.tsx` screen component for the same leak. Having read all of them
closely: **none contains an independent computation of `price + overtimeFee`
or any other money math of its own.** The export route calls `getHubEarnings()`
exactly once and builds its worksheet entirely from the `HubEarningsData` it
gets back (`data.days[].fares`, `data.grossFares` is not read directly but
each day's `fares` is summed into the sheet's own totals row, which by
construction equals `grossFares`) — fixing `getHubEarnings()`'s SQL therefore
fixes the exported `.xlsx` for free, with no code change needed in that file.
Its column header ("Fares") and its `ESTIMATES_NOTE` ("Date, Day, Jobs and
Fares are real completed-order figures.") both remain accurate wording after
the fix — "Fares" reads naturally as "what the driver earned from fares" once
the underlying number is correct, so neither needs editing.

Confirm this with a grep before considering Part 2 done, rather than trusting
this description alone (line numbers may have shifted since this task was
written):

```bash
grep -rn "price.*overtimeFee\|overtimeFee.*price" \
  src/lib/dashboard/hub/earnings.ts \
  src/app/api/dashboard/hub/earnings/export/route.ts \
  src/components/driver-hub/screens/earnings-*.tsx
```

Before this task's fix, that command returns exactly six matches: four in
`earnings.ts` (three doc comments plus the SQL expression itself), one in
`earnings-screen.tsx`, one in `earnings-breakdown-card.tsx` — matching the four
occurrences and two files enumerated above. After the fix, it must return
zero matches in the SQL/JSDoc formula sense — a bare mention of the word
"fares" or "price" alone is fine and expected (e.g. CSS class names like
`font-price` in `earnings-filter-bar.tsx`, which is unrelated styling, not a
money leak).

#### The company Revenue tab

**Finding: there is no separate company-facing "Revenue" tab, and the same fix
above is the correct and complete fix for company accounts too — no separate
decision or `action-required.md` entry is needed here.**

This was verified directly in the code, not assumed:

- The Driver Hub has exactly one earnings surface, at
  `src/app/dashboard/(hub)/earnings/page.tsx`, titled "Earnings" for every
  account. There is no second "Revenue"-labelled route, tab, or component
  anywhere under `src/app/dashboard` or `src/components/driver-hub`. The only
  code in the whole repository that uses the word "Revenue" is the platform
  admin's own internal back-office Sales Analytics dashboard
  (`src/lib/admin/analytics.ts`, `src/components/admin/analytics/
  metric-cards.tsx`, `src/app/api/admin/analytics/export/route.ts`), which is
  a different surface for a different audience — see below.
- `src/lib/dashboard/hub/earnings.ts`'s `getHubEarnings()` is the *one*
  function behind that one Earnings page, and it serves both account kinds
  through the same `hubOrderScopeSql()` helper: an `INDIVIDUAL` account
  (a driver) is scoped by `"driverId" = <userId>`, and a `BUSINESS` account
  (a `LogisticsCompany` — a fleet owner, per `HubAccountKind`'s own doc
  comment in `src/lib/dashboard/hub/account.ts`) is scoped by `"companyId" =
  <companyId>`. Both branches run the exact same aggregation this task fixes.
- The reason this is correct, not a coincidence: a `LogisticsCompany` session
  in this screen is the **fulfilling party** for the orders it is scoped to —
  a fleet whose roster of drivers completed those jobs — not the *client* who
  booked and paid for them. `Order.companyId` marks who claimed and fulfilled
  the job, exactly as `Order.driverId` does for an individual driver; it is
  not a foreign key to whichever client account placed the order (that is
  `Order.clientId`, a separate column, never read by this file). The
  platform's 15% commission is taken from the client's payment once per
  order, regardless of whether an individual driver or a company's fleet
  fulfilled it, and `Order.driverPayout` / `Order.overtimeDriverPayout` are
  each order's *fulfiller's* 85% share — the company earns the same 85% an
  individual driver would have earned completing the identical job. So a
  `BUSINESS` account on this screen should see exactly what an `INDIVIDUAL`
  account sees: its commissioned earnings, never the client's gross price.
  The fix above is single and shared by construction; there is nothing
  company-specific left to decide.
- The genuinely distinct "Revenue" surface — the admin back-office one — is
  correctly showing gross `price` today and must **not** be touched by this
  task. `src/lib/admin/analytics.ts`'s own doc comment explains its two
  figures precisely: `turnover` is `sum(price)` over every order a report
  covers (gross bookings), and `revenue` is `sum(price)` restricted to
  `COMPLETED` orders — both deliberately gross, because that dashboard's
  audience is the *platform operator* asking "how much money moved through
  the platform", not a driver or company asking "what did I earn". That is a
  different question with a different correct answer, and conflating the two
  by applying this task's fix there would itself be a bug. Do not modify
  `src/lib/admin/analytics.ts`, `src/components/admin/analytics/
  metric-cards.tsx`, or `src/app/api/admin/analytics/export/route.ts` as part
  of this task.

### CRITICAL RULE

`Order.price` and `Order.overtimeFee` are what the **CLIENT** pays.
`Order.driverPayout` and `Order.overtimeDriverPayout` are what the **DRIVER**
(or, for a claimed-by-company job, the company that fulfilled it) **earns**.
No driver-facing surface — the load board, the load drawer, the confirm
dialog, the Earnings screen, or the Earnings export — may ever show the
former. This task removes the one place in the codebase where that rule was
being violated.

### Worked Example

For an order with `price = 190`, `commissionRate = 0.15` (the default), and
`overtimeFee = 20` (computed at completion from reported waiting minutes):

- `driverPayout = driverPayoutFor(190, 0.15) = 161.5` — stamped once at
  booking by task-05, unchanged by this task.
- `overtimeDriverPayout = driverPayoutFor(20, 0.15) = 17` — written by this
  task's change to the completion route.
- `totalDriverEarnings({ driverPayout: 161.5, overtimeDriverPayout: 17 }) =
  178.5` — what the Earnings screen must now sum to for this one order,
  instead of the old, wrong `price + overtimeFee = 210`.

### The existing bug is worse than "shows gross"

The Earnings screen sums `price + overtimeFee`. That is wrong twice over, and
the file's own doc comments call it "the honest headline":

1. It shows the driver **client money as driver earnings** — the headline bug,
   overstated by ~17.6% under a 15% commission.
2. It is **not even the client's correct total**, because `serviceLevelAdjustment`
   is a third column stored beside `price` and the client is charged
   `price + serviceLevelAdjustment + overtimeFee`. So on PRIORITY orders the
   screen simultaneously overstates what the driver earned and understates what
   the client paid.

The fix resolves both at once — `SUM("driverPayout" + "overtimeDriverPayout")` is
the driver's actual money and needs no adjustment term, because the adjustment is
already inside the basis `driverPayout` was computed from. Say this in the
corrected doc comments, so the absence of `serviceLevelAdjustment` from the new
sum reads as deliberate rather than as the same omission repeated.

**Do not touch `src/lib/pricing.ts`** — task-05 owns the one comment change there.

## Acceptance Criteria

- [ ] `POST /api/orders/[id]/complete` selects `commissionRate` on the fetched
      order and computes `overtimeDriverPayout = driverPayoutFor(overtimeFee,
      order.commissionRate)` — never the bare `driverPayoutFor(overtimeFee)`
      default and never `PLATFORM_COMMISSION_RATE` directly.
- [ ] `overtimeFee` and `overtimeDriverPayout` are written in the same
      `prisma.order.update` call — grep confirms no second `.update()` call
      exists for either field in this route.
- [ ] `driverPayout` is never referenced, read, or written anywhere in
      `src/app/api/orders/[id]/complete/route.ts` — completion must not touch
      it.
- [ ] Worked example: for an order with `price = 190`, `commissionRate =
      0.15`, and a reported `waitingMinutes` that yields `overtimeFee = 20`,
      completing it results in `driverPayout = 161.5` (unchanged from
      booking), `overtimeDriverPayout = 17`, and
      `totalDriverEarnings({ driverPayout: 161.5, overtimeDriverPayout: 17 })
      = 178.5`.
- [ ] `src/lib/dashboard/hub/earnings.ts`'s raw SQL sums `"driverPayout" +
      "overtimeDriverPayout"`, aliased `fares`, in place of `"price" +
      "overtimeFee"`.
- [ ] Every doc comment in `src/lib/dashboard/hub/earnings.ts`,
      `src/components/driver-hub/screens/earnings-screen.tsx` and
      `src/components/driver-hub/screens/earnings-breakdown-card.tsx` that
      previously stated the `price + overtimeFee` formula now states the
      corrected `driverPayout + overtimeDriverPayout` formula. Verified by
      `grep -rn "price.*overtimeFee\|overtimeFee.*price" src/lib/dashboard/hub/earnings.ts src/app/api/dashboard/hub/earnings/export/route.ts src/components/driver-hub/screens/earnings-*.tsx` returning zero matches.
- [ ] `src/app/api/dashboard/hub/earnings/export/route.ts` is unmodified by
      this task (it has no independent money computation to fix) and its
      exported workbook's Fares/Total columns reflect the corrected figures
      purely because `getHubEarnings()` now returns them correctly.
- [ ] `roundCurrency()` in `src/lib/dashboard/hub/earnings.ts` is unmodified
      and still applied to the new sums exactly where it was applied to the
      old ones (per day row and on the range total) — the `Float`
      binary-fraction concern applies identically to the new columns.
- [ ] No file outside the four listed in "Files to Modify" is changed.
- [ ] `pnpm check` passes.

## Notes

- **Do not modify `src/lib/admin/analytics.ts` or its export route / metric
  cards.** That is the platform admin's own Sales Analytics dashboard, whose
  `turnover`/`revenue` figures are deliberately gross `price` sums for a
  platform-operator audience — a different, correct answer to a different
  question. Applying this task's fix there would itself introduce a bug.
- **Do not modify `src/lib/order-response-select.ts`.** It is shared by six
  order-lifecycle endpoints beyond `complete`, and while it does not currently
  expose `driverPayout` or `overtimeDriverPayout` in any of their JSON
  responses, nothing in the codebase reads those fields from those responses
  today, so this is not a regression this task needs to fix. Widening that
  shared select is a decision with effects on five endpoints this task does
  not otherwise touch, and is out of scope.
- The six-occurrence grep count given under "Verification" is a snapshot at
  the time this task was written. If task-01 or task-02 land with different
  line numbers, or if intervening changes add further mentions, use the grep
  command itself as the source of truth rather than the line numbers quoted
  in this file.
