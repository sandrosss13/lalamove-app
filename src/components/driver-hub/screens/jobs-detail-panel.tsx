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
} from "@/components/driver-hub/screens/jobs-format";
// The three claims this panel and the driver's Job sheet both make about one
// order — which timeline steps exist, what the payout lines are called, and
// when a stored number becomes a `tel:` link. See that module's header for why
// only the *decisions* moved and both layouts stayed put.
import {
  StopPhoneLink,
  buildHubPayoutLines,
  buildHubTimeline,
  type HubTimelineStep,
  type HubTimelineStepState,
} from "@/components/driver-hub/hub-job-parts";
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
 * Below the fare, the panel carries what the client asked for at booking: the
 * load space the job was booked for, the plate that ran it, who to ask for at
 * each end, and a business client's own PO reference.
 *
 * The header above holds the handoff's two pills and no more — the status, and
 * one neutral tag naming the vehicle class. The load space and the plate used
 * to be two more pills there and are now labelled rows here, which is the
 * honest shape for them: a bare "Dry box" in a grey capsule beside a status
 * capsule is a word the reader has to place, while a row called "Body type"
 * says what it is. The tier lost its pill and gained nothing, because it
 * already had somewhere better to be: `Order.serviceLevel` is REGULAR on most
 * orders and moves no money there, and wherever it *did* move money the note
 * under "Paid to you" names it in a sentence. Dispatch never reads the column
 * either — it matches on `vehicleTypeSpecId` alone — so a permanent pill for it
 * was overstating a flag nothing acts on.
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

/**
 * Success green — a step that is on the record as having happened. No `dark:`
 * counterpart, and deliberately: at L=59.6% this green clears both the light
 * card and the dark one, so pairing it would be inventing a second green to
 * solve a problem the first one does not have.
 */
const DOT_DONE_CLASSES =
  "border-[oklch(59.6%_0.145_163.225)] bg-[oklch(59.6%_0.145_163.225)]";

/**
 * Brand orange, hollow — the step the job is currently waiting on. Left
 * unpaired for the same reason as the green above: L=64% is legible on either
 * ground, and this is the brand's own orange, which is not a colour a theme gets
 * to restate. Its `bg-background` fill is what flips, so the dot stays hollow —
 * a ring around the card's own surface — rather than becoming a white disc
 * floating on a dark panel.
 */
const DOT_CURRENT_CLASSES = "border-[oklch(64%_0.19_48)] bg-background";

/**
 * Border grey, hollow — a step that has not been reached.
 *
 * `--border`'s light value is within a hair of the handoff's own LINE grey that
 * used to be spelled out here, so naming the token is not a colour change in
 * light mode; what it buys is the dark one, where the token resolves to a
 * translucent white hairline and the dot goes on reading as *not yet reached*
 * instead of staying a near-white ring burning a hole in the panel. The token
 * also ties the dot to the hairlines it sits among — `DETAIL_ROW_CLASSES`, the
 * card edges — which is the relationship the design was drawing, and which a
 * frozen literal could only keep by coincidence.
 */
const DOT_PENDING_CLASSES = "border-border bg-background";

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

const DOT_CLASSES: Record<HubTimelineStepState, string> = {
  done: DOT_DONE_CLASSES,
  current: DOT_CURRENT_CLASSES,
  pending: DOT_PENDING_CLASSES,
};

/**
 * The shared three steps, each paired with **this panel's** sub-line.
 *
 * Which steps exist and which of them count as done is
 * `buildHubTimeline`'s call, not this file's — the rule that a step is done
 * only when its timestamp exists, and that nothing may pad the list out to the
 * design's four, is the same rule on the driver's Job sheet and must not be
 * written twice. What stays here is the `detail` line under each label, which
 * is genuinely this panel's own: the Job sheet shows a bare timestamp under the
 * label because it is already showing both addresses in full a card away, while
 * this panel is the only place a reader sees them at all.
 */
function detailFor(
  job: HubJob,
  nowIso: string,
  // Keyed on `HubTimelineStep["id"]` rather than on `string`, so that a step
  // added to the shared builder is a compile error here — a missing sub-line
  // would otherwise be an empty second row under a label, which reads as a
  // rendering fault rather than as unfinished work.
): Record<HubTimelineStep["id"], string> {
  return {
    // `scheduledAt` is the client's requested slot and is null on every order
    // booked before the column existed, which is why the alternative wording
    // is a statement about this order rather than an em dash.
    placed:
      job.scheduledAt === null
        ? "Booked for immediate pickup"
        : `Requested for ${formatJobTime(job.scheduledAt, nowIso)}`,
    "picked-up": job.pickupAddress,
    "dropped-off": job.dropoffAddress,
  };
}

/* -------------------------------------------------------------------------- */
/* Fare lines                                                                 */
/* -------------------------------------------------------------------------- */

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
 *
 * **All of the above now lives in `buildHubPayoutLines`**, shared with the
 * driver's Job sheet, which prints these same two lines on a completed job.
 * The reasoning is kept here because this is where it was argued; the
 * implementation is not, because two implementations of "what does this job pay
 * its carrier" is two answers waiting to disagree. One label changed in the
 * move — "N min loading" became "N min **waiting**", after the column
 * (`Order.waitingMinutes`) and after the Job sheet dialog's "Waiting time"
 * field, which is the only UI in the product that collects the number. See that
 * function's own note.
 */

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
 * has no digits in it — `StopPhoneLink` owns both halves of that, and the Job
 * sheet's own stop cards render the same decision through the same component.
 *
 * The row's *layout* stays here and is deliberately not shared: this is a
 * bordered label/value pair in a narrow column beside a table, where the Job
 * sheet lays the same two facts out as a 96px definition grid inside a stop
 * card with Call and Navigate under it.
 */
function StopContactRow({ label, contact }: StopContactRowProps) {
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
            {contact.phone === null ? null : (
              <StopPhoneLink
                phone={contact.phone}
                className="block truncate font-price text-muted-foreground"
              />
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
  // `HubJobStatus` has already collapsed PENDING/CLAIMED/ACCEPTED into
  // "Scheduled", which is lossless for the only question asked here: is the job
  // still going, so that its next unreached step should be painted as the one
  // being waited on. The driver's Job sheet answers the same question from the
  // raw `OrderStatus` it needs for its action buttons — which is exactly why
  // `buildHubTimeline` takes the boolean rather than either enum.
  const timeline = buildHubTimeline({
    createdAt: job.createdAt,
    inTransitAt: job.inTransitAt,
    completedAt: job.completedAt,
    running: job.status === "In transit" || job.status === "Scheduled",
  });
  const stepDetails = detailFor(job, nowIso);
  const fareLines = buildHubPayoutLines(job);

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

      {/* Two pills, which is what the handoff draws: the status, and one
          neutral tag naming the vehicle class the job was booked for
          (`<span style="{{ selectedJob.tagStyle }}">…</span><span
          style="{{ selectedJob.typeTagStyle }}">{{ selectedJob.vehicle }}</span>`,
          where the prototype's `vehicle` is the class — "Van" — not a plate).

          The tier, the body type and the plate used to ride here as three more
          pills, and a five-pill row was the reason the status — the one thing a
          reader scans this header for — had to be hunted for. None of the three
          is lost: the tier is named under the total wherever it moved money,
          and the other two now sit in the detail rows below, where a labelled
          value says what it is instead of a bare word in a grey capsule. */}
      <div className="mt-4 mb-5 flex flex-wrap gap-2">
        <HubStatusBadge status={job.status} />
        {/* Neutral, never a status tone. `hub-status.ts` defines six tones,
            all of them for job states, and a vehicle class is not one. */}
        <Badge variant="outline" className={NEUTRAL_PILL_CLASSES}>
          {job.vehicleTypeLabel}
        </Badge>
      </div>

      <ol className="flex flex-col gap-3.5 border-b border-border pb-5">
        {timeline.map((step) => (
          <li key={step.id} className="flex items-start gap-3">
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
                {stepDetails[step.id]}
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

      {/* Now the only place the booked tier is named, and the place it was
          always doing the real work: a figure smaller than the client's invoice
          invites the reader to wonder where the Priority premium went, and a
          pill saying "Priority" never answered that — this sentence does. It is
          still true word for word — the tier adjusts what the client pays, and
          this figure is not that — and the reason is that the carrier's share of
          the adjustment is already inside the Payout line above, not withheld
          pending a decision. Regular moves the fare by nothing, so it earns no
          note; a line saying the adjustment was zero would only be noise. */}
      {job.serviceLevel === "Regular" ? null : (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Booked as {job.serviceLevel}. The tier adjusts what the client pays
          and is not part of this figure.
        </p>
      )}

      {/* The two facts that came out of the pill row. Both are conditional and
          both are silent when absent rather than defaulted: `bodyType` is null
          on every order placed before the load-space filter existed and there
          is nothing to derive one from, and a plate only exists once a vehicle
          was actually dispatched, so an unstarted job carries neither row.
          Labelled rows rather than pills because that is what they are — a
          value with a name — and because the handoff's header is two pills. */}
      {job.bodyType === null && job.vehiclePlate === null ? null : (
        <dl className="mt-5">
          {job.bodyType === null ? null : (
            <div className={DETAIL_ROW_CLASSES}>
              <dt className="flex-none text-muted-foreground">Body type</dt>
              <dd className="min-w-0 truncate font-medium">{job.bodyType}</dd>
            </div>
          )}
          {job.vehiclePlate === null ? null : (
            <div className={DETAIL_ROW_CLASSES}>
              <dt className="flex-none text-muted-foreground">Plate</dt>
              <dd className="min-w-0 truncate font-price font-medium">
                {job.vehiclePlate}
              </dd>
            </div>
          )}
        </dl>
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
