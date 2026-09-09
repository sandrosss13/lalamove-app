"use client";

import {
  useHubSubtitle,
  useHubTitle,
} from "@/components/driver-hub/driver-hub-shell";
import { JobSheetActionBar } from "@/components/driver-hub/screens/job-sheet-actions";
import {
  BackToBoardButton,
  JobSheetCargoCard,
  JobSheetContactsCard,
  JobSheetHeaderCard,
  JobSheetNotice,
  JobSheetPickedUpStrip,
  JobSheetStopCard,
  JobSheetTimelineCard,
  JobSheetTimingCard,
  jobSheetRouteSummary,
} from "@/components/driver-hub/screens/job-sheet-parts";
import type { HubJobSheet } from "@/lib/dashboard/hub/job-sheet";

/**
 * The driver's Job sheet: `/dashboard/jobs/[id]`.
 *
 * The screen a driver works from **after** they claim a load. The load board
 * ends at "claimed"; everything from arriving at the pick-up to marking the
 * delivery done happens here, and until this shipped the "Open job sheet"
 * button on three surfaces was disabled because there was nowhere for it to go
 * — leaving a driver who had claimed a job unable to reach the client's phone
 * number at all.
 *
 * This component decides only **which cards appear, in what order**. What each
 * card says is `job-sheet-parts.tsx`, what the two buttons do is
 * `job-sheet-actions.tsx`, and what the order *is* is
 * `src/lib/dashboard/hub/job-sheet.ts`.
 *
 * ## Phone-first, and that inverts the rest of the hub
 *
 * Every other driver-hub screen is desktop-first with a phone pass. This one is
 * written the other way round, because a driver reads a job sheet standing at a
 * loading bay or sitting in a cab, one-handed, in daylight, possibly gloved.
 * The primary artboard is 390 × 844 and the classes below are that layout; `lg`
 * changes two things and nothing else.
 *
 * **Desktop is the same single column, capped at 720px.** Not the hub's 1180px
 * content width, and not a grid. Every other hub screen spreads to 1180 because
 * it is a dashboard — a table with a detail panel beside it — and this is a task
 * list a driver reads top to bottom, where the only thing a wider column buys is
 * longer line lengths on Georgian addresses. Both artboards say so in as many
 * words ("Why 720, not 1180"), and it is why the wrapper below caps its own
 * width rather than inheriting the shell's: it is the one place this screen
 * restates a page-level measurement, and it restates a *narrower* one.
 *
 * The consequence is that the DOM order **is** the visual order, top to bottom,
 * at every width — no `order-*` and no `col-start-*` moves a card out of its
 * reading position. The single exception is the action bar, which is written
 * first and shown last on a phone so that `position: sticky` has somewhere to
 * stick from; `job-sheet-actions.tsx` documents that trade at the site of it.
 *
 * ## Four layouts, branched on the raw `OrderStatus`
 *
 * Not on a display status. `toHubJobStatus` collapses `PENDING`, `CLAIMED` and
 * `ACCEPTED` into one word, which is right for a history table and fatal here:
 * the difference between them decides whether `Start delivery` may be offered
 * at all. `HubJobSheet.status` is the stored enum, unmapped.
 *
 * - **ACCEPTED** — get the driver to the pick-up with the right phone number in
 *   hand. The pick-up is the prominent card, the drop-off is subordinate but
 *   never hidden, and the bar says `Start delivery`.
 * - **IN_TRANSIT** — re-weighted, not rebuilt. The pick-up collapses to a
 *   one-line receipt, the drop-off takes the emphasis, and the bar becomes
 *   `Mark delivered`.
 * - **COMPLETED** — read-only. What it paid including any overtime, when each
 *   of the three real things happened, what the driver reported, and both
 *   contacts — which stay, because a driver is routinely rung back about a job
 *   they finished an hour ago.
 * - **CANCELLED** — terminal, with one exit and no payout figure.
 *
 * There is no fifth branch for a driver-side cancel or abort. No endpoint
 * exists — only the company that placed an order can cancel it — so there is no
 * such affordance anywhere on this sheet.
 */

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The one column every state renders into.
 *
 * `gap-5` is the 20px the shell already puts between page sections, so a card
 * boundary inside this wrapper reads exactly like one outside it. `flex` rather
 * than a plain block because the action bar's `order-last` needs a flex parent
 * to reorder against.
 *
 * No horizontal padding: the shell's `<main>` supplies the page gutter, and a
 * screen that restated it would be indenting itself twice.
 */
const COLUMN_CLASSES = "flex min-w-0 max-w-[720px] flex-col gap-5";

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export type JobSheetScreenProps = {
  job: HubJobSheet;
  /**
   * "Now", sampled once by the server component. See
   * `JobSheetActionBarProps.nowIso` — it decides whether a future-dated job's
   * action is pressable, and reading a clock during render would disagree
   * between the server pass and the hydration pass.
   */
  nowIso: string;
};

export function JobSheetScreen({ job, nowIso }: JobSheetScreenProps) {
  /**
   * The header says "Job sheet", not "Job history".
   *
   * `hubNavItemForPath` prefix-matches `/dashboard/jobs/<id>` to the Jobs nav
   * entry — which is exactly what makes "My orders" light up in the rail, and
   * exactly what would otherwise title this screen after the list it was opened
   * from. See `useHubTitle` for why the fix is an override from below rather
   * than a ninth `HUB_NAV` entry.
   */
  useHubTitle("Job sheet");

  /**
   * The subhead is the route, which is the fastest way for a driver to confirm
   * they opened the job they meant to. It is derived, so it replaces the nav
   * entry's static "182 jobs in the last 30 days" — a sentence about the list,
   * on a screen showing one delivery.
   */
  useHubSubtitle(jobSheetRouteSummary(job));

  if (job.status === "CANCELLED") {
    return <JobSheetCancelled job={job} />;
  }

  if (job.status === "COMPLETED") {
    return <JobSheetCompleted job={job} />;
  }

  const inTransit = job.status === "IN_TRANSIT";

  return (
    <div className={COLUMN_CLASSES}>
      {/* Written first so a screen reader and the tab order meet the job's one
          action immediately after its title rather than after five cards. It
          renders nothing at all on the `PENDING`/`CLAIMED` states an assigned
          order can briefly hold, where neither endpoint would accept a call. */}
      <JobSheetActionBar job={job} nowIso={nowIso} />

      <JobSheetHeaderCard
        job={job}
        // The figure agreed at booking. Never a breakdown before completion:
        // `overtimeDriverPayout` is 0 and `waitingMinutes` is null until the
        // driver reports them, so it would print a total about to change.
        payout="quoted"
      />

      {/* Directly under the money, in both running states — "what time am I due
          somewhere" is the most common reason a driver opens this sheet before
          setting off. It stays in the `IN_TRANSIT` layout even though the
          artboard drops it there, because `JobSheetStopCard` carries no time at
          all by design: this card is the only place `deliveryDeadline` appears,
          and a driver holding the load is precisely the reader who needs it. */}
      <JobSheetTimingCard job={job} />

      {/* Once the load is on the vehicle the pick-up collapses to a one-line
          receipt: its address and the minute it happened, which is the fact
          still worth having, without spending two 44px controls and a third of
          a 390px screen on a stop the driver has already left. Its contact is
          not lost — the completed state keeps both numbers on the Contacts
          card, and this state keeps the drop-off's. */}
      {inTransit ? (
        <JobSheetPickedUpStrip job={job} />
      ) : (
        <JobSheetStopCard
          label="Pick-up"
          marker="filled"
          city={job.pickupCity}
          address={job.pickupAddress}
          contactName={job.pickupContactName}
          contactPhone={job.pickupContactPhone}
          contactDetails={job.pickupContactDetails}
          lat={job.pickupLat}
          lng={job.pickupLng}
          prominent
        />
      )}

      <JobSheetStopCard
        label="Drop-off"
        marker="ring"
        city={job.dropoffCity}
        address={job.dropoffAddress}
        contactName={job.dropoffContactName}
        contactPhone={job.dropoffContactPhone}
        contactDetails={job.dropoffContactDetails}
        lat={job.dropoffLat}
        lng={job.dropoffLng}
        // Subordinate while the driver is still heading for the pick-up —
        // smaller city type and muted actions, but never hidden: ringing ahead
        // to the consignee before setting off is ordinary. Prominent once the
        // load is aboard, when it is the whole remaining job.
        prominent={inTransit}
      />

      <JobSheetCargoCard job={job} />

      {/* `running` — the job is neither finished nor cancelled, so the first
          step without a timestamp is what is being waited on and is drawn as
          the current one. On a cancelled job the same dot would promise a
          pickup that is never coming; see `JobSheetTimelineCard`. */}
      <JobSheetTimelineCard job={job} running />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Completed                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A finished delivery: read-only, and deliberately still useful.
 *
 * **No actions, and no disabled ones either.** A driver cannot reopen, amend or
 * cancel a delivered job — no endpoint exists for any of it — so the bar is
 * absent rather than present and dead, which is the same rule
 * `JobSheetActionBar` applies by returning `null` for this status.
 *
 * What it keeps is the four things the driver may need afterwards: what the job
 * paid *including* the overtime the reported waiting minutes earned, when each
 * of the three recorded events happened, what they told us at completion, and
 * **both contacts**. The stop cards go — their Call and Navigate actions are
 * for a job in progress — but the numbers do not, because being rung back about
 * a delivery made an hour ago is ordinary and the alternative is hunting a
 * finished-job list on a phone at the roadside.
 *
 * The cargo table stays too, last. It is the least urgent thing here and the
 * first thing wanted in a dispute about what was actually carried.
 */
function JobSheetCompleted({ job }: { job: HubJobSheet }) {
  return (
    <div className={COLUMN_CLASSES}>
      {/* Booking plus overtime, with the two-line breakdown. Both halves are
          settled at this point, which is the only point at which summing them
          states a fact rather than a forecast. */}
      <JobSheetHeaderCard job={job} payout="final" />

      {/* Carries the completion time on its "Dropped off" step, and under the
          rail the two figures the driver typed into the confirmation dialog:
          the waiting minutes and, if they caught one, the recipient's name. */}
      <JobSheetTimelineCard job={job} running={false} />

      <JobSheetContactsCard job={job} />

      <JobSheetCargoCard job={job} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cancelled                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A job cancelled while this driver held it.
 *
 * **No payout figure**, which is what `payout="none"` is for. `driverPayout`
 * still holds whatever the job was commissioned at when it was booked, and it
 * is still a real stored column — but a cancelled job is not going to pay it,
 * and printing a stored number under "You are paid" would be the one genuinely
 * dishonest figure this screen could show.
 *
 * **The timeline cannot say when.** `Order` has no `cancelledAt` column, so
 * there is no fourth step to draw and no timestamp to put on one. What
 * `inTransitAt` *does* say is whether the job got as far as the pick-up, which
 * is worth a sentence — and the sentence says out loud that the moment is not
 * recorded, rather than leaving a reader to wonder why it is missing. The
 * wording is `jobs-detail-panel.tsx`'s existing pair for the same case, so a
 * driver reading the same cancelled job on two screens is told the same thing.
 * The rail itself is still drawn, with every unreached step *pending* rather
 * than current: what did happen (the client placed it; possibly a pick-up) is
 * the only account of the job there will ever be.
 */
function JobSheetCancelled({ job }: { job: HubJobSheet }) {
  return (
    <div className={COLUMN_CLASSES}>
      <JobSheetHeaderCard job={job} payout="none" />

      <JobSheetNotice
        title="This delivery was cancelled."
        detail={
          job.inTransitAt === null
            ? "Cancelled before pickup. Nothing records when it was cancelled."
            : "Cancelled after pickup. Nothing records when it was cancelled."
        }
      />

      <JobSheetTimelineCard job={job} running={false} />

      {/* The only exit. A driver cannot un-cancel, appeal or reopen a job, so
          the honest affordance is the way back to work rather than a control
          that would refuse. `self-start` so it is sized by its label instead of
          stretching the width of the column like a primary action. */}
      <BackToBoardButton className="self-start" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Not found                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What `/dashboard/jobs/[id]` renders when `getHubJobSheet` returns `null`.
 *
 * **The same page for three different situations** — no such order, an order
 * belonging to another driver, and an order with no driver at all — and they
 * are indistinguishable on purpose. A "not yours" that reads differently from a
 * "no such id" turns this route into an oracle: a caller could walk ids and
 * learn which ones exist, and roughly how much work the platform is carrying,
 * without ever being authorised to see one. `getHubJobSheet` returns one bare
 * `null` for all three precisely so that this component *cannot* tell them
 * apart, and `src/app/orders/[id]/track/page.tsx` reports someone else's order
 * exactly like a missing one for the same reason.
 *
 * **The copy is that page's, not the handoff's copy table.** The table gives
 * *"This delivery isn't assigned to you."* for "not yours", and the same brief
 * requires a not-found indistinguishable from a missing id; the two contradict,
 * because naming the assignment confirms the order exists and belongs to
 * someone else — which is the id-probing the requirement exists to block. The
 * security rule wins, both artboards annotate the departure, and the assignment
 * string belongs on the load board's "you no longer hold this load" path, where
 * the reader is already known to have held it.
 *
 * Do not add the order reference, a "this job was reassigned" branch, or a
 * sentence about what might have happened to it. The follow-up line below is
 * about what the reader can do next and says nothing about the order.
 *
 * It sets no hub title, unlike `JobSheetScreen`: a title override is a hook,
 * and this branch has no order to name in one. So it inherits the nav entry's
 * own title, which is what a driver following a stale link should see.
 */
export function JobSheetNotFound() {
  return (
    <div className={COLUMN_CLASSES}>
      <JobSheetNotice
        title="Order not found."
        detail="It may have been removed, or the link may be wrong."
      >
        <BackToBoardButton className="mt-1.5 self-start" />
      </JobSheetNotice>
    </div>
  );
}
