"use client";

import * as React from "react";

import { useHubSubtitle } from "@/components/driver-hub/driver-hub-shell";
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
import {
  EMPTY_VALUE,
  formatDecimal,
  formatHours,
  formatRate,
  formatRating,
  formatWeekRange,
  pluralise,
} from "@/components/driver-hub/screens/performance-format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  HubPerformanceData,
  HubPerformanceDriverRow,
} from "@/lib/dashboard/hub/performance";
import { cn } from "@/lib/utils";

/**
 * Performance — how the week is going, for an independent driver, an employed
 * one, or a fleet.
 *
 * ## Two readers, not three
 *
 * `data.persona` arrives on the loader's payload and every branch in this file
 * tests it against `"BUSINESS"`. `INDEPENDENT` and `ROSTER` render identically:
 * both are one person driving, both have a personal completion rate and a
 * personal score, and the only thing that separates them — who is paid the fare
 * — is an Earnings concern. So there is deliberately no third branch here, and
 * the screen never re-derives the persona from `kind` or `companyId`.
 *
 * What a fleet owner gets instead of the driver-shaped surfaces:
 *
 * - **No "What affects your score" card.** Its rows are individual coaching
 *   ("Moving to Vake between 09:00 and 11:00 cuts it by about a third"), which
 *   no title change makes sensible advice to a logistics company. Dropped, not
 *   reworded — rewriting the bodies would mean inventing new sample content.
 * - **No sampled online-hours series.** A COMPANY session resolves with
 *   `isOnline: null` because a fleet has no online toggle and no
 *   `DriverProfile` behind it, so fleet "online hours" is not merely unsourced,
 *   it is meaningless — and it was drawn as the chart's *primary* series, which
 *   on a quiet week put a tall invented bar over a 3px real one. The fleet
 *   chart is single-series and entirely real.
 * - **A per-driver table** of the same week the tiles above it aggregate.
 *
 * That table is the one surface on this screen with no fictional value anywhere
 * in it, which is why it carries no `<SampleNote />` and why none may be added.
 * It has no per-driver acceptance column for the same reason: acceptance is
 * unrecorded rather than unaggregated, and the only per-driver figure that
 * exists is a sample constant whose fallback is `0` — a confident, specific
 * `0%` beside a named person on the roster their employer reads is a worse lie
 * than an em dash.
 *
 * ## The one thing this screen has to get right
 *
 * Three of its five tiles show a **real** value under a **sampled** delta.
 * `Order.status` can say what share of this week's finished jobs completed; it
 * cannot say what that share was last week without a second full aggregation
 * per request, so every "vs last week" line on this screen is invented (see
 * `SAMPLE_PERFORMANCE_DELTAS`). A single "Sample data" badge on such a tile
 * would disown the driver's own completion rate; no badge at all would pass off
 * a fabricated comparison as measured. So the marker is scoped to the line it
 * qualifies:
 *
 * - Sampled value **and** sampled delta (Acceptance, Avg rating) → the tile
 *   carries the ordinary `<SampleNote />`, "Sample data", covering both.
 * - Real value, sampled delta (Completion, Cancellations, Jobs per day) → the
 *   badge reads **"Estimated delta"**. The value keeps the top of the tile to
 *   itself, unbadged, because it is true.
 *
 * The tile itself is the handoff's, exactly: label → value → delta → track,
 * and the track tinted green or amber by the delta's own tone. That tint was
 * once refused here on the ground that a verdict drawn from an invented delta
 * should not colour a bar built from a real value — and the objection was
 * answered rather than overruled. The tone was never the *only* thing the
 * delta's fictionality is announced by: the "Estimated delta" badge is, it
 * still sits on all three of those tiles, and it now closes the tile below the
 * track, so everything the badge qualifies — the delta line and the tint it
 * gives the bar — is above it. What the old arrangement bought instead was a
 * tile that looked like no other tile in the hub and a bar that said nothing
 * at all.
 *
 * ## The `note` line, and the one state that keeps it
 *
 * No tile carries a `note` when it has a figure to show, because the handoff
 * draws no such line. That dropped every tile's **denominator** — "Of the jobs
 * offered to you", "N jobs finished this week", "From N rated jobs", "Across N
 * days so far" — and for three of the five that is simply the design's call:
 * a rating over "From 61 rated jobs" is context, and context is what this
 * layout trades away for the four-line tile.
 *
 * The two **rate** tiles are the exception, and only in one state. `formatRate`
 * returns an em dash when its rate is `null`, which is the loader's "nothing
 * finished this week" — emphatically not zero. An em dash over an empty track
 * with nothing else on the tile does not read as a quiet week; it reads as a
 * broken tile. The handoff cannot arbitrate that, because its five figures are
 * hardcoded and it has no empty tile anywhere: its silence here is an absence
 * of opinion, not an instruction. So both rate tiles restore
 * `NO_FINISHED_JOBS_NOTE` exactly when their own value is `null`, and render
 * the design's four lines the rest of the time. The tile matches the artboard
 * in every state the artboard actually depicts.
 *
 * That note gets no `<SampleNote>`: "nothing finished this week" is a true
 * statement about real rows, and badging it would disown a fact.
 *
 * `sampled.ratedJobCount` and `window.daysElapsed` are consequently unread here
 * now, and `data.finishedJobCount` is too — the rate tiles condition on their
 * own values rather than on the shared denominator. All three stay on the
 * payload; they are the loader's vocabulary, not this screen's leftovers.
 *
 * ## Two windows that look like one
 *
 * `performance.ts` keys the rates on `createdAt` and the bars on `completedAt`,
 * because `Order` has no `cancelledAt` and a cancellation can therefore only be
 * dated by when the job was booked. Both cover the same Monday–Sunday week,
 * but they are not the same set of jobs — a job booked Sunday and completed
 * Monday lands in one and not the other. That is a real discrepancy a reader
 * would otherwise silently resolve the wrong way, so it is stated once, quietly,
 * under the tiles rather than as a banner over them.
 *
 * ## Read-only
 *
 * Nothing here mutates: every figure is a rollup, so the screen holds no state
 * and needs `"use client"` only for `useHubSubtitle`.
 */

/* -------------------------------------------------------------------------- */
/* Honesty copy                                                               */
/* -------------------------------------------------------------------------- */

const ACCEPTANCE_NOTE =
  "A declined offer leaves no row — Order only ever stores the offer that was " +
  "taken — so acceptance is unrecorded, not merely unaggregated. Retire with " +
  "a JobOffer model holding every dispatch and its outcome.";

const RATING_NOTE =
  "Nothing in the schema captures customer feedback. Retire with an " +
  "OrderRating model — one score per completed order.";

const DELTA_NOTE =
  "The value above is real; this comparison is not. Last week's figure is not " +
  "held anywhere to compare against. Retire with a DriverMetricSnapshot model " +
  // "per account" rather than "per driver": the same tiles carry a fleet's
  // figures for a BUSINESS reader, whose snapshot would be per company.
  "storing each metric per account per week.";

const ONLINE_HOURS_NOTE =
  "Online hours only. DriverProfile.isOnline is a single boolean with no " +
  "history behind it, so no duration can be computed from it. The jobs bars " +
  "are real. Retire with an OnlineSession model bucketed by Tbilisi day.";

const SCORE_NOTES_NOTE =
  "Every figure and threshold in this card is invented — the thresholds are " +
  "policy the product has not written down anywhere the code can read. " +
  "Retire alongside the metrics each row describes.";

/* -------------------------------------------------------------------------- */
/* Empty-state copy                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The line the two rate tiles show *instead of* a denominator, and only when
 * they have none.
 *
 * Deliberately not in the honesty block above: every string there is the body
 * of a `<SampleNote>` and names something invented. This is the opposite — a
 * true statement about real data — so it must never acquire a badge.
 *
 * Shared by both tiles because they are unknown together: `performance.ts`
 * documents `cancellationRatePercent` as the complement of
 * `completionRatePercent`, null on the same condition, so a week that leaves
 * one of them blank leaves both.
 */
const NO_FINISHED_JOBS_NOTE = "No jobs have finished yet this week";

/* -------------------------------------------------------------------------- */
/* Tile geometry                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Ceilings the 4px tracks are drawn against, transcribed from the handoff's own
 * arithmetic (`2.1%` fills 21%, `7.4` fills 74%).
 *
 * A rate tile fills to its own percentage, but a *cancellation* rate that
 * filled to 2% would look like a broken bar rather than a good week, and jobs
 * per day is not a percentage at all. Both therefore need a stated full-scale
 * value. These are presentational only — neither is a threshold the product
 * enforces, and `MetricTile` clamps anything past the end of the track.
 */
const CANCELLATION_TRACK_CEILING_PERCENT = 10;
const JOBS_PER_DAY_TRACK_CEILING = 10;

/** The rating scale the design's 4.86 fills 97% of. */
const RATING_SCALE_MAX = 5;

/**
 * Delta text colours, matching `hub-primitives.tsx`'s own private map. Copied
 * rather than imported because Tailwind scans source text: a class assembled
 * from a shared import would never be generated. `vehicles-screen.tsx` repeats
 * the accent orange for the same reason.
 */
const DELTA_TONE_CLASSES: Record<MetricDeltaTone, string> = {
  good: "text-[oklch(44.8%_0.119_151.328)]",
  bad: "text-[oklch(47.6%_0.114_61.907)]",
};

/**
 * The two series of the paired chart, named as the handoff names them
 * (`…>Online hours</span>` / `…>Jobs completed</span>`).
 *
 * The legend used to read "Online hours (estimated)", carrying the honesty
 * marker inside the legend text. It no longer needs to: the card this chart
 * sits in already wears a `<SampleNote label="Online hours" />` in its header
 * action, which says the same thing in the place the rest of the hub says it,
 * and a parenthetical in the legend on top of that badged the same fact twice.
 * The badge is the marker; do not delete it and re-add the parenthetical.
 */
const CHART_SERIES: readonly HubBarSeries[] = [
  { label: "Online hours", tone: "ink" },
  { label: "Jobs completed", tone: "accent" },
];

/**
 * The fleet chart's one series. A company has no online state to estimate hours
 * from — `resolveHubAccount()` sets `isOnline: null` for a COMPANY session
 * precisely because a fleet has no toggle — so the sampled hours bars are
 * dropped rather than relabelled, and what remains is entirely real.
 */
const FLEET_CHART_SERIES: readonly HubBarSeries[] = [
  { label: "Jobs completed", tone: "ink" },
];

/* -------------------------------------------------------------------------- */
/* Fleet table geometry                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The fleet table's grid. A static class string, not an inline
 * `gridTemplateColumns`, so Tailwind can see it at build time — the same reason
 * `drivers-screen.tsx` spells its own columns out. The `min-w-` is what makes
 * the scroll container `Table` already ships actually scroll on a narrow pane
 * instead of the six columns crushing.
 *
 * These three strings are duplicated from `drivers-screen.tsx` rather than
 * imported, matching the hub's convention that each screen owns its own table
 * geometry and its own formatter module.
 */
const FLEET_TABLE_COLUMNS =
  "grid-cols-[1.4fr_90px_110px_130px_90px_100px] min-w-[760px]";

const FLEET_HEAD_CLASSES =
  "h-auto px-0 pb-2.5 text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground";
const FLEET_CELL_CLASSES = "min-w-0 px-0 py-3.5";

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

/** Any figure inside running copy. Every number on this surface is mono. */
function Num({ children }: { children: React.ReactNode }) {
  return <span className="font-price">{children}</span>;
}

type TileMarkerProps = {
  /**
   * Badge text. `"Sample data"` (the default) when the tile's value is invented
   * too; `"Estimated delta"` when only the delta line above the track is.
   */
  label?: string;
  /** What would make the badged thing real. */
  note: string;
};

/**
 * The honesty badge at the foot of every tile.
 *
 * It is the one thing on these tiles the handoff has no slot for, because the
 * prototype's five figures are all invented and it never had to say so. Here
 * three of the five values are real and every "vs last week" line is not, so
 * the badge stays and the tile is built around it: label → value → delta →
 * track is the handoff's order, and this sits *under* the track, which is the
 * only place left that does not push a real value down the tile behind a
 * caveat about an invented one.
 *
 * `flex` on the wrapper rather than a bare badge: `MetricTile`'s card is a flex
 * column, so an unwrapped inline-flex badge would stretch to the tile's full
 * width and lose its pill shape.
 */
function TileMarker({ label, note }: TileMarkerProps) {
  return (
    <div className="mt-2.5 flex">
      <SampleNote label={label} note={note} />
    </div>
  );
}

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
 *
 * `formatRate` prints an em dash for the `null` the loader returns when a
 * driver finished nothing this week; `0%` would say every job they took failed,
 * when they took none.
 */
function FleetTable({ rows }: { rows: readonly HubPerformanceDriverRow[] }) {
  return (
    // `Table` brings its own `overflow-x-auto` wrapper — the min-width in the
    // column classes is what makes that wrapper scroll inside the card rather
    // than widening the page. `drivers-screen.tsx` relies on the same thing.
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
          <TableHead role="columnheader" className={FLEET_HEAD_CLASSES}>
            Finished
          </TableHead>
          <TableHead role="columnheader" className={FLEET_HEAD_CLASSES}>
            Completion
          </TableHead>
          <TableHead role="columnheader" className={FLEET_HEAD_CLASSES}>
            Cancellations
          </TableHead>
          {/* The same abbreviation the Drivers roster uses for the same figure,
              so an operator moving between the two screens reads one header. */}
          <TableHead role="columnheader" className={FLEET_HEAD_CLASSES}>
            Jobs · wk
          </TableHead>
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
              // `hover:bg-transparent` because these rows are not selectable —
              // there is no `onClick` and no detail panel behind them. The
              // Drivers screen keeps the base hover precisely because its rows
              // *are* clickable; a highlight here would promise an interaction
              // that does not exist.
              "grid items-center gap-3 border-b border-muted text-sm hover:bg-transparent",
              FLEET_TABLE_COLUMNS,
            )}
          >
            {/* A name is not a number, so it is the one cell without
                `font-price`. */}
            <TableCell
              role="cell"
              className={cn(FLEET_CELL_CLASSES, "truncate font-medium")}
            >
              {row.name}
            </TableCell>
            <TableCell
              role="cell"
              className={cn(FLEET_CELL_CLASSES, "font-price")}
            >
              {row.finishedJobCount}
            </TableCell>
            <TableCell
              role="cell"
              className={cn(FLEET_CELL_CLASSES, "font-price")}
            >
              {formatRate(row.completionRatePercent)}
            </TableCell>
            <TableCell
              role="cell"
              className={cn(FLEET_CELL_CLASSES, "font-price")}
            >
              {formatRate(row.cancellationRatePercent)}
            </TableCell>
            <TableCell
              role="cell"
              className={cn(FLEET_CELL_CLASSES, "font-price")}
            >
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

export type PerformanceScreenProps = {
  data: HubPerformanceData;
};

export function PerformanceScreen({ data }: PerformanceScreenProps) {
  // `window` is the global's name; the alias keeps the two unambiguous in a
  // file that also does date formatting.
  const { window: hubWindow, sampled } = data;

  // INDEPENDENT and ROSTER render identically here: both are one person
  // driving, with a personal completion rate and a personal score. The only
  // axis this screen cares about is whether the reader is the fleet rather than
  // one of its drivers, so there is deliberately no third branch.
  const isBusiness = data.persona === "BUSINESS";

  // `fleet` is non-null exactly when the persona is BUSINESS, but the type says
  // `HubPerformanceFleet | null` — so this is the narrowing rather than a second
  // opinion about who gets the table.
  const fleet = isBusiness ? data.fleet : null;

  const weekRange = formatWeekRange(hubWindow.from, hubWindow.to);
  useHubSubtitle(`Week of ${weekRange}`);

  // The sampled hours series is keyed by weekday label, which is exactly what
  // `HubPerformanceDay.weekday` carries — `performance.ts` pins its formatter's
  // locale so the two vocabularies cannot drift apart.
  const hoursByWeekday = new Map(
    sampled.onlineHoursWeek.map((day) => [day.day, day.onlineHours]),
  );

  const hasFutureDays = data.jobsByDay.some((day) => day.isFuture);

  // The two column sets are built separately rather than as one array with a
  // conditional `values`: the driver branch needs `hoursByWeekday` and
  // `formatHours` and the fleet branch needs neither, and interleaving them
  // makes both harder to read. Seven entries either way, so the unused set
  // costs nothing worth branching around.
  const driverColumns: HubBarColumn[] = data.jobsByDay.map((day) => {
    // A day that has not started gets no hours, whatever the sample series
    // holds for that weekday: showing Thursday's 9.1h on a Tuesday would be a
    // forecast rather than an estimate. Both bars then fall to the chart's
    // dimmed 3px sliver, and the em dash above them separates "not yet" from a
    // real, worked zero — which prints "0.0h · 0".
    const hours = day.isFuture ? 0 : (hoursByWeekday.get(day.weekday) ?? 0);

    return {
      label: day.weekday,
      values: [hours, day.jobsCompleted],
      valueLabel: day.isFuture
        ? EMPTY_VALUE
        : `${formatHours(hours)} · ${day.jobsCompleted}`,
    };
  });

  const fleetColumns: HubBarColumn[] = data.jobsByDay.map((day) => ({
    label: day.weekday,
    values: [day.jobsCompleted],
    valueLabel: day.isFuture ? EMPTY_VALUE : String(day.jobsCompleted),
  }));

  // The same footnote under either chart — a day that has not happened is not a
  // persona question.
  const futureDaysNote = hasFutureDays ? (
    <p className="mt-3.5 text-xs text-muted-foreground">
      Days later this week show <Num>{EMPTY_VALUE}</Num> and a flat bar until
      they happen.
    </p>
  ) : null;

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
        {/* Five tiles in the handoff's shape: label → value → delta → track,
            with the delta above the bar and the bar tinted to the delta's own
            tone. `progressTone` is passed explicitly rather than left to
            `MetricTile`'s `progressTone ?? delta?.tone` fallback — the tone is
            a deliberate statement here, not an inherited default, and spelling
            it out means a change to that fallback cannot silently repaint five
            tracks. Each tile then closes with its `<TileMarker />`, which the
            handoff has no equivalent for and which is not optional here; see
            that component. */}
        <MetricTile
          label="Acceptance"
          value={`${formatDecimal(sampled.acceptanceRatePercent)}%`}
          delta={sampled.deltas.acceptance}
          progress={sampled.acceptanceRatePercent / 100}
          progressTone={sampled.deltas.acceptance.tone}
        >
          <TileMarker note={ACCEPTANCE_NOTE} />
        </MetricTile>

        <MetricTile
          label="Completion"
          value={formatRate(data.completionRatePercent)}
          // Present only in the state the handoff never draws. `formatRate`
          // returns the em dash on `null` and on nothing else, so this is the
          // exact condition under which the tile would otherwise be a dash over
          // an empty track with no account of itself. Conditioned on this
          // tile's own value rather than on the shared `finishedJobCount`, so
          // it stays right if the loader ever makes the two rates independent.
          note={
            data.completionRatePercent === null
              ? NO_FINISHED_JOBS_NOTE
              : undefined
          }
          delta={sampled.deltas.completion}
          // A rate with no denominator is not a full track and not a broken
          // one — it is an empty track under an em dash.
          progress={(data.completionRatePercent ?? 0) / 100}
          progressTone={sampled.deltas.completion.tone}
        >
          <TileMarker label="Estimated delta" note={DELTA_NOTE} />
        </MetricTile>

        <MetricTile
          label="Cancellations"
          value={formatRate(data.cancellationRatePercent)}
          note={
            data.cancellationRatePercent === null
              ? NO_FINISHED_JOBS_NOTE
              : undefined
          }
          delta={sampled.deltas.cancellations}
          progress={
            (data.cancellationRatePercent ?? 0) /
            CANCELLATION_TRACK_CEILING_PERCENT
          }
          progressTone={sampled.deltas.cancellations.tone}
        >
          <TileMarker label="Estimated delta" note={DELTA_NOTE} />
        </MetricTile>

        {/* A company is not rated, its drivers are — so a fleet reads the
            fleet-wide pair the loader already swapped in (the same pair the
            Drivers screen shows, so the two screens agree), under a label that
            does not claim the score is the reader's own. Both are still on the
            same five-point scale, and both are still fully sampled. */}
        <MetricTile
          label={isBusiness ? "Fleet rating" : "Avg rating"}
          value={formatRating(sampled.averageRating)}
          delta={sampled.deltas.rating}
          progress={sampled.averageRating / RATING_SCALE_MAX}
          progressTone={sampled.deltas.rating.tone}
        >
          <TileMarker note={RATING_NOTE} />
        </MetricTile>

        <MetricTile
          label="Jobs per day"
          value={formatDecimal(data.jobsPerDay)}
          delta={sampled.deltas.jobsPerDay}
          progress={data.jobsPerDay / JOBS_PER_DAY_TRACK_CEILING}
          progressTone={sampled.deltas.jobsPerDay.tone}
        >
          <TileMarker label="Estimated delta" note={DELTA_NOTE} />
        </MetricTile>
      </div>

      {/* One line, not a banner: the two windows really are different sets of
          jobs, and a reader who never notices would quietly assume they match. */}
      <p className="text-xs text-muted-foreground">
        This week, <Num>{weekRange}</Num>. The rates count jobs by when they
        were <strong className="font-medium">booked</strong>; the chart counts
        them by when they were{" "}
        <strong className="font-medium">completed</strong>, so the two need not
        describe the same jobs.
      </p>

      {isBusiness ? (
        <>
          {/* Full width: the score-notes card that sits beside this one for a
              driver is individual coaching and does not apply to a fleet, so
              the two-column grid has no second occupant. No `action` either —
              nothing on this chart is sampled any more, and leaving the
              "Online hours" badge on a chart with no hours in it would be
              worse than either alternative. */}
          {/* `titleGap="chart"` for the same reason the driver chart below
              takes it — this is the same bar chart under a different title, and
              the handoff's plot cards set `margin-bottom:22px` on their title
              row where every other card sets 16px. The artboard has no
              fleet-owner Performance screen to quote a line from, so this one
              follows the driver chart by analogy rather than by transcription;
              two identical charts differing by 6px would be the odder result. */}
          <HubCard title="Jobs completed by day" titleGap="chart">
            <HubBarChart
              columns={fleetColumns}
              series={FLEET_CHART_SERIES}
              ariaLabel="Jobs completed by day of this week"
            />
            {futureDaysNote}
          </HubCard>

          {fleet ? (
            <HubCard title="How the week went, by driver">
              {fleet.drivers.length === 0 ? (
                // The one legitimately empty case: a company that has
                // registered nobody. A roster that exists but had a quiet week
                // is *not* empty — those rows render with real zeroes and em
                // dashes, which is the signal an operator came for.
                //
                // The message matches the Drivers screen's own wording for the
                // same condition; the hint differs because that screen can
                // offer the register action and this one cannot.
                <HubEmptyState message="No drivers on this roster yet.">
                  <p className="mt-1 text-[13px]">
                    Register a driver and their week shows up here.
                  </p>
                </HubEmptyState>
              ) : (
                <>
                  <FleetTable rows={fleet.drivers} />

                  {/* Not an apology for a bug: the rows are a strict subset of
                      the tiles' scope, and the gap is orders never dispatched
                      plus orders carried by someone who has since left. Said
                      out loud, because a reader who sums the column and finds
                      a smaller number concludes the screen is broken. Nothing
                      renders when the gap is zero. */}
                  {fleet.unattributedFinishedJobCount > 0 ? (
                    <p className="mt-3.5 text-xs text-muted-foreground">
                      <Num>
                        {pluralise(
                          fleet.unattributedFinishedJobCount,
                          "finished job",
                        )}
                      </Num>{" "}
                      this week{" "}
                      {fleet.unattributedFinishedJobCount === 1 ? "is" : "are"}{" "}
                      not attributed to anyone on the roster — either never
                      dispatched, or carried by a driver who has since left. The
                      rows above will not add up to the tiles.
                    </p>
                  ) : null}
                </>
              )}
            </HubCard>
          ) : null}
        </>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
          {/* `margin-bottom:22px` on this card's title row in the handoff
              (`…font-weight:600; margin-bottom:22px">Online hours vs jobs
              completed</div>`), against the 16px the score card beside it uses
              — so this one opts into the wider gap and that one does not. */}
          <HubCard
            title="Online hours vs jobs completed"
            titleGap="chart"
            action={
              <SampleNote label="Online hours" note={ONLINE_HOURS_NOTE} />
            }
          >
            <HubBarChart
              columns={driverColumns}
              series={CHART_SERIES}
              ariaLabel="Online hours against jobs completed, by day of this week"
            />
            {futureDaysNote}
          </HubCard>

          <HubCard
            title="What affects your score"
            action={<SampleNote note={SCORE_NOTES_NOTE} />}
          >
            <ul className="flex flex-col">
              {sampled.scoreNotes.map((note) => (
                <li
                  key={note.title}
                  // `padding:14px 0` on every row, last one included — the
                  // handoff's own rule. Trimming the final row's bottom padding
                  // pulled the list tight against the card's floor and made the
                  // card read shorter than the chart beside it.
                  className="border-t border-muted py-3.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium">{note.title}</p>
                    <p
                      className={cn(
                        "font-price text-[13px]",
                        DELTA_TONE_CLASSES[note.tone],
                      )}
                    >
                      {note.value}
                    </p>
                  </div>
                  <p className="mt-1 text-xs leading-normal text-muted-foreground">
                    {note.body}
                  </p>
                </li>
              ))}
            </ul>
          </HubCard>
        </div>
      )}
    </>
  );
}
