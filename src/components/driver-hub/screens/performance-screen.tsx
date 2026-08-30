"use client";

import * as React from "react";

import { useHubSubtitle } from "@/components/driver-hub/driver-hub-shell";
import {
  HubBarChart,
  HubCard,
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
import type { HubPerformanceData } from "@/lib/dashboard/hub/performance";
import type { SampleMetricDelta } from "@/lib/dashboard/hub/sample";
import { cn } from "@/lib/utils";

/**
 * Performance — how the week is going, for either account kind.
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
  "storing each metric per driver per week.";

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

export type PerformanceScreenProps = {
  data: HubPerformanceData;
};

export function PerformanceScreen({ data }: PerformanceScreenProps) {
  // `window` is the global's name; the alias keeps the two unambiguous in a
  // file that also does date formatting.
  const { window: hubWindow, sampled } = data;

  const weekRange = formatWeekRange(hubWindow.from, hubWindow.to);
  useHubSubtitle(`Week of ${weekRange}`);

  // The sampled hours series is keyed by weekday label, which is exactly what
  // `HubPerformanceDay.weekday` carries — `performance.ts` pins its formatter's
  // locale so the two vocabularies cannot drift apart.
  const hoursByWeekday = new Map(
    sampled.onlineHoursWeek.map((day) => [day.day, day.onlineHours]),
  );

  const hasFutureDays = data.jobsByDay.some((day) => day.isFuture);

  const columns: HubBarColumn[] = data.jobsByDay.map((day) => {
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
          note="Of the jobs offered to you"
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

      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <HubCard
          title="Online hours vs jobs completed"
          action={<SampleNote label="Online hours" note={ONLINE_HOURS_NOTE} />}
        >
          <HubBarChart
            columns={columns}
            series={CHART_SERIES}
            ariaLabel="Online hours against jobs completed, by day of this week"
          />
          {hasFutureDays ? (
            <p className="mt-3.5 text-xs text-muted-foreground">
              Days later this week show <Num>{EMPTY_VALUE}</Num> and a flat bar
              until they happen.
            </p>
          ) : null}
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
    </>
  );
}
