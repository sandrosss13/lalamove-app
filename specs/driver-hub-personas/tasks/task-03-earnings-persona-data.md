# Task 03: Earnings roster guard and business per-driver revenue

## Status

complete

## Wave

2

## Description

Two things, both server-side, both on the Earnings ("Wallet") surface.

First, the **boundary**: `/dashboard/earnings` must `redirect()` a roster driver
— an employed driver on somebody else's fleet — to `/dashboard/today`, and
`GET /api/dashboard/hub/earnings/export` must refuse the same session with a
`403`. Task-01 hides the "Wallet" link in the sidebar for that persona, but nav
filtering is cosmetic: a hand-typed URL and a hand-issued `fetch` both walk
straight past it. This task installs the two real gates. The reason the screen
is withheld at all is that it is currently *wrong* for that persona — see
"Why the Wallet is hidden from a roster driver" below.

Second, the **fleet data**: `HubEarningsData` gains `persona` (so the Wave-3
screen can branch at all) and, for a `BUSINESS` account only, a per-driver
revenue breakdown computed from real `Order` rows — which of the fleet's drivers
earned the company what, over the same range every other figure on the screen
covers. No schema change, no migration, no new sampled value.

Task-07 renders both of those on the client. This task produces the data and the
guards and renders nothing.

## Dependencies

**Depends on:** task-01-hub-persona-model
**Blocks:** task-07-earnings-screen-fleet

**Context from dependencies:**

task-01 makes `HubPersona` a first-class field on `HubAccount`. Everything below
depends on it existing; nothing below re-derives it.

### The three personas

The Driver Hub serves three registered-driver account shapes. They are derived
from two fields that already exist on `HubAccount`:

| Persona | `HubAccount.kind` | `HubAccount.companyId` | Who they are |
|---|---|---|---|
| `INDEPENDENT` | `"INDIVIDUAL"` | `null` | Owns their vehicle, browses the open Load Board, keeps their own fares |
| `ROSTER` | `"INDIVIDUAL"` | set — their **employer** | Employed driver; work arrives via company dispatch; fares are paid to the employer |
| `BUSINESS` | `"BUSINESS"` | set — their **own** company | Fleet owner; also sees the Drivers and Employees screens |

**`companyId !== null` alone is NOT the roster test.** A `BUSINESS` account has a
`companyId` too — its own company's id. The roster test is `kind ===
"INDIVIDUAL" && companyId !== null`, and getting it backwards would hide the
Wallet from the fleet owners who are entitled to it. This is why `persona`
exists: so no consumer has to remember the conjunction.

`DriverProfile.accountType` (the Prisma `DriverAccountType` enum) is a
**different axis** and must never be used for this. A sole-proprietor driver who
registered as a business is still `kind: "INDIVIDUAL"` and, with no employer,
persona `INDEPENDENT`.

### What task-01 produces, exactly

```ts
// src/lib/dashboard/hub/account.ts
export type HubPersona = "INDEPENDENT" | "ROSTER" | "BUSINESS";

export type HubAccount = {
  kind: HubAccountKind;   // unchanged, still "BUSINESS" | "INDIVIDUAL"
  persona: HubPersona;    // NEW in task-01
  userId: string;
  displayName: string;
  initials: string;
  identifier: string;
  city: string;
  isOnline: boolean | null;
  isActivated: boolean;
  canToggleOnline: boolean;
  companyName: string | null;
  driverProfileId: string | null;
  companyId: string | null;
};
```

`persona` is derived inside `resolveHubAccount()`
(`src/lib/dashboard/hub/account.ts:144-278`, React-`cache()`d): `"BUSINESS"`
when `kind === "BUSINESS"`, `"ROSTER"` when `kind === "INDIVIDUAL" && companyId
!== null`, `"INDEPENDENT"` otherwise. Because it is `cache()`d, reading the
account in a page that the layout already read it in is a memo hit, not a second
session validation.

`HubAccountKind` is **not** removed and still means what it meant — the Vehicles
loader (`src/lib/dashboard/hub/vehicles.ts:172`) and the Loads screen still
consume it. `persona` is added alongside.

task-01 also re-keys sidebar visibility: the `businessOnly` / `rosterHidden`
booleans on `HubNavItem` are replaced by a single persona-keyed rule, and the
`earnings` ("Wallet") entry becomes hidden for `ROSTER`. **That is cosmetic.**
The two gates in this task are the actual boundary.

## Files to Create

None.

## Files to Modify

- `src/lib/dashboard/hub/earnings.ts` — add `persona` and the nullable `fleet`
  breakdown to `HubEarningsData`; add the per-driver revenue query for
  `BUSINESS` accounts.
- `src/app/dashboard/(hub)/earnings/page.tsx` — add the server-side roster
  `redirect("/dashboard/today")`, mirroring the Load Board's guard.
- `src/app/api/dashboard/hub/earnings/export/route.ts` — refuse a `ROSTER`
  session with `403`, mirroring `GET /api/loads`.

**Do not modify** any of the following. Several are owned by sibling tasks
running in the same wave, and editing them will collide:

- `src/lib/dashboard/hub/account.ts` — task-01's, already landed.
- `src/components/driver-hub/driver-hub-nav.ts` — task-01's.
- `src/lib/dashboard/hub/today.ts`, `performance.ts`, `vehicles.ts`, `jobs.ts` —
  task-02 / task-04 / task-05 own the first three; `jobs.ts` is explicitly out of
  scope for the whole spec.
- `src/lib/dashboard/hub/drivers.ts` — **read it, reuse its approach, change
  nothing in it.** Its per-driver `Order` aggregation is the pattern this task
  copies.
- `src/lib/dashboard/hub/sample.ts` — this task adds no sampled value.
- Every `src/components/driver-hub/screens/earnings-*` file — task-07's.
- `prisma/schema.prisma` — no schema changes in this spec, full stop.

## Technical Details

### 1. Why the Wallet is hidden from a roster driver

Restated here because the implementer will be tempted to "fix" the screen
instead of hiding it, and because the redirect looks gratuitous without it.

`getHubEarnings()` scopes its query with `hubOrderScopeSql()`
(`src/lib/dashboard/hub/earnings.ts:249-259`), which for any `INDIVIDUAL`
account is `"driverId" = <userId>`. It then sums `driverPayout +
overtimeDriverPayout` over that account's `COMPLETED` orders and the screen
prints the result under the label **"Gross earnings"**.

For an independent driver that is true. For a driver on a company's roster it is
false: the order was claimed by the company, the payout was settled to the
company, and `Order.driverId` records only which employee drove it. The screen
therefore shows an employee a currency figure, in their own hub, labelled as
theirs, which was in fact paid to their employer — and then offers to export it
to a spreadsheet.

The decision taken in planning, recorded in `requirements.md`'s Assumptions and
in `action-required.md`, is to **hide the screen outright rather than relabel
it** as a non-currency work summary. The failure direction being avoided is
showing an employee money that is not theirs; an employee who wants to know what
they drove has the My orders screen, which is 100% real data and reads correctly
for all three personas. Do not "fix" the labels instead. Do not add a
roster-flavoured variant of the screen. Redirect.

### 2. The current shape of `HubEarningsData`, verbatim

`src/lib/dashboard/hub/earnings.ts:190-231`, exactly as it stands today. Nothing
in it is removed or renamed by this task:

```ts
export type HubEarningsData = {
  range: ResolvedHubEarningsRange;
  /** Which shape `buckets` is in — see `DAILY_GROUPING_MAX_DAYS`. */
  grouping: "daily" | "weekly";
  /** Every Tbilisi day in range, oldest first, zero-filled. */
  days: readonly HubEarningsDay[];
  /** What the chart plots: `days` verbatim, or weekly sums of them. */
  buckets: readonly HubEarningsBucket[];
  /**
   * `SUM(driverPayout + overtimeDriverPayout)` over the whole range — what was
   * actually earned, not what the client paid. The honest headline.
   *
   * "Gross" here means *before* the sampled tips, incentives and adjustments
   * below, not before the platform's commission: the commission is already
   * taken out, because these are the stored payout columns.
   */
  grossFares: number;
  jobsCompleted: number;
  /** `grossFares / jobsCompleted`, or 0 when nothing completed in range. */
  averagePerJob: number;
  /** Everything below this line is fictional — badge it. */
  sampled: {
    /** Tips, incentives and adjustments for the range. */
    extras: SampleEarningsExtras;
    /** Estimated hours online, for the "Nh online" note. */
    onlineHours: number;
    /** `rangeTotal / onlineHours`, for the "₾N per online hour" note. */
    perOnlineHour: number;
    /**
     * Fares + tips + incentives + adjustments — the breakdown card's "Range
     * total" footer. Sampled because three of its four terms are.
     */
    rangeTotal: number;
    /** Caption under the Incentives tile. */
    incentivesNote: string;
    /**
     * The payout table. Deliberately *not* range-filtered: a payout period is a
     * fixed weekly settlement window, which is why the breakdown card's footer
     * reads "Range total" rather than "Payout total".
     */
    payouts: readonly SamplePayoutRow[];
  };
};
```

Supporting types already in the same file, for reference:

```ts
export type ResolvedHubEarningsRange = {
  preset: HubEarningsPresetId | "custom";
  from: string;  // YYYY-MM-DD, Tbilisi, inclusive
  to: string;    // YYYY-MM-DD, Tbilisi, inclusive
  days: number;  // whole Tbilisi days in [from, to], both ends counted
};

export type HubEarningsDay = { date: string; jobs: number; fares: number };

export type HubEarningsBucket = {
  startDate: string;
  endDate: string;
  jobs: number;
  fares: number;
};
```

And `SampleEarningsExtras`, from `src/lib/dashboard/hub/sample.ts:298-306`:

```ts
export type SampleEarningsExtras = {
  tipsGel: number;
  tippingCustomers: number;
  incentivesGel: number;
  adjustmentsGel: number;
  adjustmentsNote: string;
};
```

The `sampled` sub-object is a **nesting level, not a naming convention**, and
the module comment says why at length: "a screen cannot read a fictional number
without typing the word `sampled` on the way to it". Everything this task adds is
real, so nothing this task adds goes inside `sampled`.

### 3. `persona` on `HubEarningsData`

Add two fields at the top level of `HubEarningsData`, above `sampled`. Put
`persona` first, next to `range`, since it describes who the whole object is
for:

```ts
import type { HubAccount, HubPersona } from "@/lib/dashboard/hub/account";

export type HubEarningsData = {
  range: ResolvedHubEarningsRange;
  /**
   * Which account shape this data was assembled for.
   *
   * Carried on the payload rather than re-derived in the screen because
   * `HubEarningsData` is what crosses into the `"use client"` tree — the screen
   * never sees a `HubAccount`, and a client component has no business
   * re-deriving a persona from `kind` and `companyId` anyway. `ROSTER` cannot
   * occur here in practice: the page redirects that persona away before this
   * loader is called and the export route refuses it. The variant is still part
   * of the type because the persona axis is closed and a screen switching on it
   * should be exhaustive.
   */
  persona: HubPersona;
  grouping: "daily" | "weekly";
  // …days, buckets, grossFares, jobsCompleted, averagePerJob unchanged…

  /**
   * Who in the fleet earned the money above. `null` for anything that is not a
   * BUSINESS account — an individual driver's earnings have no per-driver
   * breakdown, and `null` says that rather than an empty array, which would
   * read as "a fleet with nobody in it".
   */
  fleet: HubEarningsFleet | null;

  sampled: { /* unchanged */ };
};
```

Set `persona: account.persona` in the object `getHubEarnings()` returns. It
takes a `HubAccount` already (`earnings.ts:508-515`), so nothing about its
signature changes.

Import `HubPersona` as a **type-only** import alongside the existing
`import type { HubAccount } from "@/lib/dashboard/hub/account";` at
`earnings.ts:54`. `account.ts` is `server-only` and `earnings.ts` is too, so a
value import would be legal here — but the type is all that is needed and a
type-only import cannot accidentally be re-exported into a client bundle.

### 4. The page guard

`src/app/dashboard/(hub)/earnings/page.tsx` currently has no guard at all. Its
doc comment even says so, at lines 25-27:

```
 * Open to both account kinds: `getHubEarnings()` resolves the scope difference
 * (a fleet sees the orders it holds, a driver the orders assigned to them), so
 * there is no business-only redirect here.
```

That paragraph is now false and must be rewritten as part of this change.

Mirror the Load Board's guard exactly. Here is that guard, verbatim, from
`src/app/dashboard/(hub)/loads/page.tsx` — the constant at line 23-24 and the
check at lines 166-179:

```ts
/** Where a driver who has no board of their own is sent instead. */
const HUB_HOME = "/dashboard/today";

// …inside the page component, after the `account === null` narrowing…

  // The roster-driver gate, server-side — the hidden sidebar link is cosmetic
  // and does nothing about a hand-typed URL.
  //
  // The test is `kind` **and** `companyId`, never `companyId` alone. A BUSINESS
  // account's `companyId` names its *own* company and that account is exactly
  // who this board is for; only an INDIVIDUAL with a non-null `companyId` is an
  // employed driver on somebody else's roster. Per the requirements'
  // Assumptions, they receive work through their company's dispatcher rather
  // than the open market — and `GET /api/loads` 403s them for the same reason,
  // so without this redirect they would land on a screen that can only ever
  // show them an error.
  if (account.kind === "INDIVIDUAL" && account.companyId !== null) {
    redirect(HUB_HOME);
  }
```

Write the Earnings equivalent in the same shape and the same register — a
`HUB_HOME` module constant with its own one-line doc comment, then the guard
immediately after the `account === null` early return, with a multi-sentence
comment explaining *why*. The one substantive difference: the condition is now
`account.persona === "ROSTER"`, because task-01 has done the conjunction once
and for all. Say that in the comment, so the next reader does not "restore" the
two-field test.

```ts
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EarningsScreen } from "@/components/driver-hub/screens/earnings-screen";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import {
  HUB_EARNINGS_PRESETS,
  getHubEarnings,
  resolveHubEarningsRange,
} from "@/lib/dashboard/hub/earnings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Earnings & payouts · Driver Hub",
};

/** Where a driver who has no wallet of their own is sent instead. */
const HUB_HOME = "/dashboard/today";

export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await resolveHubAccount();

  if (account === null) {
    return null;
  }

  // The roster-driver gate, server-side — the hidden "Wallet" link in the
  // sidebar is cosmetic and does nothing about a hand-typed URL.
  //
  // This screen sums `driverPayout` over the orders whose `driverId` is this
  // user and labels the total "Gross earnings". For an employed driver that
  // money was settled to their *employer* — the company claimed the order and
  // was paid for it; `driverId` only records who drove. Showing it here asserts
  // something false about an employee's own income, which is why the screen is
  // withheld outright rather than relabelled. `GET
  // /api/dashboard/hub/earnings/export` refuses the same persona with a 403 for
  // the same reason, so this redirect is one half of a pair rather than the
  // whole gate.
  //
  // The test is `persona`, not `companyId`. A BUSINESS account has a non-null
  // `companyId` too — its own company's — and is entitled to this screen;
  // `resolveHubAccount()` already conjoined `kind` and `companyId` into the one
  // field, so no caller has to remember to.
  if (account.persona === "ROSTER") {
    redirect(HUB_HOME);
  }

  const params = await searchParams;
  const range = resolveHubEarningsRange(params);
  const data = await getHubEarnings(account, range);

  return <EarningsScreen data={data} presets={HUB_EARNINGS_PRESETS} />;
}
```

Notes on the guard:

- It goes **after** the `account === null` narrowing and **before** `await
  searchParams` — there is no reason to resolve a range for a request that is
  about to be redirected.
- `redirect()` from `next/navigation` throws a control-flow error; do not wrap it
  in `try`/`catch` and do not `return` it.
- Keep the existing doc block on the page, minus the now-false "Open to both
  account kinds … so there is no business-only redirect here" paragraph, which
  should be replaced by a short paragraph naming the roster redirect and the
  matching `403`.

### 5. The export route refusal

`GET /api/dashboard/hub/earnings/export` calls `getHubEarnings()` with the
session's own account (`route.ts:300`) and streams the result as an `.xlsx`. It
is the reason the page redirect is not sufficient on its own: a roster driver
who never sees the screen can still `fetch` the endpoint and receive a workbook
of their employer's takings with their own name in the header block
(`route.ts:228` writes `["Driver", account.displayName]`).

**Status code: `403`.** Two reasons, and both point the same way:

1. It is what `GET /api/loads` answers the identical persona with — see below.
2. It is what this route already answers its own two existing refusals with
   (`route.ts:277-291`: a `CLIENT` session or a `mustChangePassword` session gets
   `403`, and a missing driver profile gets `403`). A fourth status here would
   make one endpoint speak two dialects.

`401` would be wrong: the caller is authenticated, they are just not entitled.
A redirect would be wrong for the reason the route's own comment at
`route.ts:261-267` already gives — "a redirect is the wrong answer to a `fetch`
for a file: the browser would follow it and save the sign-in page as a
spreadsheet".

Here is the refusal to mirror, verbatim, from `src/app/api/loads/route.ts:730-750`:

```ts
  // `account.companyId` on an INDIVIDUAL account is `DriverProfile.companyId`:
  // the fleet a roster driver belongs to, or null for an independent driver or
  // sole proprietor. An employed roster driver receives work through their
  // company's dispatcher, who accepts and rejects on the company's behalf, so
  // they have no board of their own — the same reasoning
  // src/app/api/orders/[id]/accept/route.ts already refuses them with, adapted
  // from an action to a listing. …
  if (account.kind === "INDIVIDUAL" && account.companyId !== null) {
    return NextResponse.json<LoadBoardError>(
      {
        error:
          "Drivers who belong to a company receive deliveries through their company's dispatch, not through the open load board.",
      },
      { status: 403 },
    );
  }
```

The Earnings equivalent, to be inserted in `route.ts` **immediately after** the
`account === null` check at lines 286-291 and **before** the range is resolved at
line 293:

```ts
  // The roster-driver gate, the API half of the pair — `/dashboard/earnings`
  // redirects the same persona to /dashboard/today, and a redirect is the wrong
  // answer to a fetch for a file (see the note on the session check above), so
  // it is answered as a status code here.
  //
  // Every figure in this workbook is scoped by `driverId = <this user>` and
  // headed with this user's own name, but for an employed driver the payouts it
  // sums were settled to their *employer*: the company claimed the order and was
  // paid for it, and `Order.driverId` records only who drove. A spreadsheet
  // outlives the screen that made it, so an employee's copy of their employer's
  // takings, with their own name at the top, is the exact artefact this refusal
  // exists to prevent.
  //
  // 403 rather than 401 — the caller is authenticated, just not entitled — and
  // it matches both the two refusals above and the one `GET /api/loads` answers
  // this same persona with.
  if (account.persona === "ROSTER") {
    return NextResponse.json<HubEarningsExportError>(
      {
        error:
          "Drivers who belong to a company are paid through their employer, so there are no personal earnings to export.",
      },
      { status: 403 },
    );
  }
```

`HubEarningsExportError` is already declared in the same file (`route.ts:49`) as
`{ error: string }` and is already the shape of the other refusals. The export
button reads `payload?.error` off a non-`ok` response and prints it inline
(`earnings-export-button.tsx:63-72`), so the message string above is
user-visible copy in the unlikely event a roster session ever reaches the button
— write it as such. Do not add a new error type.

Also update the route's module doc comment (`route.ts:17-38`), which currently
describes only the scope rule, to name the roster refusal alongside it.

### 6. The BUSINESS per-driver revenue breakdown

#### 6.1 The money rule — read this before writing the query

`Order` carries four money columns that matter here, and only two of them may
appear on this screen:

| Column | Whose money | May it appear on Earnings? |
|---|---|---|
| `driverPayout` | the carrier's commissioned share, quoted at booking | **Yes** |
| `overtimeDriverPayout` | the carrier's share of overtime, settled at completion | **Yes** |
| `price` | what the **client** paid | **No** |
| `overtimeFee` | what the **client** paid for overtime | **No** |

This is not a preference. `prisma/schema.prisma:1091` states it as a rule:
"`driverPayout` is the ONLY money figure a driver may be shown." `earnings.ts`'s
own module comment (lines 22-26) says `price` and `overtimeFee` "are the
client's money and must not reach this screen; summing them here is the bug this
module used to have". And `drivers.ts:205-208` closes the obvious loophole
before anyone opens it:

> A company reading this screen is under the same rule as a driver, not outside
> it: a logistics company is the job's fulfilling party — the carrier — and its
> own revenue is its commissioned payout, exactly as an independent driver's is.

So the per-driver breakdown is `SUM(driverPayout + overtimeDriverPayout)` per
driver, full stop. Do **not** add a "client billed" or "gross booking value"
column from `price`, however tempting a revenue table makes it look. A
per-driver column built from `price` would also silently disagree with the
`grossFares` headline directly above it, since the two are ~18% apart at the
platform's commission rate.

`serviceLevelAdjustment` is likewise **not** part of the sum, and its absence is
deliberate rather than an omission carried forward: `driverPayout` was computed
at booking from `roundCurrency(price + serviceLevelAdjustment)`, so the Priority
uplift and the Pooling discount are already inside it. Adding the column again
would pay it out twice. Both `earnings.ts:564-568` and `drivers.ts:210-214` say
this; do not be the third place that gets it wrong.

#### 6.2 The types

Add these above `HubEarningsData` in `earnings.ts`:

```ts
/**
 * One fleet driver's contribution to the range's revenue.
 *
 * Every field is real, read from `COMPLETED` `Order` rows scoped to the
 * signed-in company. Nothing here is sampled, so nothing here is badged.
 */
export type HubEarningsDriverRow = {
  /** `User.id` — what `Order.driverId` holds. Stable key for the table row. */
  driverId: string;
  /**
   * `User.name`.
   *
   * Read from `User` rather than from the company's current roster on purpose:
   * `Order.driverId` outlives a driver's membership of a fleet
   * (`DriverProfile.companyId` is nullable and is nulled on removal), so a
   * driver who has since left still has orders this company was paid for and
   * must still be nameable in a range that covers them.
   */
  name: string;
  /** COMPLETED orders this driver ran for the company, in range. */
  jobsCompleted: number;
  /**
   * `SUM(driverPayout + overtimeDriverPayout)` for those orders — what the
   * fleet earned on them, never what its clients were billed.
   */
  grossFaresGel: number;
  /** `grossFaresGel / jobsCompleted`, or 0 when the driver completed nothing. */
  averagePerJobGel: number;
  /**
   * This driver's share of the range's `grossFares`, 0–100, one decimal.
   *
   * Computed here rather than in the screen so the denominator is unarguably
   * the same `grossFares` the headline tile prints. Rounding is per row, so the
   * column need not sum to exactly 100 — see the note in the table's own
   * component about never printing a re-summed total.
   */
  sharePercent: number;
};

/**
 * The BUSINESS per-driver revenue breakdown for the range.
 *
 * Built entirely from existing `Order` columns — no schema change, no sampled
 * value, no new index. The company's own tenancy scope is applied in the query
 * exactly as `drivers.ts` applies it.
 */
export type HubEarningsFleet = {
  /** Drivers who completed at least one job in range, largest revenue first. */
  drivers: readonly HubEarningsDriverRow[];
  /**
   * The company's completed orders in range that carry **no** `driverId`.
   *
   * Real and non-zero in ordinary operation: a company claims an order with its
   * own identity and assigns a driver at dispatch time (see the Load Board's
   * "claim first, assign afterwards" resolution), and `Order.driverId` is
   * `onDelete: SetNull`, so a deleted user's completed orders lose their driver
   * while keeping their money. Carried as its own object rather than folded into
   * `drivers` as a fake row so the screen labels it honestly, and so
   * `drivers.length` remains the count of actual drivers.
   *
   * Its presence is what lets the table reconcile: `drivers` plus this equals
   * `grossFares` to the cent.
   */
  unassigned: {
    jobsCompleted: number;
    grossFaresGel: number;
    sharePercent: number;
  };
};
```

#### 6.3 The query — reuse `drivers.ts`'s approach, do not invent a second one

`src/lib/dashboard/hub/drivers.ts:320-367` already aggregates per-driver order
data for a fleet. This is the shape to copy (it is `drivers.ts:334-344`
verbatim):

```ts
    prisma.order.groupBy({
      by: ["driverId"],
      where: {
        companyId,
        driverId: { in: driverUserIds },
        status: OrderStatus.COMPLETED,
      },
      // The carrier's two payout columns, never the client's `price` and
      // `overtimeFee` — see `orderPayoutTotal`.
      _sum: { driverPayout: true, overtimeDriverPayout: true },
    }),
```

Three deliberate differences for Earnings:

1. **No `driverId: { in: … }` filter.** `drivers.ts` starts from the roster and
   asks what each current member earned; Earnings starts from the *money* and
   asks who earned it. Restricting to today's roster would drop revenue this
   company was genuinely paid — a driver who has since left, or an order with a
   null `driverId` — and the column would no longer add up to the `grossFares`
   figure printed above it. The `companyId` filter is the tenancy boundary and it
   is sufficient on its own.
2. **A range filter**, since Earnings is always range-scoped:
   `completedAt: { gte: fromInstant, lt: toExclusiveInstant }`, reusing the two
   instants `getHubEarnings` already computes at lines 536-537. Half-open, so the
   last day of an inclusive range is counted whole. Do **not** recompute them.
3. **`_count: true` as well as `_sum`**, for the jobs column.

A note on the timestamp bound: the raw SQL in this module wraps its bounds in
`AT TIME ZONE 'UTC'` (`HUB_UTC_BOUND_SQL`) because Prisma binds a `Date` as
`timestamptz` and Postgres would otherwise promote the naive `completedAt`
column using the *session's* zone. A Prisma-built `where` does not need that
treatment and does not get it — `drivers.ts:330` filters `completedAt: { gte:
startOfWeek }` through the query builder for exactly this reason. Use the
builder; do not hand-write a second raw query.

The scope guard, mirroring `drivers.ts:274-280`:

```ts
export async function getHubDrivers(account: HubAccount) {
  const { companyId } = account;

  // Both halves of the guard are load-bearing: `kind` is the product rule, and
  // the null check is what lets `companyId` narrow to a string below.
  if (account.kind !== "BUSINESS" || companyId === null) {
    return null;
  }
```

Write the same guard with `account.persona !== "BUSINESS"` in place of the
`kind` half. **Do not** reach for `hubOrderScopeSql`'s
`UNMATCHABLE_COMPANY_ID` sentinel here: that sentinel exists because
`hubOrderScopeSql` has no early exit and must fail closed inside an expression,
whereas this helper can simply return `null` for an account with no company —
which is both stricter and clearer. Leave `hubOrderScopeSql` (lines 249-259)
untouched; it is the tenancy boundary for this file's one raw query and
`requirements.md` forbids weakening it.

#### 6.4 The loader

Add a module-private helper beside `getHubEarnings`:

```ts
/** One `groupBy` row, before names are resolved and shares are computed. */
type FleetRevenueRow = {
  /** `null` for the company's completed orders with no driver on them. */
  driverId: string | null;
  jobsCompleted: number;
  grossFaresGel: number;
};

/**
 * Per-driver `COMPLETED` revenue for a fleet, over the same half-open instant
 * window the day series is built from.
 *
 * `null` for anything that is not a BUSINESS account with a company: an
 * individual driver's earnings have no per-driver breakdown, and returning null
 * rather than an empty array is what lets the screen tell "not a fleet" apart
 * from "a fleet whose drivers completed nothing".
 *
 * Two round trips rather than one join: `groupBy` cannot include a relation's
 * columns, so the names are resolved in a second query keyed on the ids the
 * first returned. `drivers.ts` makes the same trade for the same reason.
 */
async function loadFleetRevenue(
  account: HubAccount,
  fromInstant: Date,
  toExclusiveInstant: Date,
): Promise<FleetRevenueRow[] | null> {
  const { companyId } = account;

  // Both halves are load-bearing: `persona` is the product rule, and the null
  // check is what narrows `companyId` to a string for the query below.
  if (account.persona !== "BUSINESS" || companyId === null) {
    return null;
  }

  const rows = await prisma.order.groupBy({
    by: ["driverId"],
    where: {
      // The tenancy boundary. Deliberately *not* also filtered to the current
      // roster: `Order.driverId` outlives a driver's membership of a fleet, and
      // dropping a departed driver's orders would make this table fail to add
      // up to the `grossFares` figure printed above it.
      companyId,
      status: OrderStatus.COMPLETED,
      // Half-open, and the same two instants the day series uses, so a driver's
      // row and the chart's bars cover the identical window.
      completedAt: { gte: fromInstant, lt: toExclusiveInstant },
    },
    _count: true,
    // The carrier's two payout columns, never the client's `price` and
    // `overtimeFee` — see this module's header and `prisma/schema.prisma`'s
    // `driverPayout` comment.
    _sum: { driverPayout: true, overtimeDriverPayout: true },
  });

  return rows.map((row) => ({
    driverId: row.driverId,
    jobsCompleted: row._count,
    grossFaresGel: roundCurrency(
      (row._sum.driverPayout ?? 0) + (row._sum.overtimeDriverPayout ?? 0),
    ),
  }));
}
```

`OrderStatus` must be imported as a **value** from `@prisma/client`
(`import { OrderStatus, Prisma } from "@prisma/client";` — the file already
imports `Prisma` at line 52). `drivers.ts:42` imports it the same way.

A `_sum` over no rows is `null` in Prisma, which is why both terms are
`?? 0`-defaulted; `drivers.ts:223-230`'s `orderPayoutTotal` explains this and
rounds identically. `roundCurrency` already exists in `earnings.ts` at lines
266-268 — reuse it, do not add a fourth copy.

Then a pure shaping function, called once `grossFares` is known:

```ts
/**
 * Groups the raw rows into the screen's breakdown: named drivers largest first,
 * plus whatever the company earned on orders with no driver on them.
 *
 * `grossFares` is passed in rather than re-summed here so the share column's
 * denominator is provably the same number the headline tile prints.
 */
function toFleetBreakdown(
  rows: readonly FleetRevenueRow[],
  namesByDriverId: ReadonlyMap<string, string>,
  grossFares: number,
): HubEarningsFleet {
  const share = (fares: number): number =>
    grossFares === 0 ? 0 : Math.round((fares / grossFares) * 1000) / 10;

  const drivers: HubEarningsDriverRow[] = rows
    .filter((row): row is FleetRevenueRow & { driverId: string } =>
      row.driverId !== null,
    )
    .map((row) => ({
      driverId: row.driverId,
      // A driver whose `User` row has since been deleted keeps their orders
      // (`onDelete: SetNull` fires on the FK, not on history) but loses their
      // name, so the fallback is a label rather than an empty cell — the money
      // is real and must still be attributable to *something*.
      name: namesByDriverId.get(row.driverId) ?? "Former driver",
      jobsCompleted: row.jobsCompleted,
      grossFaresGel: row.grossFaresGel,
      averagePerJobGel:
        row.jobsCompleted === 0
          ? 0
          : roundCurrency(row.grossFaresGel / row.jobsCompleted),
      sharePercent: share(row.grossFaresGel),
    }))
    // Largest earner first, then by name so two equal rows have a stable order
    // across renders rather than whatever the database returned.
    .sort(
      (a, b) =>
        b.grossFaresGel - a.grossFaresGel || a.name.localeCompare(b.name),
    );

  const unassignedRow = rows.find((row) => row.driverId === null);
  const unassignedFares = unassignedRow?.grossFaresGel ?? 0;

  return {
    drivers,
    unassigned: {
      jobsCompleted: unassignedRow?.jobsCompleted ?? 0,
      grossFaresGel: unassignedFares,
      sharePercent: share(unassignedFares),
    },
  };
}
```

Name resolution, inside `loadFleetRevenue` or immediately after it — either is
fine, but it must not run for a non-business account:

```ts
  const driverIds = rows
    .map((row) => row.driverId)
    .filter((id): id is string => id !== null);

  // Read off `User` rather than `DriverProfile`: `Order.driverId` is a `User`
  // id (the `DriverDeliveries` relation), and a driver who has left this fleet
  // has a `DriverProfile` whose `companyId` no longer points here — filtering by
  // the roster would leave their row nameless while their money still counts.
  const users =
    driverIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: driverIds } },
          select: { id: true, name: true },
        });

  const namesByDriverId = new Map(users.map((user) => [user.id, user.name]));
```

Skipping the query when `driverIds` is empty matters: `{ in: [] }` is a
guaranteed-empty read that is still a round trip.

#### 6.5 Wiring it into `getHubEarnings`

The two instants are already computed at `earnings.ts:536-537`:

```ts
  const fromInstant = parseHubDayKey(resolved.from);
  const toExclusiveInstant = startOfHubDayPlus(parseHubDayKey(resolved.to), 1);
```

Run the fleet query **alongside** the existing raw day query rather than after
it — neither depends on the other, and a fleet owner should not pay two serial
round trips for one screen:

```ts
  const [rows, fleetRows] = await Promise.all([
    prisma.$queryRaw<{ day: Date; jobs: number; fares: number }[]>`
      … existing raw query, unchanged …
    `,
    loadFleetRevenue(account, fromInstant, toExclusiveInstant),
  ]);
```

Leave the raw query's body and its long explanatory comment block
(`earnings.ts:539-582`) exactly as they are — only the `await` in front of it
moves.

Then, after `grossFares` is finalised at line 618 (`grossFares =
roundCurrency(grossFares);`), build the breakdown and add both new fields to the
returned object:

```ts
  return {
    range: resolved,
    persona: account.persona,
    grouping,
    days,
    buckets: /* unchanged */,
    grossFares,
    jobsCompleted,
    averagePerJob:
      jobsCompleted === 0 ? 0 : roundCurrency(grossFares / jobsCompleted),
    fleet:
      fleetRows === null
        ? null
        : toFleetBreakdown(fleetRows, namesByDriverId, grossFares),
    sampled: { /* unchanged */ },
  };
```

(If you keep the name lookup inside `loadFleetRevenue`, have it return the map
alongside the rows — e.g. `{ rows, namesByDriverId } | null` — rather than
threading a second nullable through `getHubEarnings`.)

#### 6.6 The reconciliation invariant

`sum(fleet.drivers[].grossFaresGel) + fleet.unassigned.grossFaresGel` equals
`grossFares` **to within per-row rounding**, because both are the same set of
orders: the day series and the fleet rollup run the same `companyId`, the same
`status = COMPLETED` and the same half-open `completedAt` window. They can drift
by cents, since the day series rounds per Tbilisi day and the rollup rounds per
driver, both off `Float` columns.

This matters for task-07: the fleet table must print `data.grossFares` in any
total row it shows, **never** a re-sum of its own rows. Say so in the type's doc
comment so the constraint travels with the data.

Update this module's header comment (`earnings.ts:1-49`) to name the new `fleet`
field under its "Real vs sample" heading — it is real, and the header is where a
reader checks which half of the payload a figure lives in.

### 7. What this task must not widen: the sampled surface in the export route

`GET /api/dashboard/hub/earnings/export` folds `SAMPLE_ONLINE_HOURS_PER_JOB`
(`sample.ts:66`, `0.92`) and `sampleEarningsExtras()` into four columns of the
workbook — "Online hours (estimate)", "Tips (estimate)", "Incentives
(estimate)", "Adjustments (estimate)" — plus a "Total (incl. estimates)" column
that adds three of them to real fares (`route.ts:78-88`, `163-194`).

That is a surface where the `<SampleNote />` badge **cannot travel**. The route
compensates with a header-block row and a prose `ESTIMATES_NOTE`
(`route.ts:72-75, 227-233`), and its comment says why: "A spreadsheet outlives
the screen that made it: a column of invented tips with no marker beside it is
the failure mode this row exists to prevent."

`requirements.md`'s Technical Constraints puts it plainly: *"`src/app/api/
dashboard/hub/earnings/export/route.ts` folds sampled figures into an XLSX where
the badge cannot travel; do not widen that surface."*

So in this route, this task adds **only** the `403`. In particular, do not:

- add the new per-driver `fleet` rows as a second worksheet or extra columns;
- add any sampled per-driver figure (there is no `sampleDriverFacts()` call in
  this route today and there must not be one);
- change `TABLE_HEADERS`, `buildRows`, `addEarningsSheet` or `ESTIMATES_NOTE`.

A per-driver worksheet is a defensible follow-up — built from real columns only,
with its own header-block note — but it is not in this spec, and adding it here
would put fleet data behind the same unbadged-estimates problem the note above
is holding at bay.

### 8. Verification

There are no tests in this spec (`requirements.md`, Non-Goals: "No new tests").
Verify by:

1. `pnpm lint` and `pnpm typecheck` (or the project's equivalents from
   `package.json`) — both must pass clean.
2. `git grep -n "account.companyId !== null"` — your new guards must **not**
   appear in the results. They test `persona`.
3. `git grep -n '"price"\|overtimeFee' src/lib/dashboard/hub/earnings.ts` —
   should return nothing but the existing explanatory comments. If a `_sum`
   mentions either column, the money rule in 6.1 has been broken.
4. Reading `HubEarningsData` and confirming `fleet` is `null` on every
   non-`BUSINESS` path and that nothing new landed inside `sampled`.
5. If the human has provided the three test accounts named in
   `action-required.md`'s "During Implementation" item: hand-type
   `/dashboard/earnings` as the roster driver (expect a redirect to
   `/dashboard/today`), `curl` the export endpoint with that session's cookie
   (expect `403` and the JSON error), and confirm the business account's fleet
   rows sum to its "Gross earnings" tile.

## Acceptance Criteria

- [ ] `HubEarningsData` carries `persona: HubPersona`, set from
      `account.persona` inside `getHubEarnings()`.
- [ ] `HubEarningsData` carries `fleet: HubEarningsFleet | null`, which is
      `null` for every account whose persona is not `BUSINESS` and for a
      `BUSINESS` account whose `companyId` is somehow `null`.
- [ ] `HubEarningsDriverRow` exists and is exported, with `driverId`, `name`,
      `jobsCompleted`, `grossFaresGel`, `averagePerJobGel` and `sharePercent`.
- [ ] `HubEarningsFleet` exists and is exported, with `drivers` and the
      `unassigned` sub-object.
- [ ] `/dashboard/earnings` calls `redirect("/dashboard/today")` when
      `account.persona === "ROSTER"`, placed after the `account === null`
      narrowing and before `searchParams` is awaited.
- [ ] The redirect target is a named module constant with a doc comment, in the
      same shape as `HUB_HOME` in `src/app/dashboard/(hub)/loads/page.tsx`.
- [ ] `GET /api/dashboard/hub/earnings/export` returns `403` with a
      `HubEarningsExportError` body for a `ROSTER` session, placed after the
      existing `account === null` check and before the range is resolved.
- [ ] Neither guard tests `companyId` directly; both test `persona`.
- [ ] The per-driver rollup sums `driverPayout + overtimeDriverPayout` only.
      Neither `price` nor `overtimeFee` nor `serviceLevelAdjustment` appears in
      any `_sum` or any new SQL in this task.
- [ ] The rollup query is scoped by `companyId` and by the same half-open
      `completedAt` window the day series uses, and is **not** additionally
      filtered to the fleet's current roster.
- [ ] Orders with a null `driverId` are reported in `fleet.unassigned` rather
      than dropped, so the breakdown reconciles with `grossFares`.
- [ ] Driver names come from `User.name` via `Order.driverId`, with a fallback
      label for a deleted user, and the name query is skipped entirely when
      there are no driver ids.
- [ ] The fleet query does not run at all for a non-`BUSINESS` account.
- [ ] `hubOrderScopeSql()` in `earnings.ts:249-259` is unchanged, and so are its
      three verbatim twins in `today.ts`, `jobs.ts` and `performance.ts`.
- [ ] `src/app/api/dashboard/hub/earnings/export/route.ts` gains the `403` and
      nothing else — `TABLE_HEADERS`, `buildRows`, `addEarningsSheet`,
      `ESTIMATES_NOTE` and every `sample.ts` import are untouched.
- [ ] Nothing new was added under `HubEarningsData["sampled"]`, and
      `src/lib/dashboard/hub/sample.ts` is unmodified.
- [ ] No Prisma schema change, no migration.
- [ ] The now-false paragraph in `earnings/page.tsx`'s doc comment ("Open to
      both account kinds … so there is no business-only redirect here") is
      rewritten, and `earnings.ts`'s "Real vs sample" header names the new
      `fleet` field.
- [ ] `pnpm lint` and `pnpm typecheck` pass clean.

## Notes

**The export route's sampled surface is a hard boundary.** Repeating it because
it is the single most likely thing to go wrong in this task: the XLSX already
carries four estimated columns and a total that includes them, in a format where
the `<SampleNote />` badge cannot follow. Add the `403` and touch nothing else in
that file's sheet-building code. `requirements.md` names this route explicitly
under Technical Constraints.

**`ROSTER` is unreachable inside `getHubEarnings`, and the type still carries
it.** Both entry points refuse that persona before the loader runs. The variant
stays in `HubPersona` because the axis is closed and a `switch` in a screen
should be exhaustive — but do not add a roster branch to the loader, and do not
"defensively" return zeroes for it. If a roster session ever reaches
`getHubEarnings`, a guard has been deleted and the right outcome is a loud
absence of the screen, not a quietly emptied one.

**Why hide rather than relabel.** Recorded here so it is not relitigated
mid-implementation: a non-currency "work summary" variant of this screen for
roster drivers was considered and rejected in planning. It duplicates My orders,
which is already real and already correct for all three personas, and it keeps a
currency-shaped screen one bad edit away from showing an employee their
employer's money. `action-required.md` carries a human checkbox to confirm this
decision before implementation; the default if nobody acts is "hidden, as
specified".

**`Order.driverId` is a `User` id, not a `DriverProfile` id.** The relation is
`driver User? @relation("DriverDeliveries", fields: [driverId], references:
[id], onDelete: SetNull)`. `drivers.ts` keys its own maps on
`driverProfile.userId` for this reason. Getting this wrong produces a table with
every row named "Former driver" and no type error to warn you.

**Two `Float` columns, so round once at the boundary.** `driverPayout` and
`overtimeDriverPayout` are `Float`; adding them reintroduces binary-fraction
dust. Every money value crossing into the payload goes through the existing
`roundCurrency` in this file. The reconciliation between the fleet rows and
`grossFares` is therefore cent-exact only up to per-row rounding — which is why
task-07 is told to print `data.grossFares` in any total row rather than
re-summing.

**Performance.** One extra `groupBy` and one small `findMany` per BUSINESS
request, both on indexed columns — `@@index([companyId])` and
`@@index([status, driverId, companyId])` both exist on `Order`.
`requirements.md`'s Assumptions record that no new index is needed at the data
volumes in play. Individual accounts pay nothing: `loadFleetRevenue` returns
before it queries.

**A tidy-up you may notice and should leave alone.** There is an empty untracked
directory at `src/app/dashboard/(hub)/earnings 2/` — a macOS copy artefact.
`action-required.md` already lists the copy-artefact clean-up as a human step.
Do not delete it as part of this task and do not put anything in it.
