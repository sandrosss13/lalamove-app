# Task 08: Performance screen personas

## Status

complete

## Wave

3

## Description

The Performance screen is byte-identical for all three registered-driver account
shapes, and for a fleet owner it is wrong in four separate places: a tile note
reading *"Of the jobs offered to **you**"*, a card headed *"What affects **your**
score"*, a tile labelled *"Avg rating"* showing one driver's 4.86, and a chart
whose primary series is an online-hours estimate for an account that has no
`DriverProfile` and therefore no online state at all.

This task makes the screen read `data.persona` and branch: it renders the new
per-driver breakdown table for `BUSINESS`, drops or rewords the second-person
driver copy a fleet owner should never see, and — because Performance is the one
hub screen in the whole codebase with **no `HubEmptyState` usage anywhere** —
gives that new table a proper empty state from the shared primitive.

It changes no data and adds no new sampled value. Everything it renders was
already computed by task-04.

## Dependencies

**Depends on:** task-04-performance-persona-data
**Blocks:** None

**Context from dependencies:**

### The three personas

task-01 (Wave 1) added `HubPersona` to `HubAccount`, derived once inside the
React-`cache()`d `resolveHubAccount()` in `src/lib/dashboard/hub/account.ts`:

| Persona | `HubAccount.kind` | `HubAccount.companyId` | Who they are |
|---|---|---|---|
| `INDEPENDENT` | `"INDIVIDUAL"` | `null` | Owns their vehicle, browses the open Load Board, keeps their own fares |
| `ROSTER` | `"INDIVIDUAL"` | set (their **employer**) | Employed driver; work arrives via company dispatch; fares are paid to the employer |
| `BUSINESS` | `"BUSINESS"` | set (their **own** company) | Fleet owner; also sees the Drivers and Employees screens |

```ts
export type HubPersona = "INDEPENDENT" | "ROSTER" | "BUSINESS";
```

Performance is visible to **all three** personas — there is no redirect and no
nav change for this screen. The persona arrives inside the screen's `data` prop;
this component never re-derives it and never reads `kind` or `companyId`.

For this screen, `INDEPENDENT` and `ROSTER` render **identically**. Both are one
person driving, both have a personal completion rate and a personal score, and
the only thing that differs between them (who gets paid) is an Earnings concern
handled by task-03/task-07. So every branch in this file is
`persona === "BUSINESS"` versus everything else — do not add a third branch.

### What task-04 produces — the exact shape this task consumes

task-04 modified `src/lib/dashboard/hub/performance.ts`. After it lands, the
module exports these types. **This is the contract; nothing else about it needs
to be read from another task file.**

```ts
/** One column of the jobs-completed bar chart. Unchanged by this feature. */
export type HubPerformanceDay = {
  /** Tbilisi `YYYY-MM-DD`. */
  date: string;
  /** Three-letter Tbilisi weekday; lines up with `SampleOnlineHoursDay.day`. */
  weekday: string;
  jobsCompleted: number;
  /** True for days of this week that have not started yet. */
  isFuture: boolean;
};

/** One row of the fleet breakdown. EVERY FIELD ON THIS TYPE IS REAL. */
export type HubPerformanceDriverRow = {
  /** `User.id` — the same key `HubDriver.userId` carries on the Drivers screen. */
  userId: string;
  /** `User.name`. */
  name: string;
  /** COMPLETED orders booked this week for this company. */
  completedCount: number;
  /** CANCELLED orders booked this week for this company. */
  cancelledCount: number;
  /** `completedCount + cancelledCount` — the denominator of both rates. */
  finishedJobCount: number;
  /** `null` — never 0 — when this driver finished nothing this week. */
  completionRatePercent: number | null;
  /** The complement; `null` on the same condition. */
  cancellationRatePercent: number | null;
  /** COMPLETED orders this week dated by `completedAt` — the chart's basis. */
  jobsCompleted: number;
  /** `jobsCompleted / window.daysElapsed`, one decimal. */
  jobsPerDay: number;
};

/** The BUSINESS-only breakdown. Non-null only for `persona === "BUSINESS"`. */
export type HubPerformanceFleet = {
  /**
   * Every driver currently on the roster, including those who did nothing this
   * week. Ordered busiest first (`finishedJobCount` descending), ties broken by
   * name. May be empty — a fleet that has registered nobody.
   */
  drivers: readonly HubPerformanceDriverRow[];
  /**
   * Finished jobs this week the company holds that no row above accounts for:
   * orders never dispatched (`driverId IS NULL`) plus orders carried by someone
   * who has since left the roster. Frequently `0`.
   */
  unattributedFinishedJobCount: number;
};

export type HubPerformanceData = {
  /** NEW in this feature. */
  persona: HubPersona;
  window: {
    /** Tbilisi `YYYY-MM-DD` of the week's Monday. */
    from: string;
    /** Tbilisi `YYYY-MM-DD` of the week's Sunday. */
    to: string;
    /** Always 7. */
    days: number;
    /** Days of the window that have started, Monday through today. At least 1. */
    daysElapsed: number;
  };
  /** REAL. `null` when nothing finished this week — the screen prints "—". */
  completionRatePercent: number | null;
  /** REAL. `null` on the same condition. */
  cancellationRatePercent: number | null;
  /** REAL. Jobs behind both rates, keyed on `createdAt`. */
  finishedJobCount: number;
  /** REAL. Completed jobs keyed on `completedAt` — the bars' total. */
  jobsCompleted: number;
  /** REAL. `jobsCompleted / window.daysElapsed`, one decimal. */
  jobsPerDay: number;
  /** REAL. Seven entries, Monday first, zero-filled. */
  jobsByDay: readonly HubPerformanceDay[];
  /** NEW in this feature. Real data; non-null only for BUSINESS. */
  fleet: HubPerformanceFleet | null;
  /** Everything below this line is fictional — badge it. */
  sampled: {
    acceptanceRatePercent: number;
    /**
     * Persona-keyed by task-04: `SAMPLE_FLEET_AVG_RATING` (4.76) for BUSINESS,
     * `SAMPLE_AVG_RATING` (4.86) otherwise. The screen does not choose; it
     * renders whichever arrived, under the label this task picks.
     */
    averageRating: number;
    /** Likewise: 214 for BUSINESS, 61 otherwise. */
    ratedJobCount: number;
    idleMinutesPerHour: number;
    /** The hours half of the paired chart. Supplied for every persona. */
    onlineHoursWeek: readonly SampleOnlineHoursDay[];
    /** Period-over-period deltas for all five tiles. */
    deltas: Record<SamplePerformanceMetric, SampleMetricDelta>;
    /** The "What affects your score" rows. Supplied for every persona. */
    scoreNotes: readonly SampleScoreNote[];
  };
};
```

Supporting sample types, unchanged, from `@/lib/dashboard/hub/sample`:

```ts
export type SampleMetricDelta = { label: string; tone: "good" | "bad" };
export type SampleOnlineHoursDay = { day: string; onlineHours: number; jobsCompleted: number };
export type SamplePerformanceMetric =
  "acceptance" | "completion" | "cancellations" | "rating" | "jobsPerDay";
export type SampleScoreNote = { title: string; value: string; body: string; tone: "good" | "bad" };
```

**Two things about task-04's output that drive this task's design:**

1. **`sampled.onlineHoursWeek` and `sampled.scoreNotes` are supplied for
   `BUSINESS` too.** task-04 deliberately keeps the `sampled` sub-object a
   single non-conditional shape. It is *this* task's job to decline to render
   them for a fleet, per the spec rule that a sampled card which is meaningless
   for a persona is **hidden, not made real**. Branch on `persona`, never on
   `onlineHoursWeek.length`.
2. **The fleet table carries no sampled value at all.** task-04 excluded
   per-driver acceptance on purpose: `sampleDriverFacts()` falls back to
   `acceptanceRatePercent: 0` for any driver id not in the handoff's seed data —
   which is every driver in a real database — so an acceptance column would print
   a confident, specific, wrong `0%` against every named person on the roster.
   **The table therefore renders no `<SampleNote />`, and none may be added.**

`src/app/dashboard/(hub)/performance/page.tsx` still renders
`<PerformanceScreen data={data} />` with a single prop. task-04 added no second
prop and this task must not ask for one.

## Files to Create

None. The fleet table is a local component inside `performance-screen.tsx` (see
**Step 5**), not a new module — the wave's file ownership is drawn around the two
files below.

## Files to Modify

- `src/components/driver-hub/screens/performance-screen.tsx` — read
  `data.persona`; reword or drop the four pieces of fleet-wrong personal copy;
  render the per-driver table and its `HubEmptyState` for `BUSINESS`; swap the
  paired chart for a jobs-only chart for `BUSINESS`.
- `src/components/driver-hub/screens/performance-format.ts` — doc comment only.
  **Every formatter the new table needs already exists here.** See **Step 7**.

**Do not modify:**

- `src/lib/dashboard/hub/performance.ts` or
  `src/app/dashboard/(hub)/performance/page.tsx` — task-04 owns both, and it has
  already landed.
- `src/components/driver-hub/hub-primitives.tsx` — **read it, reuse what it
  exports.** Everything this task needs (`HubCard`, `MetricTile`, `SampleNote`,
  `HubBarChart`, `HubEmptyState`) is already there. Do not add a primitive.
- `src/components/driver-hub/hub-status.ts` — the six-tone status vocabulary is
  closed. This task introduces no status pill at all, so it should not come up.
- `src/lib/dashboard/hub/sample.ts` — no new sample values.
- Any other `*-screen.tsx` or `*-format.ts` — task-06, task-07, task-09 and
  task-10 own the other component sets **in this same wave**. In particular do
  not touch `drivers-screen.tsx` or `drivers-format.ts`, even though the table
  built here is modelled on the roster table there.

## Technical Details

### 1. The file as it stands — verified anatomy

`performance-screen.tsx` is 368 lines, `"use client"`, and holds no state: every
figure is a rollup, and the `"use client"` directive is needed only for
`useHubSubtitle`.

| Lines | What is there |
|---|---|
| 1-26 | `"use client"` and imports |
| 28-70 | Module doc comment — the badging scheme, the two windows, "Read-only" |
| 76-98 | Five "honesty copy" constants: `ACCEPTANCE_NOTE` (76-79), `RATING_NOTE` (81-83), `DELTA_NOTE` (85-88), `ONLINE_HOURS_NOTE` (90-93), `SCORE_NOTES_NOTE` (95-98) |
| 114-119 | `CANCELLATION_TRACK_CEILING_PERCENT = 10`, `JOBS_PER_DAY_TRACK_CEILING = 10`, `RATING_SCALE_MAX = 5` |
| 126-129 | `DELTA_TONE_CLASSES` — copied from `hub-primitives.tsx` rather than imported, because Tailwind scans source text and a class assembled from a shared import would never be generated |
| 136-139 | `CHART_SERIES` — `[{ label: "Online hours (estimated)", tone: "ink" }, { label: "Jobs completed", tone: "accent" }]` |
| 146-148 | `Num` — `<span className="font-price">`, for any figure inside running copy |
| 150-181 | `TileFooterProps` and `TileFooter` |
| 183-185 | `PerformanceScreenProps = { data: HubPerformanceData }` |
| 187-368 | `PerformanceScreen` |
| 190 | `const { window: hubWindow, sampled } = data;` |
| 192-193 | `formatWeekRange(...)` then `useHubSubtitle(\`Week of ${weekRange}\`)` |
| 198-200 | `hoursByWeekday` — `Map` from `sampled.onlineHoursWeek` keyed by weekday label |
| 202 | `hasFutureDays` |
| 204-219 | `columns: HubBarColumn[]` — the paired chart's columns |
| 223-230 | `finishedNote` — shared by the Completion and Cancellations tiles |
| 234-307 | The five-tile grid, `grid gap-5 sm:grid-cols-2 xl:grid-cols-5` |
| 235-245 | Acceptance tile — **`note="Of the jobs offered to you"` is line 238** |
| 247-260 | Completion tile |
| 262-276 | Cancellations tile |
| 278-289 | Avg rating tile — **`label="Avg rating"` is line 279** |
| 291-306 | Jobs per day tile |
| 309-317 | The one-line "two windows" footnote |
| 319-365 | `grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]` |
| 320-335 | Left: `HubCard title="Online hours vs jobs completed"` with the paired chart |
| 337-364 | Right: **`HubCard title="What affects your score"` is line 338** |

### 2. The badging scheme — do not disturb it

The module doc comment at lines 33-54 describes the one thing this screen has to
get right, and every change below must leave it intact:

- Sampled value **and** sampled delta (Acceptance, Avg rating) → the tile carries
  the ordinary `<SampleNote />` reading **"Sample data"**, covering both.
- Real value, sampled delta (Completion, Cancellations, Jobs per day) → the badge
  reads **"Estimated delta"** and sits directly *under the delta line*, below the
  progress track that measures the real value. The value keeps the top of the
  tile to itself, unbadged, because it is true.

That is implemented by `TileFooter`'s `markerLabel` prop (default `"Sample
data"`, overridden to `"Estimated delta"` on the three real tiles) and by
rendering the footer as `MetricTile` *children* — i.e. below the progress track —
rather than through `MetricTile`'s own `delta` prop, which would place the delta
above the track and tint the track with the delta's tone.

All five progress tracks are ink for the same reason: the design's tinted track
takes its verdict from the delta, and tinting a track built from a real value
with an opinion sourced from an invented one is exactly the confusion the split
exists to prevent.

**None of this changes.** Rewording a label or a note does not move a tile
between categories: the Acceptance tile stays fully sampled for every persona
(its value is still `SAMPLE_ACCEPTANCE_RATE_PERCENT`), and the rating tile stays
fully sampled for every persona (its value is still a `sample.ts` constant,
merely a fleet-shaped one for `BUSINESS`).

### 3. The persona flag

One derived boolean at the top of the component, right after the destructure at
line 190:

```ts
  const { window: hubWindow, sampled } = data;

  // INDEPENDENT and ROSTER render identically here: both are one person
  // driving, with a personal completion rate and a personal score. The only
  // axis this screen cares about is whether the reader is the fleet rather than
  // one of its drivers, so there is deliberately no third branch.
  const isBusiness = data.persona === "BUSINESS";
```

Do not import `HubPersona` for this — comparing `data.persona` against the string
literal narrows without it.

### 4. Copy changes — the four fleet-wrong pieces, plus one

#### 4a. Acceptance tile note — line 238

Today:

```tsx
        <MetricTile
          label="Acceptance"
          value={`${formatDecimal(sampled.acceptanceRatePercent)}%`}
          note="Of the jobs offered to you"
          progress={sampled.acceptanceRatePercent / 100}
        >
```

"You" is a fleet owner who is never personally offered a job — a company claims
loads, its drivers carry them. Make the note persona-keyed. Add a constant beside
the other copy constants (lines 76-98) rather than inlining a ternary in JSX:

```ts
/**
 * The Acceptance tile's sub-line, per persona. A fleet is offered loads it may
 * claim; a driver is offered jobs they may take. "You" was correct for two of
 * the three personas and a category error for the third.
 */
const ACCEPTANCE_TILE_NOTE = {
  driver: "Of the jobs offered to you",
  fleet: "Of the loads offered to the fleet",
} as const;
```

and render `note={isBusiness ? ACCEPTANCE_TILE_NOTE.fleet : ACCEPTANCE_TILE_NOTE.driver}`.

The tile is **not** dropped for `BUSINESS`. Acceptance is a real fleet concept —
a company claims or passes on board loads — it is simply unrecorded, exactly as
it is for a driver, and `ACCEPTANCE_NOTE` already says why.

#### 4b. The rating tile — line 279

Today:

```tsx
        <MetricTile
          label="Avg rating"
          value={formatRating(sampled.averageRating)}
          note={
            <>
              From <Num>{sampled.ratedJobCount}</Num> rated jobs
            </>
          }
          progress={sampled.averageRating / RATING_SCALE_MAX}
        >
          <TileFooter delta={sampled.deltas.rating} markerNote={RATING_NOTE} />
        </MetricTile>
```

"Avg rating" beside `4.86` reads as *the reader's own* rating. A company is not
rated; its drivers are. task-04 already swapped the value to the fleet-wide
sample pair (`4.76` over `214` rated jobs — the same pair the Drivers screen's
third tile shows, so the two screens now agree). This task supplies the matching
label and note:

- `label={isBusiness ? "Fleet rating" : "Avg rating"}`
- `note` for `BUSINESS`: `<>Across <Num>{sampled.ratedJobCount}</Num> rated jobs, fleet-wide</>`
- `note` otherwise: unchanged, `<>From <Num>{sampled.ratedJobCount}</Num> rated jobs</>`

`RATING_NOTE` (lines 81-83) is already persona-neutral — *"Nothing in the schema
captures customer feedback. Retire with an `OrderRating` model — one score per
completed order."* — and stays as it is. `RATING_SCALE_MAX` and the progress
maths are unchanged; a fleet rating is on the same five-point scale.

The delta stays `sampled.deltas.rating`, whose label is `"Top 15% in Tbilisi"`.
That reads acceptably for a fleet, and inventing a fleet-specific ranking would
mean a new sample value, which this spec forbids.

#### 4c. "What affects your score" — line 338

The whole card is dropped for `BUSINESS`. Not reworded — dropped. It is not the
title alone: `SAMPLE_SCORE_NOTES` (`sample.ts:197-222`) is four rows of
individual-driver coaching, one of which reads *"Highest in Gldani. Moving to
Vake between 09:00 and 11:00 cuts it by about a third."* There is no rewording
of a title that makes that sentence sensible advice to a logistics company, and
rewriting the bodies would mean new sample content.

For `INDEPENDENT` and `ROSTER` the card renders exactly as it does today, title
and all — an individual driver, employed or not, does have a personal score, and
"your" is correct for both.

#### 4d. The paired chart — beyond the four items the spec brief named

The left card at lines 320-335 draws `CHART_SERIES`: `"Online hours
(estimated)"` in ink against `"Jobs completed"` in accent. `ONLINE_HOURS_NOTE`
explains the honest limit — *"`DriverProfile.isOnline` is a single boolean with
no history behind it, so no duration can be computed from it."*

For a `BUSINESS` account there is no `DriverProfile` at all: a company session
resolves through the company branch of `resolveHubAccount()`, which sets
`isOnline: null` because *"a fleet has no online toggle"*. The hours series is
therefore not merely unsourced for a fleet, it is meaningless — and it is drawn
as the chart's *primary* series, which on a fleet with little activity means a
tall fabricated bar standing over a 3px real one.

So for `BUSINESS`: render a **single-series, jobs-only** chart.

```ts
/**
 * The fleet chart's one series. A company has no online state to estimate hours
 * from — `resolveHubAccount()` sets `isOnline: null` for a COMPANY session
 * precisely because a fleet has no toggle — so the sampled hours bars are
 * dropped rather than relabelled, and what remains is entirely real.
 */
const FLEET_CHART_SERIES: readonly HubBarSeries[] = [
  { label: "Jobs completed", tone: "ink" },
];
```

- Columns for `BUSINESS`: `values: [day.jobsCompleted]`, and
  `valueLabel: day.isFuture ? EMPTY_VALUE : String(day.jobsCompleted)`.
- Card title: `"Jobs completed by day"`.
- Card `action`: **omit it entirely.** Nothing on this chart is sampled any more,
  so there is no `<SampleNote />` — and leaving the "Online hours" badge on a
  chart with no hours in it would be worse than either alternative.
- `HubBarChart` props: `series={FLEET_CHART_SERIES}`, `ariaLabel="Jobs completed
  by day of this week"`. Leave `showLegend` unset — it defaults to
  `showLegend ?? paired`, which is `false` for a single series, and a one-item
  legend is noise. `highlightPeak` defaults to `true`, which paints the fleet's
  best day in accent; that is the behaviour the Earnings chart already has and
  is worth keeping.
- The `hasFutureDays` footnote at lines 329-334 stays for both branches; its copy
  ("Days later this week show — and a flat bar until they happen.") is
  persona-neutral.

For `INDEPENDENT` and `ROSTER` the paired chart, its `CHART_SERIES`, its
`<SampleNote label="Online hours" …/>` action and the `hoursByWeekday` lookup are
all unchanged.

Build the two column arrays in separate branches rather than one array with a
conditional `values` — the driver branch needs `hoursByWeekday` and
`formatHours` and the fleet branch needs neither, and interleaving them makes
both harder to read:

```ts
  // A day that has not started gets no hours, whatever the sample series holds
  // for that weekday: showing Thursday's 9.1h on a Tuesday would be a forecast
  // rather than an estimate. Both bars then fall to the chart's dimmed 3px
  // sliver, and the em dash above them separates "not yet" from a real, worked
  // zero — which prints "0.0h · 0".
  const driverColumns: HubBarColumn[] = data.jobsByDay.map((day) => { /* …as today… */ });

  const fleetColumns: HubBarColumn[] = data.jobsByDay.map((day) => ({
    label: day.weekday,
    values: [day.jobsCompleted],
    valueLabel: day.isFuture ? EMPTY_VALUE : String(day.jobsCompleted),
  }));
```

`hoursByWeekday` is only consumed by `driverColumns`; leaving it computed for
both personas is a `Map` over seven constants and not worth branching around.

**This item is beyond the four the spec brief enumerated.** It is included
because it is the same defect as the other four — personal framing a fleet owner
should not be shown — and because dropping it is strictly less invention than
keeping it. If the coordinator wants task-08 held to the four named items, cut
this sub-step and nothing else in the task depends on it; the fleet then keeps
the paired chart unchanged.

#### 4e. One honesty-copy string worth correcting

`DELTA_NOTE` (lines 85-88) ends *"Retire with a `DriverMetricSnapshot` model
storing each metric **per driver** per week."* For a fleet the snapshot would be
per company. Change the last clause to *"storing each metric per account per
week"* so the note is true for all three personas. It is one word and it stays a
single shared constant.

`ACCEPTANCE_NOTE` (lines 76-79) needs **no** change:

```ts
const ACCEPTANCE_NOTE =
  "A declined offer leaves no row — Order only ever stores the offer that was " +
  "taken — so acceptance is unrecorded, not merely unaggregated. Retire with " +
  "a JobOffer model holding every dispatch and its outcome.";
```

It contains no second-person framing and no reference to "a driver"; it is a
statement about the schema and it is equally true for a fleet. (The planning
audit flagged this constant as personal copy — that was an error carried forward
from an earlier revision of the file. Verify before rewriting it: the
persona-wrong acceptance copy on this screen is the *tile note* at line 238,
handled in **4a**.)

`ONLINE_HOURS_NOTE` and `SCORE_NOTES_NOTE` also stay exactly as they are — they
are still rendered verbatim on the driver path, which is the only path that
still shows the surfaces they annotate.

### 5. The per-driver table

Rendered only when `isBusiness && data.fleet !== null`. It goes **below** the
chart, as its own full-width card — not into the right-hand column of the
`lg:grid-cols-[1.4fr_1fr]` grid, which for `BUSINESS` no longer has an occupant.

Layout for `BUSINESS`:

```tsx
      {/* Chart, full width — the score-notes card that used to sit beside it is
          individual-driver coaching and does not apply to a fleet. */}
      <HubCard title="Jobs completed by day">…</HubCard>

      <HubCard title="How the week went, by driver">…table or empty state…</HubCard>
```

Layout for `INDEPENDENT` / `ROSTER`: the existing
`<div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">` wrapper with
its two cards, unchanged.

#### 5a. Columns

| Header | Cell | Source |
|---|---|---|
| `Driver` | name, 14px medium, truncating | `row.name` |
| `Finished` | mono count | `row.finishedJobCount` |
| `Completion` | mono rate or `—` | `formatRate(row.completionRatePercent)` |
| `Cancellations` | mono rate or `—` | `formatRate(row.cancellationRatePercent)` |
| `Jobs · wk` | mono count | `row.jobsCompleted` |
| `Jobs / day` | mono, one decimal | `formatDecimal(row.jobsPerDay)` |

`Jobs · wk` uses the same abbreviation the Drivers roster's column already uses
(`drivers-screen.tsx:408`), so an operator moving between the two screens reads
the same header for the same figure.

`formatRate` already returns `EMPTY_VALUE` (`"—"`) for `null`, which is the whole
reason the loader returns `null` rather than `0` for a driver who finished
nothing: a `0%` completion rate would say every job they took failed, when they
took none.

#### 5b. Markup

Follow the idiom the other four hub tables use — a shadcn `Table` whose display
is `block` with grid rows, and **every table role stated explicitly**. From
`drivers-screen.tsx:101-110`:

> The design's data table is a CSS grid, not a `<table>` layout — fractional and
> fixed columns side by side, which no table-layout algorithm reproduces. So the
> rows are grids and the table element is a block, and every table role is stated
> explicitly: a `display` other than `table` is enough for some browsers to drop
> the implicit roles, and this *is* tabular data.
>
> Columns are static class strings rather than an inline `gridTemplateColumns` so
> Tailwind can see them at build time.

Add the geometry constants beside the existing tile-geometry block (lines
104-119):

```ts
/**
 * The fleet table's grid. A static class string, not an inline
 * `gridTemplateColumns`, so Tailwind can see it at build time — the same reason
 * `drivers-screen.tsx` spells its own columns out. `min-w-` plus the card's
 * `overflow-x-auto` wrapper is what stops the six columns crushing on a narrow
 * pane instead of scrolling.
 */
const FLEET_TABLE_COLUMNS =
  "grid-cols-[1.4fr_90px_110px_130px_90px_100px] min-w-[760px]";

const FLEET_HEAD_CLASSES =
  "h-auto px-0 pb-2.5 text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground";
const FLEET_CELL_CLASSES = "min-w-0 px-0 py-3.5";
```

These three strings are duplicated from `drivers-screen.tsx:111-117` rather than
imported. That is deliberate and matches the hub's existing convention — each
screen owns its own table geometry and its own formatter module (see
`drivers-format.ts`'s and `jobs-format.ts`'s own doc comments), and this task may
not modify `drivers-screen.tsx` in any case.

Sketch of the table body, as a local component in the same file:

```tsx
/**
 * Who on the roster did what with the week.
 *
 * Every column here is real — this is the only surface on the Performance
 * screen with no sampled value anywhere in it, which is why it carries no
 * `<SampleNote />`. A per-driver acceptance column was considered and left out:
 * the only per-driver acceptance figure that exists is a sample constant whose
 * fallback is `0`, and a confident `0%` beside a real person's name on a screen
 * their employer reads is a worse lie than an em dash.
 *
 * Unlike the Drivers roster this table has no sort control and no row
 * selection. The order is fixed by the loader — busiest first — and the row is
 * not a link, because the place to act on a driver is the Drivers screen and
 * duplicating its detail panel here would be a second, thinner copy of it.
 */
function FleetTable({ rows }: { rows: readonly HubPerformanceDriverRow[] }) {
  return (
    <Table role="table" className={cn("block", FLEET_TABLE_COLUMNS)}>
      <TableHeader role="rowgroup" className="block">
        <TableRow
          role="row"
          className={cn(
            "grid items-center gap-3 border-b border-border hover:bg-transparent",
            FLEET_TABLE_COLUMNS,
          )}
        >
          <TableHead role="columnheader" className={FLEET_HEAD_CLASSES}>
            Driver
          </TableHead>
          {/* …Finished, Completion, Cancellations, Jobs · wk… */}
          <TableHead
            role="columnheader"
            className={cn(FLEET_HEAD_CLASSES, "text-right")}
          >
            Jobs / day
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody role="rowgroup" className="block">
        {rows.map((row) => (
          <TableRow
            key={row.userId}
            role="row"
            className={cn(
              "grid items-center gap-3 border-b border-muted text-sm",
              FLEET_TABLE_COLUMNS,
            )}
          >
            <TableCell role="cell" className={cn(FLEET_CELL_CLASSES, "truncate font-medium")}>
              {row.name}
            </TableCell>
            <TableCell role="cell" className={cn(FLEET_CELL_CLASSES, "font-price")}>
              {row.finishedJobCount}
            </TableCell>
            <TableCell role="cell" className={cn(FLEET_CELL_CLASSES, "font-price")}>
              {formatRate(row.completionRatePercent)}
            </TableCell>
            <TableCell role="cell" className={cn(FLEET_CELL_CLASSES, "font-price")}>
              {formatRate(row.cancellationRatePercent)}
            </TableCell>
            <TableCell role="cell" className={cn(FLEET_CELL_CLASSES, "font-price")}>
              {row.jobsCompleted}
            </TableCell>
            <TableCell
              role="cell"
              className={cn(FLEET_CELL_CLASSES, "text-right font-price")}
            >
              {formatDecimal(row.jobsPerDay)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

All numeric text is `font-price` — the repo's IBM Plex Mono variable, the
handoff's "mono" — per `hub-primitives.tsx:37-38`: *"All numeric text (money,
counts, ids, plates, dates) uses `font-price`."* The driver's name is not a
number and does not get it.

Wrap the table in `<div className="min-w-0 overflow-x-auto">` inside the card, so
the `min-w-[760px]` scrolls within the card rather than pushing the page into
horizontal scroll.

#### 5c. The caveat line

Under the table, when `fleet.unattributedFinishedJobCount > 0`:

```tsx
        {fleet.unattributedFinishedJobCount > 0 ? (
          <p className="mt-3.5 text-xs text-muted-foreground">
            <Num>{pluralise(fleet.unattributedFinishedJobCount, "finished job")}</Num>{" "}
            this week {fleet.unattributedFinishedJobCount === 1 ? "is" : "are"} not
            attributed to anyone on the roster — either never dispatched, or
            carried by a driver who has since left. The rows above will not add
            up to the tiles.
          </p>
        ) : null}
```

This is not an apology for a bug. Rows are a strict subset of the tiles' scope,
and the two legitimate gaps are orders with `driverId: null` and orders whose
driver has left the roster (`Order.driverId` survives a removal that nulls
`DriverProfile.companyId`). Without the line a reader sums the column, gets a
smaller number than the Completion tile's denominator, and concludes the screen
is broken.

Render nothing when the count is `0` — a caveat about a discrepancy that does not
exist is noise. Note that the same gap technically applies to the `Jobs · wk`
column; the loader deliberately supplies one counter rather than two, so the copy
speaks about finished jobs — the figure both rates actually divide by.

#### 5d. The empty state — the point of this task's second half

Performance is currently the **only** hub screen with no `HubEmptyState` usage
anywhere. Every other one has it: `jobs-screen.tsx:379,398`,
`drivers-screen.tsx:532`, `vehicles-screen.tsx:571,578`,
`employees-screen.tsx:360`, `earnings-screen.tsx:186`,
`earnings-payouts-card.tsx:67`, `today-zone-demand-card.tsx:77`,
`loads-screen.tsx:170,175`. The new table is the first thing on this screen that
can legitimately be empty, so it gets one.

Import it from the shared primitive — do not hand-roll a "no drivers" paragraph:

```ts
import {
  HubBarChart,
  HubCard,
  HubEmptyState,
  MetricTile,
  SampleNote,
  type HubBarColumn,
  type HubBarSeries,
  type MetricDeltaTone,
} from "@/components/driver-hub/hub-primitives";
```

Its contract (`hub-primitives.tsx:456-480`):

```ts
export type HubEmptyStateProps = {
  /** Why there is nothing here, e.g. "No days in the selected range". */
  message: string;
  /** Optional follow-up — a hint, or an action that would fill the view. */
  children?: React.ReactNode;
  className?: string;
};
```

It renders `py-10 text-center text-muted-foreground` with the message at
`text-sm`, matching the admin tables' own empty-row idiom.

There is exactly **one** empty case: `fleet.drivers.length === 0`, a company that
has registered nobody. A roster that exists but had a quiet week is **not**
empty — those rows render with real zeroes and em dashes, which is the signal an
operator came for.

```tsx
          {fleet.drivers.length === 0 ? (
            <HubEmptyState message="No drivers on this roster yet.">
              <p className="mt-1 text-[13px]">
                Register a driver and their week shows up here.
              </p>
            </HubEmptyState>
          ) : (
            <>
              <div className="min-w-0 overflow-x-auto">
                <FleetTable rows={fleet.drivers} />
              </div>
              {/* …the caveat line from 5c… */}
            </>
          )}
```

The message deliberately matches `drivers-screen.tsx`'s
`EMPTY_MESSAGE.All` — `"No drivers on this roster yet."` — so the two screens say
the same thing about the same condition. The follow-up hint is worded differently
because the Drivers screen can offer the action ("Register your first driver to
start dispatching jobs.") and this screen cannot: there is no register affordance
here and adding one would duplicate a mutation surface another screen owns.

Narrow `fleet` once, before the JSX, so TypeScript is satisfied without a
non-null assertion:

```ts
  // `fleet` is non-null exactly when the persona is BUSINESS, but the type says
  // `HubPerformanceFleet | null` — so this is the narrowing rather than a second
  // opinion about who gets the table.
  const fleet = isBusiness ? data.fleet : null;
```

### 6. What must NOT change

- **Structure of the five tiles.** The grid stays
  `grid gap-5 sm:grid-cols-2 xl:grid-cols-5`, all five tiles render for every
  persona, in the same order, with the same `progress` maths, the same
  `TileFooter` deltas and the same `markerLabel` split. Only the two labels/notes
  named in **4a** and **4b** are persona-keyed.
- **The Completion, Cancellations and Jobs-per-day tiles.** Untouched for every
  persona, including the shared `finishedNote` at lines 223-230 whose zero-case
  reads *"No jobs have finished yet this week"*. That copy is correct for a fleet
  as written.
- **The "two windows" footnote** at lines 309-317. It is persona-neutral and it
  is now more load-bearing, not less, because the fleet table reproduces the same
  `createdAt`-vs-`completedAt` split per driver.
- **`DELTA_TONE_CLASSES`** stays a local copy (lines 126-129). Do not "fix" it by
  importing from `hub-primitives.tsx`: Tailwind scans source text, and a class
  assembled from a shared import would never be generated.
- **`useHubSubtitle(\`Week of ${weekRange}\`)`** — persona-neutral, unchanged.
- **No state.** The screen stays a pure render. The new table has no sort, no
  filter and no selection, so nothing here needs `React.useState`. The
  `"use client"` directive remains needed only for `useHubSubtitle`.
- **No new `<SampleNote />` anywhere**, and none removed except the chart's
  `"Online hours"` badge on the `BUSINESS` path, which is removed because the
  thing it annotated is gone.
- **The six-tone status vocabulary** in `hub-status.ts` is closed. This task adds
  no status pill.

### 7. `performance-format.ts`

**No new formatter is required.** The four the table needs already exist and are
already exported:

| Export | Line | Behaviour |
|---|---|---|
| `EMPTY_VALUE` | 16 | `"—"` |
| `formatDecimal(value)` | 75 | `7` → `"7"`, `7.4` → `"7.4"` |
| `formatRate(percent \| null)` | 86 | `98` → `"98%"`, `null` → `"—"` |
| `pluralise(count, singular)` | 108 | `1, "job"` → `"1 job"` |

`formatRating` (line 98) and `formatHours` (line 103) are also unchanged;
`formatWeekRange` (line 50) is unchanged.

Do **not**:

- add a `formatGel`-style helper — no money appears on this screen;
- add a `formatCount` wrapper around `String(n)`;
- import anything from `drivers-format.ts`. That module's `formatRating(rating:
  number | null)` has a different signature from this module's
  `formatRating(rating: number)` and the hub's convention is one formatter module
  per screen, never shared between them.

The only change here is a sentence in the module doc comment (lines 1-12) noting
that these helpers now also serve the per-driver fleet table, so a future reader
does not assume they are tile-only. If you conclude even that is not worth it,
leaving the file untouched is an acceptable outcome — it is listed under **Files
to Modify** because this task owns it, not because it must change.

### 8. Implementation steps

1. Read `src/components/driver-hub/screens/performance-screen.tsx` and
   `performance-format.ts` end to end, then
   `src/components/driver-hub/hub-primitives.tsx` (`HubCard`, `MetricTile`,
   `SampleNote`, `HubEmptyState`, `HubBarChart` and their prop types), then
   `src/components/driver-hub/screens/drivers-screen.tsx` lines 97-120 and
   385-548 for the table idiom this one copies.
2. Add the imports: `HubEmptyState` to the `hub-primitives` block (lines 6-14);
   `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` from
   `@/components/ui/table`; `type HubPerformanceDriverRow` alongside the existing
   `type HubPerformanceData` import from `@/lib/dashboard/hub/performance`
   (line 24). `cn` is already imported (line 26).
3. Add the new copy and geometry constants (**4a**, **4d**, **5b**) in the
   existing constant blocks, not inline in JSX.
4. Apply the `DELTA_NOTE` wording fix (**4e**).
5. Add `isBusiness` and the narrowed `fleet` (**3**, **5d**).
6. Split the chart columns into `driverColumns` / `fleetColumns` (**4d**).
7. Persona-key the Acceptance note and the rating tile's label and note (**4a**,
   **4b**).
8. Branch the lower half of the screen: the existing two-card grid for the driver
   personas, the full-width chart card plus the fleet card for `BUSINESS`.
9. Add the `FleetTable` local component, the empty state and the caveat line.
10. Update the module doc comment (lines 28-70). It currently opens *"Performance
    — how the week is going, for either account kind."* Rewrite the opening to
    name the three personas and add a short section explaining what a fleet owner
    sees instead of the score card and the hours series, and why the fleet table
    carries no sample badge. Match the file's register — this codebase's comments
    explain *why*, at length, in full sentences.
11. Verify:

    ```bash
    pnpm lint
    pnpm typecheck
    ```

    Both must pass clean. This spec adds no tests (see `requirements.md`,
    Non-Goals). If those script names do not exist, read `package.json` and run
    the project's equivalents.

## Acceptance Criteria

- [ ] The screen branches on `data.persona` only; it never reads `kind`,
      `companyId` or `DriverProfile.accountType`, and it re-derives no persona.
- [ ] `INDEPENDENT` and `ROSTER` render identically to each other, and identically
      to the screen before this feature apart from the `DELTA_NOTE` wording fix.
- [ ] No tile is added or removed for any persona: all five render, in the same
      order, for all three.
- [ ] The Acceptance tile's note reads "Of the jobs offered to you" for a driver
      and fleet-appropriate copy for `BUSINESS`. `git grep -n "offered to you"`
      returns only the driver-path constant.
- [ ] The rating tile is labelled "Avg rating" for a driver and "Fleet rating"
      for `BUSINESS`, with a matching note; `git grep -n '"Avg rating"'` shows it
      is no longer unconditional.
- [ ] No card titled "What affects your score" renders for a `BUSINESS` account;
      the card is unchanged for the other two personas.
- [ ] The badging scheme is intact: Acceptance and the rating tile carry the
      default "Sample data" `<SampleNote />`; Completion, Cancellations and Jobs
      per day carry "Estimated delta" below the progress track; all five tracks
      are still ink.
- [ ] For `BUSINESS`, a per-driver table renders with one row per roster member,
      including drivers who finished nothing this week.
- [ ] A driver with `completionRatePercent: null` shows `—`, never `0%`.
- [ ] The per-driver table renders **no** `<SampleNote />` and displays no value
      sourced from `sample.ts`.
- [ ] `HubEmptyState` is imported from
      `src/components/driver-hub/hub-primitives.tsx` and renders when
      `fleet.drivers.length === 0` — making Performance no longer the one hub
      screen without an empty state.
- [ ] A roster with members but no finished jobs renders **rows**, not the empty
      state.
- [ ] The unattributed-jobs caveat renders when the count is above zero and not
      at all when it is zero.
- [ ] The table uses the shadcn `Table` primitives with explicit `role`
      attributes on the table, both row groups, every row, every column header
      and every cell, and static Tailwind grid-column classes.
- [ ] Every numeric cell uses `font-price`; the driver-name cell does not.
- [ ] The table scrolls horizontally inside its card rather than widening the
      page.
- [ ] The screen still holds no React state and takes exactly one prop, `data`.
- [ ] `src/lib/dashboard/hub/performance.ts`,
      `src/app/dashboard/(hub)/performance/page.tsx`,
      `hub-primitives.tsx`, `hub-status.ts` and `sample.ts` are unmodified.
- [ ] `pnpm lint` and `pnpm typecheck` pass clean.

## Notes

**Line numbers in this task were verified against the file as it stands before
task-04.** task-04 does not touch `performance-screen.tsx`, so they should still
hold — but re-check anything that looks off by a line or two rather than editing
by number.

**One correction to the planning audit, carried here on purpose.** The audit
listed `ACCEPTANCE_NOTE` (lines 76-79) as copy "referring to a driver". It does
not: the constant is a statement about the schema — *"A declined offer leaves no
row … Retire with a JobOffer model"* — with no second-person or per-driver
framing, and `git grep -n "driver" performance-screen.tsx` finds it only in the
module doc comment (line 38) and in `DELTA_NOTE` (line 88). The persona-wrong
acceptance copy is the tile note at line 238. **4a** fixes the real one and
**4e** fixes `DELTA_NOTE`; `ACCEPTANCE_NOTE` stays as written.

**Why the fleet table has no row selection.** The Drivers screen already owns the
per-driver detail panel, the offboard action and the register flow, and it keys
on `HubDriver.userId` — the same id `HubPerformanceDriverRow.userId` carries, so
an operator can move between the two screens by name or by id. A second, thinner
detail panel here would be a duplicate surface with a subset of the facts, and
this task may not modify `drivers-screen.tsx` to share the real one.

**Why no per-driver acceptance column, restated because it will be asked.**
`sampleDriverFacts()` returns `SAMPLE_DRIVER_FACTS_FALLBACK` for any
`DriverProfile.id` not in the handoff's seed — which is every driver in a real
database — and that fallback's `acceptanceRatePercent` is `0`. `rating` falls
back to `null` and prints an honest em dash, which is why the Drivers roster can
show it; acceptance has no such escape hatch. task-04 excluded it from the row
type, so there is nothing to render even if someone wanted to.

**The zero-data problem this task does not solve.** Sampled constants never
degrade, so a brand-new account still sees `Acceptance 94%` beside real tiles
reading `—` and *"No jobs have finished yet this week"*. task-04 records the
decision in full: this spec does **not** gate sampled values on the presence of
real data, because the trigger is account age rather than persona and
`requirements.md` lists onboarding states as an explicit non-goal. What this task
does do is remove three of the worst offenders *for `BUSINESS` specifically* —
the score-notes card, the sampled hours series and the one-driver rating pair —
because those are persona-wrong regardless of how much data exists. For
`INDEPENDENT` and `ROSTER` the problem is untouched, by design. **Do not add a
zero-data gate here.**

**Copy is product content.** The exact wording of the new labels, the empty-state
hint and the caveat line is a reasonable default, not a mandate — if the team
wants different words, the words are cheap to change and the structure is what
this task is really specifying.
