"use client";

import Link from "next/link";

import { useHubSubtitle } from "@/components/driver-hub/driver-hub-shell";
import {
  HubCard,
  MetricTile,
  SampleNote,
} from "@/components/driver-hub/hub-primitives";
import { TodayAttentionCard } from "@/components/driver-hub/screens/today-attention-card";
import { TodayCurrentJobCard } from "@/components/driver-hub/screens/today-current-job-card";
import { TodayZoneDemandCard } from "@/components/driver-hub/screens/today-zone-demand-card";
import {
  TILE_LABEL_CLASSES,
  formatGel,
  formatPercent,
  pluralise,
} from "@/components/driver-hub/screens/today-format";
import { Button } from "@/components/ui/button";
import type { HubTodayData } from "@/lib/dashboard/hub/today";

/**
 * Today — the landing screen after sign-in, and the only one a driver looks at
 * without a question already in mind.
 *
 * It answers four things at a glance: what today paid, how the week is going,
 * what is running right now, and what needs acting on. Two rows of cards, in
 * the handoff's own `1.15fr 1fr 1fr` and `1.15fr 1fr` tracks, stretched so the
 * cards in a row share a height and their footers line up.
 *
 * ## Real versus sampled
 *
 * The split is exactly the one `src/lib/dashboard/hub/today.ts` draws, and it
 * is worth stating because this screen mixes the two more finely than any
 * other:
 *
 * - **Real** — earned today, the job count and the per-job average behind it,
 *   the completion rate, the whole current-job card, and the licence row of
 *   "Needs your attention".
 * - **Sampled** — the online-time *segment* of the hero note, three of the four
 *   glance rows, the entire zone-demand table, and the two vehicle-compliance
 *   rows.
 *
 * Each of those carries a `<SampleNote />` naming the schema change that would
 * retire it, at the smallest granularity that is honest: on the hero card the
 * badge names "Online time" rather than the card, because the money above it is
 * real and a card-level badge would disown it.
 *
 * One departure from the brief's screen matrix, decided in the loader and only
 * rendered here: **completion rate is real**. `sample.ts` exports no completion
 * figure — the number is derivable from `Order.status` — so there is nothing
 * fictional to render and nothing to badge. It is a Monday-anchored week,
 * not today, which is why the row carries its own denominator: a week's rate
 * under a heading that says "Today at a glance" would otherwise be read as
 * today's.
 *
 * ## No mutations
 *
 * Nothing on this screen writes. The online toggle already lives in the sticky
 * header (`driver-hub-header.tsx`); a second one here would be two controls for
 * one boolean, able to disagree with each other for as long as a refresh takes.
 * Accepting, starting and completing jobs live on the Jobs screen.
 */

/* -------------------------------------------------------------------------- */
/* Honesty copy                                                               */
/* -------------------------------------------------------------------------- */

const ONLINE_TIME_NOTE =
  "Online time is a placeholder: DriverProfile.isOnline is a single boolean " +
  "with no history behind it, so no duration can be computed from it. Retire " +
  "with an OnlineSession model. The job count and the per-job average beside " +
  "it are real.";

const ACCEPTANCE_NOTE =
  "Acceptance is unrecorded, not merely unaggregated: a declined dispatch " +
  "leaves no row at all. Retire with a JobOffer model.";

const CANCELLATIONS_NOTE =
  "Order records no actor for a cancellation, so a client-cancelled job is " +
  "indistinguishable from a driver-cancelled one and cannot fairly be counted " +
  "against a driver. Retire once Order records who cancelled.";

const RATING_NOTE =
  "Nothing in the schema captures customer feedback. Retire with an " +
  "OrderRating model — one score per completed order.";

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export type TodayScreenProps = {
  data: HubTodayData;
  /**
   * The header subhead, e.g. "Saturday 30 August · Tbilisi", formatted on the
   * server. It arrives as a finished string rather than being derived here on
   * purpose — see the comment in `today/page.tsx`.
   */
  subtitle: string;
};

export function TodayScreen({ data, subtitle }: TodayScreenProps) {
  const { sampled } = data;

  useHubSubtitle(subtitle);

  return (
    <>
      {/* Row 1. `items-stretch` is the grid default, but it is stated because
          the current-job card's pinned footer depends on it. */}
      <div className="grid items-stretch gap-5 lg:grid-cols-[1.15fr_1fr_1fr]">
        <MetricTile
          className="h-full p-[22px]"
          label="Earned today"
          hero
          value={formatGel(data.earnedToday)}
          note={
            <>
              <span className="font-price">{data.jobsCompletedToday}</span>{" "}
              {data.jobsCompletedToday === 1 ? "job" : "jobs"} ·{" "}
              <span className="font-price">{sampled.onlineTimeLabel}</span> ·{" "}
              <span className="font-price">
                {formatGel(data.averagePerJob)}
              </span>{" "}
              per job
            </>
          }
        >
          {/* Named for the one segment it covers: the money and the job count
              on the line above it are real. */}
          <SampleNote
            label="Online time"
            note={ONLINE_TIME_NOTE}
            className="mt-2.5"
          />

          <div className="mt-[18px] flex flex-wrap gap-2">
            <Button
              asChild
              size="lg"
              className="h-auto rounded-md px-[14px] py-2 text-[13px]"
            >
              <Link href="/dashboard/earnings">View earnings</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-auto rounded-md px-[14px] py-2 text-[13px]"
            >
              <Link href="/dashboard/jobs">Job history</Link>
            </Button>
          </div>
        </MetricTile>

        <HubCard className="h-full" contentClassName="flex flex-col gap-4">
          <p className={TILE_LABEL_CLASSES}>Today at a glance</p>

          <GlanceRow
            label="Acceptance rate"
            value={formatPercent(sampled.glance.acceptanceRatePercent)}
            sampleNote={ACCEPTANCE_NOTE}
          />
          <GlanceRow
            label="Completion rate"
            value={formatPercent(data.completionRatePercent)}
            // The one real row here, and the one whose window differs from the
            // card's heading — so it states its own denominator rather than
            // letting a week's figure pass for today's. It also explains the
            // em dash: no job has finished this week, which is not "0%".
            note={`${pluralise(
              data.completedOrCancelledCount,
              "job",
            )} finished this week`}
          />
          <GlanceRow
            label="Cancellations"
            value={String(sampled.glance.cancellationsToday)}
            sampleNote={CANCELLATIONS_NOTE}
          />
          <GlanceRow
            label="Avg rating"
            value={sampled.glance.averageRating.toFixed(2)}
            note={`${pluralise(sampled.glance.ratedJobCount, "rated job")}`}
            sampleNote={RATING_NOTE}
          />
        </HubCard>

        <TodayCurrentJobCard job={data.currentJob} />
      </div>

      {/* Row 2. */}
      <div className="grid items-stretch gap-5 lg:grid-cols-[1.15fr_1fr]">
        <TodayZoneDemandCard zoneDemand={sampled.zoneDemand} />
        <TodayAttentionCard
          licenceAlert={data.licenceAlert}
          vehicleAlerts={sampled.vehicleAlerts}
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Glance row                                                                 */
/* -------------------------------------------------------------------------- */

type GlanceRowProps = {
  label: string;
  /** Pre-formatted by the caller — only it knows the unit. */
  value: string;
  /** Optional 12px line under the label, e.g. the completion denominator. */
  note?: string;
  /** Present only on a fabricated row, and names what would make it real. */
  sampleNote?: string;
};

/**
 * One label/value line of "Today at a glance".
 *
 * The badge sits beside the *label* rather than the value: it qualifies where
 * the number came from, and putting it next to the number would push a 15px
 * mono figure off its own baseline alignment with the three rows around it.
 */
function GlanceRow({ label, value, note, sampleNote }: GlanceRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] text-muted-foreground">{label}</span>
          {sampleNote === undefined ? null : <SampleNote note={sampleNote} />}
        </span>
        {note === undefined ? null : (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {note}
          </span>
        )}
      </span>
      <span className="font-price text-[15px] font-semibold">{value}</span>
    </div>
  );
}
