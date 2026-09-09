# Task 16: Driver payload redaction across the order API

## Status

pending

## Wave

3

## Description

Stops the pre-existing order API — and the driver hub's Job history screen —
from leaking the client's gross fare to whoever is carrying the job. The load
board's own endpoint (`GET /api/loads`, task-06) already returns only
`Order.driverPayout`, but the fulfilling party reaches ten other, older
surfaces constantly — accept, start and complete a delivery; claim, dispatch
and cancel one; the driver's own `GET /api/orders` listing; the company's own
`GET /api/logistics-company/orders` listing; and the Job history screen both
account kinds share — and every one of them answers with `Order.price` and
the full itemised fare breakdown (`baseFare`, `distanceFare`, `timeFare`,
`helperFee`, `overtimeFee`, `serviceLevelAdjustment`) untouched. This is the
client's business, not the carrier's: *"driver should see only its net, not
total paid."* That rule is not limited to individual drivers — see "Company
accounts are carriers, not clients" below — so this task adds one shared
carrier-facing response shape and wires every carrier-facing lifecycle,
listing and history call site to it, leaving only client-facing responses and
the platform's own admin analytics unchanged.

The redaction is **per requester role, not per route** — `GET /api/orders`
answers both a client looking at their own bookings and a driver browsing
open work from the same handler, and only the driver's half of that response
changes. `getHubJobs` answers both an individual driver and a company from
the same function, scoped by `driverId` or `companyId`, and both halves
change identically, because both are the same audience under this rule: the
carrier, never the client.

## Dependencies

**Depends on:** task-01-schema-and-migration, task-05-create-order-persistence
**Blocks:** None

**Context from dependencies:**

task-01-schema-and-migration added three columns to `Order`:
`commissionRate` (`Float`, `@default(0.15)`), `driverPayout` (`Float`,
`@default(0)`) and `overtimeDriverPayout` (`Float`, `@default(0)`). The
platform takes 15% of everything the client pays. `helperFee` is already a
component of `price`, so it is commissioned by construction and needs no
column of its own; `overtimeFee` is settled separately at completion, so it
carries its own commissioned column, `overtimeDriverPayout`, written when the
order completes. **Total carrier earnings for a job are `driverPayout +
overtimeDriverPayout`** — this is true whether the carrier is an independent
driver or a logistics company; see below. Both figures are resolved and
stored at the time they become known (booking for `driverPayout`, completion
for `overtimeDriverPayout`) rather than computed on read, so retuning the
commission never rewrites what a historical job paid.

task-05-create-order-persistence is the only place an `Order` row is created.
It stamps `commissionRate` and `driverPayout` on every new order, and — as
that task left `src/app/api/orders/route.ts` and
`src/lib/order-response-select.ts` — the following is already true by the
time this task runs:

- `src/lib/order-response-select.ts` exports `ORDER_PARTY_SELECT`, a named
  column allowlist shared by six lifecycle endpoints: accept, start and
  complete (`/api/orders/[id]/...`), and claim, dispatch and cancel
  (`/api/logistics-company/orders/[id]/...`). task-05 added `reference: true`
  and `driverPayout: true` to it. It still carries every original field,
  including `price`, `baseFare`, `distanceFare`, `timeFare`, `helperFee`,
  `overtimeFee` and `serviceLevelAdjustment` — task-05's own doc-comment
  update explicitly flagged that any **driver-facing** response built from
  this select must render `driverPayout`, never `price`, and named that
  redaction as unfinished work for a later task. This task is that later
  task, and — per the resolved decision below — extends the same fix to
  every company-facing lifecycle route too. It does **not** yet include
  `overtimeDriverPayout` — task-05 never added it, and neither does this
  task's change to `ORDER_PARTY_SELECT` itself (see Technical Details).
- `src/app/api/orders/route.ts` exports a route-local `ORDER_LIST_SELECT`
  (~line 509), consumed by that file's `GET` handler. task-05 added the same
  twelve board-relevant columns to it as to `ORDER_PARTY_SELECT`
  (`reference`, `driverPayout`, the cargo/handling/window fields), and its
  own Notes section states plainly: *"`GET /api/orders` still returns `price`
  unfiltered to a driver looking at open `PENDING` work, exactly as it does
  today; that is a pre-existing condition of this endpoint and out of scope
  for \[task-05\] to fix."* This task fixes it.
- `POST /api/orders` and `parseCreateOrderBody` are otherwise untouched by
  this task — order **creation** already writes the correct figures; this
  task only changes what is **returned** to a carrier afterwards.

Do not rename or remove anything task-01 or task-05 added; this task is
additive on top of both.

## Files to Create

None.

## Files to Modify

- `src/lib/dashboard/hub/today.ts` — **added after the Wave 2 review found it
  ownerless.** Lines ~130 and ~168 sum `price + overtimeFee` and present it to a
  driver as what the job pays them, including the Today screen's hero earnings
  tile. Same bug class as the Earnings screen that task-15 fixed, in a different
  module. Change to `driverPayout + overtimeDriverPayout` and correct the doc
  comments, exactly as task-15 did for `earnings.ts`.
- `src/lib/dashboard/hub/drivers.ts` — **added for the same reason.** Lines ~111
  and ~162 do the same, including an all-time company total. Note this one is
  company-facing: a logistics company is the job's *fulfilling* party, the
  carrier, so the commissioned figure is the correct one for it too — the same
  reasoning task-15 recorded.

- `src/lib/order-response-select.ts` — add a new export,
  `CARRIER_ORDER_PARTY_SELECT`, alongside the existing `ORDER_PARTY_SELECT`,
  and extend that file's doc comment to explain the split. This is the
  shared select all six lifecycle routes below switch to (three driver-facing,
  three company-facing — see "Company accounts are carriers, not clients").
- `src/app/api/orders/[id]/accept/route.ts` — the driver's claim response
  currently selects `ORDER_PARTY_SELECT`; switch it to
  `CARRIER_ORDER_PARTY_SELECT`.
- `src/app/api/orders/[id]/start/route.ts` — same switch, same reason: every
  caller of this route is the assigned driver.
- `src/app/api/orders/[id]/complete/route.ts` — same switch on the response
  `select` only. Do **not** touch the `overtimeFee` computation above it
  (`overtimeMinutes`, `roundCurrency`, the `data:` object passed to
  `prisma.order.update`) — that is a sibling task's territory (fixing the
  driver Earnings screen, its Excel export, and this route's overtime maths;
  it does not touch this route's response `select`). This task changes only
  what the route hands back in its HTTP response, not what it writes to the
  database.
- `src/app/api/logistics-company/orders/[id]/claim/route.ts` — same switch:
  `ORDER_PARTY_SELECT` → `CARRIER_ORDER_PARTY_SELECT`. A company is the
  carrier on the order it just claimed, entitled to its own payout, not the
  client's price — see "Company accounts are carriers, not clients."
- `src/app/api/logistics-company/orders/[id]/dispatch/route.ts` — same
  switch, same reason.
- `src/app/api/logistics-company/orders/[id]/cancel/route.ts` — same switch,
  same reason.
- `src/app/api/orders/route.ts` — add a new route-local select,
  `DRIVER_ORDER_LIST_SELECT`, next to the existing `ORDER_LIST_SELECT`, and
  restructure `GET` so the `DRIVER` branch queries and returns with the new
  select while the client (default) branch is unchanged. (This one stays
  driver-only and route-local — this file's `GET` has no company branch to
  extend; the company list redaction below lives in its own file.)
- `src/app/api/logistics-company/orders/route.ts` — redact
  `COMPANY_ORDER_LIST_SELECT` in place: remove the seven money fields, add
  `driverPayout: true` and `overtimeDriverPayout: true`. Unlike
  `ORDER_PARTY_SELECT`, this constant has exactly one consumer (this file's
  own `GET`) and no client branch to preserve, so it is edited directly
  rather than given a redacted sibling.
- `src/lib/dashboard/hub/jobs.ts` — `getHubJobs` and the `HubJob` type read
  `Order.price`, `baseFare`, `distanceFare`, `timeFare`, `helperFee` and
  `overtimeFee` directly via Prisma (not through any JSON API route) and hand
  them to both a driver and a company account. Swap the Prisma `select` and
  the `HubJob` fields it feeds to `driverPayout`/`overtimeDriverPayout`, and
  recompute `fare` (currently `price + overtimeFee`, the client's gross) as
  `driverPayout + overtimeDriverPayout`, the carrier's net. This is the same
  bug class the requirements document records for the driver Earnings screen,
  on a screen no other task owns — see Technical Details.
- `src/components/driver-hub/screens/jobs-detail-panel.tsx` —
  `buildFareLines` itemises `baseFare`/`distanceFare`/`timeFare`/`helperFee`/
  the minimum-fare top-up/`overtimeFee`, all gross client-side fare
  components with no carrier-net equivalent per line; once `jobs.ts` stops
  supplying those fields, this itemisation cannot exist in its current form
  and must be replaced with a payout-based line set (see Technical Details).
  The "Paid to you" total and its surrounding comment, and the Priority/
  Pooling disclaimer paragraph below it, both currently reason about a
  "commercial split nobody has decided" that this task's resolved decision
  supersedes — their comments need rewriting, not just their code.
- `src/components/driver-hub/screens/jobs-screen.tsx` — verification only,
  not a functional edit: line 360 renders `formatGel(job.fare)`, and `fare`
  is redefined upstream in `jobs.ts` (see above), so this line renders the
  net figure automatically once that change lands. Listed here because this
  is the exact line the leak was observed at; confirm after the `jobs.ts`
  change that no other money field is read anywhere else in this file
  (checked during research: it reads no other `job.*` money field).

## Technical Details

### The established pattern this task follows, not reinvents

Both existing order-listing endpoints already redact per row today —
`canSeeStopContacts` in `src/app/api/orders/route.ts` (~line 561) and its
twin in `src/app/api/logistics-company/orders/route.ts` (~line 87). Each
selects the six stop-contact columns for every row, then **nulls** them
(never drops them) on any row the requester is not yet a party to:

```ts
const visibleOrders = orders.map((order) =>
  canSeeStopContacts(order, userId)
    ? order
    : {
        ...order,
        pickupContactName: null,
        pickupContactPhone: null,
        pickupContactDetails: null,
        dropoffContactName: null,
        dropoffContactPhone: null,
        dropoffContactDetails: null,
      },
);
```

Both files' comments explain why nulling rather than omitting: the
entitlement is **per row**, not per request — one response mixes rows the
requester is and is not yet a party to (an open, unclaimed order next to one
already assigned to them), and nulling keeps every row the same shape for
"the consuming UI," which would otherwise have to handle two different row
types in one array.

**Money redaction is a different shape of problem and gets a different
mechanism — deliberately.** For every call site in this task, entitlement to
see `price` is not per row, it is per **response**: a driver's or company's
`GET /api/orders` / `GET /api/logistics-company/orders` call never shows the
client's price on any row, open or assigned — there is no row in a carrier's
response that is allowed to carry it, unlike stop contacts. That removes the
one reason the contact pattern nulls instead of omits. So this task **omits**
the money fields from a carrier-facing response — a distinct Prisma `select`
that never asks the database for `price`, `baseFare`, `distanceFare`,
`timeFare`, `helperFee`, `overtimeFee` or `serviceLevelAdjustment` in the
first place — rather than fetching them and nulling them afterwards.

This is also strictly stronger, which is the point of Implementation Steps
below ("make the type system carry the rule"): the TypeScript type Prisma
infers from a `select` literally lacks a `price` key when that key is not in
the select. A future line of carrier-facing code that tries `order.price` is
then a **compile error**, not a runtime `null` that a careless render
(`formatGel(order.price)`) would silently turn into `₾0.00` or `₾NaN` — or
that someone "fixes" by re-adding the field, quietly undoing the redaction.
Nulling, by contrast, keeps the key present with a value that still has to be
remembered not to render. Given the choice the task brief calls out — "a
stable shape versus a type that cannot express the leak at all" — this task
picks the type that cannot express the leak, because every affected response
here is either a single order (accept/start/complete/claim/dispatch/cancel:
one row, one audience, nothing to keep a stable shape across) or a list whose
entitlement is uniform for the whole response (`GET /api/orders`'s driver
branch, `GET /api/logistics-company/orders`, `getHubJobs`: every row,
assigned or not, gets the same treatment). Stop-contact nulling stays exactly
as it is — this task does not touch `canSeeStopContacts` anywhere, only adds
parallel selects next to the ones it already reads.

### Company accounts are carriers, not clients — resolved, not deferred

A sibling task settled this: a `BUSINESS`/`LogisticsCompany` account renders
its own revenue through the **exact same** `src/lib/dashboard/hub/earnings.ts`
module an individual driver does, merely scoped by `companyId` instead of
`driverId`. There is no separate company revenue model in this codebase —
there never was one to decide between gross and net for. A logistics company
is the job's **fulfilling party** — the carrier — not the client. The
platform takes 15% of what the client paid and pays the company the rest,
exactly as it does for an independent driver, so **the company's own revenue
is the commissioned payout, not the client's gross quote.** The client's
gross figure is a fact about the transaction between the client and the
platform; a company fulfilling that job has no more claim to see it than a
driver does, for the same reason a subcontractor does not get to see what a
general contractor billed the client.

This is why every company-facing route this task touches gets the **same**
redaction as the driver-facing ones, using the **same** shared select —
`CARRIER_ORDER_PARTY_SELECT` — rather than a second, company-specific one:
`ORDER_PARTY_SELECT`'s original doc comment already grouped accept/start/
complete with claim/dispatch/cancel as "the same audience on the same
terms," and that grouping was correct all along — the audience is "the
carrier," and this task's redaction now matches it.

**One boundary stays deliberately gross and must not be "fixed" by this
reasoning: `src/lib/admin/analytics.ts`.** This is the platform's own Sales
Analytics module (`SalesSummary`, `turnover`/`revenue` as `sum(price)`),
read by platform admins, not by a carrier or a client. It answers "what did
clients pay the platform," which is exactly the figure the carrier-facing
redaction above is built to withhold from everyone *except* the platform
itself. Nothing in this task touches it, and nothing about the carrier
decision above implies it should change — the admin surface is the one place
gross client revenue is not only appropriate but the entire point of the
screen. Call this out explicitly so a future reader does not "complete" this
task's reasoning by redacting the one surface it was never meant to reach.

### Every call site, its audience, and what changes

| Route / module | Audience | Change |
|---|---|---|
| `POST /api/orders/[id]/accept` | Driver (the caller; only a driver can hit this route, checked by `session.user.role !== "DRIVER"` early in the handler) | Response `select` switches from `ORDER_PARTY_SELECT` to `CARRIER_ORDER_PARTY_SELECT`. No `price`/fare-component field in the response; `driverPayout` present as today. |
| `POST /api/orders/[id]/start` | Driver (only the order's assigned `driverId` may call it) | Same select switch. |
| `POST /api/orders/[id]/complete` | Driver (only the order's assigned `driverId` may call it) | Same select switch, response only — see Files to Modify for the overtime-maths boundary with the sibling Earnings task. |
| `POST /api/logistics-company/orders/[id]/claim` | Company (`session.user.role !== "COMPANY"` gated) | Same select switch: `ORDER_PARTY_SELECT` → `CARRIER_ORDER_PARTY_SELECT`. |
| `POST /api/logistics-company/orders/[id]/dispatch` | Company | Same select switch. |
| `POST /api/logistics-company/orders/[id]/cancel` | Company | Same select switch. |
| `GET /api/orders`, `DRIVER` branch (`role === "DRIVER"`) | Driver | Query `select` switches from `ORDER_LIST_SELECT` to the new `DRIVER_ORDER_LIST_SELECT` for this branch only. Stop-contact nulling (`canSeeStopContacts`) is unchanged and still runs on top. |
| `GET /api/orders`, default branch (`where = { clientId: userId }`) | Client | **No change.** Keeps `ORDER_LIST_SELECT`, full fare breakdown, exactly as today. (A `COMPANY` session also falls through this branch today and gets an empty list, since no order has `clientId` equal to a company's `userId` — also unchanged, and out of scope: this route has never had a company-specific branch and this task does not add one.) |
| `GET /api/logistics-company/orders` | Company | `COMPANY_ORDER_LIST_SELECT` redacted in place: same seven fields dropped, `driverPayout`/`overtimeDriverPayout` added. Stop-contact nulling (`canSeeStopContacts` in this file) unchanged. |
| `getHubJobs` (`src/lib/dashboard/hub/jobs.ts`) | Driver or company (`HubAccount.kind` is `"INDIVIDUAL"` or `"BUSINESS"`; both scoped by `hubOrderScope`) | Prisma `select` drops the six gross fare columns, adds `driverPayout`/`overtimeDriverPayout`; `HubJob.fare` becomes `driverPayout + overtimeDriverPayout`. |
| Job history detail panel (`jobs-detail-panel.tsx`) | Driver or company | Itemised gross fare lines replaced with a payout-based line set (see below). |
| Job history table row (`jobs-screen.tsx:360`) | Driver or company | No code change; renders the corrected `job.fare` automatically. |

### Implementation Steps

1. **`src/lib/order-response-select.ts`.** Add `CARRIER_ORDER_PARTY_SELECT`
   directly below `ORDER_PARTY_SELECT`, as a full literal object (matching
   this file's existing style — an explicit field-by-field list, not a
   spread-and-override of `ORDER_PARTY_SELECT`, since Prisma `select` objects
   read most clearly as one flat, named list per the pattern already in this
   file and in both `*_LIST_SELECT` constants). It is every field
   `ORDER_PARTY_SELECT` has **except** `baseFare`, `distanceFare`,
   `timeFare`, `helperFee`, `overtimeFee`, `price` and
   `serviceLevelAdjustment`, **plus** `overtimeDriverPayout: true` (a field
   `ORDER_PARTY_SELECT` itself still lacks — see Code Snippets for the exact
   list). Extend the doc comment above `ORDER_PARTY_SELECT` — do not replace
   it — with a paragraph explaining the split: `ORDER_PARTY_SELECT` answers
   the **client**, who is entitled to the fare they are commercially party
   to; `CARRIER_ORDER_PARTY_SELECT` answers **either carrier** — an
   independent driver or a logistics company — who is entitled to their own
   payout and nothing about what the client paid to get it (see "Company
   accounts are carriers, not clients" above). Note in the same comment that,
   after this task, `ORDER_PARTY_SELECT` has **no remaining consumer** among
   the six lifecycle routes it was written for (all six now use
   `CARRIER_ORDER_PARTY_SELECT`); it is kept, not deleted, because it is the
   correct shape for any future genuinely client-facing single-order
   endpoint, and deleting an exported, documented constant on the basis that
   nothing currently imports it is a separate, larger cleanup this task does
   not take on.

2. **`accept/route.ts`.** Change the `import { ORDER_PARTY_SELECT } from
   "@/lib/order-response-select"` to import `CARRIER_ORDER_PARTY_SELECT`
   instead, and use it in the final `prisma.order.findUnique({ where: { id
   }, select: ... })` call whose result is returned. Every caller of this
   route is already gated to `session.user.role === "DRIVER"` a few lines
   above, so no further branching is needed. Add a one-line comment at the
   `select:` site: *"Carrier-only response — see
   `CARRIER_ORDER_PARTY_SELECT`'s doc comment; never `ORDER_PARTY_SELECT`
   here."*

3. **`start/route.ts`.** Same change. This route has no explicit role check
   (any authenticated user can call it, but the `order.driverId !==
   session.user.id` check a few lines above means only the assigned driver
   ever reaches the update), so the same reasoning applies. Same import swap,
   same comment.

4. **`complete/route.ts`.** Same import and `select:` swap, applied only to
   the `select` property of the final `prisma.order.update` call. Leave the
   `data:` object, the `overtimeFee`/`overtimeMinutes` computation, and every
   line above the `select:` untouched. Add a comment next to the swapped
   `select:` noting that `overtimeDriverPayout` is read from whatever this
   update call currently writes (today: nothing — the column keeps its
   `@default(0)` until a separate task populates it at completion) — this
   task does not add that write, only stops leaking `overtimeFee` in the
   meantime.

5. **`claim/route.ts`, `dispatch/route.ts`, `cancel/route.ts`** (all under
   `src/app/api/logistics-company/orders/[id]/`). Same import and `select:`
   swap as steps 2–4: `ORDER_PARTY_SELECT` → `CARRIER_ORDER_PARTY_SELECT` in
   each file's final `prisma.order.findUnique`/`update` call. Each is already
   gated to `session.user.role === "COMPANY"`, so no branching is needed.
   Same one-line comment convention as step 2, naming the company as the
   carrier rather than the driver.

6. **`src/app/api/orders/route.ts`.** Add `DRIVER_ORDER_LIST_SELECT` as a new
   `const`, placed directly after `ORDER_LIST_SELECT`, as a full literal
   (same reasoning as step 1 — this file's existing constants are all
   explicit lists, and the two existing listing endpoints deliberately keep
   route-local selects rather than importing a shared one, a convention this
   step continues rather than breaks). Its fields are `ORDER_LIST_SELECT`'s
   fields minus the same seven money keys, plus `overtimeDriverPayout: true`
   — i.e., built the same way `CARRIER_ORDER_PARTY_SELECT` was in step 1,
   kept as a second, separate constant because this endpoint's existing
   `ORDER_LIST_SELECT` is itself a separate constant from
   `ORDER_PARTY_SELECT` (see that file's own doc comment on why: listing
   endpoints "serve non-parties too... and must be free to withhold more").
   Give it a doc comment of its own, cross-referencing
   `src/lib/order-response-select.ts`'s `CARRIER_ORDER_PARTY_SELECT`. Named
   `DRIVER_ORDER_LIST_SELECT`, not `CARRIER_...`, because this file's `GET`
   has no company branch — only a driver ever reaches this constant.

   Then restructure `GET` (~line 586 onward). Today the handler builds one
   `where` (branching on `role === "DRIVER"`) and runs a single
   `prisma.order.findMany` at the end for every role. Split the tail into two
   explicit paths **after** `where` is built, so the driver path can use a
   different `select` without producing a Prisma-inferred union type from a
   ternary `select`:

   ```ts
   if (role === "DRIVER") {
     const orders = await prisma.order.findMany({
       where,
       select: DRIVER_ORDER_LIST_SELECT,
       orderBy: { createdAt: "desc" },
     });

     // Same per-row contact redaction as the client path below — entitlement
     // to stop contacts is still per row (open vs. assigned), independent of
     // the money redaction this select already applies to every row.
     const visibleOrders = orders.map((order) =>
       canSeeStopContacts(order, userId)
         ? order
         : {
             ...order,
             pickupContactName: null,
             pickupContactPhone: null,
             pickupContactDetails: null,
             dropoffContactName: null,
             dropoffContactPhone: null,
             dropoffContactDetails: null,
           },
     );

     return NextResponse.json(visibleOrders, { status: 200 });
   }

   const orders = await prisma.order.findMany({
     where,
     select: ORDER_LIST_SELECT,
     orderBy: { createdAt: "desc" },
   });

   const visibleOrders = orders.map((order) =>
     canSeeStopContacts(order, userId)
       ? order
       : {
           ...order,
           pickupContactName: null,
           pickupContactPhone: null,
           pickupContactDetails: null,
           dropoffContactName: null,
           dropoffContactPhone: null,
           dropoffContactDetails: null,
         },
   );

   return NextResponse.json(visibleOrders, { status: 200 });
   ```

   `canSeeStopContacts` itself needs no change — its signature only reads
   `clientId`/`driverId`, which both selects still carry. The redaction block
   is duplicated across the two branches rather than factored into a shared
   helper: this mirrors the file's own existing choice to duplicate
   `canSeeStopContacts` itself across `orders/route.ts` and
   `logistics-company/orders/route.ts` rather than share it, and avoids
   fighting Prisma's type inference across two different `select` literals
   for a five-line block. Update the `GET` handler's doc comment to note the
   two branches now also differ in `select`, not only in `where`.

7. **`src/app/api/logistics-company/orders/route.ts`.** Edit
   `COMPANY_ORDER_LIST_SELECT` directly: remove `baseFare`, `distanceFare`,
   `timeFare`, `helperFee`, `overtimeFee`, `price`, `serviceLevelAdjustment`;
   add `driverPayout: true` and `overtimeDriverPayout: true`. Unlike step 6,
   there is no second constant to add here — this select has exactly one
   consumer (this file's own `GET`, which has no client branch), so it is
   simply corrected in place. Update the doc comment above it to state the
   same carrier reasoning ("Company accounts are carriers, not clients"
   above) in place of whatever it currently says about `price` being
   appropriate for a company to see. `canSeeStopContacts` in this file is
   unchanged.

8. **`src/lib/dashboard/hub/jobs.ts`.** In `getHubJobs`'s `prisma.order
   .findMany` call, remove `baseFare`, `distanceFare`, `timeFare`,
   `helperFee`, `overtimeFee`, `price` from the `select`; add `driverPayout`
   and `overtimeDriverPayout`. In the `HubJob` type, remove the same six
   fields and add `driverPayout: number` and `overtimeDriverPayout: number`
   in their place; `helperCount` stays (it is a headcount, not money — see
   Notes). In the `jobs.push({...})` mapping, change
   `fare: roundCurrency(order.price + order.overtimeFee)` to
   `fare: roundCurrency(order.driverPayout + order.overtimeDriverPayout)`,
   and replace the six removed field assignments with
   `driverPayout: order.driverPayout` and `overtimeDriverPayout:
   order.overtimeDriverPayout`. Rewrite `HubJob.fare`'s doc comment: it
   currently justifies `price + overtimeFee` as "what the job pays *the
   account reading this*" and separately argues `serviceLevelAdjustment` is
   excluded because "whether any of it reaches the driver... is a commercial
   split nobody has decided." Both points are now settled — `fare` **is**
   the account's commissioned payout by construction, and
   `serviceLevelAdjustment` is excluded because `driverPayout` is derived
   from `price` alone (see task-01's schema comment: `driverPayout = price *
   (1 - commissionRate)`), not because the split is undecided. Say so
   plainly rather than leaving the old "nobody has decided" framing in a
   file this task just resolved it in.

9. **`src/components/driver-hub/screens/jobs-detail-panel.tsx`.** Replace
   `buildFareLines`. It currently builds up to six lines from gross
   components that no longer exist on `HubJob` after step 8
   (`baseFare`/`distanceFare`/`timeFare`, a conditional `Helper` line off
   `helperFee`, a computed "Minimum fare top-up" reconciling those against
   `price`, and a conditional `Overtime` line off `overtimeFee`). None of
   those per-component gross figures has a carrier-net equivalent — payout is
   a single lump derived from the whole `price`, not itemised per fare
   component — so the itemisation collapses to at most two lines:

   ```ts
   function buildFareLines(job: HubJob): FareLine[] {
     const lines: FareLine[] = [{ label: "Payout", amountGel: job.driverPayout }];

     if (job.overtimeDriverPayout !== 0) {
       lines.push({
         label:
           job.waitingMinutes === null
             ? "Overtime payout"
             : `Overtime payout · ${job.waitingMinutes} min loading`,
         amountGel: job.overtimeDriverPayout,
       });
     }

     return lines;
   }
   ```

   Rewrite the doc comment above it accordingly — the existing one explains
   the minimum-fare top-up and the Helpers/Overtime conditionals, none of
   which apply anymore. Keep the `waitingMinutes`-based label pattern
   (matches the existing Overtime line's convention) so the reason for a
   non-zero overtime payout stays visible. Then:
   - Update the "Paid to you" total block's comment (the one currently
     explaining why the total is `fare` and not `price` or `price +
     serviceLevelAdjustment`, on the grounds that "whether a Priority
     premium reaches the driver... is a commercial split nobody has
     decided"). Replace it with the resolved reasoning: `fare` is
     `driverPayout + overtimeDriverPayout` by construction (step 8), and
     `serviceLevelAdjustment` is not part of it because `driverPayout` is
     computed from `price` alone — not because the split is unresolved.
   - The `job.serviceLevel === "Regular"` disclaimer paragraph below the
     total ("Booked as {tier}. The tier adjusts what the client pays and is
     not part of this figure.") stays — it is still true — but drop its
     implicit "nobody has decided" framing from the surrounding comment for
     the same reason.
   - `roundCurrency`, imported from `jobs-format.ts` for the old top-up
     calculation, is no longer used by this file once the top-up line is
     gone; remove the now-unused import (`pnpm lint` will flag it if left).

10. **`src/components/driver-hub/screens/jobs-screen.tsx`.** No edit
    expected. After step 8, `job.fare` at line 360 is already
    `driverPayout + overtimeDriverPayout`. Read the file to confirm no other
    line reads a gross field directly (confirmed during this task's
    research: it does not) before treating this file as done.

11. Run `pnpm typecheck` and `pnpm lint`; fix anything either surfaces,
    including the unused-import case in step 9. Then run `pnpm check` (the
    project's combined quality gate) and confirm it passes.

12. **Verify by hand — there is no existing automated coverage of these
    routes or this screen.** `tests/service-level-pricing.spec.ts` and the
    other two specs under `tests/` cover pricing and formatting, not these
    response shapes or this screen; grepping the suite confirms no test
    currently asserts on the JSON `POST /api/orders/[id]/accept|start|
    complete`, `POST /api/logistics-company/orders/[id]/claim|dispatch|
    cancel`, `GET /api/orders`, `GET /api/logistics-company/orders`, or the
    Job history screen's rendered output. Do one of:
    - Add a focused Playwright/API-level test (create an order, accept it as
      a driver, assert the JSON body has no `price` key and has
      `driverPayout`) if the project's existing Playwright setup makes that
      cheap, matching the style of `tests/service-level-pricing.spec.ts`; or
    - If adding one is out of proportion to this task, manually verify with
      `curl` against a local dev server (sign in as a seeded driver and a
      seeded company, exercise each route, inspect the JSON) and load the Job
      history screen as both account kinds, and record in the PR description
      that this was checked, rather than asserting it works untested. Per
      `AGENTS.md`, do not simply assume the change works.

### Code Snippets

`CARRIER_ORDER_PARTY_SELECT`, added to `src/lib/order-response-select.ts`:

```ts
/**
 * The `Order` columns an endpoint may return to the *carrier* on an order —
 * whichever account is fulfilling it, an independent driver or a logistics
 * company — never to the client. Sibling to `ORDER_PARTY_SELECT` above, and
 * deliberately a separate object rather than that one with some fields
 * removed at each call site: a carrier-facing route that imports this
 * constant cannot accidentally receive `price` back from Prisma, because the
 * field is never asked for. A per-call-site `delete order.price` or a
 * row-nulling map — the mechanism `canSeeStopContacts` uses two files over —
 * would leave the key present with a value someone has to remember not to
 * render; omitting it here means a future `order.price` in carrier-facing
 * code is a TypeScript compile error, not a silent leak. See
 * `specs/driver-load-board/tasks/task-16-driver-payload-redaction.md` for the
 * full reasoning on why money redaction is omission and stop-contact
 * redaction (`canSeeStopContacts`, unchanged by this select) stays nulling —
 * the two are genuinely different problems: contact visibility varies row by
 * row within one response, money visibility does not. That file also records
 * why this applies equally to a company: the platform takes 15% of what the
 * client pays and pays the rest to whichever carrier fulfils the job, so a
 * company's own revenue is its commissioned payout, exactly like a driver's —
 * it has no more claim to the client's gross quote than a driver does.
 *
 * `driverPayout` is the carrier's share of `price`, `overtimeDriverPayout` is
 * their share of `overtimeFee` (both computed and stored elsewhere — see
 * `src/lib/orders/payout.ts` and the columns' comments on `model Order`).
 * Together they are the only money a carrier-facing response may ever carry.
 *
 * As of this select's introduction, `ORDER_PARTY_SELECT` above has no
 * remaining consumer among the six lifecycle endpoints it was written for —
 * all six (accept, start, complete, claim, dispatch, cancel) now use this
 * constant instead. It is kept rather than deleted: it remains the correct
 * shape for any future genuinely client-facing single-order endpoint, and a
 * missing current caller is not, on its own, a reason to remove a documented
 * export.
 */
export const CARRIER_ORDER_PARTY_SELECT = {
  id: true,
  cargoCategory: true,
  description: true,
  bodyType: true,
  helperCount: true,
  scheduledAt: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  distanceKm: true,
  serviceLevel: true,
  vehicleTypeSpecId: true,
  status: true,
  clientId: true,
  companyId: true,
  driverId: true,
  vehicleId: true,
  paymentMethodType: true,
  inTransitAt: true,
  completedAt: true,
  waitingMinutes: true,
  createdAt: true,
  updatedAt: true,
  reference: true,
  driverPayout: true,
  overtimeDriverPayout: true,
} as const;
```

`DRIVER_ORDER_LIST_SELECT`, added to `src/app/api/orders/route.ts` next to
`ORDER_LIST_SELECT` (same field set as above, plus the eleven board-relevant
fields task-05 already put on `ORDER_LIST_SELECT`: `cargoWeightKg`,
`cargoLengthM`, `cargoWidthM`, `cargoHeightM`, `packagingDescription`,
`itemQuantity`, `handlingTags`, `pickupWindowStart`, `pickupWindowEnd`,
`deliveryDeadline` — `reference` and `driverPayout` are already counted
above):

```ts
/**
 * `ORDER_LIST_SELECT`'s driver-facing sibling — see
 * `CARRIER_ORDER_PARTY_SELECT` in `src/lib/order-response-select.ts` for the
 * full reasoning. Kept as its own route-local constant rather than importing
 * that one, for the same reason `ORDER_LIST_SELECT` itself is route-local
 * and not `ORDER_PARTY_SELECT`: this is a listing endpoint serving a driver
 * who is not yet a party to most of what it lists, and must stay free to
 * withhold more than the lifecycle endpoints do. Named `DRIVER_...` rather
 * than `CARRIER_...` because this file's `GET` has no company branch to
 * serve — only a driver session ever reaches this constant.
 */
const DRIVER_ORDER_LIST_SELECT = {
  id: true,
  cargoCategory: true,
  description: true,
  bodyType: true,
  helperCount: true,
  scheduledAt: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  distanceKm: true,
  serviceLevel: true,
  vehicleTypeSpecId: true,
  status: true,
  clientId: true,
  companyId: true,
  driverId: true,
  vehicleId: true,
  paymentMethodType: true,
  inTransitAt: true,
  completedAt: true,
  waitingMinutes: true,
  createdAt: true,
  updatedAt: true,
  reference: true,
  cargoWeightKg: true,
  cargoLengthM: true,
  cargoWidthM: true,
  cargoHeightM: true,
  packagingDescription: true,
  itemQuantity: true,
  handlingTags: true,
  pickupWindowStart: true,
  pickupWindowEnd: true,
  deliveryDeadline: true,
  driverPayout: true,
  overtimeDriverPayout: true,
} as const;
```

### API Endpoints

- `POST /api/orders/[id]/accept` — response body now omits `price`,
  `baseFare`, `distanceFare`, `timeFare`, `helperFee`, `overtimeFee`,
  `serviceLevelAdjustment`; carries `driverPayout` and
  `overtimeDriverPayout` as before/newly added respectively.
- `POST /api/orders/[id]/start` — same shape change.
- `POST /api/orders/[id]/complete` — same shape change; overtime maths
  unchanged (sibling Earnings task's territory).
- `POST /api/logistics-company/orders/[id]/claim` — same shape change.
- `POST /api/logistics-company/orders/[id]/dispatch` — same shape change.
- `POST /api/logistics-company/orders/[id]/cancel` — same shape change.
- `GET /api/orders` — unchanged for a `CLIENT` caller (full fare breakdown on
  every row); a `DRIVER` caller's rows now omit the same seven fields on
  every row, open or assigned, with stop-contact nulling still applied on
  top exactly as before.
- `GET /api/logistics-company/orders` — same shape change as `GET
  /api/orders`'s driver branch, applied to every row this endpoint returns
  (there is no client branch to preserve here).

### The three hub modules that still show gross, and why they are all yours

The Wave 2 review found that fixing `src/lib/dashboard/hub/earnings.ts`
(task-15) did not fix the bug — it fixed one of four places. These three remain,
and they present the client's money to a driver as the driver's own earnings:

| File | What it says now |
|---|---|
| `src/lib/dashboard/hub/jobs.ts:121` | "`price + overtimeFee` — what the job pays *the account reading this*" |
| `src/lib/dashboard/hub/today.ts:130,168` | the quote plus overtime, and today's earnings total |
| `src/lib/dashboard/hub/drivers.ts:111,162` | per-driver and all-time company totals |

`jobs.ts:121`'s comment is the one to read closely: it asserts the sum is *what
the account is paid*, which is now exactly backwards. That is the claim to
delete, not soften.

All three become `driverPayout + overtimeDriverPayout`. As in task-15, **no
`serviceLevelAdjustment` term belongs in the new sum** — the Priority uplift and
Pooling discount are already inside the basis `driverPayout` was commissioned
from at booking. Say so, so its absence reads as deliberate rather than as the
same omission repeated a fourth time.

Do NOT touch `src/lib/admin/analytics.ts`. The admin's Sales Analytics is
correctly gross: it is the platform's own view of what clients paid, which is a
different question with a different right answer.

## Acceptance Criteria

- [ ] `jobs.ts`, `today.ts` and `drivers.ts` all sum
      `driverPayout + overtimeDriverPayout`; no hub module outside
      `src/lib/admin/` sums `price + overtimeFee` any more.
- [ ] `src/lib/admin/analytics.ts` is unchanged and still gross.

- [ ] A driver calling `POST /api/orders/[id]/accept` receives a response
      whose JSON body contains no `price`, `overtimeFee`, `baseFare`,
      `distanceFare`, `timeFare`, `helperFee` or `serviceLevelAdjustment`
      key, and does contain `driverPayout` and `overtimeDriverPayout`.
- [ ] The same is true of `POST /api/orders/[id]/start` and `POST
      /api/orders/[id]/complete`.
- [ ] The same is true of `POST /api/logistics-company/orders/[id]/claim`,
      `.../dispatch` and `.../cancel` for a company caller.
- [ ] A client calling `GET /api/orders` still receives their full itemised
      quote on every row: `price`, `baseFare`, `distanceFare`, `timeFare`,
      `helperFee`, `overtimeFee` and `serviceLevelAdjustment` all present,
      unchanged from today.
- [ ] A driver calling `GET /api/orders` receives no `price` or
      fare-component field on any row — open or already assigned to them —
      and does receive `driverPayout` and `overtimeDriverPayout` on every
      row.
- [ ] A company calling `GET /api/logistics-company/orders` receives no
      `price` or fare-component field on any row — open, claimed or
      dispatched — and does receive `driverPayout` and
      `overtimeDriverPayout` on every row.
- [ ] Stop-contact redaction (`canSeeStopContacts`) behaves identically to
      today on both branches of `GET /api/orders` and on `GET
      /api/logistics-company/orders`: nulled on a row the requester is not a
      party to, present on one they are.
- [ ] The driver hub's Job history screen (`/dashboard/jobs`) shows no
      `price`, `baseFare`, `distanceFare`, `timeFare`, `helperFee` or
      `overtimeFee` figure anywhere — table or detail panel — for either an
      individual driver or a company account, and shows `driverPayout`
      (labelled "Payout") and, when non-zero, `overtimeDriverPayout`
      (labelled "Overtime payout") instead.
- [ ] `src/lib/admin/analytics.ts` has no diff — the admin Sales Analytics
      module keeps reading and reporting gross `price`, unchanged.
- [ ] `src/lib/dashboard/hub/earnings.ts`, `src/app/api/dashboard/hub/
      earnings/export/route.ts`, `earnings-screen.tsx` and
      `earnings-breakdown-card.tsx` have no diff — that is the sibling
      Earnings task's territory and this task does not touch it.
- [ ] `complete/route.ts`'s `overtimeFee`/`overtimeMinutes` computation and
      its `data:` object passed to `prisma.order.update` are unchanged;
      only its `select:` differs.
- [ ] `POST /api/orders` (order creation) is unchanged; this task modifies
      only response selects and the Job history read path on existing
      routes/modules.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm check` all pass.
- [ ] `CARRIER_ORDER_PARTY_SELECT` is exported from
      `src/lib/order-response-select.ts` and used by all six lifecycle
      routes (accept, start, complete, claim, dispatch, cancel);
      `DRIVER_ORDER_LIST_SELECT` is defined in `src/app/api/orders/route.ts`;
      none of these is derived by spreading and overriding another constant
      in its file (all are independent literals, matching this codebase's
      existing select style).

## Notes

- No component in `src/app/orders/`, `src/components/order-card.tsx`, the
  checkout pages (`src/app/checkout/**`) or the wallet
  (`src/app/wallet/**`, `src/components/wallet/**`) is affected by this
  task: all of them are client-only surfaces that read `Order.price` through
  their own route-local Prisma selects or the `POST /api/orders` creation
  response, never through any of the routes or modules this task changes.
  They were checked (`grep -rn "\.price\b"` across `src/app/orders`,
  `src/components`, `src/app/checkout`, `src/app/wallet`) and every hit is a
  client-facing render, correct and unaffected.
- None of the six lifecycle routes this task changes currently has a UI
  consumer in this codebase (checked: no `fetch` call to `/api/orders`
  (`GET`), `/accept`, `/start`, `/complete`, `/claim`, `/dispatch` or
  `/cancel` exists outside `route.ts` files and `booking-form.tsx`'s `POST
  /api/orders`). The load board's own UI (task-08's claim endpoint, task-09
  onward) is a separate, new code path this task does not touch. The Job
  history screen, by contrast, **is** live and rendered today to both
  account kinds — that leak was real traffic, not a dormant surface. This
  means the API-route changes carry no known UI-regression risk today, but
  every one of them is still a live, callable surface — a mobile client or a
  future UI could call it directly — so none of the fixes are deferred
  merely because nothing in the web app currently reads that particular
  response.
- `commissionRate` stays excluded from every select this task adds or edits,
  exactly as it already is from `ORDER_PARTY_SELECT` and `ORDER_LIST_SELECT`:
  it is an internal figure with no consumer on any surface, carrier-facing or
  otherwise.
- `helperCount` (a headcount) stays on `HubJob` and in every select in this
  task — it is not money, and the Job history panel is free to keep noting
  "booked with N helpers" as operational context even though the per-helper
  fee itself (`helperFee`) is gone from the type.
