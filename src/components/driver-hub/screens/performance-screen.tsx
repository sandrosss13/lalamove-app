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
import type { SampleMetricDelta } from "@/lib/dashboard/hub/sample";
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
 *   badge reads **"Estimated delta"** and sits directly under the delta line,
 *   below the progress track that measures the real value. The value keeps the
 *   top of the tile to itself, unbadged, because it is true.
 *
 * The same reasoning removes the design's tinted progress track. In the handoff
 * a track is green when the metric moved the right way and amber when it did
 * not — an opinion sourced entirely from the delta. Tinting a track built from
 * a real value with a verdict from an invented one is precisely the confusion
 * the split above exists to prevent, so all five tracks are ink and the
 * good/amber tone survives only where it belongs: in the delta text itself.
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

/**
 * The Acceptance tile's sub-line, per persona. A fleet is offered loads it may
 * claim; a driver is offered jobs they may take. "You" was correct for two of
 * the three personas and a category error for the third — a fleet owner is
 * never personally offered a job.
 *
 * The tile itself is not dropped for a fleet. Acceptance is a real fleet
 * concept, simply unrecorded, exactly as it is for a driver; `ACCEPTANCE_NOTE`
 * above says why, in terms that are already persona-neutral.
 */
const ACCEPTANCE_TILE_NOTE = {
  driver: "Of the jobs offered to you",
  fleet: "Of the loads offered to the fleet",
} as const;

const ONLINE_HOURS_NOTE =
  "Online hours only. DriverProfile.isOnline is a single boolean with no " +
  "history behind it, so no duration can be computed from it. The jobs bars " +
  "are real. Retire with an OnlineSession model bucketed by Tbilisi day.";

const SCORE_NOTES_NOTE =
  "Every figure and threshold in this card is invented — the thresholds are " +
  "policy the product has not written down anywhere the code can read. " +
  "Retire alongside the metrics each row describes.";

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
 * The two series of the paired chart. The legend names the sampled one in the
 * legend text itself, so a reader who never hovers the badge still knows which
 * half of each column is a guess.
 */
const CHART_SERIES: readonly HubBarSeries[] = [
  { label: "Online hours (estimated)", tone: "ink" },
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

type TileFooterProps = {
  delta: SampleMetricDelta;
  /**
   * Badge text. `"Sample data"` (the default) when the tile's value is invented
   * too; `"Estimated delta"` when only the line above the badge is.
   */
  markerLabel?: string;
  /** What would make the badged thing real. */
  markerNote: string;
};

/**
 * The bottom of every tile: the period-over-period line in its own tone, and
 * immediately under it the badge saying how much of the tile that line's
 * fictionality extends to.
 *
 * Rendered as `MetricTile` children — i.e. *below* the progress track — rather
 * than through its `delta` prop, which would place the delta above the track
 * and tint the track with the delta's tone. Below the track is also the right
 * place semantically: the track measures the real value, and everything under
 * it on these three tiles is the estimate.
 */
function TileFooter({ delta, markerLabel, markerNote }: TileFooterProps) {
  return (
    <div className="mt-2.5 flex flex-col items-start gap-1.5">
      <p className={cn("text-xs", DELTA_TONE_CLASSES[delta.tone])}>
        {delta.label}
      </p>
      <SampleNote label={markerLabel} note={markerNote} />
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

  // Shared by both rate tiles: they have the same denominator, so they are
  // unknown together and explained together.
  const finishedNote =
    data.finishedJobCount === 0 ? (
      "No jobs have finished yet this week"
    ) : (
      <>
        <Num>{pluralise(data.finishedJobCount, "job")}</Num> finished this week
      </>
    );

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
        <MetricTile
          label="Acceptance"
          value={`${formatDecimal(sampled.acceptanceRatePercent)}%`}
          note={
            isBusiness
              ? ACCEPTANCE_TILE_NOTE.fleet
              : ACCEPTANCE_TILE_NOTE.driver
          }
          progress={sampled.acceptanceRatePercent / 100}
        >
          <TileFooter
            delta={sampled.deltas.acceptance}
            markerNote={ACCEPTANCE_NOTE}
          />
        </MetricTile>

        <MetricTile
          label="Completion"
          value={formatRate(data.completionRatePercent)}
          note={finishedNote}
          // A rate with no denominator is not a full track and not a broken
          // one — it is an empty track under an em dash.
          progress={(data.completionRatePercent ?? 0) / 100}
        >
          <TileFooter
            delta={sampled.deltas.completion}
            markerLabel="Estimated delta"
            markerNote={DELTA_NOTE}
          />
        </MetricTile>

        <MetricTile
          label="Cancellations"
          value={formatRate(data.cancellationRatePercent)}
          note={finishedNote}
          progress={
            (data.cancellationRatePercent ?? 0) /
            CANCELLATION_TRACK_CEILING_PERCENT
          }
        >
          <TileFooter
            delta={sampled.deltas.cancellations}
            markerLabel="Estimated delta"
            markerNote={DELTA_NOTE}
          />
        </MetricTile>

        {/* A company is not rated, its drivers are — so a fleet reads the
            fleet-wide pair the loader already swapped in (the same pair the
            Drivers screen shows, so the two screens agree), under a label that
            does not claim the score is the reader's own. Both are still on the
            same five-point scale, and both are still fully sampled. */}
        <MetricTile
          label={isBusiness ? "Fleet rating" : "Avg rating"}
          value={formatRating(sampled.averageRating)}
          note={
            isBusiness ? (
              <>
                Across <Num>{sampled.ratedJobCount}</Num> rated jobs, fleet-wide
              </>
            ) : (
              <>
                From <Num>{sampled.ratedJobCount}</Num> rated jobs
              </>
            )
          }
          progress={sampled.averageRating / RATING_SCALE_MAX}
        >
          <TileFooter delta={sampled.deltas.rating} markerNote={RATING_NOTE} />
        </MetricTile>

        <MetricTile
          label="Jobs per day"
          value={formatDecimal(data.jobsPerDay)}
          note={
            <>
              Across <Num>{pluralise(hubWindow.daysElapsed, "day")}</Num> so far
            </>
          }
          progress={data.jobsPerDay / JOBS_PER_DAY_TRACK_CEILING}
        >
          <TileFooter
            delta={sampled.deltas.jobsPerDay}
            markerLabel="Estimated delta"
            markerNote={DELTA_NOTE}
          />
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
          <HubCard title="Jobs completed by day">
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
          <HubCard
            title="Online hours vs jobs completed"
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
                  className="border-t border-muted py-3.5 last:pb-0"
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
