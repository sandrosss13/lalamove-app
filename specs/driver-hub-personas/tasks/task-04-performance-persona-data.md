# Task 04: Performance persona data

## Status

pending

## Wave

2

## Description

The Performance loader is persona-blind. `HubPerformanceData` carries no
account-shape field at all, so the screen above it cannot tell an independent
driver from a fleet owner even though the two are reading materially different
things: for a driver the five tiles describe one person's week, and for a
business account the very same tiles silently aggregate every driver on the
roster into one anonymous number with no way to see who produced it.

This task adds `persona: HubPersona` to `HubPerformanceData` and builds a
**per-driver acceptance/completion breakdown for `BUSINESS` accounts only**, out
of real `Order` rows — no schema changes, no migrations, no new sample data. It
reuses the per-driver join `src/lib/dashboard/hub/drivers.ts` already performs
for the Drivers roster, so the two screens cannot disagree about how many jobs a
driver did this week.

It is equally a task about what **cannot** be made real. Four of the figures on
this screen are unrecorded rather than merely unaggregated, and every one of the
five period-over-period deltas is invented. Three tiles carry a **real value
under a sampled delta**, and that distinction is the single thing this screen's
existing design is built around. Preserving it exactly — not flattening it in
either direction — is a hard requirement of this task.

## Dependencies

**Depends on:** task-01-hub-persona-model
**Blocks:** task-08-performance-screen-personas

**Context from dependencies:**

task-01 introduces the hub's account-shape axis in
`src/lib/dashboard/hub/account.ts`. After it lands, that module exports:

```ts
export type HubPersona = "INDEPENDENT" | "ROSTER" | "BUSINESS";

export type HubAccountKind = "BUSINESS" | "INDIVIDUAL"; // unchanged, still exported

export type HubAccount = {
  kind: HubAccountKind; // unchanged, still present
  persona: HubPersona; // NEW — added by task-01
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

`persona` is derived once inside `resolveHubAccount()` (which is React-`cache()`d,
so deriving it there costs nothing per request) by exactly this rule:

| Persona | `kind` | `companyId` | Who they are |
|---|---|---|---|
| `INDEPENDENT` | `"INDIVIDUAL"` | `null` | Owns their vehicle, browses the open Load Board, keeps their own fares |
| `ROSTER` | `"INDIVIDUAL"` | set (their **employer**) | Employed driver; work arrives via company dispatch; fares are paid to the employer |
| `BUSINESS` | `"BUSINESS"` | set (their **own** company) | Fleet owner; sees the Drivers and Employees screens |

Two traps this task must not fall into:

- **`companyId !== null` alone is NOT the roster test.** A `BUSINESS` account
  also has a `companyId` — its own company's id. The roster test is
  `kind === "INDIVIDUAL" && companyId !== null`. Getting it backwards would
  classify every fleet owner as an employee.
- **`DriverProfile.accountType` (`DriverAccountType`) is a different axis
  entirely** and must never be used for this. A sole-proprietor driver who
  registered as a business is still `kind: "INDIVIDUAL"` and, with no employer,
  persona `INDEPENDENT`.

Nothing else from task-01 is consumed here. task-01 also re-keys nav visibility
(replacing the `businessOnly` / `rosterHidden` booleans on `HubNavItem` with a
persona-keyed rule) — **Performance stays visible to all three personas**, so no
nav or redirect work belongs in this task.

**What this task hands to task-08** (the Wave-3 task that owns
`performance-screen.tsx` and `performance-format.ts`): `data.persona`, a new
`data.fleet` object that is non-null only for `BUSINESS`, and a `data.sampled`
sub-object whose rating pair is selected by persona. task-08 renders the
breakdown table, rewords the fleet-wrong personal copy and adds the empty state.
**This task renders nothing.**

## Files to Create

None.

## Files to Modify

- `src/lib/dashboard/hub/performance.ts` — add `persona` to
  `HubPerformanceData`; add the `HubPerformanceDriverRow` / `HubPerformanceFleet`
  types and the `BUSINESS`-only per-driver aggregation that fills them; select
  the persona-appropriate sampled rating pair; extend the module doc comment.
- `src/app/dashboard/(hub)/performance/page.tsx` — doc-comment correction only.
  No functional change, no redirect (see **Step 6**).

**Do not modify** any of the following. They belong to sibling tasks running in
the same wave, or to Wave 3, or are shared infrastructure this task has no
business touching:

- `src/lib/dashboard/hub/account.ts` — task-01 owns it and has already landed.
- `src/lib/dashboard/hub/drivers.ts` — **read it, reuse its approach, import
  nothing from it.** See **Step 3**.
- `src/lib/dashboard/hub/today.ts`, `earnings.ts`, `vehicles.ts` — task-02,
  task-03 and task-05 own these *in this same wave*. In particular, do not
  "helpfully" lift `hubOrderScope` into a shared module: it is duplicated
  verbatim across four loaders on purpose (see **Step 2**).
- `src/lib/dashboard/hub/sample.ts` — this task adds **no new sample values**.
  Every constant it needs is already exported.
- `src/components/driver-hub/screens/performance-screen.tsx` and
  `performance-format.ts` — task-08 owns both.
- `src/lib/dashboard/hub/timezone.ts` — read it, use its helpers, change
  nothing.
- `prisma/schema.prisma` — **no schema changes and no migrations in this spec.**

## Technical Details

### 1. The file as it stands today

`src/lib/dashboard/hub/performance.ts` is 361 lines: a long module doc comment
(1-48), imports (49-79), module constants (81-118), the `HubPerformanceDay` type
(120-133), `HubPerformanceData` (135-184), the two tenancy helpers (186-225),
`roundRate` (227-230) and `getHubPerformance()` (232-361).

**`HubPerformanceData` verbatim, exactly as it exists today at lines 135-184.**
Quoted in full because every change below is stated relative to it, and because
the real/sampled split it encodes is the thing this task must preserve:

```ts
export type HubPerformanceData = {
  window: {
    /** Tbilisi `YYYY-MM-DD` of the week's Monday. */
    from: string;
    /** Tbilisi `YYYY-MM-DD` of the week's Sunday. */
    to: string;
    /** Always `HUB_PERFORMANCE_WINDOW_DAYS`. */
    days: number;
    /** Days of the window that have started, Monday through today. */
    daysElapsed: number;
  };
  /**
   * Share of finished jobs that completed rather than cancelled, as a
   * percentage, or `null` when nothing finished this week — a rate with no
   * denominator is not zero, and the screen prints "—" for it.
   */
  completionRatePercent: number | null;
  /** The complement of `completionRatePercent`; `null` on the same condition. */
  cancellationRatePercent: number | null;
  /**
   * Jobs behind both rates.
   *
   * Keyed on `createdAt`, not `completedAt`: `Order` has no `cancelledAt`, so a
   * cancellation cannot be dated by when it happened, and the only timestamp
   * both outcomes share is when the job was booked. Both rates therefore read
   * "of the jobs taken on this week that have since finished, what share
   * completed" — which is a *different* week's-worth of jobs than the bars
   * below, and is stated here because a reader would otherwise assume one.
   */
  finishedJobCount: number;
  /** Completed jobs in the window, dated by `completedAt` — the bars' total. */
  jobsCompleted: number;
  /** `jobsCompleted / window.daysElapsed`, rounded to one decimal. */
  jobsPerDay: number;
  /** Seven entries, Monday first, zero-filled. */
  jobsByDay: readonly HubPerformanceDay[];
  /** Everything below this line is fictional — badge it. */
  sampled: {
    acceptanceRatePercent: number;
    averageRating: number;
    ratedJobCount: number;
    idleMinutesPerHour: number;
    /** The hours half of the "online hours vs jobs completed" chart. */
    onlineHoursWeek: readonly SampleOnlineHoursDay[];
    /** Period-over-period deltas for all five tiles — see the module comment. */
    deltas: Record<SamplePerformanceMetric, SampleMetricDelta>;
    /** The "What affects your score" rows. */
    scoreNotes: readonly SampleScoreNote[];
  };
};
```

The supporting `HubPerformanceDay` at lines 120-133:

```ts
/** One column of the jobs-completed bar chart. */
export type HubPerformanceDay = {
  /** Tbilisi `YYYY-MM-DD`. */
  date: string;
  /** Three-letter Tbilisi weekday; lines up with `SampleOnlineHoursDay.day`. */
  weekday: string;
  jobsCompleted: number;
  /**
   * True for days of this week that have not started yet. A zero on a future
   * day means "not yet", not "nothing was done" — the design dims empty bars,
   * and these deserve dimming for a different reason.
   */
  isFuture: boolean;
};
```

Other landmarks you will need:

- `HUB_PERFORMANCE_WINDOW_DAYS = 7` (line 95). **Do not change it.**
  `today.ts:94` states that its own glance-card completion rate runs over a
  window of the same length so the two screens cannot disagree; task-02 owns
  `today.ts` in this same wave, so a change here would silently break a file you
  are not allowed to edit.
- `TERMINAL_JOB_STATUSES = [OrderStatus.COMPLETED, OrderStatus.CANCELLED]`
  (line 105). Reuse it — do not spell the array out again.
- `roundRate(value)` (lines 227-230): `Math.round(value * 10) / 10`, "one decimal
  place, the precision the design's rate figures are shown at". Every new rate
  and every new per-day average goes through it.
- `UNMATCHABLE_COMPANY_ID` (line 85).
- The existing sample imports at lines 54-68.

### 2. The tenancy boundary — read before writing a single query

`hubOrderScope()` at lines 197-208 is the clause that scopes every `Order` query
in this file to the signed-in account:

```ts
function hubOrderScope(account: HubAccount): Prisma.OrderWhereInput {
  if (account.kind === "BUSINESS") {
    // `{ companyId: null }` reads as `IS NULL` in Prisma, which would match
    // every unclaimed order on the platform. `resolveHubAccount` always sets
    // `companyId` for a BUSINESS so this branch is unreachable, but the type
    // permits null and the failure mode is a cross-tenant read rather than an
    // error, so it fails closed instead of being asserted away.
    return { companyId: account.companyId ?? UNMATCHABLE_COMPANY_ID };
  }

  return { driverId: account.userId };
}
```

with a SQL twin, `hubOrderScopeSql()` at lines 219-225, for the one raw query
that Prisma's `groupBy` cannot express.

Rules:

- **Do not change either function.** They are duplicated verbatim in `today.ts`,
  `jobs.ts` and (as SQL) `earnings.ts`. Three of those four files are owned by
  other tasks in this same wave; changing the clause here would leave the four
  copies out of step. Nothing in this task needs it changed.
- **Do not switch either function's `account.kind === "BUSINESS"` test to
  `account.persona === "BUSINESS"`.** The two are equivalent by construction, and
  a gratuitous edit to the tenancy boundary is exactly the kind of change that
  should never appear in a diff that is nominally about adding a field. Read
  `persona` where you branch on *product* behaviour; leave `kind` where it
  guards *data access*.
- Every new query this task adds must carry `companyId` in its `where`, not just
  a driver-id list. See **Step 3** for why that is a correctness requirement and
  not a nicety.

### 3. The per-driver aggregation — what `drivers.ts` already does, and why

`src/lib/dashboard/hub/drivers.ts` (`getHubDrivers()`, lines 271-467) already
performs a per-driver `Order` join for the Drivers roster. **Read it before
writing this step.** The pattern to reuse, in its own words:

1. **Roster first.** `prisma.driverProfile.findMany({ where: { companyId }, … })`
   (line 284), then `const driverUserIds = rawDrivers.map((d) => d.userId)`
   (line 315). Every aggregate afterwards is keyed off those ids.
2. **Every aggregate is filtered by `companyId` *as well as* by the user ids.**
   The module comment at lines 30-34 gives the reason and it applies verbatim
   here: *"`Order.driverId` outlives a driver's membership of a roster
   (`DriverProfile.companyId` is nullable and set null on removal), so without
   the company filter a driver who moved here from another fleet — or from
   independent work — would drag their old volume and earnings onto this page."*
   A per-driver completion rate computed without the `companyId` filter would be
   a cross-tenant read of another fleet's outcomes. **This is not optional.**
3. **The same Monday-anchored Tbilisi week.** `drivers.ts:318` uses
   `startOfHubWeek(new Date())` and comments that it is *"the same
   Monday-anchored Tbilisi week the Performance bars run over, so a driver's
   'jobs this week' here and their bars there count the same jobs."* This file
   already computes `weekStart` the same way at line 249. Use the one this
   function already has — do not call `startOfHubWeek` a second time, because
   the existing code deliberately derives both bounds from a single `now` (see
   the comment at lines 245-246) so a request crossing Tbilisi midnight cannot
   count its rates against one week and its bars against another.
4. **Grouped rows become a `Map`, keyed by `userId`, read with a `?? 0`
   fallback** (`drivers.ts:369-374, 439-441`), so a driver with no orders gets a
   real zero rather than being dropped from the list.
5. **`row.driverId` narrows with an explicit null check.** `drivers.ts:378-382`:
   *"`driverId: { in: [...] }` already excludes nulls; the check is what narrows
   the type so it can key the map without a cast."* Prisma still types the
   grouped `driverId` as `string | null`. Do the same — `continue`, never a
   non-null assertion.

**Do not import anything from `drivers.ts`.** `getHubDrivers()` returns `null`
for a non-business account, fetches licences, applications, assignments and
all-time earnings, and is a materially heavier query than this screen needs.
Reuse the *approach*, not the function.

### 4. What is real and what is not — the exact inventory

This is the part of the task that is easiest to get wrong, so it is stated
exhaustively. **Nothing in the "cannot be real" column may be made real, moved
out of `sampled`, or quietly recomputed.**

#### 4a. Real today, and staying real (all persona-agnostic)

| Field | Source |
|---|---|
| `completionRatePercent` | `groupBy` over `Order.status` in `TERMINAL_JOB_STATUSES`, keyed on `createdAt` within the Tbilisi week |
| `cancellationRatePercent` | the complement of the same `groupBy` |
| `finishedJobCount` | `completedCount + cancelledCount` from that same `groupBy` |
| `jobsCompleted` | the raw-SQL daily series, keyed on `completedAt` |
| `jobsPerDay` | `jobsCompleted / window.daysElapsed` |
| `jobsByDay[].jobsCompleted` | the same daily series, zero-filled across seven days |
| `window.*` | pure Tbilisi calendar arithmetic |

#### 4b. New, and real — added by this task

Everything under `fleet` (**Step 5**) is derived from `Order.status`,
`Order.createdAt`, `Order.completedAt`, `Order.driverId` and `Order.companyId`.
There is **no `sampled` sub-object on a fleet row** and none may be added — see
**Step 5c** for the specific trap.

#### 4c. Cannot be made real without a schema change — must stay sampled

| Value | Blocked on | Already documented at |
|---|---|---|
| `sampled.acceptanceRatePercent` | a **`JobOffer`** model holding every dispatch and its outcome. `Order` only ever stores the offer that was *taken*; a declined offer leaves no row, so acceptance is **unrecorded**, not merely unaggregated | `sample.ts:114-122` |
| `sampled.averageRating`, `sampled.ratedJobCount` | an **`OrderRating`** model (one score per completed order). Nothing in the schema captures customer feedback at all | `sample.ts:124-132` |
| `sampled.idleMinutesPerHour` | an **`OnlineSession`** model to supply the denominator | `sample.ts:134-141` |
| `sampled.onlineHoursWeek` (the entire online-hours series) | the same **`OnlineSession`** model, bucketed by Tbilisi day. `DriverProfile.isOnline` is a single boolean with no history behind it, so **no duration can be computed from it at all** | `sample.ts:94-108`, `sample.ts:50-56` |
| `sampled.scoreNotes` | the metrics each row describes, plus policy thresholds ("above 5% pauses incentives") the product has not written down anywhere the code can read | `sample.ts:190-196` |
| **every one of the five `sampled.deltas`** | a **`DriverMetricSnapshot`** model storing each metric per driver per week | `sample.ts:157-167` |

#### 4d. The distinction that must survive this task intact

`SAMPLE_PERFORMANCE_DELTAS` (`sample.ts:168-179`) covers **all five tiles**,
including the three whose *current value is real*. The module doc comment at
`performance.ts:39-43` states it:

> Note that **every** period-over-period delta is sampled, including the deltas
> on the three tiles whose current value is real. A delta needs last week's
> value held somewhere comparable, and recomputing it would be a second full
> aggregation on every request.

So the screen has three categories, not two:

| Tile | Value | Delta |
|---|---|---|
| Acceptance | **sampled** | sampled |
| Completion | **real** | sampled |
| Cancellations | **real** | sampled |
| Avg rating | **sampled** | sampled |
| Jobs per day | **real** | sampled |

`performance-screen.tsx:33-54` builds its whole badging scheme on that split:
a fully-sampled tile carries the ordinary `<SampleNote />` reading "Sample
data", while a real-value tile carries a narrower badge reading **"Estimated
delta"** placed *below* the progress track, because the track measures the real
value and only the line under it is invented.

**Do not flatten this in either direction.** Concretely, this task must not:

- move `completionRatePercent`, `cancellationRatePercent` or `jobsPerDay` under
  `sampled` because their deltas are sampled;
- lift `deltas` out of `sampled` because three of the five values it accompanies
  are real;
- add a second, "real" delta for the three real metrics by running a second
  aggregation over last week — that is precisely the cost `sample.ts:157-167`
  declined to pay, and the decision is not this task's to reverse;
- collapse `deltas` to a single shape shared by all five tiles.

The `deltas` record stays exactly as it is: `Record<SamplePerformanceMetric,
SampleMetricDelta>` where `SamplePerformanceMetric` is
`"acceptance" | "completion" | "cancellations" | "rating" | "jobsPerDay"`.

### 5. `HubPerformanceData` — the exact changes

#### 5a. Two new exported types, placed immediately after `HubPerformanceDay`

```ts
/**
 * One row of the fleet breakdown: what a single driver on this company's roster
 * did with the week.
 *
 * **Every field on this type is real.** There is deliberately no `sampled`
 * sub-object here, and one must not be added — see the note on the fleet type
 * below for the specific trap.
 *
 * The two windows this screen already carries are reproduced per driver rather
 * than reconciled: `completionRatePercent` and `cancellationRatePercent` count
 * jobs by when they were *booked* (`createdAt`), because `Order` has no
 * `cancelledAt` and a cancellation can only be dated by its booking; while
 * `jobsCompleted` counts by when the job *finished* (`completedAt`), so this
 * column and the chart above it describe the same set of jobs. A row where the
 * two disagree is not a bug — it is a driver who finished last week's work.
 */
export type HubPerformanceDriverRow = {
  /**
   * `User.id`. The same key `HubDriver.userId` carries on the Drivers screen,
   * so an operator can line the two tables up, and the same key
   * `Order.driverId` holds.
   */
  userId: string;
  /** `User.name`, the display name the Drivers roster shows. */
  name: string;
  /** COMPLETED orders booked this week for this company. */
  completedCount: number;
  /** CANCELLED orders booked this week for this company. */
  cancelledCount: number;
  /** `completedCount + cancelledCount` — the denominator of both rates below. */
  finishedJobCount: number;
  /**
   * Share of this driver's finished jobs that completed, as a percentage, or
   * `null` when nothing of theirs finished this week.
   *
   * `null` rather than `0` for exactly the reason the fleet-level field gives:
   * a rate with no denominator is not zero, and printing 0% would tell an
   * operator that every job this driver took failed, when in fact they took
   * none. The screen prints an em dash.
   */
  completionRatePercent: number | null;
  /** The complement of `completionRatePercent`; `null` on the same condition. */
  cancellationRatePercent: number | null;
  /** COMPLETED orders this week dated by `completedAt` — the chart's basis. */
  jobsCompleted: number;
  /**
   * `jobsCompleted / window.daysElapsed`, one decimal — divided by the days
   * *elapsed*, not by seven, exactly as the fleet figure is, so the column does
   * not sag every Monday for reasons that have nothing to do with the driver.
   */
  jobsPerDay: number;
};

/**
 * The BUSINESS-only per-driver breakdown of everything the tiles above it
 * aggregate.
 *
 * Non-null only for `persona === "BUSINESS"`. A driver-shaped account — either
 * `INDEPENDENT` or `ROSTER` — gets `null`, not an empty object: there is no
 * fleet to break down, and `null` is the answer that makes a screen branch on
 * the fact rather than on an empty array that could equally mean "a fleet with
 * nobody on it".
 */
export type HubPerformanceFleet = {
  /**
   * Every driver currently on this company's roster, including those who did
   * nothing this week — a row of em dashes is the actionable signal an operator
   * came for, and dropping it would make an idle driver indistinguishable from
   * one who left.
   *
   * Ordered busiest first (`finishedJobCount` descending), ties broken by name.
   * The order is fixed here rather than left to the screen because the table
   * this feeds carries no sort control.
   */
  drivers: readonly HubPerformanceDriverRow[];
  /**
   * Finished jobs this week that this company holds but that **no row above
   * accounts for**.
   *
   * Two things land here, and neither is an error. An order the company claimed
   * but never dispatched has `driverId: null` and belongs to nobody. An order
   * carried by a driver who has since left the roster keeps its `driverId`
   * (`DriverProfile.companyId` is set null on removal, `Order.driverId` is
   * not), and that user is no longer in the roster query above.
   *
   * It exists so the table can say out loud that its rows do not add up to the
   * tiles. Without it a reader sums the rows, finds a smaller number than the
   * fleet's own `finishedJobCount`, and concludes the screen is broken.
   *
   * Computed by subtraction from figures this function already has, so it costs
   * no extra query, and it cannot go negative: the row set is a strict subset
   * of the same window and the same company scope.
   */
  unattributedFinishedJobCount: number;
};
```

#### 5b. `HubPerformanceData` gains two fields

Add `persona` as the **first** field of the type, above `window`, and `fleet`
immediately after `jobsByDay` and before `sampled`. Nothing else in the type
changes — no field is renamed, removed or moved out of `sampled`.

```ts
export type HubPerformanceData = {
  /**
   * Which account shape is reading this screen. Derived once in
   * `resolveHubAccount()` and carried here so the screen can branch at all —
   * before this field existed, Performance was byte-identical for an
   * independent driver, an employed one and a fleet owner.
   */
  persona: HubPersona;
  window: {
    /* …unchanged… */
  };
  /* …completionRatePercent, cancellationRatePercent, finishedJobCount,
     jobsCompleted, jobsPerDay, jobsByDay all unchanged… */
  /**
   * The per-driver breakdown behind the fleet figures above. Real data, and
   * non-null only for `persona === "BUSINESS"`.
   */
  fleet: HubPerformanceFleet | null;
  /** Everything below this line is fictional — badge it. */
  sampled: {
    /* …unchanged shape; see step 5d for the one persona-keyed value… */
  };
};
```

Add the type import at the top of the file, alongside the existing
`import type { HubAccount } from "@/lib/dashboard/hub/account";` on line 53:

```ts
import type { HubAccount, HubPersona } from "@/lib/dashboard/hub/account";
```

#### 5c. The trap: no sampled column on a fleet row

It is tempting to give each row an acceptance rate, since the Drivers screen has
a per-driver one. **Do not.** `sampleDriverFacts(driverProfileId)`
(`sample.ts:761-763`) looks up `SAMPLE_DRIVER_FACTS` by `DriverProfile.id` and
falls through to `SAMPLE_DRIVER_FACTS_FALLBACK` (`sample.ts:662-666`):

```ts
export const SAMPLE_DRIVER_FACTS_FALLBACK: SampleDriverFacts = {
  rating: null,
  acceptanceRatePercent: 0,
  verification: SAMPLE_DRIVER_VERIFICATION_FALLBACK,
};
```

The keys in `SAMPLE_DRIVER_FACTS` are handoff display ids (`"GE-88214"`) that no
real database contains, so in any real fleet **every lookup misses**. `rating`
falls back to `null`, which prints an honest em dash — that is why the Drivers
roster can show it. `acceptanceRatePercent` falls back to **`0`**, which would
print a confident, specific, wrong `0%` against every named driver on the
roster. A fabricated rating is bad; a fabricated *zero* attached to a real
person's name on a screen their employer uses to evaluate them is worse.

So: **the fleet table is real-only.** No `sampled` sub-object on the row type,
no sample import in the fleet code path, and consequently no `<SampleNote />`
anywhere on the table when task-08 renders it. That property is worth stating in
the row type's doc comment, because it is the only fully-real surface on this
screen.

#### 5d. The one persona-keyed sampled value

`sampled.averageRating` / `sampled.ratedJobCount` currently always carry
`SAMPLE_AVG_RATING` (4.86) and `SAMPLE_RATED_JOB_COUNT` (61) — *one driver's*
rating over *one driver's* rated jobs. For a fleet owner that is a category
error: a company is not rated, its drivers are.

`sample.ts` already exports the fleet-shaped pair, used today by the Drivers
screen's third tile (`drivers.ts:462-463`):

```ts
export const SAMPLE_FLEET_AVG_RATING = 4.76;
export const SAMPLE_FLEET_RATED_JOB_COUNT = 214;
```

For `persona === "BUSINESS"`, supply those two instead. This is a **reword, not
a new invention**: the constants exist, they are already badged where they are
already shown, and using them means the Performance screen and the Drivers
screen quote the same fleet rating rather than two different numbers.

It is routed through the loader rather than imported directly by the screen
because `performance-screen.tsx` reads every fictional value through
`data.sampled` and its doc comment depends on that being true — `sample.ts` is
deliberately not `server-only` and client screens *may* import it (see
`sample.ts:18-23`), but this screen's honesty scheme is "type the word `sampled`
on the way to any invented number", and a direct import would put a fictional
constant in the component that does not.

Document the asymmetry where it happens, because it is the only field on
`sampled` whose meaning depends on persona:

```ts
    // The only persona-keyed value in this sub-object. A fleet is not rated;
    // its drivers are, so a BUSINESS account reads the fleet-wide pair the
    // Drivers screen already shows rather than one driver's 4.86 over one
    // driver's 61 jobs. Both pairs are equally fictional and both retire with
    // the same `OrderRating` model — this picks the one that is fictional about
    // the right subject.
    averageRating: isBusiness ? SAMPLE_FLEET_AVG_RATING : SAMPLE_AVG_RATING,
    ratedJobCount: isBusiness
      ? SAMPLE_FLEET_RATED_JOB_COUNT
      : SAMPLE_RATED_JOB_COUNT,
```

#### 5e. Everything else on `sampled` stays uniform across all three personas

`acceptanceRatePercent`, `idleMinutesPerHour`, `onlineHoursWeek`, `deltas` and
`scoreNotes` are supplied unchanged for every persona, including `BUSINESS`.

That is deliberate and task-08 depends on knowing it. Several of these are
meaningless for a fleet — an online-hours series for an account that has no
`DriverProfile` and therefore no `isOnline` boolean at all; a "What affects your
score" card whose rows coach an individual driver to move to Vake between 09:00
and 11:00 — and **task-08 will decline to render them for `BUSINESS`.** Hiding
a persona-meaningless sampled card is a render decision, per the spec's rule
that such a card is *hidden*, not made real.

Keeping the loader's output uniform costs nothing (these are module constants,
not queries), keeps `HubPerformanceData` a single non-conditional shape, and
avoids a second, subtler failure mode: a `sampled` sub-object whose fields go
empty by persona invites a screen to branch on `onlineHoursWeek.length === 0`
instead of on `persona`, which would then also fire if the constant were ever
edited down to nothing.

### 6. `performance/page.tsx` — doc comment only

The page is 39 lines. It resolves the account, returns `null` when there is
none, calls `getHubPerformance(account)` and renders
`<PerformanceScreen data={data} />`.

**No functional change is required and none should be made:**

- **No redirect.** Performance is visible to all three personas. The nav (after
  task-01) keeps the entry for all three, and there is nothing to guard.
- **No new prop.** `persona` reaches the screen inside `data`, so the
  `<PerformanceScreen data={data} />` call at line 38 is already correct.
  Do not add an `account={account}` prop — the screen is a `"use client"`
  component and `HubAccount` carries fields (`userId`, `driverProfileId`,
  `companyId`) it has no use for.
- The `account === null` early return at lines 32-34 stays exactly as it is. Its
  comment already explains that a null account cannot reach this route — the
  `(hub)` layout renders its own "profile isn't set up yet" fallback instead of
  these children — and that the check is the narrowing TypeScript still needs.

Two sentences in the doc comment (lines 14-28) are now wrong and should be
corrected, since this task is the one that makes them wrong:

- Line 16 says *"the current Monday–Sunday **UTC** week"*. It has not been UTC
  since the hub was unified on `Asia/Tbilisi`; `performance.ts` anchors the week
  to Tbilisi midnight (see its module comment at lines 25-29 and
  `@/lib/dashboard/hub/timezone`). Change "UTC" to "Tbilisi".
- Lines 18-20 say *"Open to both account kinds — a fleet's numbers are its
  orders' numbers, and `getHubPerformance()` resolves that scope difference
  itself, so there is no business-only redirect here."* Reword for three
  personas: the screen is open to all of `INDEPENDENT`, `ROSTER` and `BUSINESS`;
  `getHubPerformance()` resolves both the tenancy scope and the persona shape
  itself; a business account additionally gets the per-driver breakdown; there
  is still no redirect here.

### 7. Implementation steps

1. **Read** `src/lib/dashboard/hub/performance.ts` end to end, then
   `src/lib/dashboard/hub/drivers.ts` lines 264-467 (`getHubDrivers`), then
   `src/lib/dashboard/hub/sample.ts` lines 30-222 and 602-773. Do not start
   writing until you have.
2. **Extend the imports.** Add `HubPersona` to the existing type import from
   `@/lib/dashboard/hub/account` (line 53). Add `SAMPLE_FLEET_AVG_RATING` and
   `SAMPLE_FLEET_RATED_JOB_COUNT` to the existing value import from
   `@/lib/dashboard/hub/sample` (lines 54-62), keeping it alphabetically sorted
   as it currently is.
3. **Add the two new exported types** (`HubPerformanceDriverRow`,
   `HubPerformanceFleet`) after `HubPerformanceDay`, with the doc comments from
   **Step 5a**.
4. **Add `persona` and `fleet` to `HubPerformanceData`** per **Step 5b**.
5. **Add a private fleet loader** below `roundRate` and above
   `getHubPerformance`. Suggested shape — the doc comment is not optional, this
   codebase's comments explain *why*, at length, in full sentences:

   ```ts
   /**
    * The roster's own counts, for the BUSINESS breakdown table.
    *
    * Structured exactly as `drivers.ts` structures the Drivers screen: the
    * roster is fetched first because every aggregate after it is keyed off the
    * user ids it returns, and every aggregate carries `companyId` as well as
    * those ids. The second filter is not redundant — `Order.driverId` outlives
    * a driver's membership of a roster, because removing a driver nulls
    * `DriverProfile.companyId` and leaves the orders they carried pointing at
    * them. Without it, a driver who moved here from another fleet would drag
    * that fleet's outcomes onto this company's screen, which is a cross-tenant
    * read.
    *
    * Returns raw counts only. `jobsPerDay` is finished by the caller, which is
    * where `window.daysElapsed` is known — and dividing there rather than here
    * is what guarantees the rows and the tiles above them use the same divisor.
    */
   async function loadFleetDriverCounts(
     companyId: string,
     weekStart: Date,
     weekEndExclusive: Date,
   ): Promise<{
     userId: string;
     name: string;
     completedCount: number;
     cancelledCount: number;
     jobsCompleted: number;
   }[]> {
     const roster = await prisma.driverProfile.findMany({
       where: { companyId },
       select: { userId: true, user: { select: { name: true } } },
       orderBy: { createdAt: "asc" },
     });

     const driverUserIds = roster.map((driver) => driver.userId);

     const [terminalRows, completedRows] = await Promise.all([
       // Both outcomes in one pass, keyed on `createdAt` — the window both
       // rates run over, because `Order` has no `cancelledAt` and a
       // cancellation can only be dated by when the job was booked.
       prisma.order.groupBy({
         by: ["driverId", "status"],
         where: {
           companyId,
           driverId: { in: driverUserIds },
           status: { in: TERMINAL_JOB_STATUSES },
           createdAt: { gte: weekStart, lt: weekEndExclusive },
         },
         _count: { _all: true },
       }),
       // Keyed on `completedAt` instead, so this column counts the same jobs
       // the chart above the table draws.
       prisma.order.groupBy({
         by: ["driverId"],
         where: {
           companyId,
           driverId: { in: driverUserIds },
           status: OrderStatus.COMPLETED,
           completedAt: { gte: weekStart, lt: weekEndExclusive },
         },
         _count: { _all: true },
       }),
     ]);

     const completedByDriver = new Map<string, number>();
     const cancelledByDriver = new Map<string, number>();
     for (const row of terminalRows) {
       // `driverId: { in: [...] }` already excludes nulls; the check is what
       // narrows the type so it can key the map without a cast.
       if (row.driverId === null) {
         continue;
       }

       const target =
         row.status === OrderStatus.COMPLETED
           ? completedByDriver
           : cancelledByDriver;
       target.set(row.driverId, (target.get(row.driverId) ?? 0) + row._count._all);
     }

     const jobsCompletedByDriver = new Map<string, number>();
     for (const row of completedRows) {
       if (row.driverId === null) {
         continue;
       }

       jobsCompletedByDriver.set(row.driverId, row._count._all);
     }

     return roster.map((driver) => ({
       userId: driver.userId,
       name: driver.user.name,
       completedCount: completedByDriver.get(driver.userId) ?? 0,
       cancelledCount: cancelledByDriver.get(driver.userId) ?? 0,
       jobsCompleted: jobsCompletedByDriver.get(driver.userId) ?? 0,
     }));
   }
   ```

   Notes on this sketch:
   - `by: ["driverId", "status"]` returns at most two rows per driver, so the
     accumulate-into-a-map loop is what folds them; do not assume one row per
     driver.
   - An empty roster yields `driverUserIds = []`. Prisma renders `in: []` as a
     predicate that matches nothing, so both `groupBy` calls return `[]` and the
     function returns `[]`. That is correct and needs no short-circuit — but if
     you add one, it must still return `[]` rather than skipping the caller's
     `fleet` object entirely (a fleet with nobody on it is a renderable state,
     exactly as `drivers.ts:268-269` says of its own empty roster).
   - `roster` is ordered `createdAt: "asc"` only so the query is deterministic;
     the display order is applied by the caller.

6. **Wire it into `getHubPerformance()`.** The existing body (lines 240-361)
   computes `scope`, `now`, `startOfToday`, `weekStart`, `weekEndExclusive`,
   then awaits `Promise.all([terminalCounts, dayRows])`, then runs the
   seven-day fill loop, then returns.

   - Derive the persona flag once, near the top:

     ```ts
     // Both halves are load-bearing: `persona` is the product rule, and the
     // null check is what lets `companyId` narrow to a string for the roster
     // query. A BUSINESS account always has a `companyId`, but the type permits
     // null and this fails closed rather than asserting it away — the same
     // shape `getHubDrivers()` uses.
     const { companyId } = account;
     const fleetCompanyId =
       account.persona === "BUSINESS" && companyId !== null ? companyId : null;
     ```

   - Add the fleet query as a **third entry in the existing `Promise.all`**, so
     it runs alongside the two queries already there rather than adding a
     serial round-trip:

     ```ts
     const [terminalCounts, dayRows, fleetDriverCounts] = await Promise.all([
       /* …the existing groupBy, unchanged… */
       /* …the existing $queryRaw, unchanged… */
       fleetCompanyId === null
         ? Promise.resolve(null)
         : loadFleetDriverCounts(fleetCompanyId, weekStart, weekEndExclusive),
     ]);
     ```

   - After the seven-day loop (so `daysElapsed` is known), build the fleet
     object:

     ```ts
     const fleet: HubPerformanceFleet | null =
       fleetDriverCounts === null
         ? null
         : (() => {
             const drivers = fleetDriverCounts
               .map((row) => {
                 const rowFinished = row.completedCount + row.cancelledCount;

                 return {
                   userId: row.userId,
                   name: row.name,
                   completedCount: row.completedCount,
                   cancelledCount: row.cancelledCount,
                   finishedJobCount: rowFinished,
                   completionRatePercent:
                     rowFinished === 0
                       ? null
                       : roundRate((row.completedCount / rowFinished) * 100),
                   cancellationRatePercent:
                     rowFinished === 0
                       ? null
                       : roundRate((row.cancelledCount / rowFinished) * 100),
                   jobsCompleted: row.jobsCompleted,
                   // The same divisor the fleet tile uses, so a reader can add
                   // the column up and land near the tile above it.
                   jobsPerDay: roundRate(row.jobsCompleted / daysElapsed),
                 };
               })
               // Busiest first: an operator scans for who carried the week and
               // who did not move. The locale is pinned for the same reason
               // every formatter in this hub pins one — an unpinned
               // `localeCompare` reads the host's locale, which would make the
               // row order depend on which machine the deploy landed on.
               .sort(
                 (a, b) =>
                   b.finishedJobCount - a.finishedJobCount ||
                   a.name.localeCompare(b.name, "en-GB"),
               );

             const attributed = drivers.reduce(
               (total, row) => total + row.finishedJobCount,
               0,
             );

             return {
               drivers,
               // Cannot go negative: the rows are a strict subset of the same
               // company, the same statuses and the same window as
               // `finishedJobCount` above.
               unattributedFinishedJobCount: finishedJobCount - attributed,
             };
           })();
     ```

     An `if`/`else` over a mutable `let` is equally acceptable if you find the
     IIFE unidiomatic — this codebase does not use IIFEs elsewhere in these
     loaders, so a plain `let fleet: HubPerformanceFleet | null = null;`
     followed by an `if (fleetDriverCounts !== null) { … }` is probably the
     better match for the surrounding style. The arithmetic is what matters.

   - Add `persona: account.persona` and `fleet` to the returned object
     (currently lines 328-360), and apply the persona-keyed rating pair inside
     the `sampled` block (currently lines 351-359) per **Step 5d**.

7. **Extend the module doc comment.** The "Real vs sample" section at lines
   31-43 currently says *"Everything at the top level of `HubPerformanceData` is
   derived from `Order.status`."* That is still true and now also covers
   `fleet`, so add a short paragraph saying so explicitly — the fleet table is
   the only surface on this screen with no sampled value anywhere in it, and
   that is worth stating where a future reader will look for it. Also note the
   one persona-keyed exception inside `sampled` (the rating pair), because a
   reader of `sampled` will otherwise assume the whole sub-object is constant.

8. **Verify.** Run the project's checks:

   ```bash
   pnpm lint
   pnpm typecheck
   ```

   Both must pass clean. This spec adds no tests (see `requirements.md`,
   Non-Goals). If neither script exists under those names, read `package.json`
   and run the project's equivalents.

### 8. The zero-data problem — flagged, and the decision on it

**Read this section before implementing; it tells you what NOT to do as much as
what to do.**

Sampled constants never degrade. They are module-level literals with no
dependency on the account reading them, so a brand-new account with zero orders
sees them at full strength beside real fields that correctly report nothing.
Concretely, today, on a fresh account:

| Surface | What it shows with zero data | Real? |
|---|---|---|
| Acceptance tile | `94%`, "Of the jobs offered to you" | sampled |
| Completion tile | `—`, *"No jobs have finished yet this week"* | real |
| Cancellations tile | `—`, *"No jobs have finished yet this week"* | real |
| Avg rating tile | `4.86`, "From `61` rated jobs" | sampled |
| Jobs per day tile | `0`, "Across N days so far" | real |
| The paired chart | sampled hours bars (`7.2h`, `8.6h`, `6.4h`, `9.1h`, …) drawn to full height above real jobs bars flattened to the 3px, 12%-opacity sliver `HubBarChart` draws for an empty value | half and half |
| "What affects your score" | `94%`, `2.1%`, `4.86`, `38 min/h`, and the body text *"Two cancellations this week, both before pickup."* | sampled |

That last row is the sharpest: `SAMPLE_SCORE_NOTES` (`sample.ts:197-222`) does
not merely show a number, it asserts a specific fact — two cancellations, both
before pickup — about a driver who has not taken a job. The `<SampleNote />`
badge is present and correct on every one of these, and it is still a screen
where the fabricated half looks confident and the true half looks broken.

**The decision, stated explicitly as the spec brief requires: this task does NOT
gate sampled values on the presence of real data, and no implementer of this
spec should add such a gate.** Four reasons:

1. **The trigger is account age, not persona.** A fresh account is the
   onboarding state, and `requirements.md` lists *"No unactivated / suspended /
   onboarding states"* as an explicit non-goal, noting it is a real P0 gap that
   *"is orthogonal to persona differentiation and belongs in its own spec"*. A
   zero-data gate is that spec's work, not this one's.
2. **It would change all three personas, including `INDEPENDENT`.** Everything
   else this spec does to Performance is persona-keyed. A zero-data gate would
   silently alter the screen for the persona this spec otherwise leaves
   functionally untouched, inside a diff labelled "personas" — the kind of
   change a reviewer cannot see the boundary of.
3. **Hiding a sampled value at zero is a *stronger* claim than the badge makes,
   not a weaker one.** "Sample data · 94%" says "this figure is invented".
   An Acceptance tile that vanishes for a new driver and appears for an
   established one says "this figure is measured, and we have not measured yours
   yet" — which is false. The `<SampleNote />` convention exists precisely so a
   placeholder does not have to be conditionally hidden to stay honest.
4. **The `sampled` values are constants, and the retirement path is deletion,
   not suppression.** Each export in `sample.ts` names the model that retires it;
   when `OnlineSession` or `JobOffer` lands, the export is deleted and the type
   errors point at every call site. A zero-data branch would be extra code to
   unpick at exactly that moment.

**What this task does do about it, incidentally and only for `BUSINESS`:** the
persona work removes three of the worst offenders for a fleet owner, because
they are persona-wrong independently of whether any data exists. task-08 drops
the "What affects your score" card and the sampled online-hours series for
`BUSINESS`, and this task swaps the personal rating pair for the fleet one. What
survives for a zero-data `BUSINESS` account is the Acceptance tile alone. For
`INDEPENDENT` and `ROSTER` the problem is untouched, by design.

**For the follow-up spec, so the work is not re-derived:** the cheap, single
-place implementation is a boolean on `HubPerformanceData` — something like
`hasRealSignalThisWeek: finishedJobCount > 0 || jobsCompleted > 0` — computed in
this loader from figures it already holds, with the screen suppressing the
fully-sampled tiles and the score-notes card when it is false. **Do not add that
field in this task.** A field nothing reads is dead code, and the decision above
is that nothing should read it yet. Record it in
`specs/driver-hub-personas/action-required.md` under *After Implementation*
instead, alongside the other deferred P0/P1 gaps already listed there.

### 9. House conventions this task is bound by

- **Server-only.** `performance.ts` starts with `import "server-only";` (line
  49). Keep it.
- **Plain serialisable data only.** The returned object crosses into a
  `"use client"` tree. **No `Date`, no Prisma model instance, no `Decimal`.**
  Every date leaves as a `YYYY-MM-DD` string and every number leaves unformatted
  for the screen to present. The new fleet types contain only `string` and
  `number | null` for exactly this reason — note that `HubPerformanceDriverRow`
  deliberately carries no timestamp at all.
- **No new sample data.** Everything sampled here already exists in `sample.ts`.
  If you find yourself wanting a new constant, you have made something up that
  should have stayed unbuilt.
- **No Prisma schema changes, no migrations.**
- **Comments explain *why*, at length, in full sentences.** Match the register of
  the file you are editing; it is one of the most heavily commented modules in
  the codebase and a terse addition will read as someone else's code.
- **Do not weaken `hubOrderScope` / `hubOrderScopeSql`.** See **Step 2**.

## Acceptance Criteria

- [ ] `HubPerformanceData` carries `persona: HubPersona`, populated from
      `account.persona`, with no ad-hoc re-derivation of the persona anywhere in
      this file.
- [ ] `HubPerformanceDriverRow` and `HubPerformanceFleet` are exported from
      `src/lib/dashboard/hub/performance.ts`.
- [ ] `HubPerformanceData.fleet` is non-null for a `BUSINESS` account and `null`
      for `INDEPENDENT` and `ROSTER`.
- [ ] A `BUSINESS` account with an empty roster gets `fleet` non-null with
      `drivers: []` — not `fleet: null`.
- [ ] Every field on `HubPerformanceDriverRow` is derived from real `Order` rows.
      `git grep -n "sample" src/lib/dashboard/hub/performance.ts` shows no sample
      import reached from the fleet code path, and the row type has no `sampled`
      sub-object.
- [ ] Both per-driver rates are `null` — never `0` — when that driver's
      `finishedJobCount` is `0`.
- [ ] Every per-driver `Order` query filters on `companyId` **as well as** the
      roster's user ids, so a driver who transferred from another fleet cannot
      drag their previous employer's outcomes onto this screen.
- [ ] Per-driver rates are keyed on `createdAt` and the per-driver
      `jobsCompleted` on `completedAt`, matching the two windows the fleet-level
      figures already use.
- [ ] `unattributedFinishedJobCount` equals the fleet's `finishedJobCount` minus
      the sum of the rows' `finishedJobCount`, and is `0` for a fleet whose every
      finished job this week was carried by a current roster member.
- [ ] Per-driver `jobsPerDay` divides by `window.daysElapsed`, the same divisor
      the fleet tile uses, not by `HUB_PERFORMANCE_WINDOW_DAYS`.
- [ ] Fleet rows are ordered `finishedJobCount` descending, ties broken by name
      with a pinned locale.
- [ ] `sampled.averageRating` / `sampled.ratedJobCount` carry
      `SAMPLE_FLEET_AVG_RATING` / `SAMPLE_FLEET_RATED_JOB_COUNT` for `BUSINESS`
      and `SAMPLE_AVG_RATING` / `SAMPLE_RATED_JOB_COUNT` otherwise, with a
      comment saying why.
- [ ] `sampled.acceptanceRatePercent`, `idleMinutesPerHour`, `onlineHoursWeek`,
      `deltas` and `scoreNotes` are unchanged and identical for all three
      personas.
- [ ] `sampled.deltas` still covers all five metrics, including the three whose
      value is real. No metric moved into or out of `sampled`.
- [ ] No second aggregation over last week was added anywhere.
- [ ] The fleet query runs inside the existing `Promise.all`, not as an extra
      serial round-trip, and does not run at all for a non-business account.
- [ ] `hubOrderScope()` and `hubOrderScopeSql()` are byte-identical to their
      current form.
- [ ] `HUB_PERFORMANCE_WINDOW_DAYS` is still `7`.
- [ ] `performance/page.tsx` has no redirect, no new prop and no functional
      change; its doc comment now says "Tbilisi" rather than "UTC" and describes
      three personas rather than two account kinds.
- [ ] Nothing in `HubPerformanceData` is a `Date`, a Prisma model instance or
      any other non-serialisable value.
- [ ] `pnpm lint` and `pnpm typecheck` pass clean.

## Notes

**Reconciliation is a feature, not a rounding error.** The fleet rows will
usually *not* sum to the tiles above them, for two legitimate reasons that
`unattributedFinishedJobCount` exists to name: orders the company claimed but
never dispatched (`Order.driverId IS NULL`), and orders carried by a driver who
has since left the roster (`Order.driverId` survives, `DriverProfile.companyId`
does not). task-08 renders the caveat; this task supplies the number.

The same gap applies to the `jobsCompleted` column, and it is deliberately
**not** given a second counter. One caveat line under a table is read; two
counters invite a reader to do arithmetic the screen does not show, and the
denominator that actually misleads — the one both rates divide by — is the
finished-job count.

**Two windows, per driver as well as per fleet.** `performance.ts` keys the
rates on `createdAt` and the bars on `completedAt`, because `Order` has no
`cancelledAt`. The per-driver row reproduces that split rather than picking one,
so each column lines up with the fleet figure directly above it. A driver whose
`jobsCompleted` exceeds their `completedCount` finished work booked last week —
correct, not a bug.

**`_count: { _all: true }` vs `_count: true`.** `performance.ts` uses the former
(line 263) and `drivers.ts` the latter (line 332). Both are valid Prisma; match
the file you are editing, which means `{ _all: true }` here.

**Why the roster query and not an orders-first `groupBy`.** Grouping orders by
`driverId` and looking names up afterwards would be one query fewer, but it
would silently omit every driver who did nothing this week — which is the row an
operator most needs to see — and it would include drivers who have left the
roster under names the company can no longer act on. Roster-first is the same
choice `drivers.ts` makes, for the same reason.

**`Order.driverId` is nullable and `@@index([driverId])`, `@@index([companyId])`
and `@@index([status, driverId, companyId])` all exist** on the `Order` model, so
the added `groupBy` calls are indexed. `requirements.md` records the assumption
that no new index is required at the data volumes in play.

**Manual verification needs three accounts.** `action-required.md` already flags
this under *During Implementation*: verifying the breakdown needs one
independent driver, one driver with `DriverProfile.companyId` set, and one
`role === "COMPANY"` session, ideally each with completed orders. Without them,
verification is limited to reading the code and running lint and typecheck. If
no such accounts or seed exist, say so rather than claiming the runtime
behaviour was checked.
