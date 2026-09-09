# Task 07: Earnings screen — fleet revenue table and fleet-appropriate copy

## Status

complete

## Wave

3

## Description

The client half of the Earnings work. task-03 put `persona` and a real
per-driver revenue breakdown on `HubEarningsData`; this task renders them.

Two things change on `/dashboard/earnings` for a `BUSINESS` (fleet-owner)
account. A new card lists which of the fleet's drivers earned the company what
over the selected range — real `Order` money, no sampled figure anywhere in it.
And the screen's second-person driver copy stops being addressed to a company:
the "Jobs completed" tile currently notes `"6h online"` and badges it **"Online
hours"** (`earnings-screen.tsx:136,139`), and the "Avg per job" tile notes
`"₾18.40 per online hour"` and badges it **"Per online hour"**
(`earnings-screen.tsx:156,159`). A fleet has no online hours — it has drivers who
do — so for that persona those two sampled notes are dropped and replaced with
real fleet facts, per the spec's standing rule that a sampled figure which is
meaningless for a persona is *hidden*, never made real.

Nothing changes for an `INDEPENDENT` driver: they see exactly the screen they see
today. A `ROSTER` driver never reaches this screen at all — task-03 redirects
them server-side and the API refuses them.

## Dependencies

**Depends on:** task-03-earnings-persona-data
**Blocks:** None

**Context from dependencies:**

### The three personas

| Persona | `HubAccount.kind` | `HubAccount.companyId` | Who they are |
|---|---|---|---|
| `INDEPENDENT` | `"INDIVIDUAL"` | `null` | Owns their vehicle, browses the open Load Board, keeps their own fares |
| `ROSTER` | `"INDIVIDUAL"` | set — their **employer** | Employed driver; work arrives via company dispatch; fares are paid to the employer |
| `BUSINESS` | `"BUSINESS"` | set — their **own** company | Fleet owner; also sees the Drivers and Employees screens |

```ts
// src/lib/dashboard/hub/account.ts — added by task-01
export type HubPersona = "INDEPENDENT" | "ROSTER" | "BUSINESS";
```

`persona` is derived once inside `resolveHubAccount()`: `"BUSINESS"` when
`kind === "BUSINESS"`, `"ROSTER"` when `kind === "INDIVIDUAL" && companyId !==
null`, `"INDEPENDENT"` otherwise. **`companyId !== null` alone is not the roster
test** — a BUSINESS account has one too. This screen never re-derives any of
that; it reads `data.persona` and nothing else.

### What task-03 produces, exactly

`HubEarningsData` gained two top-level fields. Everything else on it is
unchanged from what this screen already reads:

```ts
// src/lib/dashboard/hub/earnings.ts

export type HubEarningsData = {
  range: ResolvedHubEarningsRange;
  /** Which account shape this data was assembled for. */
  persona: HubPersona;                       // NEW (task-03)
  grouping: "daily" | "weekly";
  days: readonly HubEarningsDay[];
  buckets: readonly HubEarningsBucket[];
  /** `SUM(driverPayout + overtimeDriverPayout)` over the range. Real. */
  grossFares: number;
  jobsCompleted: number;
  averagePerJob: number;
  /** `null` for anything that is not a BUSINESS account. */
  fleet: HubEarningsFleet | null;            // NEW (task-03)
  sampled: {
    extras: SampleEarningsExtras;   // tips, incentives, adjustments
    onlineHours: number;
    perOnlineHour: number;
    rangeTotal: number;             // not rendered anywhere, deliberately
    incentivesNote: string;
    payouts: readonly SamplePayoutRow[];
  };
};

/** One fleet driver's contribution to the range's revenue. All real. */
export type HubEarningsDriverRow = {
  /** `User.id` — what `Order.driverId` holds. Stable React key. */
  driverId: string;
  /** `User.name`, or "Former driver" when the user row is gone. */
  name: string;
  jobsCompleted: number;
  /** `SUM(driverPayout + overtimeDriverPayout)` for this driver, in range. */
  grossFaresGel: number;
  /** `grossFaresGel / jobsCompleted`, or 0. */
  averagePerJobGel: number;
  /** Share of the range's `grossFares`, 0–100, one decimal. */
  sharePercent: number;
};

export type HubEarningsFleet = {
  /** Drivers who completed at least one job in range, largest revenue first. */
  drivers: readonly HubEarningsDriverRow[];
  /** The company's completed orders in range that carry no `driverId`. */
  unassigned: {
    jobsCompleted: number;
    grossFaresGel: number;
    sharePercent: number;
  };
};
```

Three properties of that data you must build on and must not undo:

1. **`fleet` is `null` for `INDEPENDENT` and for `ROSTER`.** It is an object —
   possibly with an empty `drivers` array — only for `BUSINESS`. Branch on
   `data.fleet !== null`, or on `data.persona === "BUSINESS"` and narrow; do not
   branch on `drivers.length` alone, which cannot tell "not a fleet" from "a
   fleet whose drivers completed nothing".
2. **Every field on `HubEarningsFleet` is real.** It is built from `COMPLETED`
   `Order` rows scoped to the company. Nothing in the new card gets a
   `<SampleNote />`; putting one there would be a lie in the other direction.
3. **The rows do not re-sum to `grossFares` exactly.** They cover the same
   orders, but the day series rounds per Tbilisi day and the rollup rounds per
   driver, both off `Float` columns, so a total row must print
   `data.grossFares` and never `drivers.reduce(...)`. This is stated in the
   type's own doc comment for the same reason.

task-03 also installed the two roster gates — a `redirect("/dashboard/today")`
in `src/app/dashboard/(hub)/earnings/page.tsx` and a `403` from
`GET /api/dashboard/hub/earnings/export` — so this task writes **no** roster
branch. If you find yourself adding one, the guard has been deleted upstream and
that is the bug to report, not to paper over.

## Files to Create

- `src/components/driver-hub/screens/earnings-fleet-card.tsx` — the per-driver
  revenue card for `BUSINESS` accounts. New file; no other task in this wave or
  any other owns it.

## Files to Modify

- `src/components/driver-hub/screens/earnings-screen.tsx` — render the new card
  for `BUSINESS`; reword the two personal-copy tiles for that persona.

Also **owned** by this task, in the sense that no sibling may touch them, but
expected to need no change — read them, reuse what they export, and only edit
them if the sections below say so:

- `src/components/driver-hub/screens/earnings-format.ts` — reuse `formatGel`,
  `pluralise`, `EMPTY_VALUE`. Add a percent formatter here **only** if you need
  one (see §4.4); nothing else.
- `src/components/driver-hub/screens/earnings-breakdown-card.tsx` — no change.
- `src/components/driver-hub/screens/earnings-payouts-card.tsx` — no change;
  **read it**, it is the table idiom the new card copies.
- `src/components/driver-hub/screens/earnings-filter-bar.tsx` — no change.
- `src/components/driver-hub/screens/earnings-export-button.tsx` — no change.

**Do not modify:**

- `src/lib/dashboard/hub/earnings.ts`, `src/app/dashboard/(hub)/earnings/page.tsx`
  or `src/app/api/dashboard/hub/earnings/export/route.ts` — task-03's, already
  landed. If the data you need is not on `HubEarningsData`, that is a task-03
  gap to report, not a reason to reach into the loader.
- `src/components/driver-hub/hub-primitives.tsx` — read it, import from it, add
  nothing to it. Four sibling Wave-3 tasks import from the same file.
- `src/components/driver-hub/hub-status.ts` — the six-tone status vocabulary is
  closed. The new card has no status column and needs no tone.
- Any `today-*`, `performance-*`, `vehicles-*` or `driver-hub-sidebar` /
  `driver-hub-header` file — tasks 06, 08, 09 and 10 own those and run in
  parallel with this one.
- `src/lib/dashboard/hub/sample.ts` — this task adds no sampled value.

## Technical Details

### 1. What the screen looks like today

`src/components/driver-hub/screens/earnings-screen.tsx` is 203 lines and holds
no state. It destructures `const { range, grouping, buckets, sampled } = data;`
at line 103, sets the header subtitle through `useHubSubtitle(...)` at line 105,
and renders, in order:

1. `<EarningsFilterBar range={range} presets={presets} />`
2. a four-up `MetricTile` grid — Gross earnings, Jobs completed, Incentives, Avg
   per job (lines 126-164)
3. a two-column row: the `HubCard` bar chart, and `<EarningsBreakdownCard />`
   (lines 166-198)
4. `<EarningsPayoutsCard payouts={sampled.payouts} />` (line 200)

Its props are unchanged by this task:

```ts
export type EarningsScreenProps = {
  data: HubEarningsData;
  presets: readonly HubEarningsPreset[];
};
```

The page already passes the whole `data` object, so the new `persona` and
`fleet` fields arrive with no prop plumbing at all.

Its module doc comment (lines 29-62) has a "Real versus sampled" section listing
exactly which figures are which. **Update it** to name the fleet card as real,
and to record that the two sampled tile notes are hidden for `BUSINESS`.

### 2. The badge convention you are working inside

From that same doc comment, lines 53-57 — this is the rule the reword has to
respect:

> The marking follows the same rule as Today's hero tile: the badge names the
> *part* that is invented, never the card around it. So the Jobs completed tile
> badges "Online hours" and not the job count above it, the Avg per job tile
> badges "Per online hour" and not the average, and only the Incentives tile —
> whose headline figure is itself fictional — is badged whole.

So in each of the two tiles being reworded, the **value** is real and stays, and
it is the **note** underneath plus its badge that is sampled and goes.

`SampleNote` (`hub-primitives.tsx:407-450`) takes `{ note: string; label?:
string; className?: string }`, where `note` names the schema change that would
retire the placeholder and `label` defaults to `"Sample data"`. The three note
constants already live at the top of `earnings-screen.tsx`:
`ONLINE_HOURS_NOTE` (75-79), `INCENTIVES_NOTE` (81-84), `PER_ONLINE_HOUR_NOTE`
(86-90).

### 3. The tile reword, tile by tile

Compute one boolean at the top of the component and branch on it. It also
narrows `fleet` for the card below:

```ts
export function EarningsScreen({ data, presets }: EarningsScreenProps) {
  const { range, grouping, buckets, sampled, fleet } = data;

  useHubSubtitle(formatRangeSubtitle(range.from, range.to, range.days));

  // A fleet owner is reading a *company's* takings, so the tiles' second-person
  // driver copy is wrong for them twice over: a company has no online hours (its
  // drivers do), and the sampled figures derived from them describe nobody. Per
  // the spec's standing rule, a sampled figure that is meaningless for a persona
  // is hidden rather than reworded into something equally invented — so both
  // notes and both badges go, and what replaces them is read off real data.
  //
  // `fleet` is non-null for exactly this persona, so the same test narrows it.
  const isFleet = data.persona === "BUSINESS" && fleet !== null;
```

#### 3.1 Tile 1 — "Gross earnings" → "Fleet revenue"

Currently (lines 127-131):

```tsx
        <MetricTile
          label="Gross earnings"
          value={formatGel(data.grossFares)}
          note={`${pluralise(range.days, "day")} in range`}
        />
```

For `BUSINESS`, the label becomes **"Fleet revenue"**. The value and the note are
unchanged and stay real. "Gross earnings" is not wrong for a company, but it
reads as a personal figure beside a table of other people's names; "Fleet
revenue" is what `drivers.ts` already calls the same quantity ("what the fleet
earned on them").

```tsx
        <MetricTile
          label={isFleet ? "Fleet revenue" : "Gross earnings"}
          value={formatGel(data.grossFares)}
          note={`${pluralise(range.days, "day")} in range`}
        />
```

Do **not** rename it to anything implying the client's price. `grossFares` is
`SUM(driverPayout + overtimeDriverPayout)` — the carrier's commissioned share —
and "gross" here has always meant *before the sampled tips and incentives*,
never *before commission*. `earnings-breakdown-card.tsx:67-81` spells this out
at length.

#### 3.2 Tile 2 — "Jobs completed" loses its online-hours note

Currently (lines 133-143):

```tsx
        <MetricTile
          label="Jobs completed"
          value={data.jobsCompleted}
          note={`${formatHours(sampled.onlineHours)} online`}
        >
          <SampleNote
            label="Online hours"
            note={ONLINE_HOURS_NOTE}
            className="mt-2.5"
          />
        </MetricTile>
```

For `BUSINESS`: keep the label and the value (both real), drop the note and the
`<SampleNote />` child, and put a real fleet fact in the note instead — how many
of the company's drivers earned in this range:

```tsx
        <MetricTile
          label="Jobs completed"
          value={data.jobsCompleted}
          note={
            isFleet
              ? `${pluralise(fleet.drivers.length, "driver")} earned in range`
              : `${formatHours(sampled.onlineHours)} online`
          }
        >
          {isFleet ? null : (
            <SampleNote
              label="Online hours"
              note={ONLINE_HOURS_NOTE}
              className="mt-2.5"
            />
          )}
        </MetricTile>
```

`fleet.drivers` holds only drivers who completed at least one job in range, so
its length is exactly "drivers who earned in range" and needs no filtering here.
`pluralise` is already imported from `earnings-format.ts` and gives `"1 driver"`
/ `"3 drivers"`.

Note that `formatHours` may become unused for the fleet branch but is still used
by the individual branch — leave the import alone.

#### 3.3 Tile 3 — "Incentives" is unchanged

Lines 145-151. It is wholly sampled and stays wholly sampled and wholly badged,
for both personas. Hiding it for a fleet was raised and is **out of scope for
this task**: the analogous decision for the sidebar's sampled "Weekly incentive"
card belongs to task-10, and splitting one judgement across two tasks in the
same wave is how the two end up disagreeing. Leave this tile exactly as it is.

#### 3.4 Tile 4 — "Avg per job" loses its per-online-hour note

Currently (lines 153-163):

```tsx
        <MetricTile
          label="Avg per job"
          value={formatGel(data.averagePerJob)}
          note={`${formatGel(sampled.perOnlineHour)} per online hour`}
        >
          <SampleNote
            label="Per online hour"
            note={PER_ONLINE_HOUR_NOTE}
            className="mt-2.5"
          />
        </MetricTile>
```

`sampled.perOnlineHour` is doubly unfit for a fleet: it divides by estimated
online hours *and* its numerator folds in estimated tips and incentives (see
`PER_ONLINE_HOUR_NOTE`, lines 86-90). For `BUSINESS`, drop it and the badge, and
say what the real average is actually averaged over:

```tsx
        <MetricTile
          label="Avg per job"
          value={formatGel(data.averagePerJob)}
          note={
            isFleet
              ? "Across every driver in the fleet"
              : `${formatGel(sampled.perOnlineHour)} per online hour`
          }
        >
          {isFleet ? null : (
            <SampleNote
              label="Per online hour"
              note={PER_ONLINE_HOUR_NOTE}
              className="mt-2.5"
            />
          )}
        </MetricTile>
```

After this change, a `BUSINESS` account's tile row carries exactly one
`<SampleNote />` — the Incentives tile's — instead of three. That is the
intended outcome: two of the three were describing a person who is not reading
the screen.

### 4. The fleet revenue card

#### 4.1 Where it goes

Render it between the chart/breakdown row and the payout history card — after
line 198's closing `</div>`, before `<EarningsPayoutsCard />`:

```tsx
      {isFleet ? <EarningsFleetCard fleet={fleet} total={data.grossFares} /> : null}

      <EarningsPayoutsCard payouts={sampled.payouts} />
```

That position is deliberate. The card is per-driver detail behind the tiles and
the chart above it, and the payout table below is (a) entirely sampled and (b)
explicitly not range-filtered, so it belongs last. The screen's children are
laid out by the hub shell's own vertical stack, so the card needs no wrapper.

#### 4.2 The component

New file, `src/components/driver-hub/screens/earnings-fleet-card.tsx`. One card
per file is this directory's idiom — `earnings-breakdown-card.tsx` and
`earnings-payouts-card.tsx` are both exactly this, and `earnings-screen.tsx` is
already close to its useful length.

```tsx
"use client";

import {
  HubCard,
  HubEmptyState,
} from "@/components/driver-hub/hub-primitives";
import {
  formatGel,
  pluralise,
} from "@/components/driver-hub/screens/earnings-format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HubEarningsFleet } from "@/lib/dashboard/hub/earnings";
import { cn } from "@/lib/utils";

export type EarningsFleetCardProps = {
  fleet: HubEarningsFleet;
  /**
   * `HubEarningsData.grossFares` — the range total, printed in the footer.
   *
   * Passed in rather than summed from `fleet.drivers` here: the two cover the
   * same orders, but the day series rounds per Tbilisi day and the rollup rounds
   * per driver, both off `Float` columns, so a re-sum can differ by cents from
   * the "Fleet revenue" tile at the top of the same screen. The tile is the
   * figure of record; this footer restates it rather than recomputing it.
   */
  total: number;
};
```

The `"use client"` directive is required: every component in this directory has
one, and the parent screen is a client tree.

The type import is `import type` — `earnings.ts` is `server-only`, and importing
a *value* from it into a client component drags Prisma into the browser bundle
and fails the build. `earnings-filter-bar.tsx:13-16` and its
`EarningsFilterBarProps` doc comment explain the same constraint, which is why
`HUB_EARNINGS_PRESETS` crosses as a prop rather than an import.

#### 4.3 The table

Copy the grid-table idiom from `earnings-payouts-card.tsx:38-48` verbatim in
shape. It exists because `Table`'s own `overflow-x-auto` wrapper needs a
`min-w-*` to scroll against instead of crushing the first column, and because
Tailwind scans source text, so the tracks must be written as static strings:

```tsx
/**
 * The column tracks as a static class string so Tailwind can see them at build
 * time — the same idiom as `earnings-payouts-card.tsx` and `vehicles-screen.tsx`.
 * The min-width is what makes `Table`'s own `overflow-x-auto` wrapper scroll on
 * a narrow pane instead of crushing the Driver column.
 */
const COLUMNS = "grid-cols-[1.6fr_0.7fr_0.8fr_1fr_1fr] min-w-[560px]";

const HEAD_CLASSES =
  "h-auto px-0 pb-2.5 text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground";
const CELL_CLASSES = "min-w-0 px-0 py-3.5";
```

Five columns, left to right:

| Header | Cell | Classes |
|---|---|---|
| `Driver` | `row.name` | `truncate font-medium` — a name, so **not** `font-price` |
| `Jobs` | `row.jobsCompleted` | `truncate font-price` |
| `Share` | `${row.sharePercent}%` | `truncate font-price` |
| `Avg per job` | `formatGel(row.averagePerJobGel)` | `truncate font-price` |
| `Revenue` | `formatGel(row.grossFaresGel)` | `truncate font-price font-semibold text-right`, header `text-right` |

`font-price` is the hub's mono numeric face; every figure on these screens uses
it and every name does not. `earnings-payouts-card.tsx:112-143` shows the exact
cell markup, including the `role="row"` / `role="cell"` attributes the grid
layout needs (the `display: grid` overrides the native table roles, so they are
restated explicitly — keep them).

Rows are already sorted largest-revenue-first by the loader. **Do not re-sort in
the component**, and do not add client-side sorting: this card is a readout, not
a data grid, and a second ordering rule is a second thing that can disagree with
the server's.

`key={row.driverId}` — `driverId` is a `User.id` and is unique within the array.

Like the payout table's rows, these are **not clickable**: there is no per-driver
detail panel on the Earnings screen (that is the Drivers screen's job), so do
not add a hover affordance that leads nowhere. `earnings-payouts-card.tsx:104-106`
makes exactly this point about its own rows.

#### 4.4 The unassigned row

`fleet.unassigned` is real and often non-zero: a company claims an order with its
own identity and assigns a driver at dispatch time, and `Order.driverId` is
`onDelete: SetNull`, so completed orders can legitimately carry no driver while
still carrying the company's money.

Render it as a final row **after** the driver rows, only when
`fleet.unassigned.jobsCompleted > 0`, visually distinguished as not-a-driver:

- Driver cell: `Not assigned to a driver`, in `text-muted-foreground italic`,
  not `font-medium`.
- The other four cells exactly as a driver row.

Its purpose is arithmetic honesty — without it the column visibly fails to reach
the total. Add a short comment in the component saying so, in the register the
rest of this codebase's comments use.

Do **not** invent a driver name for it and do **not** fold it into the largest
driver's row.

On the percent format: `sharePercent` arrives as a number with at most one
decimal (e.g. `41.7`, `100`, `0`). Print it as `` `${row.sharePercent}%` ``.
That yields `"41.7%"` and `"100%"` — no trailing `.0`, which is what you want. If
you prefer a formatter, add one small `formatPercent` to `earnings-format.ts`
beside `formatGel`; that file's header explains why each screen owns its own
presentation helpers rather than importing a sibling screen's. Either is
acceptable; do not import a percent helper from another screen's format module.

#### 4.5 The footer

Mirror `earnings-breakdown-card.tsx:180-190`'s footer block — a bordered row
under the table with a label, a caption, and the figure at `text-xl`:

- Label: `Fleet revenue`
- Caption: `` `${pluralise(fleet.drivers.length, "driver")} · ${pluralise(jobsTotal, "completed job")}` `` — or simply the driver count; keep it short.
- Figure: `formatGel(total)` — **the `total` prop, i.e. `data.grossFares`**, for
  the rounding reason given on the prop above. Never a `reduce` over the rows.

#### 4.6 The empty state

Use `HubEmptyState` from `src/components/driver-hub/hub-primitives.tsx`
(lines 456-480):

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
`text-sm` and the children below. It is the hub's one empty-row primitive —
`earnings-screen.tsx:186` and `earnings-payouts-card.tsx:67` both already use it,
and this spec's house conventions require it here too. Do not hand-roll a
centred paragraph.

The condition: render the table when
`fleet.drivers.length > 0 || fleet.unassigned.jobsCompleted > 0`, and the empty
state otherwise. A fleet whose only completed orders in range had no driver
still has a table worth showing — one row.

Copy:

```tsx
        <HubEmptyState message="No driver completed a job in this range.">
          <p className="mt-1.5 text-xs">
            Completed orders appear here once a driver is assigned to them.
          </p>
        </HubEmptyState>
```

Say "in this range" rather than anything absolute — the range is a filter the
reader chose and can widen, and the empty state should point at it rather than
implying the fleet has never earned. This is the same failure the Load Board
spec had to fix once already (a table blaming filters for an empty list, and the
converse).

#### 4.7 The card header

```tsx
    <HubCard
      title="Revenue by driver"
      action={`${pluralise(fleet.drivers.length, "driver")} in range`}
    >
```

`HubCard` (`hub-primitives.tsx:66-116`) takes `{ title?, action?,
contentClassName?, className? }` plus the native `div` props; `action` is the
right-aligned slot on the title row and renders inside a
`text-xs text-muted-foreground` wrapper, so a plain string is fine.

**No `<SampleNote />` anywhere on this card.** Every figure on it is real. The
badge is the honesty marker for invented data, and putting one on real data
devalues it everywhere else on the screen.

Add a module doc comment above the component in the register the rest of this
directory uses — full sentences, explaining *why*, not what. It should cover: the
money rule (payout columns, never `price`), why the footer restates
`grossFares` rather than summing, and why the unassigned row exists.

#### 4.8 The money rule, restated for the renderer

Every currency figure this card prints comes from `driverPayout +
overtimeDriverPayout` — the carrier's commissioned share. `Order.price` and
`Order.overtimeFee` are what the **client** paid and are not on
`HubEarningsData` at all, by design: `earnings.ts`'s module header calls summing
them "the bug this module used to have", and `prisma/schema.prisma:1091` states
that `driverPayout` "is the ONLY money figure a driver may be shown".
`drivers.ts:205-208` extends the same rule to a company reading its own screen.

So: no column labelled "Billed", "Client paid", "Gross booking value" or
similar, and no attempt to reconstruct one. If a future reviewer asks for it,
that is a product decision with a schema-comment-shaped answer already written
down, not a rendering change.

### 5. Verification

There are no tests in this spec (`requirements.md`, Non-Goals: "No new tests").
Verify by:

1. `pnpm lint` and `pnpm typecheck` (or the project's equivalents) — both clean.
   Typecheck is doing real work here: `fleet` is `HubEarningsFleet | null`, so a
   missing narrowing is a compile error rather than a runtime crash.
2. `git grep -n "SampleNote" src/components/driver-hub/screens/earnings-fleet-card.tsx`
   — must return nothing.
3. Reading the diff of `earnings-screen.tsx` and confirming the individual-driver
   branch of every tile is byte-identical to what is there today.
4. If the human has provided the test accounts named in `action-required.md`:
   sign in as the business account with completed orders in range and confirm
   the driver rows' revenue reaches the footer figure, and that the Share column
   is close to 100 across all rows plus the unassigned row.

## Acceptance Criteria

- [ ] `src/components/driver-hub/screens/earnings-fleet-card.tsx` exists,
      carries `"use client"`, and exports `EarningsFleetCard` plus
      `EarningsFleetCardProps`.
- [ ] It imports `HubEarningsFleet` with `import type`, never a value, from
      `@/lib/dashboard/hub/earnings`.
- [ ] The card renders a five-column table — Driver, Jobs, Share, Avg per job,
      Revenue — using the static-`COLUMNS` grid idiom from
      `earnings-payouts-card.tsx`, with the `role="row"` / `role="cell"`
      attributes preserved.
- [ ] Rows are rendered in the order the loader supplied; no client-side sort,
      no client-side filter.
- [ ] `fleet.unassigned` renders as a final, visually distinct row when its
      `jobsCompleted > 0`, labelled as not-a-driver, and is never folded into a
      driver's row.
- [ ] The footer figure is the `total` prop (`data.grossFares`), not a `reduce`
      over the rows.
- [ ] The zero case uses `HubEmptyState` from
      `src/components/driver-hub/hub-primitives.tsx`, with copy that names the
      selected range.
- [ ] The card renders when `drivers.length > 0 || unassigned.jobsCompleted > 0`
      and the empty state otherwise.
- [ ] No `<SampleNote />` appears anywhere on the new card.
- [ ] `earnings-screen.tsx` renders `<EarningsFleetCard />` only when
      `data.persona === "BUSINESS" && data.fleet !== null`, positioned between
      the chart/breakdown row and `<EarningsPayoutsCard />`.
- [ ] For `BUSINESS`, tile 1's label reads "Fleet revenue"; for every other
      persona it still reads "Gross earnings".
- [ ] For `BUSINESS`, the "Jobs completed" tile shows neither the
      `"Nh online"` note nor the "Online hours" `<SampleNote />`, and its note
      is a real driver count instead.
- [ ] For `BUSINESS`, the "Avg per job" tile shows neither the
      `"₾N per online hour"` note nor the "Per online hour" `<SampleNote />`.
- [ ] The Incentives tile is unchanged for both personas, badge included.
- [ ] The `INDEPENDENT` rendering of every tile is byte-identical to today's.
- [ ] No roster-specific branch exists anywhere in this task's output.
- [ ] `earnings-screen.tsx`'s module doc comment's "Real versus sampled" section
      names the fleet card as real and records the two hidden notes.
- [ ] `hub-primitives.tsx`, `hub-status.ts`, `sample.ts`, `earnings.ts`,
      `earnings/page.tsx` and the export route are all unmodified.
- [ ] `pnpm lint` and `pnpm typecheck` pass clean.

## Notes

**Why the notes are hidden rather than reworded.** `requirements.md`'s Non-Goals
put it as a standing rule: sampled values stay sampled and stay badged, and
"where a sampled card is meaningless for a persona … it is hidden, not made
real". "Online hours" for a fleet is not a figure with a wrong label — it is a
figure with no referent. There is nothing to rename it to that would not be a
second invention. What replaces it in each tile is read off `fleet`, which is
real, or is dropped.

**`formatHours` and `sampled.perOnlineHour` stay imported and stay used.** Only
the fleet branch drops them. Do not delete the constants `ONLINE_HOURS_NOTE` or
`PER_ONLINE_HOUR_NOTE` — the individual-driver branch still renders both.

**The `sampled.rangeTotal` trap.** `HubEarningsData.sampled.rangeTotal` exists
and is rendered **nowhere**, deliberately: it adds estimated tips and incentives
to real fares into a number a reader cannot un-mix, and
`earnings-breakdown-card.tsx:11-37` spends twenty-five lines explaining why the
breakdown footer refuses to headline it. A fleet revenue card is a tempting new
home for a "Range total". It is not one. Use `grossFares`.

**Why the fleet card is not a `MasterDetailSplit`.** `hub-primitives.tsx` exports
one (line 361) and the Drivers and Vehicles screens use it. This card is not that
shape: there is no per-driver detail to open here — the Drivers screen owns
driver detail — and adding a panel would duplicate a surface that already exists
and would then need its own persona rules.

**Responsive.** The `min-w-[560px]` inside `Table`'s scroll wrapper is what keeps
a narrow pane scrolling rather than crushing. The hub shell has no mobile
breakpoint work in this spec (`requirements.md`, Non-Goals: "No mobile shell
work") — match the payout table's behaviour and do not attempt a mobile card
layout for this one table.

**Accessibility.** Follow `earnings-payouts-card.tsx` exactly: `role="table"` on
`Table`, `role="rowgroup"` on `TableHeader`/`TableBody`, `role="row"` on rows,
`role="columnheader"` on heads and `role="cell"` on cells. The `display: grid`
these components carry destroys the implicit table semantics, which is why the
roles are written out; a table without them is announced as a stack of
unlabelled text.
