"use client";

import Link from "next/link";

import {
  HubCard,
  HubStatusBadge,
} from "@/components/driver-hub/hub-primitives";
import {
  TILE_LABEL_CLASSES,
  formatClock,
  formatDistanceKm,
  formatGel,
  formatStopRoute,
  shortId,
} from "@/components/driver-hub/screens/today-format";
import type { HubPersona } from "@/lib/dashboard/hub/account";
import type {
  HubTodayCurrentJob,
  HubTodayStop,
} from "@/lib/dashboard/hub/today";
import { cn } from "@/lib/utils";

/**
 * The third card of Today's first row: the one job in flight, or a calm line
 * saying there is none.
 *
 * **Everything here is real.** `Order` is a single pickup → single drop-off
 * booking, so the design's three-stop example has no equivalent in this schema
 * and `HubTodayCurrentJob.stops` is typed as exactly two entries; no third stop
 * is synthesised to fill the design's third row. The design's "ETA 10:38" is
 * dropped for the same reason — nothing in the schema can supply an estimate,
 * and inventing one on the card a driver steers by would be the worst possible
 * place to guess (`today.ts` makes the same point on `HubTodayStop.at`).
 *
 * The no-job state is the *common* one — a driver is between jobs far more
 * often than on one — so it is written as a deliberate resting state rather
 * than as an error or an empty slot. A card that looks broken whenever nothing
 * is happening would look broken most of the day.
 *
 * ## Two readers, two layouts
 *
 * Everything above describes the card an `INDEPENDENT` or a `ROSTER` driver
 * reads, and that card is unchanged: one person holds at most one job at a time
 * — the assumption `driver-dashboard-data.ts` makes for its own `activeOrderId`
 * — so the full stop timeline fits and is what they want.
 *
 * A `BUSINESS` account is not one person. A fleet can have a dozen vans on the
 * road, so its variant leads with the real uncapped count (`totalCount`), then
 * previews up to three of the jobs with the driver's name attached, then links
 * to the Jobs screen for the rest. It is a preview and not a table on purpose:
 * row 1 of Today is a stretched three-column grid whose cards share a height,
 * and a fleet's full in-flight list would push the row below it off the screen.
 * The count answers "how much of my fleet is working"; the named rows answer
 * "and which of it should I look at"; neither answers the other.
 *
 * **Still everything here is real** — `jobsInProgress`, `jobsInProgressCount`
 * and `driverName` all come from `Order` and `User`. This file contains no
 * `<SampleNote />` and must not gain one.
 *
 * Read-only: accepting, starting and completing a job all live on the Jobs
 * screen, and the online toggle lives in the header. Nothing on Today writes.
 */

/* -------------------------------------------------------------------------- */
/* Stop dots                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The design's 9px stop dot: 2px border, filled when the leg is done, hollow
 * with an accent ring for the leg that is next, hollow and grey for a leg
 * further out. The three colours are the handoff's success green, brand orange
 * and border grey — none of which is a `--color-*` token, so all three are
 * spelled out as Tailwind arbitrary values the way `hub-status.ts` does.
 */
const DOT_DONE =
  "bg-[oklch(59.6%_0.145_163.225)] border-[oklch(59.6%_0.145_163.225)]";
const DOT_NEXT = "bg-background border-[oklch(64%_0.19_48)]";
const DOT_PENDING = "bg-background border-border";

/** The two legs, named as the driver would say them. */
const STOP_KIND_LABELS: Record<HubTodayStop["kind"], string> = {
  PICKUP: "Pickup",
  DROPOFF: "Drop-off",
};

/** What a served leg reads as. A drop-off is delivered; a pickup is collected. */
const STOP_DONE_VERBS: Record<HubTodayStop["kind"], string> = {
  PICKUP: "Collected",
  DROPOFF: "Delivered",
};

/** The design's two in-flight statuses, in its own wording. */
const STATUS_LABELS: Record<HubTodayCurrentJob["status"], string> = {
  ACCEPTED: "Accepted",
  IN_TRANSIT: "In transit",
};

export type TodayCurrentJobCardProps = {
  /**
   * The jobs in flight, newest-booked first, capped at three by the loader.
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

/**
 * What the card shows between jobs. Worded for both account kinds: a fleet's
 * card is about its vans, an individual's is about their own next booking, and
 * "nothing in progress" is true of either without the screen having to know
 * which it is looking at.
 */
function RestingState() {
  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <p className="text-sm font-medium">No job in progress</p>
      <p className="mt-1.5 text-[13px] leading-normal text-muted-foreground">
        The next accepted job appears here with its pickup, its drop-off and the
        fare it pays.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fleet variant                                                              */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Single-driver variant                                                      */
/* -------------------------------------------------------------------------- */

function JobDetail({ job }: { job: HubTodayCurrentJob }) {
  // The first leg with no timestamp is the one being worked on now; everything
  // after it is still ahead. Computed once here rather than per row so the
  // "next" ring can only ever land on a single dot.
  const nextStopIndex = job.stops.findIndex((stop) => stop.at === null);

  return (
    <>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {/* A truncated id is a label, not an identifier — the full cuid rides
            along as a title so it can still be read off and searched for. */}
        <span
          title={job.id}
          className="font-price text-[16px] leading-none font-semibold"
        >
          {shortId(job.id)}
        </span>
        {/* Not in the design's card, which conveyed progress through three
            stops and their times. With two stops and no ETA to print, the
            pill is what still separates "accepted, not yet collected" from
            "on the road" — and it is the shared status vocabulary, not a new
            one. */}
        <HubStatusBadge status={job.status} label={STATUS_LABELS[job.status]} />
      </div>

      <p className="mt-0.5 mb-3.5 text-[13px] text-muted-foreground">
        <span className="font-price">{job.stops.length}</span>{" "}
        {job.stops.length === 1 ? "stop" : "stops"} ·{" "}
        <span className="font-price">{formatDistanceKm(job.distanceKm)}</span> ·
        accepted{" "}
        <span className="font-price">{formatClock(job.createdAt)}</span>
      </p>

      <ol className="flex flex-col gap-2.5 pl-0.5">
        {job.stops.map((stop, index) => (
          <StopRow
            // Addresses can repeat (a return leg to the same yard), so the
            // index is part of the key.
            key={`${stop.kind}-${index}`}
            stop={stop}
            isNext={index === nextStopIndex}
          />
        ))}
      </ol>

      {/* Pinned to the bottom of the card, which is what makes the three cards
          in this row line their footers up when the grid stretches them. */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="text-xs text-muted-foreground">Fare</span>
        <span className="font-price text-[18px] font-semibold">
          {formatGel(job.fare)}
        </span>
      </div>
    </>
  );
}

function StopRow({ stop, isNext }: { stop: HubTodayStop; isNext: boolean }) {
  const done = stop.at !== null;

  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className={cn(
          "mt-[5px] size-[9px] flex-none rounded-full border-2",
          done ? DOT_DONE : isNext ? DOT_NEXT : DOT_PENDING,
        )}
      />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium">{stop.address}</p>
        <p className="text-xs text-muted-foreground">
          {STOP_KIND_LABELS[stop.kind]} ·{" "}
          {stop.at === null ? (
            // No ETA exists to print here — see the file header.
            isNext ? (
              "up next"
            ) : (
              "pending"
            )
          ) : (
            <>
              {STOP_DONE_VERBS[stop.kind].toLowerCase()}{" "}
              <span className="font-price">{formatClock(stop.at)}</span>
            </>
          )}
        </p>
      </div>
    </li>
  );
}
