"use client";

import { Badge } from "@/components/ui/badge";
import {
  HubCard,
  HubStatusBadge,
} from "@/components/driver-hub/hub-primitives";
// `formatDistanceKm` and `roundCurrency` were imported for the old gross fare
// itemisation — the "Distance · N km" line and the minimum-fare top-up it
// reconciled — and both went with it. The distance is not lost from the screen:
// `jobs-screen.tsx` prints it on every table row. `roundCurrency` stays exported
// from `jobs-format.ts` for other callers; only this file's use of it is gone.
import {
  EMPTY_VALUE,
  formatGel,
  formatJobDateLabel,
  formatJobTime,
  formatJobTimestamp,
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
 *
 * ## Why the total is not the client's total
 *
 * Every money figure on this panel is the **carrier's**, and none of the
 * client's reaches it. `HubJob` no longer carries `price`, `baseFare`,
 * `distanceFare`, `timeFare`, `helperFee` or `overtimeFee` at all — its loader
 * does not select them — so the panel could not print the client's fare if it
 * tried; that is a compile error rather than a rule to remember. What it prints
 * instead is `driverPayout`, plus `overtimeDriverPayout` when there is any, and
 * `fare` (their sum) as the total. See `HubJob.fare` and
 * `src/lib/orders/payout.ts`.
 *
 * The tier does move money — `Order.serviceLevelAdjustment` holds the Priority
 * premium or Pooling discount, and `/orders` adds it to `price` because that is
 * what the client agreed to pay. It is not a separate line here, and not because
 * the split is unresolved: it is settled, and it is already *inside* this
 * panel's figures. `driverPayout` was commissioned at booking from
 * `roundCurrency(price + serviceLevelAdjustment)`, so the carrier's 85% of the
 * tier adjustment is in the "Payout" line and adding it again would pay it
 * twice. The tier is still captioned under the total, because a "Priority" pill
 * above an amount smaller than the client's invoice invites exactly the question
 * the caption answers.
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
 * What the job paid, in the at most two lines the carrier's side of it has — no
 * line is estimated and none is invented.
 *
 * **This used to itemise the client's quote** — Base fare, Distance, Time, a
 * conditional Helpers line, a computed "Minimum fare top-up" reconciling those
 * against `price`, and a conditional Overtime line — and that itemisation is
 * gone rather than reworked, because none of it was this reader's money.
 * `price`, `baseFare`, `distanceFare`, `timeFare`, `helperFee` and `overtimeFee`
 * are what the **client** pays; the panel's own total was already labelled "Paid
 * to you", so the lines above it were describing a different transaction than
 * the sum below them.
 *
 * **The collapse to two lines is a fact about the data, not a simplification.**
 * A payout is one commissioned lump taken off the whole client-paid total — 85%
 * of `roundCurrency(price + serviceLevelAdjustment)`, stored once at booking —
 * so there is no per-component carrier figure to print. There is no "carrier's
 * base fare" and no "carrier's distance fare"; splitting the payout back into
 * pro-rata shares of the client's components would be inventing an itemisation
 * the platform never computed, on a screen whose whole discipline is that every
 * figure is a column on `Order`. Two real lines beat six derived ones.
 *
 * The minimum-fare top-up line goes with them for the same reason: it existed to
 * reconcile four gross components against a floored gross total, and neither
 * side of that reconciliation is on this screen any more. The payout is stored
 * whole and needs no reconciling.
 *
 * The overtime line stays conditional on the *amount* rather than on
 * `waitingMinutes`, exactly as the old Overtime line was: a job that waited but
 * stayed inside the rule's free allowance earns nothing extra, and a zero line
 * would invite the reader to look for a charge that is not there. Its label
 * keeps carrying `waitingMinutes` when there is one, so the reason for the
 * second line stays visible.
 *
 * Two of the design's lines remain deliberately absent for their original
 * reasons. **Stops · N** cannot exist on a single-leg booking. **Tip** has no
 * column at all, and a per-order tip is precisely the kind of number that must
 * not be guessed, so the line is omitted rather than shown as zero (which would
 * read as "the customer left nothing") or filled from the range-level estimate
 * in `sample.ts` (which would make this the one screen with placeholder money on
 * it).
 */
function buildFareLines(job: HubJob): FareLine[] {
  const lines: FareLine[] = [{ label: "Payout", amountGel: job.driverPayout }];

  if (job.overtimeDriverPayout !== 0) {
    lines.push({
      label:
        job.waitingMinutes === null
          ? "Overtime payout"
          : `Overtime payout · ${job.waitingMinutes} min loading`,
      amountGel: job.overtimeDriverPayout,
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
            hiding "Regular" would make its absence ambiguous. What this pill
            must not be read as is a rate on the fare below it; the note under
            "Paid to you" is what stops that. */}
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
        {/* `fare` is `driverPayout + overtimeDriverPayout` by construction (see
            `HubJob.fare`), so this total is the sum of the lines above it and
            "Paid to you" is now literally true. It is also the number the row's
            Fare column shows, and a row and its own panel must not disagree
            about what a job paid.

            It is deliberately smaller than the figure `/orders` shows the client
            for the same job, and that gap is the platform's commission, not a
            rounding difference. It is also not `price + serviceLevelAdjustment`
            — but no longer because "nobody has decided" who gets the tier
            adjustment. That is decided: the carrier receives 85% of it along
            with everything else the client pays, and they receive it *inside*
            `driverPayout`, which was commissioned at booking from
            `roundCurrency(price + serviceLevelAdjustment)`. Adding the
            adjustment on here would pay it a second time. */}
        <span className="font-price text-xl font-semibold">
          {formatGel(job.fare)}
        </span>
      </div>

      {/* The disclaimer the pills three lines up cannot carry on their own: a
          "Priority" pill sitting above a figure smaller than the client's
          invoice invites the reader to wonder where the premium went. The
          sentence stays exactly as it was, because it is still true — the tier
          adjusts what the client pays, and this figure is not that. What has
          changed is why: the carrier's share of the adjustment is already inside
          the Payout line above, not withheld pending a decision. Regular moves
          the fare by nothing, so it earns no note; a line saying the adjustment
          was zero would only be noise. */}
      {job.serviceLevel === "Regular" ? null : (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Booked as {job.serviceLevel}. The tier adjusts what the client pays
          and is not part of this figure.
        </p>
      )}

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
