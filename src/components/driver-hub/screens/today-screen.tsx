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
import { cn } from "@/lib/utils";

/**
 * Today — the landing screen after sign-in, and the only one a driver looks at
 * without a question already in mind.
 *
 * It answers four things at a glance: what today paid, how the week is going,
 * what is running right now, and what needs acting on. Two rows of cards, in
 * the handoff's own `1.15fr 1fr 1fr` and `1.15fr 1fr` tracks, stretched so the
 * cards in a row share a height and their footers line up.
 *
 * Those four questions are asked of three different readers, though, and they
 * do not all mean the same thing to each — see "Three personas" below.
 *
 * ## Real versus sampled
 *
 * The split is exactly the one `src/lib/dashboard/hub/today.ts` draws, and it
 * is worth stating because this screen mixes the two more finely than any
 * other:
 *
 * - **Real** — earned today, the job count and the per-job average behind it,
 *   the completion rate, the whole jobs-in-progress card (its count, its rows
 *   and the driver names on them), the employer's name on a roster driver's
 *   hero note, the fleet's registered vehicle count, and the licence row of the
 *   attention card.
 * - **Sampled** — the online-time *segment* of the hero note, three of the four
 *   glance rows, the entire zone-demand table, and the vehicle-compliance rows.
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
 * today's. For a BUSINESS account `hubOrderScope()` scopes it by `companyId`,
 * so it is a fleet-wide figure — still real, still unbadged, just about more
 * jobs.
 *
 * ## Three personas
 *
 * `data.persona` comes from `resolveHubAccount()` through the loader and is
 * never re-derived here. Three differences hang off it, and nothing else on
 * this screen branches:
 *
 * - **ROSTER** loses the "View earnings" button, because the Wallet is hidden
 *   from their sidebar and `/dashboard/earnings` redirects them back to this
 *   very screen, so the button would be a round trip to nowhere. It also loses
 *   the zone-demand card, whose every row is a repositioning prompt paired with
 *   a surge bonus that an employed driver neither chooses nor keeps. It gains a
 *   "Dispatched by …" line naming the employer. **Its hero currency is
 *   unchanged** — see below.
 * - **BUSINESS** loses the online-time segment and its badge, because
 *   `resolveHubAccount()` gives a COMPANY session no online state to report
 *   even in sampled form, and reads a fleet count with attributed preview rows
 *   where a driver reads their one job. The licence row of the attention card
 *   is structurally absent for it: a company holds no licence.
 * - **INDEPENDENT** is the unchanged screen every one of these branches is a
 *   departure from.
 *
 * The hero tile's label, its ₾ figure and its per-job average are **identical
 * for all three personas**, including ROSTER. Suppressing the currency for an
 * employed driver — whose fares are paid to their employer, which is exactly
 * why their Wallet is hidden — was proposed during spec-writing and explicitly
 * declined; the argument and the decision are recorded in
 * `specs/driver-hub-personas/tasks/task-06-today-screen-personas.md` under
 * "Considered and declined: the roster hero tile". It is a known, accepted
 * inconsistency, not an oversight. Do not "fix" it here: the remedy lands in
 * `today.ts` and this file together, and reversing only one half would print
 * `₾0.00` for every roster driver.
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
  const { persona, sampled } = data;
  const isRoster = persona === "ROSTER";

  useHubSubtitle(subtitle);

  return (
    <>
      {/* Row 1. `items-stretch` is the grid default, but it is stated because
          the current-job card's pinned footer depends on it. */}
      <div className="grid items-stretch gap-5 lg:grid-cols-[1.15fr_1fr_1fr]">
        {/* The label, the figure and the per-job average are identical for all
            three personas — see this file's header on why a roster driver still
            reads a currency here. The two branches below are about a *sampled*
            value a company has no equivalent of, and about a link a roster
            driver would be redirected away from. */}
        <MetricTile
          className="h-full p-[22px]"
          label="Earned today"
          hero
          value={formatGel(data.earnedToday)}
          note={
            <>
              <span className="font-price">{data.jobsCompletedToday}</span>{" "}
              {data.jobsCompletedToday === 1 ? "job" : "jobs"}
              {/* A company has no online time even in sampled form, so the
                  segment and its separator drop out together rather than
                  leaving a stray "·". `null` is rendered explicitly rather than
                  left to JSX's silent swallowing of it, which would print the
                  two separators around an empty span. */}
              {sampled.onlineTimeLabel === null ? null : (
                <>
                  {" · "}
                  <span className="font-price">{sampled.onlineTimeLabel}</span>
                </>
              )}{" "}
              ·{" "}
              <span className="font-price">
                {formatGel(data.averagePerJob)}
              </span>{" "}
              per job
              {/* Frames the day as dispatched work. `employerName` is non-null
                  for exactly the persona this renders for; the fallback exists
                  because the type is `string | null` and a non-null assertion
                  inside copy is a worse answer than a phrase that still reads
                  correctly. */}
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
          {/* Named for the one segment it covers: the money and the job count
              on the line above it are real. Absent along with that segment for
              a fleet — a badge naming a value that is not rendered is noise,
              and everything else on the tile is real. */}
          {sampled.onlineTimeLabel === null ? null : (
            <SampleNote
              label="Online time"
              note={ONLINE_TIME_NOTE}
              className="mt-2.5"
            />
          )}

          <div className="mt-[18px] flex flex-wrap gap-2">
            {/* Absent for a roster driver: the Wallet is hidden from their
                sidebar and `/dashboard/earnings` redirects them back here
                server-side, so this button would be a round trip to nowhere. */}
            {isRoster ? null : (
              <Button
                asChild
                size="lg"
                className="h-auto rounded-md px-[14px] py-2 text-[13px]"
              >
                <Link href="/dashboard/earnings">View earnings</Link>
              </Button>
            )}
            <Button
              asChild
              // Promoted to the primary variant when it is the only button
              // left, so the tile does not end on a lone secondary control.
              variant={isRoster ? "default" : "outline"}
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
            //
            // No persona branch on this card at all. For a BUSINESS account
            // `hubOrderScope()` scopes this figure by `companyId`, so it is a
            // fleet-wide rate — just as real and just as unbadged, about more
            // jobs.
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

        <TodayCurrentJobCard
          jobs={data.jobsInProgress}
          totalCount={data.jobsInProgressCount}
          persona={persona}
        />
      </div>

      {/* Row 2. The zone-demand card is absent for a ROSTER driver: every row
          on it is a repositioning prompt paired with a surge bonus, and an
          employed driver neither chooses where to sit (work reaches them
          through their employer's dispatch) nor keeps the bonus if they did.
          Hidden rather than emptied, per this feature's rule that a sampled
          card meaningless for a persona is removed rather than made real. With
          one child the row is one column — otherwise the attention card would
          sit in a 1.15fr track with a 1fr gap of nothing beside it. */}
      <div
        className={cn(
          "grid items-stretch gap-5",
          sampled.zoneDemand === null
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[1.15fr_1fr]",
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
