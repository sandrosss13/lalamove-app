"use client";

import { Badge } from "@/components/ui/badge";
import {
  HubCard,
  HubStatusBadge,
} from "@/components/driver-hub/hub-primitives";
import {
  EMPTY_VALUE,
  formatDistanceKm,
  formatGel,
  formatJobDateLabel,
  formatJobTime,
  formatJobTimestamp,
  roundCurrency,
  toTelHref,
} from "@/components/driver-hub/screens/jobs-format";
import type { HubJob, HubStopContact } from "@/lib/dashboard/hub/jobs";
import { cn } from "@/lib/utils";

/**
 * The Job history screen's right-hand panel: one job's timeline and the fare
 * lines that add up to what it paid.
 *
 * Split out of `jobs-screen.tsx` because it is the larger half of the screen
 * and none of it is about selection or filtering, which is all the screen
 * itself does. It holds no state and fires no mutation — Job history is a
 * read-only screen, so there is nothing here to arm, submit or refresh.
 *
 * ## The timeline, and the step the design has that the data does not
 *
 * The handoff draws four steps — Order accepted / Pickup / Stop 1 delivered /
 * Final drop-off. `Order` is a single pickup → single dropoff booking with no
 * stop table, so "Stop 1 delivered" describes a leg that cannot exist and is
 * not drawn. It also records no acceptance: there is no `acceptedAt` column,
 * only `createdAt` (when the client booked), `inTransitAt` and `completedAt`.
 * So the first step is labelled for what its timestamp actually is — the order
 * being placed — rather than borrowing the design's "accepted", and the panel
 * shows three steps built from the three real timestamps. Nothing is padded
 * out to reach four.
 *
 * Dot treatment is the design's: filled green for a step that happened, a
 * hollow accent ring for the step the job is waiting on, hollow line-grey for
 * one still ahead. Colours are literal Tailwind arbitrary values, never
 * interpolated — the compiler scans source text, so a class assembled from a
 * variable would never be generated.
 *
 * ## Operational context
 *
 * Below the fare, the panel carries what the client asked for at booking: who
 * to ask for at each end, the tier the order was placed on, the load space it
 * was booked for, and a business client's own PO reference. The service-level
 * pill is a *neutral* pill, not a status one — dispatch does not read
 * `Order.serviceLevel`, so a coloured pill would read as a promise about how
 * the job is being handled. The panel is where the flag is honestly visible:
 * the driver and ops can see it, and nothing here claims it changed anything.
 */

/* -------------------------------------------------------------------------- */
/* Palette                                                                    */
/* -------------------------------------------------------------------------- */

/** Success green — a step that is on the record as having happened. */
const DOT_DONE_CLASSES =
  "border-[oklch(59.6%_0.145_163.225)] bg-[oklch(59.6%_0.145_163.225)]";

/** Brand orange, hollow — the step the job is currently waiting on. */
const DOT_CURRENT_CLASSES = "border-[oklch(64%_0.19_48)] bg-background";

/** Border grey, hollow — a step that has not been reached. */
const DOT_PENDING_CLASSES = "border-[oklch(92.8%_0.006_264.531)] bg-background";

/** The grey pill the design uses beside the status for the vehicle. */
const NEUTRAL_PILL_CLASSES =
  "h-auto rounded-full border-transparent bg-muted px-[9px] py-[3px] " +
  "text-[11px] font-semibold tracking-[0.02em] text-muted-foreground";

/**
 * The hub's labelled detail row, shared verbatim with the Drivers and Employees
 * panels: a hairline above, the label on the left, the value on the right.
 */
const DETAIL_ROW_CLASSES =
  "flex items-center justify-between gap-3 border-t border-muted py-2.5 " +
  "text-[13px]";

/* -------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* -------------------------------------------------------------------------- */

type StepState = "done" | "current" | "pending";

const DOT_CLASSES: Record<StepState, string> = {
  done: DOT_DONE_CLASSES,
  current: DOT_CURRENT_CLASSES,
  pending: DOT_PENDING_CLASSES,
};

type TimelineStep = {
  label: string;
  detail: string;
  /** The moment it happened, or `null` if it has not. */
  at: string | null;
  state: StepState;
};

/**
 * The three real steps, in order, with the state each one is in.
 *
 * A step is *done* when its timestamp exists — that is the only evidence there
 * is that it happened. The first step without one is *current*, but only while
 * the job is still going: a cancelled job is waiting on nothing, so painting
 * its unreached steps in accent would promise a pickup that is never coming.
 */
function buildTimeline(job: HubJob, nowIso: string): TimelineStep[] {
  const steps: Omit<TimelineStep, "state">[] = [
    {
      label: "Order placed",
      // `scheduledAt` is the client's requested slot and is null on every order
      // booked before the column existed, which is why the alternative wording
      // is a statement about this order rather than an em dash.
      detail:
        job.scheduledAt === null
          ? "Booked for immediate pickup"
          : `Requested for ${formatJobTime(job.scheduledAt, nowIso)}`,
      at: job.createdAt,
    },
    {
      label: "Picked up",
      detail: job.pickupAddress,
      at: job.inTransitAt,
    },
    {
      label: "Dropped off",
      detail: job.dropoffAddress,
      at: job.completedAt,
    },
  ];

  const running = job.status === "In transit" || job.status === "Scheduled";
  const nextIndex = steps.findIndex((step) => step.at === null);

  return steps.map((step, index) => ({
    ...step,
    state:
      step.at !== null
        ? "done"
        : running && index === nextIndex
          ? "current"
          : "pending",
  }));
}

/* -------------------------------------------------------------------------- */
/* Fare lines                                                                 */
/* -------------------------------------------------------------------------- */

type FareLine = { label: string; amountGel: number };

/**
 * The itemised quote, exactly as `Order` stores it — no line is estimated and
 * none is invented.
 *
 * Two of the design's lines are deliberately absent. **Stops · N** cannot
 * exist on a single-leg booking. **Tip** has no column at all, and a per-order
 * tip is precisely the kind of number that must not be guessed, so the line is
 * omitted rather than shown as zero (which would read as "the customer left
 * nothing") or filled from the range-level estimate in `sample.ts` (which would
 * make this the one screen with placeholder money on it).
 *
 * The two conditional lines are conditional on different things on purpose:
 * Helpers is keyed off `helperCount`, because a job that was booked with a crew
 * should say so even if the rule priced them at nothing, while Overtime is
 * keyed off the fee, because zero waiting minutes beyond the free allowance is
 * not a charge anybody needs to read a line about.
 *
 * `helperCount` counts the extras beyond the driver, and `helperFee` is the
 * flat per-helper charge already multiplied by it — one line for the whole
 * crew, which is why the label carries the count.
 */
function buildFareLines(job: HubJob): FareLine[] {
  const lines: FareLine[] = [
    { label: "Base fare", amountGel: job.baseFare },
    {
      label: `Distance · ${formatDistanceKm(job.distanceKm)}`,
      amountGel: job.distanceFare,
    },
    { label: "Time", amountGel: job.timeFare },
  ];

  if (job.helperCount > 0) {
    lines.push({
      label: job.helperCount === 1 ? "Helper" : `Helpers × ${job.helperCount}`,
      amountGel: job.helperFee,
    });
  }

  // `price` is the quote *floored at the pricing rule's minimum fare*, so on a
  // short job the four lines above sum to less than the total underneath them.
  // Naming the difference is the only way the panel adds up; leaving it out
  // would print an itemisation that visibly disagrees with its own total. The
  // number is derived from real columns, not invented, so it carries no sample
  // marker.
  const topUp = roundCurrency(
    job.price -
      (job.baseFare + job.distanceFare + job.timeFare + job.helperFee),
  );

  if (topUp > 0) {
    lines.push({ label: "Minimum fare top-up", amountGel: topUp });
  }

  // Settled at completion on top of the quote, which is why it sits below the
  // top-up rather than inside it. `waitingMinutes` is the whole reported
  // loading time; only the part past the rule's free allowance is charged, so
  // the label gives it as context rather than as the thing being billed.
  if (job.overtimeFee !== 0) {
    lines.push({
      label:
        job.waitingMinutes === null
          ? "Overtime"
          : `Overtime · ${job.waitingMinutes} min loading`,
      amountGel: job.overtimeFee,
    });
  }

  return lines;
}

/* -------------------------------------------------------------------------- */
/* Stop contacts                                                              */
/* -------------------------------------------------------------------------- */

type StopContactRowProps = {
  /** Which end of the job this is — "Pickup" or "Dropoff". */
  label: string;
  /** Null when the client gave no contact for this stop at all. */
  contact: HubStopContact | null;
};

/**
 * One end of the job and whoever the driver asks for there.
 *
 * A non-null `contact` carries at least one non-null part by construction (see
 * `toStopContact` in the loader), so the value side of a rendered contact is
 * never blank — which is exactly why "no contact" is a null object printed as
 * the em dash rather than a row of three empty lines. The individual parts are
 * still optional, so a stop with only a phone shows only a phone.
 *
 * The number is a `tel:` link because the person most likely to be reading this
 * is a driver holding a phone at the kerb, for whom "call this person" is the
 * only thing the row is for. It falls back to plain text when the stored value
 * has no digits in it — see `toTelHref`.
 */
function StopContactRow({ label, contact }: StopContactRowProps) {
  const telHref =
    contact === null || contact.phone === null
      ? null
      : toTelHref(contact.phone);

  return (
    <div className={DETAIL_ROW_CLASSES}>
      <dt className="flex-none text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">
        {contact === null ? (
          <span className="font-price text-muted-foreground">
            {EMPTY_VALUE}
          </span>
        ) : (
          <>
            {contact.name === null ? null : (
              <span className="block truncate font-medium">{contact.name}</span>
            )}
            {contact.phone === null ? null : telHref === null ? (
              <span className="block truncate font-price text-muted-foreground">
                {contact.phone}
              </span>
            ) : (
              <a
                href={telHref}
                className="block truncate font-price text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {contact.phone}
              </a>
            )}
            {contact.details === null ? null : (
              <span className="block truncate text-xs text-muted-foreground">
                {contact.details}
              </span>
            )}
          </>
        )}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

export type JobsDetailPanelProps = {
  job: HubJob;
  /**
   * The instant the page was rendered at, threaded down so every relative day
   * label is computed against one fixed "now". See `jobs-format.ts`.
   */
  nowIso: string;
  /** The timestamp the row's Time column showed, so the two cannot disagree. */
  primaryAtIso: string;
};

export function JobsDetailPanel({
  job,
  nowIso,
  primaryAtIso,
}: JobsDetailPanelProps) {
  const timeline = buildTimeline(job, nowIso);
  const fareLines = buildFareLines(job);

  // Nothing records *when* an order was cancelled, so there is no fourth step
  // to draw for one — but `inTransitAt` does say whether it got as far as the
  // pickup, and that is worth a sentence rather than three grey dots the reader
  // has to interpret.
  const cancelledNote =
    job.status !== "Cancelled"
      ? null
      : job.inTransitAt === null
        ? "Cancelled before pickup. Nothing records when it was cancelled."
        : "Cancelled after pickup. Nothing records when it was cancelled.";

  return (
    <HubCard>
      {/* `pr-9` clears the ✕ that `MasterDetailSplit` positions at the panel's
          top-right; the panel deliberately renders no close button of its own. */}
      <div className="pr-9">
        <h2
          // The full cuid rides along as a `title`: `shortId` is six derived
          // characters and is not unique by construction, so it is a label for
          // this job, never the identifier for it.
          title={job.id}
          className="font-price text-lg leading-tight font-semibold"
        >
          {job.shortId}
        </h2>
        <p className="mt-[3px] text-[13px] text-muted-foreground">
          <span className="font-price">
            {formatJobDateLabel(primaryAtIso, nowIso)}
          </span>
        </p>
      </div>

      <div className="mt-4 mb-5 flex flex-wrap gap-2">
        <HubStatusBadge status={job.status} />
        {/* Neutral, never a status tone: `hub-status.ts` defines six tones for
            *states*, and a booked tier is not one. It is also always present —
            the column defaults to REGULAR — so it is never conditional, and
            hiding "Regular" would make its absence ambiguous. */}
        <Badge variant="outline" className={NEUTRAL_PILL_CLASSES}>
          {job.serviceLevel}
        </Badge>
        <Badge variant="outline" className={NEUTRAL_PILL_CLASSES}>
          {job.vehicleTypeLabel}
        </Badge>
        {/* Null on every order placed before the body filter existed, and
            nothing can derive one after the fact, so the pill is absent rather
            than defaulted to "Dry box". */}
        {job.bodyType === null ? null : (
          <Badge variant="outline" className={NEUTRAL_PILL_CLASSES}>
            {job.bodyType}
          </Badge>
        )}
        {/* A plate only exists once a vehicle was actually dispatched, so an
            unstarted job carries one pill fewer than a running one. */}
        {job.vehiclePlate === null ? null : (
          <Badge
            variant="outline"
            className={cn(NEUTRAL_PILL_CLASSES, "font-price")}
          >
            {job.vehiclePlate}
          </Badge>
        )}
      </div>

      <ol className="flex flex-col gap-3.5 border-b border-border pb-5">
        {timeline.map((step) => (
          <li key={step.label} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "mt-[5px] size-[9px] flex-none rounded-full border-2",
                DOT_CLASSES[step.state],
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{step.label}</p>
              <p className="mt-px truncate text-xs text-muted-foreground">
                {step.detail}
              </p>
            </div>
            {/* `formatJobTime`, not the panel's own "Today · HH:MM" heading
                format: a step is usually the same day as the row it belongs to
                and reads as a bare clock time, and only a step that crossed
                midnight earns the day prefix. */}
            <span
              title={step.at === null ? undefined : formatJobTimestamp(step.at)}
              className="font-price text-xs whitespace-nowrap text-muted-foreground"
            >
              {step.at === null ? EMPTY_VALUE : formatJobTime(step.at, nowIso)}
            </span>
            {/* The dots carry the state visually; this is how it reaches a
                screen reader, which cannot see a hollow ring. */}
            <span className="sr-only">
              {step.state === "done"
                ? " — done"
                : step.state === "current"
                  ? " — next"
                  : " — not reached"}
            </span>
          </li>
        ))}
      </ol>

      {cancelledNote === null ? null : (
        <p className="mt-3.5 text-xs leading-relaxed text-muted-foreground">
          {cancelledNote}
        </p>
      )}

      <dl className="mt-1.5 flex flex-col">
        {fareLines.map((line) => (
          <div
            key={line.label}
            className="flex justify-between gap-3 py-[9px] text-[13px]"
          >
            <dt className="min-w-0 text-muted-foreground">{line.label}</dt>
            <dd className="font-price font-medium">
              {formatGel(line.amountGel)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-border pt-3">
        <span className="text-sm font-semibold">Paid to you</span>
        {/* `fare` — `price` plus the overtime settled on top of it — and not
            `price` alone: the lines above include Overtime whenever there is
            any, so a total of `price` would sit under an itemisation it
            contradicts. It is also the number the row's Fare column shows, and
            a row and its own panel must not disagree about what a job paid. */}
        <span className="font-price text-xl font-semibold">
          {formatGel(job.fare)}
        </span>
      </div>

      {/* Below the money rather than above it: the fare lines and the total
          they add up to are one block closed by its own rule, and a row list
          wedged between them would read as another unlabelled fare line. */}
      <h3 className="mt-5 mb-0.5 text-[13px] font-semibold">Contacts</h3>
      <dl>
        <StopContactRow label="Pickup" contact={job.pickupContact} />
        <StopContactRow label="Dropoff" contact={job.dropoffContact} />
      </dl>

      {/* Business clients only, and optional even for them, so most jobs carry
          none. A heading over a single row that is usually absent would come
          and go with the row, so the row wears its own label instead. */}
      {job.purchaseOrderRef === null ? null : (
        <dl>
          <div className={DETAIL_ROW_CLASSES}>
            <dt className="flex-none text-muted-foreground">PO reference</dt>
            <dd className="min-w-0 truncate font-price font-medium">
              {job.purchaseOrderRef}
            </dd>
          </div>
        </dl>
      )}
    </HubCard>
  );
}
