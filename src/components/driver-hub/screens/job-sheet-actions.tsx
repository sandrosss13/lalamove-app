"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAbsoluteDateTime } from "@/components/driver-hub/screens/loads-format";
import type { HubJobSheet } from "@/lib/dashboard/hub/job-sheet";
import { differenceInHubDays } from "@/lib/dashboard/hub/timezone";
import { cn } from "@/lib/utils";

/**
 * The only two things on the driver's Job sheet that write: **Start delivery**
 * and **Mark delivered**.
 *
 * This screen is the first caller of either endpoint anywhere in the codebase.
 * Both have existed and been guarded since the lifecycle routes landed, and
 * neither had a UI — which is why a driver who claimed a load could not, until
 * now, tell the platform they had started or finished it.
 *
 * | Action | Endpoint | Body | Refuses |
 * |---|---|---|---|
 * | Start delivery | `POST /api/orders/[id]/start` | none | 409 unless `ACCEPTED`; 403 unless assigned |
 * | Mark delivered | `POST /api/orders/[id]/complete` | `{ waitingMinutes, receivedBy? }` | 409 unless `IN_TRANSIT`; 400 on a bad figure |
 *
 * ## The server's status is the only status
 *
 * **Nothing here is optimistic, and nothing here holds a copy of the order's
 * state.** `status` arrives as a prop from the server component that read it
 * out of Prisma; a successful request calls `router.refresh()`, the page re-runs
 * `getHubJobSheet`, and the button changes because the *database* changed. There
 * is no local `hasStarted` to go stale.
 *
 * That is not fastidiousness, it is the correctness requirement. `start`
 * refuses anything that is not exactly `ACCEPTED` and `complete` anything that
 * is not `IN_TRANSIT`, so the two ways a driver actually loses this — a double
 * tap on a slow connection, and the same job open on a phone and a tablet — are
 * both cases where the second press *must* fail. Painting success locally and
 * reconciling later would show a driver a delivery marked done that the server
 * had refused, on the one screen where that matters.
 *
 * A `409` is therefore not treated as an error to sit on: it means this screen
 * is behind, so the refusal is reported **and** a refresh is issued, and the
 * buttons resync to whatever actually happened. The driver reads a sentence
 * naming the real obstacle rather than watching a button go quietly dead.
 *
 * ## A failure leaves the job exactly where it was
 *
 * Neither endpoint writes partially — `start` is one `update`, `complete` is one
 * `update` carrying the status, the timestamp, the minutes and both overtime
 * figures together — so there is no half-applied state to unwind. On this side
 * a failed request changes nothing at all: the dialog stays open with the
 * driver's typed figures intact, the status stays what it was, and the button
 * stays pressable. Retrying is pressing it again.
 *
 * ## Async feedback is a live region, not a toast
 *
 * There is no toast primitive in this codebase and this screen does not add one.
 * Every message below lives in a `role="status"` / `aria-live="polite"` region
 * pinned beside the control that produced it — the pattern `hub-online-toggle`
 * and the claim dialogs already use. `polite` rather than `assertive` even for
 * refusals: the driver is looking at the button they just pressed, so this is an
 * answer to a question they asked, not an interruption.
 *
 * ## Why the bar is pinned to the bottom
 *
 * See `job-sheet-parts.tsx`'s header for the phone-first inversion this screen
 * makes deliberately. The consequence here is the two sizes: **56px** on the
 * state-changing action (against the hub's 44px floor for everything else),
 * full-width, in a bar fixed to the bottom of the viewport rather than at the
 * end of a scroll — a driver holding a phone one-handed in a cab reaches the
 * bottom of the screen with a thumb and nothing else.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The 56px state-changing action, and the reason it is not the hub's 44px.
 *
 * 44px is the *floor* for a control on a phone; these two are the controls the
 * whole screen exists to reach, they are pressed while standing at a tailgate,
 * and they are irreversible in the direction that matters. The extra 12px is
 * the design's, and it drops back to the desktop `h-10` at `lg` where the
 * pointer is a mouse. `w-full` for the same reason — a thumb-sized target that
 * spans the bar cannot be missed.
 */
const PRIMARY_ACTION_CLASSES =
  "h-14 w-full text-[15px] font-medium lg:h-10 lg:w-auto lg:px-[22px] lg:text-sm";

/** What a request that never reached the server is called. */
const NETWORK_ERROR =
  "Couldn't reach the server. Check your connection and try again.";

/** The fallback when a refusal arrives without a readable message. */
const START_GENERIC_ERROR = "Could not start this delivery.";
const COMPLETE_GENERIC_ERROR = "Could not complete this delivery.";

/**
 * Whole minutes, and nothing else.
 *
 * Checked here as well as by the endpoint, which refuses a non-integer or a
 * negative with a 400. Not because the server check is insufficient — it is the
 * boundary and it stays — but because the alternative is a driver who typed
 * "1.5" watching their delivery fail to complete and having to work out why
 * from a message written for an API client. The field is also the one input in
 * the product whose value changes the driver's own pay, so it is worth being
 * exact about before it is sent rather than after.
 */
const WHOLE_MINUTES = /^\d+$/;

/**
 * How long a recipient's name may be, mirroring `MAX_RECEIVED_BY_LENGTH` in
 * `src/app/api/orders/[id]/complete/route.ts`.
 *
 * A duplicated literal rather than an import: that constant is module-private
 * in a route handler, and exporting a value from a route file so a component
 * can read it would make the two importable from one another in a direction
 * nothing else in this codebase goes. The number is the *server's* rule and the
 * server still enforces it — this copy only stops the box accepting a 201st
 * character, which is a nicety, not the check.
 */
const RECEIVED_BY_MAX_LENGTH = 200;

/* -------------------------------------------------------------------------- */
/* Gating                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Whether this job's **server-side** status admits either of the two actions,
 * and therefore whether the bar renders anything at all.
 *
 * Module-private, and it stays that way. `job-sheet-screen.tsx` does not need
 * the same answer: it mounts the bar unconditionally and lets it return `null`,
 * which costs nothing to lay out — the column is a flex stack, so a child that
 * renders nothing contributes no gap, and there is no reserved space for a
 * second copy of this rule to get wrong.
 *
 * It branches on the raw `OrderStatus` for the reason the module comment gives:
 * a display status calls `PENDING`, `CLAIMED` and `ACCEPTED` all "Scheduled",
 * and only the third of those can be started.
 */
function hasJobSheetAction(status: HubJobSheet["status"]): boolean {
  return status === "ACCEPTED" || status === "IN_TRANSIT";
}

/**
 * Why `Start delivery` is not pressable yet, or `null` when it is.
 *
 * ## The one thing that blocks a startable job
 *
 * `scheduledAt` can be days out — a client books Friday's move on Monday — and
 * the order is `ACCEPTED` the whole time. `POST /api/orders/[id]/start` checks
 * only the status, so a driver could legally start Friday's job on Monday,
 * stamp `inTransitAt` four days early, and leave the client's tracking page
 * saying their load is on a vehicle that has not moved.
 *
 * So the button is disabled while the job is booked for a **later Tbilisi
 * calendar day**, and the reason is stated beside it rather than left for the
 * driver to work out from a dead control. Calendar days, not a 24-hour window:
 * a driver setting off at 06:00 for an 08:00 job is starting *today's* work and
 * must not be stopped, and one opening Friday's sheet on Monday evening is not
 * "20 hours early", they are three days early. `differenceInHubDays` is the
 * hub's one definition of a day boundary and every "N days between" figure in
 * the product goes through it.
 *
 * ## What this is not
 *
 * **It is not a security control, and it must not be mistaken for one.** The
 * artboard makes the point sharply — *"a disabled button with no server rule
 * behind it is a suggestion"* — and it is right: a client that skipped this UI
 * would be allowed to start a future job, because the endpoint does not check
 * dates. The honest fix is a server-side window, and it belongs in
 * `start/route.ts` rather than here. Until then this stops the accident (a
 * mis-tap on tomorrow's sheet) without pretending to stop anything else, and
 * nothing downstream depends on it having held.
 *
 * A past `scheduledAt` is never blocked. A job that should have gone yesterday
 * is late, and late work is exactly the work a driver needs to be able to start.
 *
 * @param nowIso Sampled once by the server component and passed down, never
 *   read from the clock here — see `JobSheetActionBarProps.nowIso`.
 */
export function startBlockedReason(
  job: HubJobSheet,
  nowIso: string,
): string | null {
  if (job.scheduledAt === null) {
    return null;
  }

  const scheduled = new Date(job.scheduledAt);
  const now = new Date(nowIso);

  // A column that will not parse is not a reason to withhold the driver's one
  // action; it is a data fault, and the timing card already prints the em dash
  // that shows it.
  if (Number.isNaN(scheduled.getTime()) || Number.isNaN(now.getTime())) {
    return null;
  }

  if (differenceInHubDays(now, scheduled) < 1) {
    return null;
  }

  return `Booked for ${formatAbsoluteDateTime(job.scheduledAt)}. You can start it on the day.`;
}

/* -------------------------------------------------------------------------- */
/* Request helper                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A refusal's own message, or the caller's fallback.
 *
 * The endpoints' messages name the real obstacle ("This delivery cannot be
 * started right now.", "You are not assigned to this delivery.") in a way a
 * generic client-side string cannot, so they are preferred wherever one comes
 * back. `catch(() => null)` because a 500 from the framework rather than from
 * the route handler is HTML, and a JSON parse failure must not become a second,
 * more confusing error on top of the first.
 */
async function refusalMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;

  return typeof body?.error === "string" ? body.error : fallback;
}

/* -------------------------------------------------------------------------- */
/* Action bar                                                                 */
/* -------------------------------------------------------------------------- */

export type JobSheetActionBarProps = {
  job: HubJobSheet;
  /**
   * "Now", sampled once by the server component and threaded down.
   *
   * Never `Date.now()` inside this component. The screen server-renders and
   * then hydrates, so a clock read during render would be sampled twice — and a
   * render straddling Tbilisi midnight would disable the button on one side and
   * enable it on the other, which is a hydration mismatch on the one control
   * the page exists for. One instant passed down makes both passes agree by
   * construction. `jobs/page.tsx` threads `nowIso` for the same reason.
   */
  nowIso: string;
};

/**
 * The bar carrying whichever of the two actions this job's **server-side**
 * status allows, and nothing on a job that allows neither.
 *
 * Renders `null` for `COMPLETED`, `CANCELLED` and for the
 * `PENDING`/`CLAIMED`/`INITIATED` states an order can technically hold while
 * assigned to a driver. That last group is the reason this branches on the raw
 * `OrderStatus` rather than on a display status: `toHubJobStatus` calls all of
 * `PENDING`, `CLAIMED` and `ACCEPTED` "Scheduled", and offering Start delivery
 * on the first two would put a button in front of a driver whose only possible
 * outcome is a 409.
 *
 * ## First in the DOM, last on the phone, first again on desktop
 *
 * It is written **first** in the screen's children, so a screen reader and the
 * tab order meet the job's one action immediately after its title rather than
 * after five cards, at both widths. Visually it moves: `order-last` puts it at
 * the end of the phone column, which is what `position: sticky` needs — a
 * sticky box is clamped to its containing block and pushed no further than its
 * own flow position, so a bar written first and left there would reserve its
 * height at the *top* of the page and leave an 85px hole above the first card.
 * `lg:order-none` restores the DOM order on desktop, where the artboard drops
 * the bar entirely for an inline action directly under the page title.
 *
 * Sticky rather than `fixed`, as the phone artboard specifies. The difference
 * is what happens at the end of the scroll: a `fixed` bar floats over the last
 * card forever and needs a spacer under the content to compensate, while a
 * sticky one occupies real space in the column and simply stops covering
 * anything once the page bottom arrives. One less invisible 68px box to keep in
 * step with a button's height.
 */
export function JobSheetActionBar({ job, nowIso }: JobSheetActionBarProps) {
  const router = useRouter();

  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
  const [startError, setStartError] = React.useState<string | null>(null);

  /**
   * One busy flag covering the request **and** the refresh that follows it.
   *
   * `router.refresh()` re-renders this route on the server and streams the
   * result back, and it is not instant. Without the transition the button would
   * re-enable the moment `fetch` resolved, leaving a window in which it still
   * says "Start delivery" over a job the server has already moved to
   * `IN_TRANSIT` — and a press in that window is the double-submit this whole
   * component is arranged to prevent. `startTransition` keeps `isPending` true
   * until the new server render has committed.
   *
   * **It is this bar's transition that the dialog's success path runs in too**,
   * which is why the dialog is handed `onCompleted` rather than refreshing for
   * itself. A refresh started on the dialog's own `useTransition` immediately
   * after `onClose()` updates a component that is already unmounting: the flag
   * is dropped, `Mark delivered` re-enables while the refresh is still in
   * flight, and a driver can reopen the dialog and collect a guaranteed 409.
   * Owning both flags here is what keeps the bar disabled across the whole
   * window.
   */
  const [isPending, startTransition] = React.useTransition();

  async function handleStart() {
    setStartError(null);

    let response: Response;

    try {
      // No body, and therefore no `Content-Type`: the route reads nothing but
      // the session and the route parameter.
      response = await fetch(`/api/orders/${job.id}/start`, { method: "POST" });
    } catch {
      setStartError(NETWORK_ERROR);
      return;
    }

    if (!response.ok) {
      setStartError(await refusalMessage(response, START_GENERIC_ERROR));

      // A 409 says the order is no longer `ACCEPTED` — someone (or this driver,
      // on another device) already started it, or a company cancelled it. The
      // screen is stale, so it is refreshed alongside the message: the driver
      // reads why the press failed and then watches the button become the
      // correct one, rather than being left with a control that no longer
      // matches the job.
      if (response.status === 409) {
        startTransition(() => {
          router.refresh();
        });
      }

      return;
    }

    // The button changes because the database changed, not because this
    // function succeeded. See the module comment.
    startTransition(() => {
      router.refresh();
    });
  }

  if (!hasJobSheetAction(job.status)) {
    return null;
  }

  const isAccepted = job.status === "ACCEPTED";
  // Only `Start delivery` can be early. A job already `IN_TRANSIT` is by
  // definition under way, whatever its `scheduledAt` says.
  const blockedReason = isAccepted ? startBlockedReason(job, nowIso) : null;

  return (
    <>
      <div
        className={cn(
          // Phone: pinned to the bottom of the viewport for as long as there is
          // page left, and part of the column once there is not. `-mx-4 px-4`
          // cancels the shell's own 16px gutter so the bar reaches both edges
          // the way the artboard draws it, and the safe-area inset keeps the
          // button clear of an iPhone's home indicator, which would otherwise
          // sit on top of a 56px target.
          "sticky bottom-0 z-30 -mx-4 flex flex-col border-t border-border bg-background px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]",
          // See the component comment: written first, shown last on the phone
          // so `sticky` has somewhere to stick from.
          "order-last",
          // Desktop: an ordinary right-aligned row at the top of the content
          // column, which is where the desktop artboard puts it — under the
          // page title, above the cards. Everything the pinned bar needs is
          // unset rather than overridden piecemeal, so the two cannot
          // half-apply.
          "lg:static lg:z-auto lg:order-none lg:mx-0 lg:flex-row lg:items-center lg:justify-end lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0",
        )}
      >
        {/* Why the button is not pressable, stated rather than left for the
            driver to infer from a dead control. Not in the live region below:
            it is a standing fact about the job, present from first paint, and a
            polite region that already has text when it mounts announces
            nothing. */}
        {blockedReason === null ? null : (
          <p className="mb-2 text-[13px] leading-[1.45] text-muted-foreground lg:mb-0 lg:text-right">
            {blockedReason}
          </p>
        )}

        {/* The live region is inside the bar so the message is beside the
            control that produced it, and it is always mounted rather than
            conditionally rendered: a region that appears at the same moment as
            its text is frequently not announced at all, because assistive tech
            has nothing to observe a change against. Empty it is invisible and
            takes no space. */}
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "text-[13px] text-destructive empty:hidden",
            "mb-2 lg:mb-0",
          )}
        >
          {startError}
        </p>

        {isAccepted ? (
          <Button
            type="button"
            // Disabled while a request is in flight, and while the job is
            // booked for a later day. `aria-describedby` is not used for the
            // reason: a disabled button is not focusable in most browsers, so
            // the sentence has to be readable as ordinary content beside it,
            // which is where it is.
            disabled={isPending || blockedReason !== null}
            onClick={() => {
              void handleStart();
            }}
            className={PRIMARY_ACTION_CLASSES}
          >
            {isPending ? "Starting…" : "Start delivery"}
          </Button>
        ) : (
          <Button
            type="button"
            // Opens the dialog; this button never calls the endpoint. Marking a
            // delivery done is irreversible and there is no driver-side undo, so
            // the confirmation is not optional chrome — it is the only thing
            // between a mis-tap in a pocket and a job closed at the wrong stop.
            onClick={() => setIsConfirmOpen(true)}
            disabled={isPending}
            className={PRIMARY_ACTION_CLASSES}
          >
            Mark delivered
          </Button>
        )}
      </div>

      {/* Mounted only while open, and keyed on nothing: unlike the load board's
          confirm dialog there is no row that can change underneath it — this
          screen shows one order and does not poll. Unmounting on close is what
          resets the two typed fields, so a driver who cancels and reopens does
          not find a stale waiting figure prefilled. */}
      {isConfirmOpen ? (
        <JobSheetConfirmDialog
          job={job}
          onClose={() => setIsConfirmOpen(false)}
          // The success path: close the dialog and resync the sheet in *this*
          // component's transition, so `isPending` — and with it the disabled
          // `Mark delivered` button behind the dialog — stays true until the
          // new server render commits. See the `useTransition` comment above.
          onCompleted={() => {
            setIsConfirmOpen(false);
            startTransition(() => {
              router.refresh();
            });
          }}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirm dialog                                                             */
/* -------------------------------------------------------------------------- */

export type JobSheetConfirmDialogProps = {
  job: HubJobSheet;
  /**
   * Dismissed without completing anything: Cancel, Escape or the overlay. The
   * order is untouched, so nothing needs refreshing.
   */
  onClose: () => void;
  /**
   * The delivery is `COMPLETED` server-side. **Closes the dialog and refreshes,
   * both in the action bar's transition** — this component does not do either
   * itself.
   *
   * The refresh has to belong to a component that outlives it. Closing here and
   * then calling this dialog's own `startTransition` would set `isRefreshing`
   * on an unmounting component, where React drops it: the bar's `isPending`
   * would never rise, `Mark delivered` would be pressable again the instant the
   * request resolved, and a second press during the refresh window would open
   * this dialog over a job the server has already closed — a guaranteed 409 the
   * driver had no way to see coming. The parent owns the flag; see
   * `JobSheetActionBar`.
   */
  onCompleted: () => void;
};

/**
 * "Confirm delivery" — the irreversible step, and the only place in the product
 * that captures waiting time.
 *
 * ## Why there is a form here at all
 *
 * `POST /api/orders/[id]/complete` **requires** `waitingMinutes` and returns
 * 400 without it, and no other screen collects it. That is not an API quirk to
 * paper over with a hard-coded zero: the figure decides `overtimeFee`, which is
 * what the client is billed for the driver's time at the kerb, and
 * `overtimeDriverPayout`, which is the driver's commissioned share of it. A
 * dialog that silently sent `0` would quietly waive the driver's own overtime on
 * every delivery.
 *
 * A field asks a driver to recall a number after the fact, which is the honest
 * weakness of this design; the alternative — a timer started on arrival — needs
 * an arrival timestamp, and `Order` has no column for one. The field is the
 * option that does not require inventing data.
 *
 * `receivedBy` is genuinely optional at both ends: the route treats absent,
 * `null` and an empty string identically, and a driver who did not catch the
 * recipient's name must still be able to close the job. It is **not** proof of
 * delivery — v1 captures no photo and no signature, and the `COMPLETED`
 * transition is what proves the delivery. It is a record of what the driver
 * reported.
 *
 * ## `data-admin-surface` on `DialogContent`
 *
 * Required. Radix portals dialog content to the document body, outside the
 * `DriverHubShell` root that carries the attribute — and with it the light
 * pin that makes `bg-muted` / `bg-card` / `border-border` resolve to the hub's
 * palette rather than the marketing site's. Nothing errors without it; the
 * colours are just quietly wrong.
 */
export function JobSheetConfirmDialog({
  job,
  onClose,
  onCompleted,
}: JobSheetConfirmDialogProps) {
  const router = useRouter();

  /**
   * The waiting figure as a **string**, not a number.
   *
   * A numeric state would have to represent "the box is empty" as something,
   * and every candidate is wrong: `0` silently answers the question for the
   * driver, `NaN` renders as "NaN", and `null` fights a controlled input. The
   * string is what the driver typed, and it is validated once, on submit.
   *
   * Defaulted to "0" because that is the design's default and because it is the
   * true answer for the majority of deliveries — but it is a prefilled default
   * the driver can clear, not a value they cannot avoid sending.
   */
  const [waitingMinutes, setWaitingMinutes] = React.useState("0");
  const [receivedBy, setReceivedBy] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  /**
   * The **409 resync only**, and nothing else.
   *
   * A refusal is the one case where this dialog stays mounted across a refresh
   * — it keeps the driver's typed figures and the reason the press failed — so
   * it is the one case where a transition owned here has a component left to
   * report into. The success path's refresh belongs to the action bar; see
   * `onCompleted`.
   */
  const [isRefreshing, startTransition] = React.useTransition();

  // The dialog must not be dismissable, and its inputs must not be editable,
  // while the request that closes the job is in flight — a dialog torn down
  // mid-submit leaves the eventual answer nowhere to render.
  const isBusy = isSubmitting || isRefreshing;

  async function handleConfirm() {
    const trimmed = waitingMinutes.trim();

    if (!WHOLE_MINUTES.test(trimmed)) {
      setError("Enter the waiting time as a whole number of minutes, or 0.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    let response: Response;

    try {
      response = await fetch(`/api/orders/${job.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waitingMinutes: Number(trimmed),
          // Sent as typed; the route trims it and collapses an empty string to
          // `null`, so an untouched box records "not captured" rather than an
          // empty name. Sending it unconditionally — rather than omitting the
          // key when blank — keeps one request shape.
          receivedBy,
        }),
      });
    } catch {
      setError(NETWORK_ERROR);
      setIsSubmitting(false);
      return;
    }

    if (!response.ok) {
      setError(await refusalMessage(response, COMPLETE_GENERIC_ERROR));
      setIsSubmitting(false);

      // The order is no longer `IN_TRANSIT` — completed from another device, or
      // cancelled underneath this driver. The dialog stays open carrying the
      // reason, and the sheet behind it resyncs; see the module comment.
      if (response.status === 409) {
        startTransition(() => {
          router.refresh();
        });
      }

      return;
    }

    // The order is `COMPLETED` server-side at this point. Handing the close and
    // the refresh to the parent in one call is what keeps them a single busy
    // window: leaving this dialog up over the refresh would offer a second,
    // guaranteed-409 submit, and closing it here while refreshing on *this*
    // component's transition would leave the bar behind it pressable for the
    // same stretch. See `onCompleted`.
    onCompleted();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Escape, the overlay and Cancel all arrive here alike; none of them may
        // interrupt a request already in flight.
        if (!open && !isBusy) {
          onClose();
        }
      }}
    >
      <DialogContent
        // Portalled outside the shell — see the doc comment above.
        data-admin-surface=""
        showCloseButton={false}
        className="gap-0 p-[22px] sm:max-w-[440px]"
        onEscapeKeyDown={(event) => {
          if (isBusy) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (isBusy) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="gap-1.5">
          <DialogTitle className="text-base font-semibold tracking-[-0.01em]">
            Confirm delivery
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.5]">
            This ends the job and cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {/* Names the stop, so a driver running several jobs can see they are
            closing the right one before they close it. The drop-off address
            rather than the city: two deliveries in one afternoon are routinely
            both "Tbilisi". */}
        <dl className="mt-4.5 grid grid-cols-[76px_1fr] gap-x-3 gap-y-2 rounded-lg border border-border bg-muted p-3.5 text-[13px]">
          <dt className="text-muted-foreground">Load</dt>
          <dd className="min-w-0 truncate font-price">{job.reference}</dd>
          <dt className="text-muted-foreground">Drop-off</dt>
          <dd className="min-w-0 leading-[1.4] break-words">
            {job.dropoffAddress}
          </dd>
        </dl>

        <div className="mt-4.5 flex flex-col gap-[7px]">
          <Label htmlFor="job-sheet-waiting" className="text-[13px]">
            Waiting time
          </Label>
          <div className="flex items-center gap-2.5">
            <Input
              id="job-sheet-waiting"
              // `type="text"` with a numeric keypad rather than
              // `type="number"`: a number input accepts "1e3" and "-" as
              // intermediate values, silently reports an empty string for
              // anything it considers invalid (so the driver's own typo becomes
              // invisible to this component), and adds spinners nobody uses on a
              // phone. `inputMode` gets the keypad without any of that.
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={waitingMinutes}
              onChange={(event) => setWaitingMinutes(event.target.value)}
              disabled={isBusy}
              aria-describedby="job-sheet-waiting-help job-sheet-waiting-pay"
              className="h-11 w-22 font-price text-[15px] tabular-nums"
            />
            <span className="text-[13px] text-muted-foreground">minutes</span>
          </div>
          <p
            id="job-sheet-waiting-help"
            className="text-xs leading-[1.45] text-muted-foreground"
          >
            Whole minutes spent waiting at either stop. Enter 0 if none.
          </p>
          {/* **That** it changes the driver's pay, never *by how much*.
              `complete` computes the overtime server-side from the vehicle
              type's own `freeLoadingMinutes` and `overtimeRatePerMinute`, and
              this screen holds neither — `HubJobSheet` carries no pricing rule,
              and `overtimeFee` is a client-side figure a driver may not see at
              all. A preview here would therefore be a number this component
              guessed, printed beside a field a driver is filling in because it
              decides their pay, and reconciled to a different one a second
              later. The artboards do draw such a line and badge it as sample
              data; it is left out, because a breakdown quoting figures no
              stored value supported has been refused twice in this product's
              history and this would be the third. What is honest — and what a
              driver actually needs to know before answering — is the direction:
              this number is not admin, it is money. */}
          <p
            id="job-sheet-waiting-pay"
            className="text-xs leading-[1.45] text-muted-foreground"
          >
            Waiting time beyond the free allowance adds an overtime payout to
            this job, so this figure affects what you are paid.
          </p>
        </div>

        <div className="mt-4.5 flex flex-col gap-[7px]">
          <Label htmlFor="job-sheet-received-by" className="text-[13px]">
            Received by (optional)
          </Label>
          <Input
            id="job-sheet-received-by"
            type="text"
            autoComplete="off"
            value={receivedBy}
            onChange={(event) => setReceivedBy(event.target.value)}
            disabled={isBusy}
            // The route's own cap, restated at the input so the box simply
            // stops accepting characters rather than letting a driver type past
            // it and collecting a 400 on the one request that closes the job.
            // Matched to `MAX_RECEIVED_BY_LENGTH` in `complete/route.ts`; the
            // server check is the boundary and stays.
            maxLength={RECEIVED_BY_MAX_LENGTH}
            placeholder="Name of whoever took the goods"
            className="h-11 text-sm"
          />
        </div>

        {/* Always mounted, for the reason the action bar's region states. */}
        <p
          role="status"
          aria-live="polite"
          className="mt-4 text-[13px] text-destructive empty:hidden"
        >
          {error}
        </p>

        {/* The design's split — Cancel at `flex:1`, the primary at `flex:1.6` —
            following `loads-claim-dialogs.tsx`'s precedent for the other
            irreversible confirmation in this product. Both are 44px, the phone
            floor: they sit inside a dialog rather than in the pinned bar, so
            neither is the 56px thumb target. */}
        <div className="mt-[18px] flex gap-2.5">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 text-sm font-medium"
            disabled={isBusy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 flex-[1.6] text-sm font-medium"
            disabled={isBusy}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {isBusy ? "Confirming…" : "Confirm delivery"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/*
 * There is deliberately no `JobSheetActionBarSpacer` here.
 *
 * An earlier draft of this file pinned the bar with `position: fixed`, which
 * takes it out of flow and floats it over the last card, so it needed an
 * invisible 68px box at the end of the column to push the content clear — a
 * height that had to be kept in step by hand with a button, its padding and a
 * safe-area inset it could not measure. The bar is `sticky` now (see
 * `JobSheetActionBar`), which occupies its own space in the column, so the
 * spacer has nothing left to compensate for and is gone rather than left
 * rendering an empty box.
 */
