# Task 02: Today loader — persona, fleet jobs-in-progress and fleet-wide attention

## Status

complete

## Wave

2

## Description

`getHubToday()` is the one server pass behind the hub's landing screen, and it
is currently persona-blind in three ways that matter. `HubTodayData` carries no
account-shape field at all, so the screen physically cannot branch. A fleet
owner's "Current job" card shows **one arbitrary in-flight job** picked by
`findFirst … orderBy createdAt desc`, when a fleet can legitimately have a dozen
running and the design's own card counts them ("6 jobs in progress"). And the
attention card's sampled compliance rows are hung off **one arbitrary fleet
vehicle** — the oldest — so a twelve-van fleet is told about one van and never
learns that the other eleven exist.

This task adds `persona: HubPersona` to `HubTodayData`, replaces the single
arbitrary in-flight job with a real fleet-wide `jobsInProgressCount` plus a
short, driver-attributed preview list, widens the compliance source from one
plate to a capped set of plates with a real fleet vehicle count beside it, and
carries the employer's name through for a roster driver so the screen can frame
the day as dispatched work rather than as self-employment. It also nulls out
two **sampled** values that are meaningless for the persona reading them: the
zone-demand table for a salaried employee, who neither chooses where to
position themselves nor keeps the surge bonus, and the online-time label for a
company, which has no online state at all.

The real currency on this screen — "Earned today" and the per-job average — is
**not** touched for any persona. Suppressing it for a roster driver was
proposed during spec-writing and explicitly declined; see the Notes, which
record the argument so a later reader does not mistake it for an oversight.

Everything here is built from columns that exist today. No Prisma schema
change, no migration, and nothing that is sampled becomes real — the sampled
values stay sampled, stay under the `sampled` sub-object and stay
`<SampleNote />`-badged by the screen. This task changes only the server pass
and the page that calls it; the rendering of every new branch is Wave 3's job.

## Dependencies

**Depends on:** task-01-hub-persona-model
**Blocks:** task-06-today-screen-personas

**Context from dependencies:**

`task-01-hub-persona-model` makes account shape a first-class axis. Before it,
`src/lib/dashboard/hub/account.ts` exported only:

```ts
export type HubAccountKind = "BUSINESS" | "INDIVIDUAL";
```

After task-01 it also exports:

```ts
export type HubPersona = "INDEPENDENT" | "ROSTER" | "BUSINESS";
```

and `HubAccount` gains a `persona: HubPersona` field **alongside** the existing
`kind`, which is unchanged and still present (the Vehicles and Loads screens
consume `kind` and must keep compiling). `persona` is derived once inside
`resolveHubAccount()`, which is React-`cache()`d, by exactly this rule:

- `BUSINESS` when `kind === "BUSINESS"`
- `ROSTER` when `kind === "INDIVIDUAL" && companyId !== null`
- `INDEPENDENT` otherwise

**Never re-derive persona in this file.** Read `account.persona`.

### The three personas, in full

This is the whole axis. Restated here because this task file is meant to be
readable without any other.

| Persona | `HubAccount.kind` | `HubAccount.companyId` | Who they are |
|---|---|---|---|
| `INDEPENDENT` | `"INDIVIDUAL"` | `null` | Owns their vehicle, browses the open Load Board, keeps their own fares |
| `ROSTER` | `"INDIVIDUAL"` | set — their **employer's** company | Employed driver; work arrives through company dispatch; the fares on their jobs are paid to the employer, not to them |
| `BUSINESS` | `"BUSINESS"` | set — their **own** company | Fleet owner; the only persona with the Drivers and Employees screens |

Two traps, both of which have bitten this codebase before:

1. **`companyId !== null` alone is not the roster test.** A `BUSINESS`
   account's `companyId` names its *own* company. The roster test must be
   conjoined with `kind === "INDIVIDUAL"`. Getting it backwards hides the Load
   Board and the Wallet from the fleet owners those screens exist to serve.
2. **`DriverProfile.accountType` (`DriverAccountType`) is a different axis and
   must never be used for this.** A sole-proprietor driver who registered as a
   business is still `kind: "INDIVIDUAL"` and, with no employer, persona
   `INDEPENDENT`.

### The fields of `HubAccount` this task actually reads

All of these exist today and are unchanged by task-01 except where noted:

```ts
export type HubAccount = {
  kind: HubAccountKind;        // unchanged
  persona: HubPersona;         // NEW in task-01
  userId: string;              // the `User.id`; `hubOrderScope` keys on it
  displayName: string;
  initials: string;
  identifier: string;
  city: string;                // already humanised via `formatCity`
  isOnline: boolean | null;    // null for a COMPANY session
  isActivated: boolean;
  canToggleOnline: boolean;    // false for a COMPANY session
  companyName: string | null;  // set when a DRIVER belongs to a fleet, and
                               // also set to its own name for a COMPANY
  driverProfileId: string | null;  // null for a COMPANY session
  companyId: string | null;
};
```

Note the shape of `companyName`: `resolveHubAccount()`'s COMPANY branch sets
`companyName: company.companyName` (its *own* name), and its driver branch sets
`companyName: driverProfile.company?.companyName ?? null` (the **employer's**
name). That is why the new `employerName` field below is gated on
`persona === "ROSTER"` rather than on `companyName !== null`.

## Files to Create

None.

## Files to Modify

- `src/lib/dashboard/hub/today.ts` — add `persona` to `HubTodayData`; replace
  the single in-flight `findFirst` with a real count plus a capped,
  driver-attributed preview list; widen the compliance source from one fleet
  plate to a capped set of plates plus a real fleet vehicle count; carry
  `employerName` for a roster driver; null out the **sampled** zone-demand
  table for a roster driver and the **sampled** online-time label for a
  company. `earnedToday` and `averagePerJob` are **not** changed.
- `src/app/dashboard/(hub)/today/page.tsx` — correct two stale claims in its
  header comment (it still says the loader buckets in UTC; it has bucketed in
  Tbilisi since the timezone change), restate the "open to every persona, no
  redirect here" reasoning in persona terms, and record the known limitation of
  using `account.city` in the subhead for a multi-city fleet.

**Do not touch any other file.** In particular the four `today-*` components
under `src/components/driver-hub/screens/` are owned by task-06 in Wave 3, and
`src/lib/dashboard/hub/sample.ts` is not modified by this task at all — no new
sampled export is needed.

**Wave-2 file ownership.** `earnings.ts`, `performance.ts`, `vehicles.ts`,
`jobs.ts`, `account.ts` and `driver-hub-nav.ts` all belong to other tasks. This
task must not edit them even though it reads types from `account.ts`.

## Technical Details

### 0. Constraints that bound every decision below

- **`today.ts` is `server-only`** (line 50: `import "server-only";`) and the
  object it returns is handed straight from `today/page.tsx` (a server
  component) into `<TodayScreen>`, which is `"use client"`. Every field must
  therefore be **plain serialisable data**: no `Date`, no Prisma model
  instance, no function. Every timestamp is an ISO string. This is already the
  file's rule; keep it.
- **The `sampled` sub-object is load-bearing.** The file's header comment
  explains why the real/sampled split is a nesting level rather than a naming
  convention: "a screen cannot read a fictional number without typing the word
  `sampled` on the way to it, which makes an accidental un-badged placeholder a
  visible mistake in review rather than an invisible one." Anything new that is
  fictional goes under `sampled`. Anything new that is real goes at the top
  level. Nothing crosses.
- **`hubOrderScope()` is the tenancy boundary and must not be weakened.** It
  lives at `today.ts:248-259` and is duplicated verbatim in `earnings.ts`,
  `jobs.ts` and `performance.ts`. It reads:

  ```ts
  function hubOrderScope(account: HubAccount): Prisma.OrderWhereInput {
    if (account.kind === "BUSINESS") {
      return { companyId: account.companyId ?? UNMATCHABLE_COMPANY_ID };
    }

    return { driverId: account.userId };
  }
  ```

  It fails closed via `UNMATCHABLE_COMPANY_ID` (`today.ts:102`) rather than
  letting `{ companyId: null }` read as `IS NULL` and match every unclaimed
  order on the platform. **This task does not change it**, and every new
  `Order` query added below must spread `...scope` exactly as the existing four
  do. Note it branches on `kind`, not on `persona`, and that stays correct: a
  `ROSTER` driver is scoped by `driverId` like any other individual, which is
  what makes their Today screen show the jobs they were dispatched.
- **No new tests.** Per project convention this spec adds none. Verify with
  `pnpm lint` and `pnpm typecheck` (or the project's equivalents) plus a read
  of the diff.

### 1. The exact current shape of `HubTodayData`

This is `src/lib/dashboard/hub/today.ts:179-235`, quoted verbatim so you can
diff your change against it without opening the file blind. Comments included,
because several of them are load-bearing and you are expected to preserve or
amend them rather than delete them:

```ts
export type HubTodayData = {
  /**
   * `SUM(driverPayout + overtimeDriverPayout)` over jobs completed in today's
   * Tbilisi day — the hero tile on this screen, and the account's **own
   * earnings**, never `SUM(price + overtimeFee)`, which is what the platform
   * billed the clients for those jobs.
   *
   * The distinction is the whole point of the tile: it is labelled as what the
   * driver earned today, and the client's total is roughly 18% larger than that.
   * See `src/lib/orders/payout.ts`, and `HubTodayCurrentJob.fare` for why no
   * `serviceLevelAdjustment` term belongs in the sum.
   */
  earnedToday: number;
  jobsCompletedToday: number;
  /** `earnedToday / jobsCompletedToday`, or 0 when nothing was completed. */
  averagePerJob: number;
  /** The job in flight, or `null` when nothing is running. */
  currentJob: HubTodayCurrentJob | null;
  /**
   * Share of finished jobs that completed rather than cancelled, as a
   * percentage over the current Monday-anchored Tbilisi week, or `null` when no job
   * finished in that week — a rate with no denominator is not zero, and the
   * screen prints "—" for it. Same derivation, same week, as the Performance
   * screen's completion tile.
   */
  completionRatePercent: number | null;
  /** Jobs behind `completionRatePercent`; 0 means the rate is `null`. */
  completedOrCancelledCount: number;
  /**
   * The signed-in driver's licence expiry, or `null` when there is none to
   * report. Null for a BUSINESS account by design: a company has no licence of
   * its own, and its drivers' licences belong on the Drivers screen where they
   * can be named.
   */
  licenceAlert: HubLicenceAlert | null;
  /** Everything below this line is fictional — badge it. */
  sampled: {
    /** Today's online time, e.g. "6h 12m". Needs an `OnlineSession` model. */
    onlineTimeLabel: string;
    glance: {
      acceptanceRatePercent: number;
      cancellationsToday: number;
      averageRating: number;
      ratedJobCount: number;
    };
    zoneDemand: {
      caption: string;
      rows: readonly SampleZoneDemandRow[];
    };
    /**
     * Insurance and inspection rows, or empty when the account has no vehicle
     * to hang them off — an empty card beats a row about a vehicle that does
     * not exist.
     */
    vehicleAlerts: readonly HubTodayVehicleAlert[];
  };
};
```

**Which of these are real and which are sampled — preserve this exactly.**

- Real (top level): `earnedToday`, `jobsCompletedToday`, `averagePerJob`,
  `currentJob`, `completionRatePercent`, `completedOrCancelledCount`,
  `licenceAlert`.
- Sampled: `onlineTimeLabel`, everything under `glance`, `zoneDemand`,
  `vehicleAlerts`.

Note in particular that **`completionRatePercent` is real and lives at the top
level while the other three "Today at a glance" rows are sampled.** The file
header (lines 22-32) explains why at length: `sample.ts` exports no completion
figure precisely because the number *is* derivable from `Order.status`, and the
honesty rule makes `sample.ts` the only place a placeholder may live, so
inventing one locally is not an option. Acceptance is unrecorded (a declined
offer leaves no row at all, so it needs a `JobOffer` model), rating needs an
`OrderRating` model, and a cancellation cannot be attributed to anyone because
`Order` records no actor for it. **This asymmetry must survive your change
untouched** — three sampled glance rows, one real one.

### 2. The new shape of `HubTodayData`

Seven changes. Each is justified in its own numbered subsection below; this is
the target to work towards.

```ts
export type HubTodayData = {
  /**
   * Which of the three account shapes is reading this screen.
   *
   * Echoed from `HubAccount.persona` rather than re-derived, because
   * `resolveHubAccount()` is the single place the derivation lives and a
   * screen that re-derives it from `kind`/`companyId` is one refactor away
   * from disagreeing with the nav and the page guards. Same role `kind` plays
   * on `HubVehiclesData`.
   */
  persona: HubPersona;
  /**
   * `SUM(driverPayout + overtimeDriverPayout)` over jobs completed in today's
   * Tbilisi day … [unchanged — keep the whole existing comment verbatim] …
   */
  earnedToday: number;
  jobsCompletedToday: number;
  /** `earnedToday / jobsCompletedToday`, or 0 when nothing was completed. */
  averagePerJob: number;
  /**
   * The jobs in flight right now, newest-accepted first, capped at
   * `IN_PROGRESS_JOB_PREVIEW_LIMIT`. Empty when nothing is running.
   *
   * A list rather than the single job this used to be — see the type's own
   * comment and `jobsInProgressCount` below.
   */
  jobsInProgress: readonly HubTodayCurrentJob[];
  /**
   * How many jobs are in flight **in total**, uncapped. Equal to
   * `jobsInProgress.length` for an individual driver (who holds at most one)
   * and for a small fleet; larger than it for a fleet with more than
   * `IN_PROGRESS_JOB_PREVIEW_LIMIT` on the road.
   */
  jobsInProgressCount: number;
  completionRatePercent: number | null;
  completedOrCancelledCount: number;
  /**
   * The signed-in driver's licence expiry, or `null` when there is none to
   * report. **Null for a BUSINESS account by design** … [keep and extend the
   * existing comment — see §6] …
   */
  licenceAlert: HubLicenceAlert | null;
  /**
   * The employing company's name, for a ROSTER driver only; `null` for the
   * other two personas.
   */
  employerName: string | null;
  /**
   * How many vehicles the fleet has registered, for a BUSINESS account only;
   * `null` for the other two personas. Real — a `COUNT(*)` on `Vehicle`.
   */
  fleetVehicleCount: number | null;
  /** Everything below this line is fictional — badge it. */
  sampled: {
    /**
     * Today's online time, e.g. "6h 12m". Needs an `OnlineSession` model.
     * **`null` for a BUSINESS account**, which has no online state at all.
     */
    onlineTimeLabel: string | null;
    glance: {
      acceptanceRatePercent: number;
      cancellationsToday: number;
      averageRating: number;
      ratedJobCount: number;
    };
    /**
     * Where demand is and what it pays extra. **`null` for a ROSTER driver**,
     * for whom neither half is actionable — see §8.
     */
    zoneDemand: {
      caption: string;
      rows: readonly SampleZoneDemandRow[];
    } | null;
    /**
     * Insurance and inspection rows — two per vehicle covered, or empty when
     * the account has no vehicle to hang them off. For a BUSINESS account this
     * covers up to `FLEET_COMPLIANCE_VEHICLE_LIMIT` vehicles rather than the
     * one arbitrary vehicle it used to.
     */
    vehicleAlerts: readonly HubTodayVehicleAlert[];
    /**
     * How many **distinct vehicles** `vehicleAlerts` covers, so the screen can
     * say "covering 3 of 12 vehicles" against the real `fleetVehicleCount`
     * without counting plates itself.
     */
    vehicleAlertVehicleCount: number;
  };
};
```

`currentJob` is **gone**, replaced by `jobsInProgress` + `jobsInProgressCount`.
That is safe: `git grep currentJob` finds it in exactly two places outside this
file's own comments — `today-screen.tsx:190` (`<TodayCurrentJobCard
job={data.currentJob} />`) and nothing else. `today-screen.tsx` is owned by
task-06, which is the task that consumes this change.

### 3. The import and the two new constants

At `today.ts:55` the account import is currently:

```ts
import type { HubAccount } from "@/lib/dashboard/hub/account";
```

Widen it:

```ts
import type { HubAccount, HubPersona } from "@/lib/dashboard/hub/account";
```

Add two constants beside the existing `ACTIVE_JOB_STATUSES` /
`TERMINAL_JOB_STATUSES` / `COMPLETION_WINDOW_DAYS` / `UNMATCHABLE_COMPANY_ID`
block (`today.ts:79-102`), in the house register — full sentences, explaining
*why* the number is what it is:

```ts
/**
 * How many in-flight jobs the Today screen previews.
 *
 * The count beside the list is uncapped and real, so this is purely how much of
 * the fleet's current work fits on one card without turning Today into a second
 * Jobs screen. Three is the design's own figure: the handoff's fleet job pill
 * lists three live jobs and then links out with "View all jobs in progress"
 * (`UI:UX/Registered Driver account (New)/Driver dashboard header alignment/
 * Driver Dashboard v2.dc.html`, `livePillJobs`). An individual driver holds at
 * most one in-flight job anyway — the same assumption `driver-dashboard-data.ts`
 * makes for its `activeOrderId` — so the cap only ever bites a fleet.
 */
const IN_PROGRESS_JOB_PREVIEW_LIMIT = 3;

/**
 * How many of a fleet's vehicles the sampled compliance rows cover.
 *
 * Two rows are emitted per vehicle (insurance and inspection), so this is a cap
 * on a card, not on a fleet. It exists because of a property of the sample
 * module rather than of the design: `sampleVehicleFacts()` only has entries for
 * the handoff's seven demo plates, so in any real database every plate falls
 * through to `SAMPLE_VEHICLE_FACTS_FALLBACK` and yields the *same* two rows —
 * "MTPL insurance not on file", "Technical inspection not on file". Uncapped, a
 * twelve-van fleet would render twenty-four identical rows saying nothing. The
 * card names how many vehicles it covered and how many exist
 * (`vehicleAlertVehicleCount` against the real `fleetVehicleCount`) and links
 * to the Vehicles screen, which is where the whole fleet's compliance belongs.
 *
 * Retire this cap along with the sampled rows themselves: with a real
 * `VehicleCompliance` model the loader would filter to the vehicles that
 * actually have something expiring, and a cap on a filtered list is a different
 * question from a cap on an unfiltered one.
 */
const FLEET_COMPLIANCE_VEHICLE_LIMIT = 3;
```

### 4. `HubTodayCurrentJob` gains `driverName`

The type at `today.ts:124-150` keeps its name and every existing field. Add one:

```ts
/** The one job in flight right now, as the "Current job" card renders it. */
export type HubTodayCurrentJob = {
  id: string;
  status: "ACCEPTED" | "IN_TRANSIT";
  stops: readonly HubTodayStop[];
  distanceKm: number;
  fare: number;
  vehicleTypeLabel: string;
  createdAt: string;
  inTransitAt: string | null;
  completedAt: string | null;
  /**
   * `User.name` of the driver running this job, or `null` when `Order.driverId`
   * is still unset (a company-claimed order that has not been dispatched to a
   * person yet — `Order.driverId` is nullable and set at accept or dispatch).
   *
   * Only a fleet renders it: an independent or roster driver is looking at
   * their own job and does not need to be told whose it is. It is `User.name`
   * rather than a name assembled from `DriverProfile.firstName`/`lastName`
   * because that is exactly what the Drivers screen's own **Driver** column
   * shows (`drivers.ts` reads `driver.user.name`), so the same person reads
   * character-for-character the same on both screens.
   */
  driverName: string | null;
};
```

**Keep the type's name.** Renaming it to something list-shaped would churn
`today-current-job-card.tsx`, which task-06 owns in the next wave, for no gain —
and the name is still accurate: each element *is* a job current right now.
Amend the doc comment's first line to "One job in flight right now" and amend
the `ACTIVE_JOB_STATUSES` comment at `today.ts:79-84`, which currently ends
"…which is what makes `currentJob` singular" and now needs to say that the
singular assumption holds for an individual driver but not for a fleet, which
is why the loader returns a list and a count.

### 5. The in-flight query: a real count plus a capped, attributed list

**Decision: a short list, not a single representative job.** The reasoning,
recorded because a reviewer will ask:

- A fleet's single "representative" in-flight job is not representative of
  anything. The current `orderBy: { createdAt: "desc" }` picks the most recently
  *booked* job, which is neither the most urgent, the largest, nor the one
  closest to a problem. The existing code says as much in its own comment —
  "this is the one that started most recently — the rest are all on the Jobs
  screen".
- The moment you show a fleet owner one job you have to tell them **who is
  driving it**, or the card is a fact about the company that they cannot act on.
  Once the row carries a driver name it is a list row, and one list row is a
  worse list than three.
- The design agrees. Its fleet variant renders a count *and* three attributed
  rows — `jobPillLabel: isBiz ? '6 jobs in progress' : 'Job in progress ·
  TB4821'` and `livePillJobs` of `{ route, who, eta }` triples with `who` reading
  "Giorgi Beridze · TB4821". The count and the list are not alternatives in the
  design; they are the same card.
- The count must be a separate real query rather than `jobsInProgress.length`,
  because the list is capped and the count is the number the pill prints.
  Deriving it from the list would silently pin a fifty-van fleet's pill at 3.
  (Where they do agree — an individual driver, or a fleet under the cap — they
  are the same number, and that is fine.)

The `Promise.all` at `today.ts:396-454` currently destructures four results:

```ts
const [earnedTodayAgg, currentOrder, terminalCounts, compliance] =
  await Promise.all([ … ]);
```

It becomes five. Replace the second element (the `findFirst`, `today.ts:412-434`)
with a `findMany`, and add a `count` alongside it:

```ts
const [
  earnedTodayAgg,
  inProgressOrders,
  jobsInProgressCount,
  terminalCounts,
  compliance,
] = await Promise.all([
  prisma.order.aggregate({
    // …unchanged…
  }),

  // A fleet can legitimately have several jobs in flight at once, unlike a
  // single driver, so this is a capped preview rather than the one arbitrary
  // job it used to be — `IN_PROGRESS_JOB_PREVIEW_LIMIT` explains the number,
  // and the uncapped total is counted separately below so the screen's pill
  // is never the cap wearing a count's clothes. Newest-booked first, which is
  // the order the design's own live list uses.
  prisma.order.findMany({
    where: { ...scope, status: { in: ACTIVE_JOB_STATUSES } },
    select: {
      id: true,
      status: true,
      pickupAddress: true,
      dropoffAddress: true,
      distanceKm: true,
      // Same rule as the aggregate above: the carrier's two payout columns,
      // never the client's `price`/`overtimeFee`.
      driverPayout: true,
      overtimeDriverPayout: true,
      createdAt: true,
      inTransitAt: true,
      completedAt: true,
      vehicleTypeSpec: { select: { label: true } },
      // Nullable relation: `Order.driverId` is set at accept or dispatch, so
      // an order a company has claimed but not yet handed to a person has
      // none. Selecting only `name` keeps the driver's email and phone off a
      // payload that crosses into a client component.
      driver: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: IN_PROGRESS_JOB_PREVIEW_LIMIT,
  }),

  // Uncapped, and the number the fleet's "N jobs in progress" pill prints.
  // Deriving it from the list above would cap it at the preview limit, which
  // is precisely the arbitrariness this change exists to remove. Filters on
  // `status` plus the scope's `driverId`/`companyId`, which is the shape
  // `@@index([status, driverId, companyId])` on `Order` was added for.
  prisma.order.count({
    where: { ...scope, status: { in: ACTIVE_JOB_STATUSES } },
  }),

  prisma.order.groupBy({
    // …unchanged…
  }),

  loadComplianceSource(account),
]);
```

Then replace the `currentJob` mapping at `today.ts:481-514` with a list
mapping. Every field maps exactly as it did — do not change the payout
handling, the status narrowing or the stop construction:

```ts
const jobsInProgress: readonly HubTodayCurrentJob[] = inProgressOrders.map(
  (order) => ({
    id: order.id,
    // The `where` above admits only these two, but Prisma types `status` as
    // the whole enum; narrowing here is what lets the client type be the
    // honest two-member union.
    status: order.status === OrderStatus.IN_TRANSIT ? "IN_TRANSIT" : "ACCEPTED",
    stops: [
      {
        kind: "PICKUP",
        address: order.pickupAddress,
        at: order.inTransitAt?.toISOString() ?? null,
      },
      {
        kind: "DROPOFF",
        address: order.dropoffAddress,
        at: order.completedAt?.toISOString() ?? null,
      },
    ],
    distanceKm: order.distanceKm,
    // One order's two payout columns, so this one *does* go through the
    // shared helper — `src/lib/orders/payout.ts` is the single definition of
    // what a job pays its carrier.
    fare: totalDriverEarnings(order),
    vehicleTypeLabel: order.vehicleTypeSpec.label,
    createdAt: order.createdAt.toISOString(),
    inTransitAt: order.inTransitAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    driverName: order.driver?.name ?? null,
  }),
);
```

`totalDriverEarnings` takes an order-shaped argument (`{ driverPayout,
overtimeDriverPayout }`), so passing the selected row works unchanged — that is
the whole point of its signature, per its comment at `today.ts:506-509`.

### 6. `licenceAlert` stays `null` for BUSINESS — keep it, and say why again

Do **not** make the licence row fleet-wide. `licenceAlert` remains `null` for a
BUSINESS account and the existing behaviour in `loadComplianceSource()`
(`today.ts:287-305`, `licenceExpiresAt: null` in the BUSINESS branch) is
correct as written. The reasoning, which the type's comment already carries in
compressed form and which you should expand rather than delete:

1. **A company has no licence.** `DriverLicence` hangs off `DriverProfile`, and
   `resolveHubAccount()`'s COMPANY branch sets `driverProfileId: null` — there
   is no profile row to read an expiry from. A fleet's Today screen cannot show
   "your licence" because there is no "your".
2. **Its drivers' licences belong where they can be named.** An unattributed
   "Driving licence expires in 8 days" on a fleet's Today screen is
   unactionable: the owner cannot tell whose licence, cannot call them, and
   cannot reassign the van. The Drivers screen already carries the attributed
   version — `drivers.ts` selects `licence: { select: { categories: true,
   expiresAt: true } }` per driver and exposes it as `HubDriverLicence` on each
   `HubDriver` row, next to that driver's name, phone and vehicle. Duplicating a
   worse copy of it here would give the fleet owner two places to look and one
   of them would be useless.
3. **It is not a data gap.** The rows *are* derivable — that is what makes this
   a deliberate product decision rather than a schema limitation, and why the
   field is `null` rather than sampled.

So this is a **restatement task, not a code change**: leave the BUSINESS branch
returning no licence, and make sure the comment on `HubTodayData.licenceAlert`
carries all three points rather than the one it carries today. The attention
card is still made fleet-wide — through its *vehicle* rows, in §7.

### 7. Fleet-wide compliance: many plates plus a real fleet count

`loadComplianceSource()` (`today.ts:283-342`) currently returns
`{ licenceExpiresAt: Date | null; vehiclePlate: string | null }` and its
BUSINESS branch takes exactly one vehicle:

```ts
// Any one of the fleet's vehicles will do: the sampled rows are per-plate
// placeholders, and the Vehicles screen is where the whole fleet's
// compliance actually belongs. Oldest first, because that is the vehicle
// most likely to have something expiring.
const vehicle =
  account.companyId === null
    ? null
    : await prisma.vehicle.findFirst({
        where: { companyId: account.companyId },
        select: { plateNumber: true },
        orderBy: { createdAt: "asc" },
      });
```

Widen the return type to a plate **list** plus a real fleet count:

```ts
async function loadComplianceSource(account: HubAccount): Promise<{
  licenceExpiresAt: Date | null;
  /**
   * Plates to hang the sampled compliance rows off. At most one for an
   * individual driver (their own vehicle, or the fleet vehicle assigned to
   * them); up to `FLEET_COMPLIANCE_VEHICLE_LIMIT` for a company.
   */
  vehiclePlates: readonly string[];
  /**
   * How many vehicles the fleet has, uncapped and real, or `null` for an
   * account that is not a fleet. Lets the card say how much of the fleet the
   * capped rows above actually cover instead of implying they are all of it.
   */
  fleetVehicleCount: number | null;
}> {
  if (account.kind === "BUSINESS") {
    // A company with no `companyId` cannot happen — `resolveHubAccount()`
    // always sets one for a BUSINESS — but the type permits null and the
    // failure mode of guessing would be reading another tenant's vehicles, so
    // this fails closed the same way `hubOrderScope` does.
    if (account.companyId === null) {
      return {
        licenceExpiresAt: null,
        vehiclePlates: [],
        fleetVehicleCount: 0,
      };
    }

    // Oldest first, because that is the vehicle most likely to have something
    // expiring, and because a stable order means the card does not reshuffle
    // between two renders of the same fleet.
    const [vehicles, fleetVehicleCount] = await Promise.all([
      prisma.vehicle.findMany({
        where: { companyId: account.companyId },
        select: { plateNumber: true },
        orderBy: { createdAt: "asc" },
        take: FLEET_COMPLIANCE_VEHICLE_LIMIT,
      }),
      prisma.vehicle.count({ where: { companyId: account.companyId } }),
    ]);

    return {
      // A company holds no licence of its own — see `HubTodayData.licenceAlert`.
      licenceExpiresAt: null,
      vehiclePlates: vehicles.map((vehicle) => vehicle.plateNumber),
      fleetVehicleCount,
    };
  }

  // A driver mid-onboarding may have no profile row yet, in which case there is
  // nothing to report and no query worth running.
  if (account.driverProfileId === null) {
    return {
      licenceExpiresAt: null,
      vehiclePlates: [],
      fleetVehicleCount: null,
    };
  }

  // …the existing `prisma.driverProfile.findUnique` is unchanged…

  const plate =
    driverProfile?.vehicles[0]?.plateNumber ??
    driverProfile?.assignments[0]?.vehicle.plateNumber ??
    null;

  return {
    licenceExpiresAt: driverProfile?.licence?.expiresAt ?? null,
    // A driver has one vehicle in play at a time, so this list is 0 or 1 long.
    // It is a list anyway so the caller has one shape to map over rather than
    // a branch per account kind.
    vehiclePlates: plate === null ? [] : [plate],
    // Not a fleet: there is no fleet size to report, and 0 would read as an
    // empty fleet rather than as "this question does not apply".
    fleetVehicleCount: null,
  };
}
```

`Vehicle.companyId` and `Vehicle.plateNumber` both exist (`plateNumber` is
`String @unique`, and `@@index([companyId])` is declared), so the count is
indexed and the `findMany` is a bounded index scan.

Then widen `vehicleAlertsFor()` (`today.ts:344-371`) from one plate to many:

```ts
/**
 * The sampled insurance and inspection rows for each real plate — two rows per
 * plate, in that order, so a card rendering them in sequence groups a vehicle's
 * two documents together.
 */
function vehicleAlertsFor(
  plateNumbers: readonly string[],
): readonly HubTodayVehicleAlert[] {
  return plateNumbers.flatMap((plateNumber): HubTodayVehicleAlert[] => {
    const facts = sampleVehicleFacts(plateNumber);

    return [
      {
        kind: "INSURANCE",
        vehiclePlate: plateNumber,
        status: facts.insuranceStatus,
        due: facts.insuranceDue,
      },
      {
        // `Vehicle` stores no inspection state at all, so unlike insurance
        // there is not even a sampled status to report — "Pending" is the
        // honest reading of "nothing has been recorded".
        kind: "INSPECTION",
        vehiclePlate: plateNumber,
        status: "Pending",
        due: facts.inspectionDue,
      },
    ];
  });
}
```

The explicit `: HubTodayVehicleAlert[]` return annotation on the callback is
what keeps the literal `"INSURANCE"` / `"INSPECTION"` / `"Pending"` assignable
to the union members instead of widening to `string` — an `as const` on each
literal would work too, but the annotation says it once. The early
`plateNumber === null` guard the old signature needed disappears: an empty list
flat-maps to an empty list, which is the same outcome the guard produced.

**A consequence task-06 must handle, and which you should call out in a comment
here so it is not missed:** `today-attention-card.tsx:183` keys its rows on
`alert.kind` alone (`key={alert.kind}`), which was unique while there was one
plate and now collides across plates. The comment above that key even says "One
row per kind, and `today.ts` emits each kind at most once", which stops being
true with this change. Add a line to the `vehicleAlerts` doc comment stating
that rows are unique on `(vehiclePlate, kind)`, not on `kind`.

### 8. Persona-conditional values in the returned object

The `return` at `today.ts:531-559` becomes:

```ts
// Read once so the three branches below are obviously keyed on the same fact.
const { persona } = account;
const isRoster = persona === "ROSTER";
const isBusiness = persona === "BUSINESS";

return {
  persona,
  // Unchanged for every persona, including ROSTER. See "Considered and
  // declined" in this task's Notes: whether a roster driver should be shown
  // this figure at all was raised, argued and deliberately settled in favour
  // of leaving it alone. Do not add a persona branch here.
  earnedToday,
  jobsCompletedToday,
  averagePerJob:
    jobsCompletedToday === 0
      ? 0
      : roundCurrency(earnedToday / jobsCompletedToday),
  jobsInProgress,
  jobsInProgressCount,
  completionRatePercent:
    completedOrCancelledCount === 0
      ? null
      : roundRate((completedCount / completedOrCancelledCount) * 100),
  completedOrCancelledCount,
  licenceAlert,
  // `HubAccount.companyName` is the employer's name for a driver and the
  // company's *own* name for a COMPANY session, which is why this is gated on
  // the persona rather than on `companyName !== null`.
  employerName: isRoster ? account.companyName : null,
  fleetVehicleCount: compliance.fleetVehicleCount,
  sampled: {
    // A company has no online state to report even in sampled form:
    // `resolveHubAccount()` sets `isOnline: null` and `canToggleOnline: false`
    // for a COMPANY session because a fleet has no toggle at all, and
    // `PATCH /api/driver-profile/status` rejects a COMPANY session outright.
    // A fleet-wide "6h 12m online" would therefore be a fabricated aggregate
    // of a quantity that does not exist for this account even in principle,
    // which is a step beyond the sampled figures elsewhere on this screen —
    // those stand in for something the schema cannot yet compute, not for
    // something that has no meaning.
    onlineTimeLabel: isBusiness ? null : SAMPLE_ONLINE_TIME_TODAY_LABEL,
    glance: {
      acceptanceRatePercent: SAMPLE_ACCEPTANCE_RATE_PERCENT,
      cancellationsToday: SAMPLE_CANCELLATIONS_TODAY,
      averageRating: SAMPLE_AVG_RATING,
      ratedJobCount: SAMPLE_RATED_JOB_COUNT,
    },
    // Suppressed for a salaried employee — see the decision note below.
    zoneDemand: isRoster
      ? null
      : {
          caption: SAMPLE_ZONE_DEMAND_CAPTION,
          rows: SAMPLE_ZONE_DEMAND,
        },
    vehicleAlerts: vehicleAlertsFor(compliance.vehiclePlates),
    vehicleAlertVehicleCount: compliance.vehiclePlates.length,
  },
};
```

**Decision R1 — suppress `zoneDemand` for `ROSTER`.** The card is "Where the
demand is", and every row is `{ zone, driversOnline, level, bonusGel }`. Both
halves of its proposition are false for an employed driver: they do not choose
where to position themselves (work reaches them through their employer's
dispatch, which is the same premise that hides the Load Board from them), and
they would not keep the surge bonus if they did, because the fare on their jobs
is paid to the employer. It is the same call this feature makes for the
sidebar's sampled "Weekly incentive" card, and it follows the planning decision
recorded in the requirements: *where a sampled card is meaningless for a
persona, hide it — do not make it real.* `null` rather than `rows: []`, so the
screen removes the card instead of rendering an empty table under a heading that
promises one.

**Decision R2 — suppressing the hero tile's currency for `ROSTER` — was
considered and explicitly declined.** `earnedToday` and `averagePerJob` keep
their `number` types and their current values for **all three personas**. Do
not add a branch for them. The argument that was made and the reason it was
turned down are recorded in this task's Notes, under *"Considered and declined:
the roster hero tile"* — read that before you decide the omission looks like an
oversight and helpfully add the branch back.

`employerName` still exists and is still carried for `ROSTER`. Its job is the
one the requirements actually asked for — letting the screen frame the day as
*dispatched* work — not gating a currency figure.

### 9. `today/page.tsx` — comment corrections and one recorded limitation

No behavioural change. `getHubToday(account)` already receives the whole
account, `data.persona` now rides on the payload, and the screen keeps the same
two props:

```tsx
const data = await getHubToday(account);

return (
  <TodayScreen
    data={data}
    subtitle={formatTodaySubtitle(new Date(), account.city)}
  />
);
```

**Do not change `formatTodaySubtitle`'s call or its signature.**
`formatTodaySubtitle(now: Date, city: string): string` lives in
`src/components/driver-hub/screens/today-format.ts`, which is owned by task-06
in the next wave; keeping the call site as-is is what stops a Wave-3 change from
breaking a Wave-2 file.

Three comment fixes:

1. **Lines 20-22 are persona-blind.** They read "Open to both account kinds:
   `getHubToday()` already resolved the scope difference … so there is no
   business-only redirect here." Rewrite in persona terms: Today is the one
   screen every one of the three personas keeps, so unlike `/dashboard/earnings`
   (redirected for a roster driver), `/dashboard/loads` (redirected for a roster
   driver) and `/dashboard/drivers` and `/dashboard/employees` (business only),
   there is no guard here at all. State that the *scope* difference is resolved
   inside `getHubToday()` by `hubOrderScope()` and the *shape* difference by
   `data.persona`, and that the page therefore has nothing persona-specific to
   do.

2. **Lines 42-44 are factually wrong and have been since the timezone change.**
   They read:

   > The formatter itself is UTC- and locale-pinned (see `today-format.ts`),
   > which also keeps the date honest: every "today" boundary in
   > `getHubToday()` is a UTC day, so the subhead names the same day the money
   > on the card covers.

   Both claims are stale. `today-format.ts` pins every formatter to
   `HUB_TIME_ZONE` (`"Asia/Tbilisi"`), and `today.ts`'s header comment
   (lines 40-48) records the deliberate move off UTC — *"'Earned today' covered
   a UTC day — 04:00 to 04:00 in Tbilisi — while the header beside it named the
   Tbilisi date, so for four hours every night the tile and its own label
   described different days."* Replace "UTC" with the Tbilisi zone in both
   sentences. The conclusion the paragraph draws is still right; only its
   premise is out of date.

3. **Add a short paragraph recording the multi-city limitation.** In the words
   of the file's own register, something like:

   ```
   * ## The city in the subhead, and what it is not
   *
   * `account.city` is `LogisticsCompany.city` for a BUSINESS account — the
   * company's *registered* city, not a summary of where its vans actually
   * worked today. A fleet operating out of Tbilisi, Kutaisi and Batumi still
   * reads "· Tbilisi" here, and the money on the card beneath it covers all
   * three. That is a known, accepted limitation: per-city fleet breakdowns were
   * considered during planning and deliberately deferred, because the rollups
   * this feature does add are per-driver and per-vehicle, and a fourth
   * dimension with no screen designed for it would be a table nobody asked
   * for. `Order.pickupCity`/`dropoffCity` exist and are indexed, so the
   * breakdown is derivable whenever a design for it does.
   ```

   **Do not implement a per-city breakdown.** It is explicitly out of scope for
   this spec; this paragraph exists so the next reader knows the gap was seen
   rather than missed.

### 10. Order of work

1. Widen the `account.ts` import to include `HubPersona`; add
   `IN_PROGRESS_JOB_PREVIEW_LIMIT` and `FLEET_COMPLIANCE_VEHICLE_LIMIT`.
2. Add `driverName` to `HubTodayCurrentJob`; amend its doc comment and the
   `ACTIVE_JOB_STATUSES` comment.
3. Rewrite `HubTodayData` to the shape in §2, keeping and extending every
   existing comment rather than replacing it.
4. Rewrite `loadComplianceSource()` and `vehicleAlertsFor()` per §7.
5. Rewrite the `Promise.all` and the job mapping per §5.
6. Rewrite the `return` per §8.
7. Fix the three comments in `today/page.tsx` per §9.
8. Run `pnpm lint` and `pnpm typecheck`. **`today-screen.tsx` will not compile
   until task-06 lands** — it still reads `data.currentJob` and passes
   `sampled.zoneDemand` (now nullable) into a card typed for the non-null
   shape. That is expected and is the whole reason task-06 exists in the next
   wave. Report the residual errors and confirm they are confined to the four
   `today-*` component files; do not "fix" them by editing files this task does
   not own.

## Acceptance Criteria

- [ ] `HubTodayData` carries `persona: HubPersona`, echoed from
      `account.persona` and never re-derived from `kind`/`companyId` inside
      this file.
- [ ] `HubTodayData.currentJob` no longer exists. `jobsInProgress: readonly
      HubTodayCurrentJob[]` and `jobsInProgressCount: number` replace it.
- [ ] `jobsInProgressCount` comes from its own `prisma.order.count()` over
      `{ ...scope, status: { in: ACTIVE_JOB_STATUSES } }` and is **not**
      derived from `jobsInProgress.length`.
- [ ] `jobsInProgress` is capped by a named constant
      (`IN_PROGRESS_JOB_PREVIEW_LIMIT = 3`) whose comment explains where the
      number comes from, and is ordered `createdAt: "desc"`.
- [ ] `HubTodayCurrentJob` gains `driverName: string | null`, sourced from
      `Order.driver.name` (`User.name`), with the nullable-relation case
      handled — no non-null assertion.
- [ ] The in-flight `select` still reads `driverPayout` and
      `overtimeDriverPayout` and never `price` or `overtimeFee`, and `fare`
      still goes through `totalDriverEarnings()`.
- [ ] `loadComplianceSource()` returns `vehiclePlates: readonly string[]` and
      `fleetVehicleCount: number | null`; its BUSINESS branch takes up to
      `FLEET_COMPLIANCE_VEHICLE_LIMIT` vehicles (`orderBy: { createdAt: "asc" }`)
      and counts the fleet separately.
- [ ] `sampled.vehicleAlerts` covers every returned plate — two rows per plate
      — and `sampled.vehicleAlertVehicleCount` reports how many distinct
      vehicles those rows cover.
- [ ] `HubTodayData.fleetVehicleCount` is a real `prisma.vehicle.count()` for a
      BUSINESS account and `null` for the other two personas. It sits at the
      **top level**, not under `sampled`, because a vehicle count is real.
- [ ] `licenceAlert` is still `null` for a BUSINESS account, and its doc
      comment now states all three reasons (no `DriverProfile` on a COMPANY
      session, attribution belongs on the Drivers screen where `HubDriverLicence`
      already lives, and this is a product decision rather than a data gap).
- [ ] `employerName: string | null` carries `account.companyName` for `ROSTER`
      only, gated on `persona === "ROSTER"` and not on `companyName !== null`.
- [ ] `sampled.zoneDemand` is `null` for `ROSTER` and unchanged for the other
      two personas.
- [ ] `sampled.onlineTimeLabel` is `null` for `BUSINESS` and unchanged for the
      other two personas.
- [ ] `earnedToday` and `averagePerJob` are still typed `number`, are still
      computed the same way, and carry **no** persona branch. Their doc
      comments are unchanged. (Suppressing them for `ROSTER` was proposed and
      declined — see Notes.)
- [ ] `completionRatePercent` and `completedOrCancelledCount` remain **real and
      at the top level**, identically derived over the same Monday-anchored
      Tbilisi week, for all three personas. The three sampled glance rows
      remain under `sampled` and are unchanged. The real/sampled boundary moves
      for nothing.
- [ ] `hubOrderScope()` is byte-identical to what it was, and every new `Order`
      query spreads `...scope`.
- [ ] `src/lib/dashboard/hub/sample.ts` is not modified, and no new sampled
      value is invented outside it.
- [ ] Every value in `HubTodayData` is still plain serialisable data — no
      `Date`, no Prisma model instance — and every timestamp is an ISO string.
- [ ] `today/page.tsx` no longer claims `getHubToday()` buckets in UTC, no
      longer says "both account kinds", and carries a paragraph recording the
      `account.city` multi-city limitation. It implements **no** per-city
      breakdown.
- [ ] `formatTodaySubtitle(new Date(), account.city)` is called exactly as
      before, with an unchanged signature.
- [ ] `pnpm lint` passes clean; `pnpm typecheck`'s only remaining errors are in
      `src/components/driver-hub/screens/today-*.tsx`, which task-06 fixes.

## Notes

**Considered and declined: the roster hero tile.**

This is recorded at length because the gap it leaves is a real one and the next
reader deserves to know it was seen, argued and settled rather than missed.

*The objection.* The requirements' own summary states the harm the Wallet
decision exists to fix: *"a roster driver's Wallet sums `driverPayout` over
orders assigned to them and labels the total as their earnings — but for an
employed driver that money was paid to their employer, so the screen asserts
something false."* Today's hero tile is the **same sum over the same scope**,
bucketed to one day instead of a range. `hubOrderScope()` gives a `ROSTER`
driver `{ driverId: account.userId }`; the aggregate sums `driverPayout +
overtimeDriverPayout`; the tile is labelled "Earned today". Every word of the
objection to the Wallet applies to it. A proposal was therefore made during
spec-writing to return `null` for `earnedToday` and `averagePerJob` for that
persona, so the tile would show `jobsCompletedToday` and the employer's name
instead of a currency figure.

*The decision.* **The user declined it.** The scope of this feature is held to
what was approved — the Wallet is hidden, and nothing else about a roster
driver's money changes. The Today hero tile stays byte-identical for all three
personas. This is an accepted, known inconsistency, not an omission: the
objection is granted on the merits and the remedy is deferred rather than
rejected, because widening a spec mid-flight to chase a second instance of a
problem costs more review than it buys.

*Consequences to be aware of.* A roster driver will continue to read "Earned
today · ₾142.60" on a screen from which the Wallet has been removed, which is a
slightly odd pairing and is expected. If a future spec revisits it, the change
is small and lands in two places together — two ternaries in this file and one
branch in `today-screen.tsx` — and reversing only one of them would leave the
tile printing `₾0.00` for every roster driver. Anyone picking it up should log
it against
`specs/driver-hub-personas/action-required.md`'s "Confirm the roster-driver
Wallet decision" item, which is where both halves of this question belong.

*What was **not** overruled.* Two other suppressions in this task are unrelated
to the above and stand as specified: `sampled.zoneDemand` is `null` for
`ROSTER` (Decision R1, §8), and `sampled.onlineTimeLabel` is `null` for
`BUSINESS` (§8). Both concern **sampled** values that are meaningless for the
persona in question, which is a different argument from the one about a real
currency figure, and both follow the planning rule already recorded in the
requirements.

**On not de-mocking.** Nothing in this task turns a sampled value into a real
one. The vehicle compliance rows stay fictional and stay badged by the screen;
what changes is only *how many vehicles they are fictional about*. The two real
numbers this task adds — `jobsInProgressCount` and `fleetVehicleCount` — are
`COUNT(*)`s over `Order` and `Vehicle` and belong at the top level for exactly
that reason.

**On the honest limits of the fleet attention card.** After this change a real
fleet's card will still say much the same thing about three vehicles as it did
about one, because `sampleVehicleFacts()` only knows the handoff's seven demo
plates and everything else falls through to `SAMPLE_VEHICLE_FACTS_FALLBACK`
("Pending" / "not on file"). The improvement is not that the rows are better —
they are not — but that the card stops silently implying the fleet has one
vehicle, and starts naming how much of the fleet it actually covered. The rows
become genuinely useful when a `VehicleCompliance` model lands and the loader
can filter to the vehicles that have something expiring, at which point
`FLEET_COMPLIANCE_VEHICLE_LIMIT` should be revisited: a cap on a filtered list
is a different question from a cap on an unfiltered one.

**Why `jobsInProgressCount` is not put in the header.** The design's "6 jobs in
progress" is a header pill. `driver-hub-header.tsx` records at length why no
active-job indicator is built there: the header is a client component whose
shell contract is that nothing in it fetches, so surfacing the count globally
would mean `(hub)/layout.tsx` resolving `getHubToday()` and threading it through
the shell. The header rebuild is explicitly out of this spec's scope, and the
requirements carry the single exception in writing — *"the fleet
jobs-in-progress count lands on the Today screen, not in the header."* This task
puts the number where a screen already fetches it.

**On `Order.driverId` being nullable.** A company-claimed order sits with
`companyId` set and `driverId` still null until it is dispatched to a person, so
a fleet's in-progress list can legitimately contain a row with no driver name.
`driverName: null` is the correct answer for it and the screen renders that case
as unassigned rather than blank — do not filter such orders out of the list or
out of the count, because they *are* in progress and the fleet owner needs to
see that one of them has nobody on it.

**Manual verification needs three accounts.** Per
`specs/driver-hub-personas/action-required.md`, checking these branches at
runtime requires one independent driver, one driver with `DriverProfile.companyId`
set, and one `role === "COMPANY"` session, ideally each with completed and
in-flight orders. If those are not available, verify by reading the code and
running `pnpm lint` / `pnpm typecheck`, and say so plainly in your report
rather than claiming runtime verification.
