# Task 06: Today screen — render every persona branch

## Status

complete

## Wave

3

## Description

The Today screen and its three cards are currently written for one reader: an
independent driver looking at their own day. They print one in-flight job with
no idea who is driving it, hang two compliance rows off a single vehicle, offer
a "View earnings" button that a roster driver is now redirected away from, and
head the compliance card "Needs your attention" for a fleet owner whose own
attention is not what any of those rows is about.

Wave 2 made `HubTodayData` persona-aware and added the data every branch needs.
This task renders those branches: the fleet's real jobs-in-progress count and a
short attributed preview list where a single driver still sees their one job
exactly as before; the fleet-wide compliance rows with an honest statement of
how much of the fleet they cover; roster framing that names the employer,
removes the dead "View earnings" link and drops the incentive-shaped
zone-demand card; and fleet-appropriate copy wherever the existing second
person addresses the wrong party.

The hero tile's currency is **not** in scope. Whether a roster driver should
read "Earned today" at all was raised during spec-writing and explicitly
declined by the user; the tile stays identical for all three personas, and the
Notes record the argument so a later reader does not mistake the omission for
an oversight.

The screen's real/sampled discipline is not relaxed anywhere. Every sampled
value still renders a `<SampleNote />` naming the schema change that would
retire it, and the one real, unbadged glance row — Completion rate — stays real
and unbadged. The current-job card, which carries zero sample badges today
because every field on it is real, gains no badge either: everything this task
adds to it is real too.

## Dependencies

**Depends on:** task-02-today-persona-data
**Blocks:** None

**Context from dependencies:**

### The three personas

| Persona | `HubAccount.kind` | `HubAccount.companyId` | Who they are |
|---|---|---|---|
| `INDEPENDENT` | `"INDIVIDUAL"` | `null` | Owns their vehicle, browses the open Load Board, keeps their own fares |
| `ROSTER` | `"INDIVIDUAL"` | set — their **employer's** company | Employed driver; work arrives through company dispatch; the fares on their jobs are paid to the employer, not to them |
| `BUSINESS` | `"BUSINESS"` | set — their **own** company | Fleet owner; the only persona with the Drivers and Employees screens |

`task-01-hub-persona-model` added to `src/lib/dashboard/hub/account.ts`:

```ts
export type HubPersona = "INDEPENDENT" | "ROSTER" | "BUSINESS";
```

derived once inside `resolveHubAccount()` (`BUSINESS` when `kind ===
"BUSINESS"`; `ROSTER` when `kind === "INDIVIDUAL" && companyId !== null`;
`INDEPENDENT` otherwise). **This screen never derives it.** It reads
`data.persona`, which task-02 put on the payload.

Two facts about the wider feature this screen has to be consistent with, stated
here so you do not have to open another task file:

- **A roster driver has no Wallet.** `/dashboard/earnings` is removed from the
  sidebar for them *and* redirects them server-side to `/dashboard/today`. So a
  "View earnings" button on Today is, for that persona, a button whose only
  effect is to bounce them back to the screen they were already on. It must not
  render for them.
- **The sidebar's sampled "Weekly incentive" card is hidden for a roster driver
  and for a business account.** That is another task's file
  (`driver-hub-sidebar.tsx`) and you must not touch it, but it is the same
  editorial rule this screen applies to zone demand: incentive-shaped sampled
  content is hidden where it is meaningless rather than made real.

### The exact shape task-02 hands you

```ts
export type HubTodayData = {
  persona: HubPersona;
  /** Unchanged by this feature — a real figure for all three personas. */
  earnedToday: number;
  jobsCompletedToday: number;
  /** Unchanged by this feature — a real figure for all three personas. */
  averagePerJob: number;
  /** Newest-accepted first, capped at 3. Empty when nothing is running. */
  jobsInProgress: readonly HubTodayCurrentJob[];
  /** The uncapped total. Equal to `jobsInProgress.length` below the cap. */
  jobsInProgressCount: number;
  completionRatePercent: number | null;
  completedOrCancelledCount: number;
  /** Real. Always `null` for BUSINESS — a company holds no licence. */
  licenceAlert: HubLicenceAlert | null;
  /** The employing company's name, for ROSTER only; `null` otherwise. */
  employerName: string | null;
  /** Real `COUNT(*)` on `Vehicle`, for BUSINESS only; `null` otherwise. */
  fleetVehicleCount: number | null;
  sampled: {
    /** `null` for BUSINESS, which has no online state at all. */
    onlineTimeLabel: string | null;
    glance: {
      acceptanceRatePercent: number;
      cancellationsToday: number;
      averageRating: number;
      ratedJobCount: number;
    };
    /** `null` for ROSTER — suppressed, not emptied. */
    zoneDemand: {
      caption: string;
      rows: readonly SampleZoneDemandRow[];
    } | null;
    /** Two rows per covered vehicle. Unique on `(vehiclePlate, kind)`. */
    vehicleAlerts: readonly HubTodayVehicleAlert[];
    /** How many distinct vehicles `vehicleAlerts` covers. */
    vehicleAlertVehicleCount: number;
  };
};

/** One job in flight right now. */
export type HubTodayCurrentJob = {
  id: string;
  status: "ACCEPTED" | "IN_TRANSIT";
  /** Exactly two entries: `[0]` pickup, `[1]` drop-off. */
  stops: readonly HubTodayStop[];
  distanceKm: number;
  /** `driverPayout + overtimeDriverPayout` — the carrier's earnings. */
  fare: number;
  vehicleTypeLabel: string;
  createdAt: string;
  inTransitAt: string | null;
  completedAt: string | null;
  /** `User.name`, or `null` when the order is claimed but not yet dispatched. */
  driverName: string | null;
};

export type HubTodayStop = {
  kind: "PICKUP" | "DROPOFF";
  address: string;
  /** ISO when the leg was served, `null` while it is still ahead. */
  at: string | null;
};

export type HubLicenceAlert = {
  expiresAt: string;
  /** Whole Tbilisi days until expiry; negative once past. */
  daysRemaining: number;
  isExpired: boolean;
};

export type HubTodayVehicleAlert = {
  kind: "INSURANCE" | "INSPECTION";
  /** The real `Vehicle.plateNumber` the sampled facts were looked up by. */
  vehiclePlate: string;
  status: SampleComplianceStatus;   // "Valid" | "Expiring soon" | "Expired" | "Pending"
  /** Human due date, or the sample module's "not on file" fallback. */
  due: string;
};
```

**What changed from the shape this screen compiles against today:**
`data.currentJob` is **gone** — `jobsInProgress` + `jobsInProgressCount` replace
it. `sampled.onlineTimeLabel` and `sampled.zoneDemand` became nullable.
`persona`, `employerName`, `fleetVehicleCount`, `driverName` and
`sampled.vehicleAlertVehicleCount` are new. **`earnedToday`,
`jobsCompletedToday` and `averagePerJob` are untouched** — same types, same
values, same meaning for every persona. That is the entire delta, and the
screen currently does not compile against it — fixing that is this task.

### What is real and what is sampled — do not move this line

- **Real, no `<SampleNote />`:** `earnedToday`, `jobsCompletedToday`,
  `averagePerJob`, everything under `jobsInProgress`, `jobsInProgressCount`,
  `completionRatePercent`, `completedOrCancelledCount`, `licenceAlert`,
  `employerName`, `fleetVehicleCount`.
- **Sampled, `<SampleNote />` mandatory:** `sampled.onlineTimeLabel`, all four
  `sampled.glance` fields, `sampled.zoneDemand`, `sampled.vehicleAlerts`.

Note the asymmetry inside the "Today at a glance" card, which is the finest
real/sampled mix on any hub screen: **Completion rate is real and carries no
sample badge**, while Acceptance rate, Cancellations and Avg rating are sampled
and each carries its own. `today.ts`'s header comment explains why —
`sample.ts` exports no completion figure precisely because the number *is*
derivable from `Order.status`, and the honesty rule makes `sample.ts` the only
place a placeholder may live. Acceptance needs a `JobOffer` model (a declined
offer leaves no row at all), rating needs an `OrderRating` model, and a
cancellation cannot be attributed because `Order` records no actor for it.
**Preserve this exactly for all three personas.** The completion rate is
already fleet-scoped for a BUSINESS account through `hubOrderScope()`, so it is
just as real there as it is for one driver.

Also note that `sampled.vehicleAlertVehicleCount` and `fleetVehicleCount` are
**real numbers about sampled rows**. Saying "covering 3 of 12 vehicles" is a
true statement; the rows it counts are still fictional and still badged. Do not
badge the count, and do not un-badge the rows.

## Files to Create

None.

## Files to Modify

- `src/components/driver-hub/screens/today-screen.tsx` — read `data.persona`;
  branch the hero tile (roster loses the Wallet link and gains a dispatch line;
  business loses the online-time segment and its badge — the currency figure
  itself is unchanged for every persona); render the jobs-in-progress
  card with its new props; drop the zone-demand card entirely when
  `sampled.zoneDemand` is `null` and collapse row 2 to one column when it is;
  hand the attention card its new props.
- `src/components/driver-hub/screens/today-current-job-card.tsx` — take a list
  and a count instead of one job; render the fleet's count plus up to three
  attributed rows for `BUSINESS`, and the byte-identical existing single-job
  layout for the other two personas.
- `src/components/driver-hub/screens/today-attention-card.tsx` — reword
  `"Needs your attention"` and the rest of its second-person copy for
  `BUSINESS`; render rows for several vehicles with a key that is unique across
  plates; state how much of the fleet the rows cover and link to the rest.
- `src/components/driver-hub/screens/today-format.ts` — add the one formatter
  the fleet job rows need. **`formatTodaySubtitle`'s signature must not
  change** — see the warning below.

**Do not touch any other file.** In particular `src/lib/dashboard/hub/today.ts`
and `src/app/dashboard/(hub)/today/page.tsx` are task-02's, and the other four
Wave-3 tasks own the earnings, performance, vehicles and shell components.

**Hard constraint on `today-format.ts`.**
`formatTodaySubtitle(now: Date, city: string): string` is called from
`src/app/dashboard/(hub)/today/page.tsx:58`, a file owned by task-02 in the
previous wave. You may **add** exports to `today-format.ts`; you may not change
that function's name, parameters or return type, or the Wave-2 file stops
compiling.

## Technical Details

### 0. Conventions this screen already follows, and must keep following

- All four files are `"use client"`. Types come from the `server-only` loader
  via **`import type`** only (`import type { HubTodayData } from
  "@/lib/dashboard/hub/today";`, already at `today-screen.tsx:21` and
  `today-zone-demand-card.tsx:13`). A value import from a `server-only` module
  into a client component fails the build; a type import is erased. The same
  applies to the new `HubPersona` import from
  `@/lib/dashboard/hub/account` — `import type`, always. There is precedent:
  `loads-screen.tsx` type-imports `HubAccountKind` from the same module.
- **The six-tone status vocabulary in `src/components/driver-hub/hub-status.ts`
  is closed.** `HubStatusTone` is `"success" | "info" | "danger" | "warning" |
  "neutral" | "demand"`, and no screen may introduce a seventh. Use
  `HubStatusBadge` from `hub-primitives.tsx` for status words and plain
  typography for anything that is not a status. A count is not a status: do not
  invent a pill tone for "6 jobs in progress".
- **Empty states** use `HubEmptyState` from `hub-primitives.tsx` — *except*
  where the current files deliberately do not, and both exceptions are correct
  and must survive. `TodayCurrentJobCard`'s `RestingState` is written as a
  resting state rather than an absence because a driver is between jobs most of
  the day and a card that looked broken whenever nothing was happening would
  look broken most of the day. `TodayAttentionCard`'s empty branch says
  "Nothing needs your attention" as good news, because an empty attention list
  is the outcome the reader wants. Keep both as bespoke copy.
- Colour rule: anything with a token uses the token
  (`text-muted-foreground`, `border-border`, `bg-muted`); the handoff's
  un-tokenised values (the accent orange `oklch(64% 0.19 48)`, the warning
  surface `oklch(97.3% 0.071 103.193)`) are written as Tailwind arbitrary
  values, spelled out literally so Tailwind's source scanner can see them.
- All numeric text — money, counts, ids, plates, dates, distances — uses
  `font-price` (the repo's IBM Plex Mono variable).
- Comments in this codebase explain *why*, at length, in full sentences. Match
  that register; every branch you add should say which persona it serves and
  why that persona needs a different answer.
- **No mutations.** Nothing on Today writes. The online toggle lives in the
  sticky header, and accepting/starting/completing jobs live on the Jobs
  screen. Do not add a control.

### 1. `today-format.ts` — one new formatter

The module currently exports `EMPTY_VALUE`, `TILE_LABEL_CLASSES`, `formatGel`,
`formatDistanceKm`, `formatClock`, `formatShortDate`, `formatTodaySubtitle`,
`formatPercent`, `pluralise` and `shortId`, and pins every `Intl` formatter to
`HUB_TIME_ZONE` and an explicit locale so server and client render the same
characters. Add one export in the same register:

```ts
/**
 * A job's two stops as one line — "Avlabari → Sololaki".
 *
 * The fleet's jobs-in-progress rows have one line for a route where the
 * single-driver card has room for a full two-row stop list with its dots and
 * timestamps, so the route has to compress to a phrase. The arrow is the
 * design's own (`livePillJobs` renders `route: 'Didube → Gldani'`), and it is
 * a real `→` rather than `->` because this is display text, not a code
 * fragment.
 *
 * First and last rather than `[0]` and `[1]` because `HubTodayStop[]` is typed
 * as a list even though `Order` only ever produces two — if a multi-stop model
 * ever lands, this keeps naming the endpoints instead of silently naming the
 * first two of five. Returns `EMPTY_VALUE` for an empty list, which cannot
 * happen today and would otherwise print a bare arrow.
 */
export function formatStopRoute(stops: readonly HubTodayStop[]): string {
  const first = stops[0];
  const last = stops[stops.length - 1];

  // `noUncheckedIndexedAccess` is on: both reads are `T | undefined`.
  if (first === undefined || last === undefined) {
    return EMPTY_VALUE;
  }

  return first === last
    ? first.address
    : `${first.address} → ${last.address}`;
}
```

This needs `import type { HubTodayStop } from "@/lib/dashboard/hub/today";` at
the top of `today-format.ts`, which currently imports only `HUB_TIME_ZONE`.
That is a type-only import from a `server-only` module and is fine — see §0.

Everything else this task needs already exists: `formatGel`, `formatPercent`,
`pluralise`, `formatClock`, `formatShortDate`, `formatDistanceKm`, `shortId`,
`EMPTY_VALUE`, `TILE_LABEL_CLASSES`.

### 2. `today-current-job-card.tsx` — a count and a list for a fleet

This file is the one card on Today with **zero sample badges**: every field it
renders is real, and its header comment says so ("**Everything here is real.**").
That stays true — `jobsInProgress`, `jobsInProgressCount` and `driverName` are
all real. Do not add a `<SampleNote />` anywhere in this file.

**Props.** Replace `TodayCurrentJobCardProps` (`today-current-job-card.tsx:75-79`):

```ts
export type TodayCurrentJobCardProps = {
  /**
   * The jobs in flight, newest-accepted first, capped at three by the loader.
   * Empty renders the resting state.
   */
  jobs: readonly HubTodayCurrentJob[];
  /**
   * How many are in flight in total, uncapped. For an individual driver this
   * is 0 or 1 and equals `jobs.length`; for a fleet it can exceed it, which is
   * exactly what the "+N more" link exists for.
   */
  totalCount: number;
  /**
   * Which reader the card is written for. Only `BUSINESS` gets the count-first
   * fleet layout — the other two personas hold at most one job and read the
   * unchanged single-job card.
   */
  persona: HubPersona;
  className?: string;
};
```

**Top-level branch.** The card keeps its `HubCard` wrapper and its
`TILE_LABEL_CLASSES` micro-label, and the label itself becomes persona-aware:

```tsx
export function TodayCurrentJobCard({
  jobs,
  totalCount,
  persona,
  className,
}: TodayCurrentJobCardProps) {
  const isFleet = persona === "BUSINESS";

  return (
    <HubCard
      className={cn("h-full", className)}
      contentClassName="flex flex-1 flex-col"
    >
      {/* "Current job" is singular because an individual driver holds one at a
          time — the assumption `driver-dashboard-data.ts` makes for its own
          `activeOrderId`. A fleet holds as many as it has vans on the road, so
          its label names the set rather than a member of it. */}
      <p className={TILE_LABEL_CLASSES}>
        {isFleet ? "Jobs in progress" : "Current job"}
      </p>

      {isFleet ? (
        <FleetDetail jobs={jobs} totalCount={totalCount} />
      ) : jobs[0] === undefined ? (
        <RestingState />
      ) : (
        <JobDetail job={jobs[0]} />
      )}
    </HubCard>
  );
}
```

**`JobDetail` is untouched.** Every line of it — the short id with its full
cuid `title`, the `HubStatusBadge`, the stops/distance/accepted-at line, the
`<ol>` of `StopRow`s with their three dot states, and the `mt-auto` pinned fare
footer that makes row 1's three cards line their footers up — stays exactly as
it is. An independent driver's card must not change by a pixel. `RestingState`
is untouched too; its copy ("No job in progress" / "The next accepted job
appears here with its pickup, its drop-off and the fare it pays.") is already
neutral and correct for one driver.

**`FleetDetail` is new.** Its job is to answer, in order: how many are on the
road, which ones, and where the rest are.

```tsx
/**
 * The fleet variant: the count first, then as many of the jobs as fit, then a
 * way to the rest.
 *
 * The count leads because it is the fact a dispatcher wants at a glance and the
 * one the design's own pill carries ("6 jobs in progress"). The rows beneath it
 * are a preview, not the list — the loader caps them at three and the Jobs
 * screen is the real register — so each row is one line of route plus one line
 * of attribution rather than the full stop timeline the single-driver card
 * shows. A fleet's card would otherwise be three times the height of the two
 * cards beside it in the same stretched grid row.
 *
 * Every field here is real. `driverName` is `User.name`, the same string the
 * Drivers screen's own Driver column prints, so the same person reads
 * identically on both screens.
 */
function FleetDetail({
  jobs,
  totalCount,
}: {
  jobs: readonly HubTodayCurrentJob[];
  totalCount: number;
}) {
  if (totalCount === 0) {
    return <FleetRestingState />;
  }

  return (
    <>
      <p className="mt-2.5 font-price text-[26px] leading-none font-semibold">
        {totalCount}
      </p>
      <p className="mt-1 mb-3.5 text-[13px] text-muted-foreground">
        {totalCount === 1 ? "job on the road" : "jobs on the road"}
      </p>

      <ul className="flex flex-col gap-2.5">
        {jobs.map((job) => (
          <FleetJobRow key={job.id} job={job} />
        ))}
      </ul>

      {/* Pinned to the bottom for the same reason the single-driver card pins
          its fare footer: row 1's three cards share a height and their footers
          have to line up. */}
      <div className="mt-auto pt-4">
        <Link
          href="/dashboard/jobs"
          className="text-[13px] font-medium underline-offset-4 hover:underline"
        >
          {totalCount > jobs.length
            ? `View all ${totalCount} jobs in progress`
            : "View all jobs in progress"}
        </Link>
      </div>
    </>
  );
}
```

The link label is the design's own ("View all jobs in progress"), and it names
the total when the list is truncated so a fleet owner can see at a glance that
they are not looking at everything. `Link` comes from `next/link`, which this
file does not import today — add it.

One row per job:

```tsx
/**
 * One preview row: who is driving it, where it is going, and what state it is
 * in. Deliberately not a link — the Jobs screen owns per-job navigation, and a
 * row that opened a detail panel this screen does not have would be a dead end.
 */
function FleetJobRow({ job }: { job: HubTodayCurrentJob }) {
  return (
    <li className="flex items-start justify-between gap-3 border-t border-muted pt-2.5">
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">
          {formatStopRoute(job.stops)}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {/* `Order.driverId` is nullable: a company-claimed order sits with no
              driver until it is dispatched, and that is precisely the row a
              dispatcher most needs to see rather than one we quietly hid. */}
          {job.driverName ?? "Unassigned"} ·{" "}
          <span className="font-price" title={job.id}>
            {shortId(job.id)}
          </span>
        </span>
      </span>
      <HubStatusBadge
        status={job.status}
        label={STATUS_LABELS[job.status]}
        className="flex-none"
      />
    </li>
  );
}
```

`STATUS_LABELS` (`today-current-job-card.tsx:70-73`) already maps `ACCEPTED` →
"Accepted" and `IN_TRANSIT` → "In transit"; reuse it. Both words already
resolve through `hubStatusTone()` — "in transit" is mapped to `info`, and
"accepted" is unmapped and falls through to the documented `neutral` default,
exactly as it does on the single-driver card today. **No new tone.**

The fleet resting state:

```tsx
/**
 * A fleet between jobs. Same reasoning as `RestingState` — nothing is broken,
 * the vans are simply idle — but worded for a company rather than for one
 * person, and plural because a fleet's zero is "none of them" rather than
 * "not mine".
 */
function FleetRestingState() {
  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <p className="text-sm font-medium">No jobs in progress</p>
      <p className="mt-1.5 text-[13px] leading-normal text-muted-foreground">
        Nothing in the fleet is on the road right now. Accepted and in-transit
        jobs appear here with the driver running them.
      </p>
    </div>
  );
}
```

Finally, amend the file's header comment: it currently describes a single card
holding "the one job in flight, or a calm line saying there is none", and says
the no-job state "is the *common* one — a driver is between jobs far more often
than on one". Both statements are still true of the individual variant and need
a paragraph added for the fleet variant. Keep the two paragraphs explaining why
there is no third stop and no ETA — they are still the reason the rows carry
what they carry.

### 3. `today-attention-card.tsx` — fleet-wide rows and fleet-appropriate copy

**The second-person copy to fix.** There are four instances, all addressing a
driver about their own documents:

| Line | Current | Wrong for |
|---|---|---|
| 168 | `title="Needs your attention"` | `BUSINESS` — the rows are about the fleet's vans, not the owner's own papers |
| 197 | `"Nothing needs your attention"` | `BUSINESS` |
| 199-201 | `"Your licence and vehicle documents are in order. Anything that is about to expire shows up here."` | `BUSINESS` — a company has no licence, and `licenceAlert` is always `null` for it |
| 129 | `` `${alert.vehiclePlate} · renew the policy to keep taking jobs.` `` | `BUSINESS` — "taking jobs" is what a driver does; a fleet keeps a *van* on the road |

`ROSTER` is a driver looking at their own licence and their assigned vehicle, so
the existing second person is correct for them and must not change. Only
`BUSINESS` gets new copy.

**Props.** Replace `TodayAttentionCardProps`
(`today-attention-card.tsx:137-143`):

```ts
export type TodayAttentionCardProps = {
  /** Picks the card's voice — see `attentionTitle` below. */
  persona: HubPersona;
  /**
   * Real. `null` for a BUSINESS account, which holds no licence of its own —
   * `resolveHubAccount()` gives a COMPANY session no `driverProfileId`, and its
   * drivers' licences belong on the Drivers screen where they can be attached
   * to a named person who can actually be called about one.
   */
  licenceAlert: HubLicenceAlert | null;
  /**
   * Sampled. Two rows per vehicle covered — one insurance, one inspection —
   * and unique on `(vehiclePlate, kind)` rather than on `kind` alone, which is
   * what it used to be when only one vehicle was ever covered.
   */
  vehicleAlerts: readonly HubTodayVehicleAlert[];
  /** How many distinct vehicles `vehicleAlerts` covers. Real. */
  vehicleAlertVehicleCount: number;
  /** The fleet's real registered vehicle count; `null` when not a fleet. */
  fleetVehicleCount: number | null;
  className?: string;
};
```

The component destructures the new props and derives one local, which the
sketches below all read:

```tsx
export function TodayAttentionCard({
  persona,
  licenceAlert,
  vehicleAlerts,
  vehicleAlertVehicleCount,
  fleetVehicleCount,
  className,
}: TodayAttentionCardProps) {
  const isFleet = persona === "BUSINESS";
  // …the existing `licenceNeedsAttention`, `openVehicleAlerts` and `hasRows`
  // derivations are unchanged…
```

**The key bug.** Line 183 reads `key={alert.kind}` with the comment "One row
per kind, and `today.ts` emits each kind at most once." That stopped being true
in Wave 2 — three vehicles now produce three `INSURANCE` rows — and duplicate
React keys in a sibling list are a real reconciliation bug, not a warning to
silence. It becomes:

```tsx
key={`${alert.vehiclePlate}-${alert.kind}`}
```

with the comment updated to say rows are unique on the pair.

**The card title and the two empty-state lines.** Small helpers keep the JSX
readable and put the reasoning next to the copy:

```tsx
/**
 * Whose attention the card is asking for.
 *
 * A driver reads it about their own licence and their own van, so the second
 * person is right for both `INDEPENDENT` and `ROSTER`. A fleet owner reads it
 * about their vehicles — none of the rows is about a document of *theirs*, and
 * `licenceAlert` is structurally `null` for them — so addressing them in the
 * second person points at the wrong party. "Fleet attention" names the subject
 * instead of the reader, which is what the rows are actually about.
 */
function attentionTitle(persona: HubPersona): string {
  return persona === "BUSINESS" ? "Fleet attention" : "Needs your attention";
}
```

and the empty branch, which is deliberately *not* `HubEmptyState` (nothing is
missing — an empty attention list is the outcome the reader wants, and that
comment at line 193-195 stays):

```tsx
{hasRows ? null : (
  <div className="py-2">
    <p className="text-sm font-medium">
      {isFleet ? "Nothing needs attention" : "Nothing needs your attention"}
    </p>
    <p className="mt-1.5 text-[13px] leading-normal text-muted-foreground">
      {isFleet
        ? "Every vehicle we checked has its documents in order. Anything that is about to expire shows up here."
        : "Your licence and vehicle documents are in order. Anything that is about to expire shows up here."}
    </p>
  </div>
)}
```

Note "every vehicle **we checked**" rather than "every vehicle": the rows cover
at most three of the fleet, and a card that said "every vehicle" would be
asserting something about vans it never looked at.

**`vehicleAlertBody` becomes persona-aware.** It is currently
(`today-attention-card.tsx:127-131`):

```ts
function vehicleAlertBody(alert: HubTodayVehicleAlert): string {
  return alert.kind === "INSURANCE"
    ? `${alert.vehiclePlate} · renew the policy to keep taking jobs.`
    : `Book the annual inspection for ${alert.vehiclePlate}.`;
}
```

Take a persona and change only the insurance clause — the inspection line
already names the plate and asks for a booking, which reads correctly for
either reader:

```ts
function vehicleAlertBody(
  alert: HubTodayVehicleAlert,
  persona: HubPersona,
): string {
  if (alert.kind !== "INSURANCE") {
    return `Book the annual inspection for ${alert.vehiclePlate}.`;
  }

  // "Keep taking jobs" is what a driver does with their own van. A fleet owner
  // is not the one taking the job — they are the one who loses a vehicle from
  // the roster when its cover lapses.
  return persona === "BUSINESS"
    ? `${alert.vehiclePlate} · renew the policy to keep this vehicle on the road.`
    : `${alert.vehiclePlate} · renew the policy to keep taking jobs.`;
}
```

`licenceTitle` (lines 98-110) is untouched: it only ever runs when
`licenceAlert !== null`, which never happens for `BUSINESS`.

**Coverage footer.** When the card is a fleet's, it must say how much of the
fleet it looked at, because three rows about three vans in a fleet of twelve
otherwise reads as a clean bill of health for all twelve. Render it inside the
card, after the rows, for `BUSINESS` only:

```tsx
{/* Only a fleet needs this: a driver's rows cover the one vehicle they have.
    The two numbers are real — a plate count and a `COUNT(*)` on `Vehicle` —
    even though the rows they describe are sampled, so this line carries no
    sample badge of its own. The rows keep theirs. */}
{isFleet && fleetVehicleCount !== null ? (
  <p className="pt-1 text-xs text-muted-foreground">
    {fleetVehicleCount === 0
      ? "No vehicles registered yet."
      : `Covering ${vehicleAlertVehicleCount} of ${pluralise(fleetVehicleCount, "vehicle")}. `}
    {fleetVehicleCount > vehicleAlertVehicleCount ? (
      <Link href={VEHICLES_HREF} className="underline underline-offset-4">
        See the whole fleet
      </Link>
    ) : null}
  </p>
) : null}
```

No new imports are needed for this block: the file already imports `Link` from
`next/link` (line 3) and both `formatShortDate` and `pluralise` from
`@/components/driver-hub/screens/today-format` (lines 6-9), and
`VEHICLES_HREF` (`"/dashboard/vehicles"`) is already declared at line 83. The
only import to add to this file is `HubPersona`, type-only, from
`@/lib/dashboard/hub/account`.

The `hasRows` calculation (lines 150-163) is unchanged in shape but now has to
account for the footer: `contentClassName={hasRows ? "flex flex-col gap-2.5" :
undefined}` should stay, and the footer sits inside the same content wrapper.
The `openVehicleAlerts` filter that drops `status === "Valid"` rows stays
exactly as written — its comment ("A 'Valid' policy is not an alert … so a
fleet whose sampled facts happen to be in order gets the calm state rather than
two rows of good news filed under 'attention'") is now more load-bearing, not
less, because there are more rows to filter.

Finally, amend the file's header comment. It still describes a card with one
licence row and two vehicle rows; it needs a paragraph saying the vehicle rows
now cover several vehicles for a fleet, that the per-row badge (rather than a
card-level one) matters more with more rows because a reader has to be able to
tell which of *many* adjacent rows is fabricated, and that the licence row is
structurally absent for a fleet rather than merely empty.

### 4. `today-screen.tsx` — the branches

**Read the persona once.** At the top of the component
(`today-screen.tsx:103-106`):

```tsx
export function TodayScreen({ data, subtitle }: TodayScreenProps) {
  const { persona, sampled } = data;
  const isRoster = persona === "ROSTER";
  const isFleet = persona === "BUSINESS";

  useHubSubtitle(subtitle);
```

`useHubSubtitle(subtitle)` is unchanged — the subhead is still formatted on the
server and handed over as a finished string, for the hydration reason
`today/page.tsx` documents at length (deriving it here would mean calling
`new Date()` on both sides of hydration, two different instants that straddle
midnight often enough to matter).

**The hero tile.** The tile keeps its `hero` sizing, its `h-full p-[22px]` and
its 1.15fr track. Its label stays **"Earned today"** and its value stays
`formatGel(data.earnedToday)` for **all three personas** — including `ROSTER`.

> **Do not suppress the currency for a roster driver.** Doing so was proposed
> during spec-writing and was **explicitly declined by the user**; the argument
> and the reason it was turned down are recorded in this task's Notes under
> *"Considered and declined: the roster hero tile"*. The money on this tile is
> out of scope for this feature. If the branch looks missing to you, it is
> missing on purpose — read the Notes before adding it.

Two things do change, and neither is about `earnedToday`:

*Roster — no Wallet link.* This one is **not** part of the declined proposal
and stands on its own. `/dashboard/earnings` is removed from the sidebar for a
roster driver *and* redirected server-side to `/dashboard/today` by this
feature, so a "View earnings" button on Today is a control whose only effect is
to bounce the reader straight back to the screen they are already on. It must
not render for them. The tile also gains a short dispatch line naming the
employer, which is what `employerName` was carried through for — it frames the
day as work that arrived through dispatch without touching the figure above it.

*Business — no online-time segment.* `sampled.onlineTimeLabel` is `null`,
because `resolveHubAccount()` gives a COMPANY session `isOnline: null` and
`canToggleOnline: false` — a fleet has no online state to report even in
sampled form. With the segment gone the `<SampleNote label="Online time" />`
under the tile goes with it: a badge naming a value that is not rendered is
noise, and everything else on the tile is real.

```tsx
{/* The label, the figure and the per-job average are identical for all three
    personas — see this task's Notes on why a roster driver still reads a
    currency here. The two branches below are about a *sampled* value a company
    has no equivalent of, and about a link a roster driver would be redirected
    away from. */}
<MetricTile
  className="h-full p-[22px]"
  label="Earned today"
  hero
  value={formatGel(data.earnedToday)}
  note={
    <>
      <span className="font-price">{data.jobsCompletedToday}</span>{" "}
      {data.jobsCompletedToday === 1 ? "job" : "jobs"}
      {/* A company has no online time even in sampled form, so the segment and
          its separator drop out together rather than leaving a stray "·". */}
      {sampled.onlineTimeLabel === null ? null : (
        <>
          {" · "}
          <span className="font-price">{sampled.onlineTimeLabel}</span>
        </>
      )}{" "}
      ·{" "}
      <span className="font-price">{formatGel(data.averagePerJob)}</span> per
      job
      {/* Frames the day as dispatched work. `employerName` is non-null for
          exactly the persona this renders for; the fallback exists because the
          type is `string | null` and a non-null assertion inside copy is a
          worse answer than a phrase that still reads correctly. */}
      {isRoster ? (
        <span className="mt-0.5 block">
          Dispatched by{" "}
          <span className="font-medium text-foreground">
            {data.employerName ?? "your employer"}
          </span>
        </span>
      ) : null}
    </>
  }
>
  {sampled.onlineTimeLabel === null ? null : (
    <SampleNote label="Online time" note={ONLINE_TIME_NOTE} className="mt-2.5" />
  )}

  <div className="mt-[18px] flex flex-wrap gap-2">
    {/* Absent for a roster driver: the Wallet is hidden from their sidebar and
        `/dashboard/earnings` redirects them back here server-side, so this
        button would be a round trip to nowhere. */}
    {isRoster ? null : (
      <Button asChild size="lg" className="h-auto rounded-md px-[14px] py-2 text-[13px]">
        <Link href="/dashboard/earnings">View earnings</Link>
      </Button>
    )}
    <Button
      asChild
      // Promoted to the primary variant when it is the only button left, so
      // the tile does not end on a lone secondary control.
      variant={isRoster ? "default" : "outline"}
      size="lg"
      className="h-auto rounded-md px-[14px] py-2 text-[13px]"
    >
      <Link href="/dashboard/jobs">Job history</Link>
    </Button>
  </div>
</MetricTile>
```

`ONLINE_TIME_NOTE` (`today-screen.tsx:70-74`) is unchanged. Its closing
sentence — "The job count and the per-job average beside it are real." —
remains true for both personas that see the badge, since the note now renders
only for `INDEPENDENT` and `ROSTER` and both of them do show a per-job average
beside it.

**The glance card is unchanged.** All four `GlanceRow`s render for every
persona, with the same values, the same three sample notes and the same real,
unbadged Completion rate carrying its own denominator note ("N jobs finished
this week"). Do not add a persona branch here. The heading stays "Today at a
glance". The one thing worth a comment: for a `BUSINESS` account the completion
rate is a fleet-wide figure, because `hubOrderScope()` scopes it by `companyId`
— still real, still unbadged, just about more jobs.

**The current-job card.** New props:

```tsx
<TodayCurrentJobCard
  jobs={data.jobsInProgress}
  totalCount={data.jobsInProgressCount}
  persona={persona}
/>
```

**Row 2.** `sampled.zoneDemand` is `null` for a roster driver, so the card
disappears and the row collapses to a single column — otherwise the attention
card would sit alone in a 1.15fr track with a 1fr gap of nothing beside it:

```tsx
{/* Row 2. The zone-demand card is absent for a ROSTER driver: every row on it
    is a repositioning prompt paired with a surge bonus, and an employed driver
    neither chooses where to sit (work reaches them through their employer's
    dispatch) nor keeps the bonus if they did. Hidden rather than emptied, per
    this feature's rule that a sampled card meaningless for a persona is
    removed rather than made real. With one child the row is one column. */}
<div
  className={cn(
    "grid items-stretch gap-5",
    sampled.zoneDemand === null ? "lg:grid-cols-1" : "lg:grid-cols-[1.15fr_1fr]",
  )}
>
  {sampled.zoneDemand === null ? null : (
    <TodayZoneDemandCard zoneDemand={sampled.zoneDemand} />
  )}
  <TodayAttentionCard
    persona={persona}
    licenceAlert={data.licenceAlert}
    vehicleAlerts={sampled.vehicleAlerts}
    vehicleAlertVehicleCount={sampled.vehicleAlertVehicleCount}
    fleetVehicleCount={data.fleetVehicleCount}
  />
</div>
```

This needs `cn` from `@/lib/utils`, which `today-screen.tsx` does not import
today — add it.

**The file header comment.** Lines 23-64 are a careful account of what is real
and what is sampled on this screen and must be updated rather than left to
drift. Specifically: the "Real"/"Sampled" bullet lists need the new fields; the
paragraph beginning "It answers four things at a glance" should acknowledge
that the four questions are asked of three different readers; and a new short
section should record the three persona differences (roster loses the currency,
the Wallet link and the zone-demand card; business loses the online-time
segment and reads a fleet count instead of one job; the licence row is
structurally absent for a fleet). Keep the "No mutations" section verbatim.

### 5. `today-zone-demand-card.tsx` — one line

The card's own contents do not change: every value on it is invented, one
card-level `<SampleNote />` (rather than one per row) is correct and its
reasoning stays, and the caption is still `zoneDemand.caption` used verbatim
("Sample snapshot", deliberately not a live-looking timestamp).

The only edit is the prop type at line 55, which currently widens to include
`null` now that the loader's field is nullable. The screen decides not to
render the card at all rather than the card rendering an empty state, so tighten
the prop instead of loosening the component:

```ts
export type TodayZoneDemandCardProps = {
  /**
   * Non-null by construction: `today-screen.tsx` omits the card entirely when
   * the loader returns `null` for a ROSTER driver, rather than handing this
   * component a null it would have to render an empty state for. A card that
   * says "no zone data" under a heading promising some is worse than no card.
   */
  zoneDemand: NonNullable<HubTodayData["sampled"]["zoneDemand"]>;
  className?: string;
};
```

The `rows.length === 0` branch that renders `HubEmptyState` stays — that is a
different case (a zone table that exists but is empty) and is still reachable.

### 6. Order of work

1. `today-format.ts` — add `formatStopRoute` and its type import.
2. `today-current-job-card.tsx` — new props, `FleetDetail`, `FleetJobRow`,
   `FleetRestingState`; leave `JobDetail`, `StopRow` and `RestingState` alone.
3. `today-attention-card.tsx` — new props, the key fix, `attentionTitle`, the
   persona-aware `vehicleAlertBody`, the empty-state copy and the coverage
   footer.
4. `today-zone-demand-card.tsx` — the one prop-type line.
5. `today-screen.tsx` — persona reads, the hero tile branch, the new card
   props, the row-2 collapse, and the header comment.
6. `pnpm lint` and `pnpm typecheck` must both pass clean. There should be no
   remaining errors anywhere: this task closes the ones task-02 knowingly left.
7. `git grep -n "Needs your attention"` should return only the non-`BUSINESS`
   branch inside `today-attention-card.tsx`.

## Acceptance Criteria

- [ ] `today-screen.tsx` reads `data.persona` and never re-derives persona from
      `kind` or `companyId`; it does not import `resolveHubAccount` or anything
      else server-side.
- [ ] All four files still compile as `"use client"`; every type crossing from
      `@/lib/dashboard/hub/today` or `@/lib/dashboard/hub/account` uses
      `import type`.
- [ ] `formatTodaySubtitle(now: Date, city: string): string` keeps its exact
      name, parameters and return type — `today/page.tsx` calls it and is owned
      by another task.
- [ ] `TodayCurrentJobCard` takes `jobs`, `totalCount` and `persona`; no
      reference to a `currentJob` prop or field remains anywhere.
- [ ] For `INDEPENDENT` and `ROSTER`, the current-job card renders exactly the
      layout it renders today — the micro-label "Current job", the short id with
      its full-cuid `title`, the status badge, the stops/distance/accepted-at
      line, the two `StopRow`s with their dot states, and the `mt-auto` fare
      footer. `JobDetail`, `StopRow` and `RestingState` are unmodified.
- [ ] For `BUSINESS`, the card leads with `jobsInProgressCount` (the real,
      uncapped total — **not** `jobs.length`), lists up to three rows each
      naming the driver, and links to `/dashboard/jobs`, naming the total when
      the list is truncated.
- [ ] A fleet job with `driverName === null` renders as "Unassigned" and is
      neither hidden nor dropped from the count.
- [ ] `today-current-job-card.tsx` still contains **zero** `<SampleNote />`
      usages — every field it renders is real.
- [ ] The status pills on the fleet rows use `HubStatusBadge` with the existing
      `STATUS_LABELS` map. No seventh `HubStatusTone` is introduced anywhere in
      this task.
- [ ] `today-attention-card.tsx` keys its vehicle rows on
      `` `${alert.vehiclePlate}-${alert.kind}` `` and the stale "each kind at
      most once" comment is corrected.
- [ ] Every sampled vehicle row still carries its own per-row `<SampleNote />`
      with `VEHICLE_ALERT_NOTE`, and the `status !== "Valid"` filter is intact.
- [ ] The card title reads "Fleet attention" for `BUSINESS` and "Needs your
      attention" for the other two personas; the empty-state headline and body
      are reworded for `BUSINESS`; `vehicleAlertBody`'s insurance clause is
      reworded for `BUSINESS`. `ROSTER` copy is byte-identical to `INDEPENDENT`
      copy throughout this card.
- [ ] For `BUSINESS`, the attention card states how many vehicles the rows
      cover against `fleetVehicleCount` and links to `/dashboard/vehicles` when
      the fleet is larger than the covered set. That line carries no sample
      badge, because both numbers on it are real.
- [ ] The hero tile's label ("Earned today"), its value
      (`formatGel(data.earnedToday)`) and its per-job average render
      **identically for all three personas**. No persona branch touches the
      currency. (Suppressing it for `ROSTER` was proposed and declined — see
      Notes.)
- [ ] The hero tile renders **no** "View earnings" button for `ROSTER`, whose
      Wallet is hidden and whose `/dashboard/earnings` redirects server-side,
      and "Job history" is promoted to the primary variant when it is the only
      button left.
- [ ] For `ROSTER` the hero tile's note names `employerName` on a "Dispatched
      by …" line, framing the day as dispatched work.
- [ ] The hero tile omits the online-time segment **and** its
      `<SampleNote label="Online time" />` for `BUSINESS`; `ONLINE_TIME_NOTE`
      no longer claims a per-job average is rendered beside it in a case where
      it is not.
- [ ] The "Today at a glance" card is unchanged for all three personas: four
      rows, three with sample notes, and Completion rate real, unbadged and
      carrying its "N jobs finished this week" denominator note.
- [ ] `TodayZoneDemandCard` does not render at all for `ROSTER`, and row 2
      collapses to one column when it is absent. Its prop type is the
      `NonNullable<…>` form; the component itself is otherwise unchanged,
      including its single card-level `<SampleNote />` and its verbatim caption.
- [ ] No component on this screen writes anything: no form, no button with an
      `onClick` that mutates, no second online toggle.
- [ ] The four files' header comments are updated to describe what they now do
      — in particular `today-screen.tsx`'s Real/Sampled lists and
      `today-attention-card.tsx`'s account of its rows.
- [ ] `pnpm lint` and `pnpm typecheck` both pass clean.

## Notes

**Why the fleet card is a preview and not a table.** Row 1 of this screen is a
stretched `1.15fr 1fr 1fr` grid whose three cards share a height, and the
current-job card's `mt-auto` footer is what makes their footers line up. A
fleet's full in-flight list would blow that row's height out and push the
zone-demand and attention cards below the fold. The loader caps the list at
three for exactly this reason and the Jobs screen — which is 100% real data,
paginated, and untouched by this spec — is the register. The link out is not a
consolation prize; it is where the answer actually lives.

**Why the count and the list are both shown.** They answer different questions.
The count answers "how much of my fleet is working right now", which is the
number the design puts in a pill. The list answers "and which of it should I
look at", which needs a name attached or it is unactionable. Showing only the
count would leave a dispatcher with a number and nowhere to go; showing only
the list would silently cap that number at three.

**Considered and declined: the roster hero tile.**

Recorded here at length because what it leaves in place is a real
inconsistency, and the next reader should be able to tell that it was seen,
argued and settled rather than missed.

*The objection.* A roster driver's Wallet is hidden by this feature because, as
the requirements put it, *"a roster driver's Wallet sums `driverPayout` over
orders assigned to them and labels the total as their earnings — but for an
employed driver that money was paid to their employer, so the screen asserts
something false."* Today's hero tile is the **same sum over the same scope**,
bucketed to one day rather than a range: `hubOrderScope()` gives a `ROSTER`
driver `{ driverId: account.userId }`, the loader sums `driverPayout +
overtimeDriverPayout`, and the tile is labelled "Earned today". Every word of
the objection to the Wallet applies to it. A proposal was therefore made during
spec-writing to render `jobsCompletedToday` and the employer's name in place of
the currency for that persona.

*The decision.* **The user declined it.** The feature's scope is held to what
was approved: the Wallet is hidden, and nothing else about a roster driver's
money changes. The hero tile is byte-identical for all three personas. This is
an accepted, known inconsistency — the objection is granted on the merits and
the remedy is deferred, not rejected, because widening the spec mid-flight to
chase a second instance of the same problem costs more review than it buys.

*So, concretely:* a roster driver reads "Earned today · ₾142.60" on a screen
from which the Wallet has been removed. That pairing is expected. **Do not
"fix" it while implementing this task.** If a later spec picks it up, the change
lands in two places at once — two ternaries in `today.ts` and one branch here —
and reversing only one of them would print `₾0.00` for every roster driver.
`specs/driver-hub-personas/action-required.md`'s "Confirm the roster-driver
Wallet decision" item is where both halves of the question belong.

*What this does **not** cover.* Three nearby changes in this task are unrelated
to the declined proposal and stand as specified: the missing "View earnings"
button for `ROSTER` (that button leads to a server-side redirect back to this
very screen, so it is a broken control regardless of what the tile prints); the
absent zone-demand card for `ROSTER`; and the absent online-time segment and
badge for `BUSINESS`. The last two concern **sampled** values that are
meaningless for the persona reading them, which is a different argument from
the one about a real currency figure.

**On `employerName ?? "your employer"`.** The fallback is unreachable in
practice — `persona === "ROSTER"` is derived from `companyId !== null`, and
`resolveHubAccount()` reads `companyName` through the same relation — but the
type is `string | null` and a non-null assertion in a copy string is a worse
answer than a phrase that still reads correctly. Keep it and say why in a
comment.

**Runtime verification needs three accounts.** Per
`specs/driver-hub-personas/action-required.md`, exercising these branches for
real requires one independent driver, one driver with `DriverProfile.companyId`
set, and one `role === "COMPANY"` session — ideally the company with several
in-flight orders and more than three registered vehicles, which is the only way
to see the truncation, the "+N" link and the coverage footer at once. If those
accounts are not available, verify by reading the code and running `pnpm lint`
and `pnpm typecheck`, and say plainly in your report that the runtime behaviour
was not exercised rather than implying it was.
