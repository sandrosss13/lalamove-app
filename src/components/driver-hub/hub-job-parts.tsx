"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The facts two hub screens both state about **one order**, in the one place
 * that decides how they are stated.
 *
 * ## Why this module exists
 *
 * Job history (`jobs-detail-panel.tsx`) and the driver's Job sheet
 * (`screens/job-sheet-*.tsx`) describe the same row to the same person at two
 * different moments: the panel is a record of a job that is over, the sheet is
 * the working document of a job in progress. They are laid out nothing alike
 * and they should not be — but three things they say are *the same claim*, and
 * a claim that lives in two files is a claim that drifts:
 *
 * - **which three timeline points exist, and which of them have happened.**
 *   `Order` has no `acceptedAt`, `claimedAt`, `dispatchedAt` or `cancelledAt`
 *   column, so exactly three steps are truthful and the rule for "done" is
 *   "its timestamp exists". Two copies of that rule is two chances to draw a
 *   fourth step from a timestamp that does not mean what it is labelled.
 * - **how many payout lines a job has, and what the second one is called.**
 *   A payout is one commissioned lump plus, sometimes, an overtime share, and
 *   the label on the second line has to name the minutes that produced it.
 * - **when a stored phone number becomes a `tel:` link.** Free text a client
 *   typed reaches these screens as anything from `+995 555 12 34 56` to
 *   `ask for Nino`, and the fallback for the unusable case is a decision, not
 *   a formatting detail.
 *
 * This is the same discipline `loads-detail-parts.tsx` applies to the load
 * board's two detail surfaces, and it exists for the same recorded reason: on
 * that feature the duplication had already shipped a compliance advisory to
 * desktop only, and its doc comment's conclusion — *"a sentence that lives in
 * only one of these files is a sentence half the drivers never read"* — is the
 * rule this module extends to the job pair.
 *
 * ## What deliberately does NOT belong here
 *
 * **Either screen's layout.** The panel draws its timeline as dots with the
 * time right-aligned on the label row, and its contacts as a bordered
 * label/value list; the job sheet draws a connected vertical rail with the
 * timestamp stacked under the label, and its contacts as a 96px definition
 * grid inside a stop card. Both are correct for their surface — the panel is a
 * dense column beside a table, the sheet is a phone screen read one-handed —
 * and folding them together behind a `variant` prop would preserve the
 * difference while hiding the reason for it.
 *
 * So the split is the one that module already argued for: **what a job says
 * lives here; how a screen shows it stays with the screen.** The builders below
 * return data, not markup, and the one component here renders a single link
 * whose *decision* (link or plain text) is the shared part.
 */

/* -------------------------------------------------------------------------- */
/* Phone numbers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A stop contact's phone as a `tel:` URI, or `null` when it cannot be dialled.
 *
 * The number is free text a client typed, so it reaches here as anything from
 * `+995 555 12 34 56` to `ask for Nino`. Everything but the digits is dropped,
 * because the rest is punctuation a dialler would have to strip anyway and
 * leaving it in a URI means percent-encoding it for nothing.
 *
 * The one exception is a `+` appearing anywhere *before the first digit*, which
 * is kept: it is the international prefix however the client punctuated around
 * it, so `(+995) 555 12 34 56` must dial `+995…` and not a number that reads as
 * national. A `+` that follows digits is not a dialling prefix — it is a note
 * the client appended, as in `555 12 34 56 (+ ask for Nino)` — and is dropped
 * with the rest of the punctuation.
 *
 * `null` for anything with no digits in it at all: a `tel:` link that dials
 * nothing is worse than plain text, because it looks tappable and is not. The
 * caller prints the client's words instead, unlinked.
 *
 * Moved here from `jobs-format.ts`, which is Job history's *display* module and
 * was never the right home for it: this is a parsing rule about a stored value,
 * not a locale- or timezone-pinned formatter, and it is the one piece of that
 * module a second screen needed. The per-screen formatter convention that keeps
 * `jobs-format.ts` and `loads-format.ts` from importing each other's clocks
 * still holds — this simply is not one of those.
 */
export function toTelHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");

  if (digits === "") {
    return null;
  }

  return `tel:${/^[^\d]*\+/.test(phone) ? "+" : ""}${digits}`;
}

export type StopPhoneLinkProps = {
  /** The stored number, exactly as the client typed it. */
  phone: string;
  /** Classes for the rendered element — link and fallback alike. */
  className?: string;
};

/**
 * A stop's phone number: a `tel:` link when it can be dialled, the client's own
 * words when it cannot.
 *
 * **The number is always shown as selectable text, and that is the point of
 * rendering the digits rather than a "Call" word here.** Drivers routinely copy
 * a number into WhatsApp instead of dialling it, so an icon button that only
 * fires an intent would take a capability away. Screens that also want a
 * full-width Call *action* put one beside this, rather than replacing it.
 *
 * One component rather than a `toTelHref` call at each site because the
 * fallback is the half that gets forgotten: a bare `<a href={toTelHref(...)!}>`
 * type-checks, renders, and dials nothing on the minority of rows where the
 * stored value has no digits in it.
 */
export function StopPhoneLink({ phone, className }: StopPhoneLinkProps) {
  const telHref = toTelHref(phone);

  if (telHref === null) {
    return <span className={className}>{phone}</span>;
  }

  return (
    <a
      href={telHref}
      className={cn(
        "underline-offset-2 hover:text-foreground hover:underline",
        className,
      )}
    >
      {phone}
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* -------------------------------------------------------------------------- */

/** Whether a step has happened, is the one being waited on, or is ahead. */
export type HubTimelineStepState = "done" | "current" | "pending";

export type HubTimelineStep = {
  /**
   * Stable key, so a screen can attach its own per-step copy (the panel's
   * address sub-line, say) without matching on the display label.
   */
  id: "placed" | "picked-up" | "dropped-off";
  label: string;
  /** The moment it happened, ISO, or `null` if it has not. */
  at: string | null;
  state: HubTimelineStepState;
};

export type HubTimelineInput = {
  /** When the client booked the order. Always present. */
  createdAt: string;
  /** When the driver started the delivery, or null before they have. */
  inTransitAt: string | null;
  /** When the driver completed it, or null before they have. */
  completedAt: string | null;
  /**
   * Whether the job is still going — i.e. not cancelled and not finished.
   *
   * A parameter rather than something derived here, because the two callers
   * hold the status in two different vocabularies: Job history has
   * `HubJobStatus`, the display mapping, and the job sheet has the raw
   * `OrderStatus` it needs to gate its action buttons. Asking each for the one
   * boolean this builder cares about is cheaper than teaching the builder both
   * enums, and it keeps `HubJobStatus`'s lossy PENDING/CLAIMED/ACCEPTED collapse
   * out of a module the job sheet depends on.
   */
  running: boolean;
};

/**
 * The three real steps, in order, with the state each one is in.
 *
 * **There are three and there can only be three.** `Order` records
 * `createdAt` (the client booked it), `inTransitAt` (the driver started) and
 * `completedAt` (the driver finished), and nothing else about a job's
 * progress: there is no `acceptedAt`, no `claimedAt`, no `dispatchedAt` and no
 * `cancelledAt` column. The design handoffs for both screens draw more steps
 * than that — Job history's draws four, including a "Stop 1 delivered" leg that
 * cannot exist on a single-pickup/single-dropoff booking — and neither screen
 * draws them, because every extra step would have to be labelled for a
 * timestamp that means something else.
 *
 * A step is *done* when its timestamp exists; that is the only evidence there
 * is that it happened. The first step without one is *current*, but only while
 * the job is still going: a cancelled job is waiting on nothing, so painting
 * its unreached steps as "next" would promise a pickup that is never coming.
 *
 * The labels name what each timestamp actually is. The first is "Order placed"
 * and not "Order accepted", because `createdAt` is when the *client* booked —
 * borrowing the design's "accepted" would attribute the client's action to the
 * driver and date it wrongly.
 */
export function buildHubTimeline({
  createdAt,
  inTransitAt,
  completedAt,
  running,
}: HubTimelineInput): HubTimelineStep[] {
  const steps: Omit<HubTimelineStep, "state">[] = [
    { id: "placed", label: "Order placed", at: createdAt },
    { id: "picked-up", label: "Picked up", at: inTransitAt },
    { id: "dropped-off", label: "Dropped off", at: completedAt },
  ];

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
/* Payout lines                                                               */
/* -------------------------------------------------------------------------- */

export type HubPayoutLine = { label: string; amountGel: number };

export type HubPayoutInput = {
  /** `Order.driverPayout` — the carrier's share, commissioned at booking. */
  driverPayout: number;
  /** `Order.overtimeDriverPayout` — their share of the waiting charge. */
  overtimeDriverPayout: number;
  /** `Order.waitingMinutes` — null until the delivery is completed. */
  waitingMinutes: number | null;
};

/**
 * What a job pays its carrier, in the at most two lines that side of it has —
 * no line is estimated and none is invented.
 *
 * **The collapse to two lines is a fact about the data, not a simplification.**
 * A payout is one commissioned lump taken off the whole client-paid total,
 * stored once at booking, so there is no per-component carrier figure to print.
 * There is no "carrier's base fare" and no "carrier's distance fare"; splitting
 * the payout back into pro-rata shares of the client's `baseFare`,
 * `distanceFare`, `timeFare` and `helperFee` would be inventing an itemisation
 * the platform never computed — on two screens whose whole discipline is that
 * every figure is a column on `Order`. Those columns are what the **client**
 * pays and neither screen's loader selects them.
 *
 * The overtime line is conditional on the *amount*, not on `waitingMinutes`: a
 * job that waited but stayed inside the vehicle type's free loading allowance
 * earns nothing extra, and a zero line would invite the reader to look for a
 * charge that is not there. The label carries the minutes when there are any,
 * so the reason for the second line stays visible.
 *
 * ## One word of copy was harmonised here, deliberately
 *
 * Job history shipped this label as "Overtime payout · 24 min **loading**",
 * after `PricingRule.freeLoadingMinutes`, the column the allowance comes from.
 * The job sheet's confirmation dialog — the only place in the product that
 * *captures* the figure — labels its field "Waiting time" and explains it as
 * "whole minutes spent waiting at either stop", and the stored column is
 * `Order.waitingMinutes`. Printing back "24 min loading" for a number the
 * driver entered under "Waiting time" would name one quantity two ways on two
 * screens the same person reads. The shared string follows the input and the
 * column: **waiting**.
 */
export function buildHubPayoutLines({
  driverPayout,
  overtimeDriverPayout,
  waitingMinutes,
}: HubPayoutInput): HubPayoutLine[] {
  const lines: HubPayoutLine[] = [
    { label: "Payout", amountGel: driverPayout },
  ];

  if (overtimeDriverPayout !== 0) {
    lines.push({
      label:
        waitingMinutes === null
          ? "Overtime payout"
          : `Overtime payout · ${waitingMinutes} min waiting`,
      amountGel: overtimeDriverPayout,
    });
  }

  return lines;
}
