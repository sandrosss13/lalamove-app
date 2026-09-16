"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

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
  type JobSheetViewer,
} from "@/components/driver-hub/screens/job-sheet-parts";
import { LoadsDispatchDialog } from "@/components/driver-hub/screens/loads-dispatch-dialog";
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
 * **Desktop is the same single column, capped at 720px.** Not the hub's content
 * width, and not a grid. Every other hub screen spreads to the shell's full cap
 * because it is a dashboard — a table with a detail panel beside it — and this
 * is a task list a driver reads top to bottom, where the only thing a wider
 * column buys is longer line lengths on Georgian addresses. Both artboards say
 * so in as many words ("Why 720, not 1180" — 1180 being what the shell capped
 * at when they were drawn; it is 1800 now, which only widens the gap this 720
 * is defending), and it is why the wrapper below caps its own width rather than
 * inheriting the shell's: it is the one place this screen restates a page-level
 * measurement, and it restates a *narrower* one.
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
 *
 * ## Two readers, four layouts, one tree
 *
 * The route used to refuse any fleet account outright: it gated on
 * `driverId === session.user.id` while the load board calls a fleet's loads
 * "mine" by `companyId`, so every "Open job sheet" a fleet owner could press
 * landed on "Order not found." The loader is a company tenancy now, and
 * `viewer` is how this screen knows which of the two it is drawing for.
 *
 * **It does not add a fifth layout.** All four run for both readers, on the same
 * order data, in the same order. `viewer` changes exactly three things, and each
 * one is a fact about the reader rather than about the job:
 *
 * - **The action bar is not mounted for a company at all** — not disabled, not
 *   present. See the default branch below.
 * - **Voice.** "You are paid" is addressed to the payee; `JobSheetHeaderCard`
 *   and `JobSheetContactsCard` carry the company's wording for the same figures
 *   and the same numbers.
 * - **One extra fact.** `job.fleet` — which driver has it, on which vehicle —
 *   drawn in the header card, which is the one card all four layouts render.
 * - **One extra action, on one status.** A company can claim a load without
 *   naming anybody, so a `CLAIMED` order with a null `fleet.driverName` carries
 *   an "Assign a driver and vehicle" trigger in that same header card, opening
 *   `LoadsDispatchDialog`. It is the way back in for a dispatcher who claimed
 *   from the load board and dismissed the dialog that opened there — dismissing
 *   it is a legitimate answer, and "Awaiting dispatch" is where the order waits
 *   until they come back. The three conditions that gate the trigger live on
 *   `JobSheetHeaderCard`, where the fleet block is; what lives *here* is the
 *   dialog's open state and the `router.refresh()` that re-reads the result, for
 *   the reason the `useTransition` below gives.
 *
 * Nothing is *withheld* from a company reader. Both stops keep their Call and
 * Navigate row: a dispatcher ringing a consignee is ordinary, and a map is
 * harmless to anyone.
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
  /**
   * Which of the loader's two claims got this reader in — the driver assigned
   * to the order, or the company that holds it.
   *
   * Resolved server-side by `getHubJobSheet`, never inferred here: this is a
   * `"use client"` tree with no session, and a viewer a component decided for
   * itself would be a permission guessed from props.
   */
  viewer: JobSheetViewer;
};

export function JobSheetScreen({ job, nowIso, viewer }: JobSheetScreenProps) {
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

  const router = useRouter();

  /**
   * Whether the dispatch dialog is on screen, held here rather than in
   * `JobSheetHeaderCard`.
   *
   * Lifted for one reason: the success path has to close the dialog *and*
   * re-read the page in a single transition, and the transition has to belong to
   * something that outlives the dialog. `job-sheet-actions.tsx` owns its confirm
   * dialog's completion for exactly the same reason, and states the failure it
   * avoids — a transition started inside a component that is already unmounting
   * drops its pending flag, and the trigger behind it re-enables over a page
   * that has not caught up.
   *
   * These three hooks sit above the two early returns below, unconditionally, as
   * React requires. They are inert on the layouts that never mount the dialog.
   */
  const [isDispatchOpen, setIsDispatchOpen] = React.useState(false);

  /**
   * The dispatch POST's server re-render.
   *
   * `router.refresh()` is what re-reads the new driver, and nothing else would:
   * `/dashboard/jobs/[id]` is `force-dynamic` and server-rendered, so the fleet
   * block's `driverName` comes from a Prisma read on the server and no client
   * state of this screen's can conjure it. Patching it locally would mean this
   * screen holding an optimistic copy of a fact the server owns, which is the
   * pattern `job-sheet-actions.tsx` rejected for the start and complete buttons
   * on the same page. `isDispatchPending` keeps the trigger disabled until the
   * new render commits — see `JobSheetHeaderCardProps.isDispatchPending`.
   */
  const [isDispatchPending, startDispatchTransition] = React.useTransition();

  if (job.status === "CANCELLED") {
    return <JobSheetCancelled job={job} viewer={viewer} />;
  }

  if (job.status === "COMPLETED") {
    return <JobSheetCompleted job={job} viewer={viewer} />;
  }

  const inTransit = job.status === "IN_TRANSIT";

  return (
    <div className={COLUMN_CLASSES}>
      {/* Written first so a screen reader and the tab order meet the job's one
          action immediately after its title rather than after five cards. It
          renders nothing at all on the `PENDING`/`CLAIMED` states an assigned
          order can briefly hold, where neither endpoint would accept a call.

          **Absent for a company, rather than present and disabled.** Both
          controls it holds write as the assigned driver — `POST
          /api/orders/[id]/start` and `POST /api/orders/[id]/complete` each
          403 unless `order.driverId === session.user.id` — so a fleet owner
          pressing either could only ever collect a refusal. A disabled button
          is the right shape for something that will become pressable; this
          never will, for this reader, on this job.

          There is no layout hole where it was. `gap-5` is flexbox gap, which
          falls between flex *items*, and an omitted child is not one — the same
          reason `JobSheetActionBar` can safely return `null` on a `CLAIMED`
          order without the column above it moving. Both arrangements already
          ship side by side in this file: the completed and cancelled layouts
          below never mount the bar at all, and they are the same column with
          the same first-card spacing as this one. It is also the only child
          here carrying an `order-*` class, so dropping it cannot re-sequence
          anything that stayed. */}
      {viewer === "DRIVER" ? (
        <JobSheetActionBar job={job} nowIso={nowIso} />
      ) : null}

      <JobSheetHeaderCard
        job={job}
        viewer={viewer}
        // The figure agreed at booking. Never a breakdown before completion:
        // `overtimeDriverPayout` is 0 and `waitingMinutes` is null until the
        // driver reports them, so it would print a total about to change.
        payout="quoted"
        // The card decides whether to draw the trigger at all, and it gates on
        // three facts about the job rather than on this prop — including
        // `status === "CLAIMED"`, which is why the same prop passed from the
        // completed and cancelled layouts would be inert. It is not passed
        // there anyway: those jobs have nothing to dispatch.
        onDispatch={() => setIsDispatchOpen(true)}
        isDispatchPending={isDispatchPending}
      />

      {/* Mounted only while open, and keyed on nothing: this screen shows one
          order and does not poll, so there is no second target a stale vehicle
          pick could leak into — unlike the load board, where the same dialog is
          keyed on the order id for precisely that reason. Unmounting on close is
          what drops the chosen vehicle, the roster override and any spent error,
          so a dispatcher who dismisses and reopens starts from the fleet as it
          is now rather than from where they left off. */}
      {isDispatchOpen ? (
        <LoadsDispatchDialog
          orderId={job.id}
          reference={job.reference}
          onClose={() => setIsDispatchOpen(false)}
          // Close and resync inside *this* component's transition, so
          // `isDispatchPending` — and with it the disabled trigger in the header
          // card — stays true until the new server render commits. See the
          // `useTransition` comment above.
          onDispatched={() => {
            setIsDispatchOpen(false);
            startDispatchTransition(() => {
              router.refresh();
            });
          }}
        />
      ) : null}

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
function JobSheetCompleted({
  job,
  viewer,
}: {
  job: HubJobSheet;
  viewer: JobSheetViewer;
}) {
  return (
    <div className={COLUMN_CLASSES}>
      {/* Booking plus overtime, with the two-line breakdown. Both halves are
          settled at this point, which is the only point at which summing them
          states a fact rather than a forecast. */}
      <JobSheetHeaderCard job={job} viewer={viewer} payout="final" />

      {/* Carries the completion time on its "Dropped off" step, and under the
          rail the two figures the driver typed into the confirmation dialog:
          the waiting minutes and, if they caught one, the recipient's name. */}
      <JobSheetTimelineCard job={job} running={false} />

      <JobSheetContactsCard job={job} viewer={viewer} />

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
 * dishonest figure this screen could show. A company reader is not an exception
 * to that: relabelling the figure does not make a payout that never happened
 * true, so `payout="none"` is unconditional and the header card says why.
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
function JobSheetCancelled({
  job,
  viewer,
}: {
  job: HubJobSheet;
  viewer: JobSheetViewer;
}) {
  return (
    <div className={COLUMN_CLASSES}>
      <JobSheetHeaderCard job={job} viewer={viewer} payout="none" />

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
 * **The same page for every situation** — no such order, an order assigned to
 * another driver, one held by another company, and one that neither of this
 * caller's two claims reaches — and they are indistinguishable on purpose. An
 * order with no driver is no longer in that list: since the loader became a
 * company tenancy it is a job sheet, and the fleet holding it reads "Awaiting
 * dispatch" on the pill. A "not yours" that reads differently from a
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
