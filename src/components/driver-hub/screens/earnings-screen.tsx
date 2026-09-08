"use client";

import { useHubSubtitle } from "@/components/driver-hub/driver-hub-shell";
import {
  HubBarChart,
  HubCard,
  HubEmptyState,
  MetricTile,
  SampleNote,
  type HubBarColumn,
} from "@/components/driver-hub/hub-primitives";
import { EarningsBreakdownCard } from "@/components/driver-hub/screens/earnings-breakdown-card";
import { EarningsFilterBar } from "@/components/driver-hub/screens/earnings-filter-bar";
import { EarningsPayoutsCard } from "@/components/driver-hub/screens/earnings-payouts-card";
import {
  formatBarValue,
  formatDayMonth,
  formatGel,
  formatHours,
  formatRangeSubtitle,
  formatWeekday,
  pluralise,
} from "@/components/driver-hub/screens/earnings-format";
import type {
  HubEarningsData,
  HubEarningsPreset,
} from "@/lib/dashboard/hub/earnings";

/**
 * Earnings & payouts — what a chosen window paid, where it came from, and when
 * it settles.
 *
 * ## The range is URL state
 *
 * This screen holds no state at all. The window comes in as
 * `data.range`, resolved on the server by `resolveHubEarningsRange` from the
 * query string, and the filter bar changes it by pushing new params rather than
 * by calling a setter — see `earnings-filter-bar.tsx`. Nothing here refetches:
 * a new range is a new server render, which is what keeps the tiles, the bars,
 * the breakdown and the export button describing one window instead of four.
 *
 * ## Real versus sampled
 *
 * Real: the range itself, gross fares, the job count, the average per job, and
 * every bar on the chart — all `SUM(driverPayout + overtimeDriverPayout)` over
 * completed orders: each job's earned share after the platform's commission,
 * never the client's price. (There is no `serviceLevelAdjustment` term in that
 * sum on purpose — the Priority uplift and Pooling discount are already inside
 * the basis `driverPayout` was commissioned from at booking.) Sampled: online
 * hours (and the per-online-hour figure derived from them), tips, incentives,
 * adjustments and the whole payout table.
 *
 * The marking follows the same rule as Today's hero tile: the badge names the
 * *part* that is invented, never the card around it. So the Jobs completed tile
 * badges "Online hours" and not the job count above it, the Avg per job tile
 * badges "Per online hour" and not the average, and only the Incentives tile —
 * whose headline figure is itself fictional — is badged whole.
 *
 * `sampled.rangeTotal` is not rendered anywhere. The breakdown card's own
 * header explains at length why a total that folds estimates into real fares is
 * the one number this screen refuses to headline.
 */

/**
 * Above a week, a daily bar is labelled with its date instead of its weekday.
 *
 * The design labels daily bars "Mon", which is unambiguous for the presets that
 * are a week long and ambiguous for anything longer — a ten-day range would
 * carry two bars called "Mon" and two called "Tue". Weekly grouping only starts
 * above ten days, so those in-between ranges have nowhere else to get a
 * distinguishable label.
 */
const WEEKDAY_LABEL_MAX_DAYS = 7;

const ONLINE_HOURS_NOTE =
  "Online hours are a placeholder estimated from the completed-job count: " +
  "DriverProfile.isOnline is a single boolean with no history behind it, so " +
  "no duration can be computed from it. Retire with an OnlineSession model. " +
  "The job count and the money beside it are real.";

const INCENTIVES_NOTE =
  "Nothing in the schema knows a bonus was ever earned. The figure is " +
  "estimated from weekend jobs. Retire with an Incentive model recording the " +
  "campaigns a driver qualified for and what each paid.";

const PER_ONLINE_HOUR_NOTE =
  "Per-hour earnings divide by estimated online hours, so the rate inherits " +
  "that estimate — and its numerator folds in the estimated tips and " +
  "incentives. Retire with an OnlineSession model. The average per job above " +
  "it is real.";

export type EarningsScreenProps = {
  data: HubEarningsData;
  /**
   * The preset tabs, forwarded to the filter bar. They come in as a prop
   * because the list is exported by a `server-only` module and this tree is a
   * client one — see `EarningsFilterBarProps`.
   */
  presets: readonly HubEarningsPreset[];
};

export function EarningsScreen({ data, presets }: EarningsScreenProps) {
  const { range, grouping, buckets, sampled } = data;

  useHubSubtitle(formatRangeSubtitle(range.from, range.to, range.days));

  // Weekly grouping starts above ten days, so a weekly bucket always falls in
  // the dated branch — one condition covers both groupings.
  const dated = range.days > WEEKDAY_LABEL_MAX_DAYS;

  const columns: readonly HubBarColumn[] = buckets.map((bucket) => ({
    label: dated
      ? formatDayMonth(bucket.startDate)
      : formatWeekday(bucket.startDate),
    values: [bucket.fares],
    valueLabel: formatBarValue(bucket.fares),
  }));

  const chartTitle =
    grouping === "weekly" ? "Weekly earnings" : "Daily earnings";

  return (
    <>
      <EarningsFilterBar range={range} presets={presets} />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Gross earnings"
          value={formatGel(data.grossFares)}
          note={`${pluralise(range.days, "day")} in range`}
        />

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

        <MetricTile
          label="Incentives"
          value={formatGel(sampled.extras.incentivesGel)}
          note={sampled.incentivesNote}
        >
          <SampleNote note={INCENTIVES_NOTE} className="mt-2.5" />
        </MetricTile>

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
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <HubCard
          title={chartTitle}
          action={
            grouping === "weekly" ? (
              <>
                Grouped by week ·{" "}
                <span className="font-price">{buckets.length}</span>{" "}
                {buckets.length === 1 ? "week" : "weeks"}
              </>
            ) : (
              "One bar per day"
            )
          }
        >
          {/* A resolved range always covers at least one day, so this is the
              structurally unreachable case rather than the common one — but the
              design specifies the copy for it, and a chart that would otherwise
              divide by an empty column list is worth one guard. */}
          {columns.length === 0 ? (
            <HubEmptyState message="No days in the selected range" />
          ) : (
            <HubBarChart columns={columns} ariaLabel={chartTitle} />
          )}
        </HubCard>

        <EarningsBreakdownCard
          grossFares={data.grossFares}
          jobsCompleted={data.jobsCompleted}
          extras={sampled.extras}
          incentivesNote={sampled.incentivesNote}
        />
      </div>

      <EarningsPayoutsCard payouts={sampled.payouts} />
    </>
  );
}
