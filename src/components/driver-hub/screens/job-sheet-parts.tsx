"use client";

import * as React from "react";
import { Navigation, Phone } from "lucide-react";
import Link from "next/link";

import { HubCard, HubStatusBadge } from "@/components/driver-hub/hub-primitives";
import { HUB_STATUS_TONE_CLASSES } from "@/components/driver-hub/hub-status";
import {
  StopPhoneLink,
  buildHubPayoutLines,
  buildHubTimeline,
  toTelHref,
  type HubTimelineStepState,
} from "@/components/driver-hub/hub-job-parts";
import {
  CargoSpecList,
  HandlingTagPills,
  LoadComplianceNotes,
  RouteStopMarker,
  type RouteStopMarkerKind,
} from "@/components/driver-hub/screens/loads-detail-parts";
import {
  EM_DASH,
  formatAbsoluteDateTime,
  formatAbsoluteWindow,
  formatClock,
  formatDistanceKm,
} from "@/components/driver-hub/screens/loads-format";
import {
  NAVIGATION_UNAVAILABLE_NOTE,
  detectMapsPlatform,
  mapsHandoffHref,
  toNavigationDestination,
  type MapsPlatform,
  type NavigationDestination,
} from "@/components/driver-hub/screens/job-sheet-navigate";
import { formatGel } from "@/components/driver-hub/screens/jobs-format";
import { Button } from "@/components/ui/button";
import type { HubJobSheet } from "@/lib/dashboard/hub/job-sheet";
import { cn } from "@/lib/utils";

/**
 * The cards the driver's Job sheet (`/dashboard/jobs/[id]`) is built from.
 *
 * Presentation only: nothing here fetches, mutates or holds state beyond what
 * React needs to render. The two transitions live in `job-sheet-actions.tsx`,
 * the arrangement of these cards per status lives in `job-sheet-screen.tsx`,
 * and the data lives in `src/lib/dashboard/hub/job-sheet.ts`.
 *
 * ## This screen is phone-first, and that inverts the rest of the hub
 *
 * Every other driver-hub screen is desktop-first with a phone pass — `lg:`
 * appears dozens of times across the hub and `max-*:` appears nowhere. **This
 * one is written the other way round on purpose**: the base classes below are
 * the 390px phone layout and `lg:` is the desktop adjustment. A driver reads a
 * job sheet standing at a loading bay or sitting in a cab, one-handed, in
 * daylight, possibly gloved — not at a desk. Concretely that means:
 *
 * - **44px is the floor on every control here**, and the two state-changing
 *   actions are 56px (see `job-sheet-actions.tsx`). No 36px/40px desktop
 *   control from the load board's drawer is reused at these sizes.
 * - **The primary action is pinned to the bottom of the viewport**, not buried
 *   at the end of a scroll. Also `job-sheet-actions.tsx`.
 * - **`tel:` is a full-width row**, not an inline link inside a sentence.
 * - The number is *also* shown as selectable text, because drivers routinely
 *   copy it into WhatsApp rather than dialling — see `StopPhoneLink`.
 *
 * Do not "bring this into line" with the rest of the hub. The inversion is the
 * design decision, and it is recorded in the handoff
 * (`design_handoff_driver_job_sheet/README.md`, "The critical departure").
 *
 * ## One tree, not two
 *
 * There is no JS viewport detection anywhere in this feature — the load board
 * established that rule and this screen keeps it. But where the board mounts a
 * desktop tree and a mobile tree simultaneously and lets CSS pick, this screen
 * mounts **one** tree and lets CSS re-place it, because its phone and desktop
 * artboards are the same five cards in two arrangements rather than two
 * different documents. That is also why there is no `Sheet` here and therefore
 * none of the `modal={false}` / `lg:hidden`-on-both-portals machinery
 * `loads-detail-sheet.tsx` documents: the one portalled surface is the delivery
 * confirmation `Dialog`, which is the same dialog at every width.
 *
 * ## Colour
 *
 * The artboards spell out `oklch(…)` because they are standalone HTML with no
 * Tailwind build. **Almost nothing here does.** Every colour goes through the
 * existing semantic tokens (`border-border`, `text-muted-foreground`,
 * `bg-card`, `bg-muted`, `bg-primary`) or, for the status pill and the
 * picked-up strip's check mark, through `hub-status.ts`'s six tone pairs —
 * which is where the artboards' pill colours came from in the first place.
 *
 * **The two literals that remain are both in `TIMELINE_DOT_CLASSES`, and
 * neither has a map to go through.** The *done* dot needs the success tone's
 * *foreground* colour as a **background**, and `HUB_STATUS_TONE_CLASSES` only
 * offers the paired `bg-…`/`text-…` string, so spreading it would paint the dot
 * the pale ground instead of the green. The *current* dot is the brand accent,
 * which has no token at all: ten other hub files (`hub-primitives.tsx`,
 * `driver-hub-sidebar.tsx`, `jobs-detail-panel.tsx` and the rest) spell
 * `oklch(64% 0.19 48)` out exactly this way, so matching them is what keeps
 * this dot the same orange as the one Job history draws for the same step.
 *
 * Anywhere else, a literal `oklch` in this file would be a colour no other hub
 * file knows to change.
 */

/* -------------------------------------------------------------------------- */
/* Shared class strings                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The 11px uppercase label above every section and beside every stop.
 *
 * `tracking-[0.08em]`, matching `MetricTile`'s label in `hub-primitives.tsx`
 * and the artboards — **not** `loads-detail-parts.tsx`'s exported
 * `SECTION_LABEL_CLASSES`, which is the same size and weight at `0.06em`. The
 * hub uses both: 0.06em on a heading over a block of prose, 0.08em on a label
 * naming a value. Every label on this screen is the second kind ("You are
 * paid", "Timing", "Pick-up", "Cargo"), so it is spelled locally rather than
 * imported and then overridden, which would leave the wrong tracking in the
 * merge order half the time.
 */
const LABEL_CLASSES =
  "text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase";

/**
 * The two-column definition grid: a 96px label rail and the value beside it.
 *
 * Character-identical to `CargoSpecList`'s own grid in
 * `loads-detail-parts.tsx`, deliberately — the cargo card on this screen *is*
 * that component, and the timing and contact grids above it have to line their
 * labels up with it or the card stack reads as three different tables.
 */
const SPEC_GRID_CLASSES =
  "grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-[13px]";

/** Numerals: IBM Plex Mono with figures locked to one width. */
const NUMERIC_CLASSES = "font-price tabular-nums";

/**
 * The minimum touch target for a secondary control on this screen.
 *
 * 44px — the hub's stated floor, and the same constant `loads-detail-sheet.tsx`
 * applies to the one other phone-first surface in the product. The two
 * *state-changing* actions are taller still; see `job-sheet-actions.tsx`.
 */
const TOUCH_TARGET_CLASSES = "h-11 flex-1 gap-2 text-sm font-medium";

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every figure on this screen is formatted by `jobs-format.ts`'s `formatGel` —
 * two decimals, always.
 *
 * A cross-screen import, and the exception that proves the hub's
 * one-formatter-module-per-screen rule rather than a hole in it. That rule
 * exists so two screens cannot print one *instant* two ways; the rule it does
 * not state is that a driver should see their own pay quoted to two different
 * precisions depending on which screen they opened.
 *
 * The load board's `formatGel` rounds to whole lari because a column of figures
 * is being *scanned* there, and its `formatGelExact` prints "₾190" for a whole
 * payout. Neither is right here: this is the "what am I owed for this job"
 * screen, it sits one tap from Job history's identical two-line breakdown of
 * the same order, and `driverPayoutFor` rounds to tetri rather than to lari
 * (`src/lib/pricing.ts`) so fractional payouts are routine. `formatGel` from
 * the sibling job screen prints the tetri that are actually there and prints
 * them the same way on both screens.
 *
 * **The money rule, restated where it is easiest to break.** The only two money
 * columns on this screen are `driverPayout` and `overtimeDriverPayout`.
 * `price`, `baseFare`, `distanceFare`, `timeFare`, `helperFee`, `overtimeFee`
 * and `serviceLevelAdjustment` are what the *client* pays; they are not on
 * `HubJobSheet`, its loader does not select them, and reaching for one here is
 * a compile error rather than a rule to remember.
 */

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The raw `OrderStatus` as a pill: the vocabulary word `hub-status.ts` knows,
 * plus the word the design prints.
 *
 * The two are separated because they disagree exactly once. The design's
 * completed copy is **"Delivered"**, which is not a key in `TONE_BY_STATUS` and
 * would fall silently through to the neutral grey used for Scheduled — the one
 * failure mode that mapper's `?? "neutral"` fallback is designed to be safe
 * about and is not, here, because a delivered job would then look identical to
 * a scheduled one. So the tone is looked up from "Completed" and the label
 * overrides it, which is precisely what `HubStatusBadge`'s `label` prop exists
 * for.
 *
 * `PENDING`, `CLAIMED` and `ACCEPTED` all read "Scheduled". That is the same
 * collapse `toHubJobStatus` performs, and it is right *for the pill*: the
 * difference between them is dispatch mechanics no driver acts on. It is not
 * right for the buttons, which is why `HubJobSheet` carries the raw enum and
 * this function is the only place the collapse happens on this screen.
 */
export function jobSheetStatusPill(status: HubJobSheet["status"]): {
  tone: string;
  label: string;
} {
  switch (status) {
    case "IN_TRANSIT":
      return { tone: "In transit", label: "In transit" };
    case "COMPLETED":
      return { tone: "Completed", label: "Delivered" };
    case "CANCELLED":
      return { tone: "Cancelled", label: "Cancelled" };
    default:
      return { tone: "Scheduled", label: "Scheduled" };
  }
}

/* -------------------------------------------------------------------------- */
/* Navigate                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Which map app this device should be handed off to, resolved after mount.
 *
 * **`"web"` during render, always.** `detectMapsPlatform` reads
 * `navigator.userAgent`, which does not exist on the server, so a component
 * that called it while rendering would emit one href on the server and a
 * different one on the client's first pass — a hydration mismatch on a link a
 * driver is about to tap. `job-sheet-navigate.ts` documents this requirement on
 * the function itself; this hook is the one place the screen satisfies it.
 *
 * The consequence is small and deliberate: for one frame after mount an iPhone
 * holds the Google Maps web URL, and then swaps to `maps://`. Both work.
 */
function useMapsPlatform(): MapsPlatform {
  const [platform, setPlatform] = React.useState<MapsPlatform>("web");

  React.useEffect(() => {
    setPlatform(detectMapsPlatform());
  }, []);

  return platform;
}

type StopNavigateActionProps = {
  /** The stop's four navigable columns, resolved by the shared module. */
  destination: NavigationDestination;
  /** The stop's address, for the link's accessible name. */
  address: string;
};

/**
 * The Navigate half of a stop's action row — a link, or the unavailable state.
 *
 * **The URL is `job-sheet-navigate.ts`'s and nothing here computes one.** This
 * file used to carry its own `navigateHref`, a coordinates-only Google Maps
 * link, alongside that module's platform-branching resolver — two answers to
 * "where does Navigate send the driver" in one feature, which is exactly the
 * failure the handoff exists to prevent. The module won because it is a strict
 * superset: it branches Apple Maps / Google Maps by platform, it range-checks a
 * coordinate pair before trusting it (a transposed lat/lng is two plausible
 * numbers and one confident instruction to drive to the wrong country), and —
 * the part the local copy could not do at all — it falls back to the stop's
 * **address text**, disambiguated by city.
 *
 * That fallback changes what this component renders, and for the better. The
 * old helper returned `null` for every order with no coordinates — every seeded
 * order, and any real one whose pair was never stored — so the dashed
 * "unavailable" box stood in for stops that were perfectly navigable by their
 * address text. `toNavigationDestination` returns
 * `"unavailable"` only when a stop has *neither* a usable point *nor* any
 * address text — very nearly never — so a driver on a coordinate-less order now
 * gets a working address search instead of a dead box, which is what the
 * artboards specify ("No coordinates stored — opens a map search on the address
 * text").
 *
 * The unavailable state that remains is a dashed, muted, **non-interactive**
 * box rather than a `disabled` `Button`. A disabled button is the right control
 * for something that will become available (the load board's Accept while a
 * request is in flight); this will not. It keeps the row's geometry so the Call
 * button does not stretch to full width and change shape between one stop and
 * the next, and it carries an `sr-only` reason so the box is not simply silent
 * to a screen reader.
 */
function StopNavigateAction({ destination, address }: StopNavigateActionProps) {
  const platform = useMapsPlatform();
  const href = mapsHandoffHref(destination, platform);

  if (href === null) {
    return (
      <span
        className={cn(
          TOUCH_TARGET_CLASSES,
          "inline-flex items-center justify-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground",
        )}
      >
        <Navigation aria-hidden="true" className="size-4" />
        Navigate
        <span className="sr-only"> — unavailable. {NAVIGATION_UNAVAILABLE_NOTE}</span>
      </span>
    );
  }

  return (
    <Button asChild variant="outline" className={TOUCH_TARGET_CLASSES}>
      {/* Not a `next/link`: this leaves the app entirely, and the client router
          has nothing to prefetch or intercept for an external scheme.
          `rel="noreferrer"` because the referrer would carry this order's id in
          the path, and a map provider has no business with it. */}
      <a href={href} target="_blank" rel="noreferrer">
        <Navigation aria-hidden="true" className="size-4" />
        Navigate
        {/* The address is the label the design asks for, placed where it is
            useful rather than in a query parameter that would cost a
            coordinate's precision. See `toNavigationDestination`. */}
        <span className="sr-only"> to {address}</span>
      </a>
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/* Header card                                                                */
/* -------------------------------------------------------------------------- */

export type JobSheetHeaderCardProps = {
  job: HubJobSheet;
  /**
   * Passed straight to `HubCard`'s outer element. **Nothing passes one today.**
   *
   * There is no grid on this screen to place a card into: `job-sheet-screen.tsx`
   * renders every state as a single flex column, so the DOM order is the visual
   * order at both widths and no card needs an `order-*` or a `col-start-*` to
   * sit where it reads. Every card in this file accepts the prop for
   * consistency and forwards it unchanged; it is not a styling escape hatch,
   * and a caller passing colours or padding through here would be re-skinning a
   * card the whole screen shares.
   */
  className?: string;
  /**
   * Which of the three things this card may truthfully say about money.
   *
   * - `"quoted"` — the figure agreed at booking, on a job still to be run.
   *   `overtimeDriverPayout` is `0` and `waitingMinutes` is `null` at this
   *   point, not because the job earned no overtime but because the number
   *   that decides it is the one the driver has not reported yet, so no
   *   breakdown is drawn: it would print a total that is about to change, on
   *   the screen the driver is about to change it from.
   * - `"final"` — booking plus whatever the reported waiting minutes earned,
   *   with the breakdown, on a completed job where both halves are settled.
   * - `"none"` — **no figure at all**, for a cancelled job. `driverPayout`
   *   still holds whatever the job was commissioned at, and it is still a real
   *   stored column, but the job is not going to pay it. Printing it under
   *   "You are paid" would be the one genuinely dishonest number this screen
   *   could show, so the reference and the pill are all that is left that is
   *   true. The cancelled artboard draws exactly this.
   *
   * A three-way variant rather than a `showBreakdown` boolean because there are
   * three states and a boolean can only carry two — the cancelled case was the
   * one that had nowhere to go.
   */
  payout: "quoted" | "final" | "none";
};

/**
 * Reference, status and the money — the card at the top of every state.
 *
 * The headline is deliberately not summed with the overtime while the job is
 * running, and deliberately is once it is done: "You are paid" is the figure
 * quoted at booking and knowable now, "You were paid" is that plus whatever the
 * waiting minutes earned. The tense is doing real work, so both strings are
 * spelled out rather than one being derived from the other.
 */
export function JobSheetHeaderCard({
  job,
  payout,
  className,
}: JobSheetHeaderCardProps) {
  const pill = jobSheetStatusPill(job.status);
  const lines = buildHubPayoutLines(job);
  const isFinal = payout === "final";

  // Summed only in the completed branch, where both halves are final. The
  // loader keeps them apart for exactly this reason — see `HubJobSheet`.
  const total = isFinal
    ? job.driverPayout + job.overtimeDriverPayout
    : job.driverPayout;

  return (
    <HubCard className={className} contentClassName="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            NUMERIC_CLASSES,
            "min-w-0 truncate text-[13px] font-medium text-muted-foreground",
          )}
        >
          {job.reference}
        </span>
        <HubStatusBadge
          status={pill.tone}
          label={pill.label}
          className="flex-none"
        />
      </div>

      {payout === "none" ? null : (
        <div className="flex flex-col gap-1">
          <p className={LABEL_CLASSES}>
            {isFinal ? "You were paid" : "You are paid"}
          </p>
          <p
            className={cn(
              NUMERIC_CLASSES,
              "text-[26px] leading-none font-semibold tracking-[-0.02em]",
            )}
          >
            {formatGel(total)}
          </p>
        </div>
      )}

      {/* One line on a job that finished inside the free loading allowance, two
          when the waiting minutes earned something. Suppressed entirely at a
          single line: a "Payout" row restating the headline immediately above
          it is a rule and a repetition, not a breakdown. */}
      {isFinal && lines.length > 1 ? (
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-[7px] border-t border-border pt-3 text-[13px]">
          {lines.map((line) => (
            <React.Fragment key={line.label}>
              <dt className="min-w-0 text-muted-foreground">{line.label}</dt>
              <dd className={cn(NUMERIC_CLASSES, "text-right")}>
                {formatGel(line.amountGel)}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
    </HubCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Timing card                                                                */
/* -------------------------------------------------------------------------- */

/**
 * When the client wants the load moved: the requested slot, the window they
 * will release it in, and the time it has to arrive by.
 *
 * High in the phone stack — directly under the money — because it is the most
 * common reason a driver opens the sheet at all: before setting off, to check
 * what time they are due somewhere.
 *
 * All three are nullable and all three print an em dash rather than being
 * omitted, which is the opposite of this codebase's usual rule for absent
 * values. It is deliberate here: the three labels are the *question* a driver
 * is asking, and a card that silently loses its "Deadline" row reads as "there
 * is no deadline on this screen" rather than "no deadline was set". Three
 * stable rows answer the question either way.
 *
 * Absolute spellings throughout — "10 Sep 07:30", never "Today 07:30". A
 * relative label needs a "now" to compare against, and a job sheet is a screen
 * a driver leaves open in a cab across Tbilisi midnight; `formatAbsoluteWindow`
 * and `formatAbsoluteDateTime` are the shared formatters that already made this
 * call for the claim dialogs, for the same reason.
 */
export function JobSheetTimingCard({
  job,
  className,
}: {
  job: HubJobSheet;
  className?: string;
}) {
  const rows = [
    { label: "Pick-up", value: formatAbsoluteDateTime(job.scheduledAt) },
    {
      label: "Window",
      value: formatAbsoluteWindow(job.pickupWindowStart, job.pickupWindowEnd),
    },
    { label: "Deadline", value: formatAbsoluteDateTime(job.deliveryDeadline) },
  ];

  return (
    <HubCard className={className} contentClassName="flex flex-col gap-3">
      <h2 className={LABEL_CLASSES}>Timing</h2>
      <dl className={SPEC_GRID_CLASSES}>
        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "min-w-0",
                // An em dash is an absence, not a figure: it takes neither the
                // mono face nor the foreground colour, so a card of unset rows
                // reads as unset at a glance rather than as data.
                row.value === EM_DASH
                  ? "text-muted-foreground"
                  : NUMERIC_CLASSES,
              )}
            >
              {row.value}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </HubCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Stop card                                                                  */
/* -------------------------------------------------------------------------- */

export type JobSheetStopCardProps = {
  /** "Pick-up" or "Drop-off" — rendered uppercase by CSS, not by the string. */
  label: string;
  marker: RouteStopMarkerKind;
  city: string | null;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  /** Block, floor or room — free text, as the schema stores it. */
  contactDetails: string | null;
  lat: number | null;
  lng: number | null;
  /**
   * Whether this is the stop the driver is currently heading for.
   *
   * The two stops carry the same information and differ only in weight: while
   * the job is `ACCEPTED` the pick-up is prominent and the drop-off is the
   * next thing; once it is `IN_TRANSIT` the drop-off is the whole job. The
   * difference is type size on the city and the muting of the subordinate
   * stop's actions — not hiding anything, because a driver at the pick-up
   * still sometimes needs to ring ahead to the drop-off.
   */
  prominent: boolean;
  /** Forwarded to `HubCard`, and unused today. See `JobSheetHeaderCardProps`. */
  className?: string;
};

/**
 * One end of the trip, with the phone number the driver came here for.
 *
 * ## Why this is not `loads-drawer.tsx`'s or `loads-detail-sheet.tsx`'s stop
 *
 * Those two render a stop as a marker, a label/city pair and a truncated or
 * wrapped address with a *time* beside it — a stop as a thing to evaluate
 * before claiming. This one is a stop as a place to go: it carries the contact
 * and the two actions, and it carries no time at all (the Timing card above
 * holds all three timestamps in one place rather than scattering them across
 * two stops).
 *
 * What it *does* share is `RouteStopMarker`, imported from
 * `loads-detail-parts.tsx` unchanged. The filled dot for a pick-up and the 2px
 * hollow ring for a drop-off are a decision about what a marker means, made
 * once; re-drawing an 8px dot here would be a third spelling of it, and the
 * first time one of the three changed the product would be telling drivers two
 * different things about which end of the job they were looking at.
 * `RouteStopHeading` is deliberately *not* reused: it lays the label and city
 * out inline at 12px for a narrow drawer, where this stacks them at 14–15px
 * over a wrapped address, which is layout rather than meaning.
 */
export function JobSheetStopCard({
  label,
  marker,
  city,
  address,
  contactName,
  contactPhone,
  contactDetails,
  lat,
  lng,
  prominent,
  className,
}: JobSheetStopCardProps) {
  // Resolved once, here, and passed down: the action needs the destination and
  // the note under the row needs to know which *kind* it turned out to be, and
  // resolving it twice is how those two could ever disagree.
  const destination = toNavigationDestination(lat, lng, address, city);
  const callHref = contactPhone === null ? null : toTelHref(contactPhone);

  return (
    <HubCard
      className={className}
      contentClassName="flex h-full flex-col gap-3.5"
    >
      <div className="flex items-start gap-3">
        <RouteStopMarker marker={marker} />
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h2 className={LABEL_CLASSES}>{label}</h2>
          {/* The city is the orienting fact — which town this is — and the
              address is the instruction. The em dash is the fallback for a stop
              the geocoder could not place; the address below still identifies
              it, which is why this degrades rather than hiding the row. */}
          <p
            className={
              prominent
                ? "text-[15px] font-semibold"
                : "text-sm font-medium"
            }
          >
            {city ?? EM_DASH}
          </p>
          {/* Wrapped, never truncated behind a `title`: this screen is read on
              a phone, which has no hover, and an elided Georgian street name is
              unreachable there. Vertical space is the cheaper thing to spend. */}
          <p className="text-[13px] leading-[1.45] text-muted-foreground">
            {address}
          </p>
        </div>
      </div>

      <dl className={cn(SPEC_GRID_CLASSES, "pt-0.5")}>
        <dt className="text-muted-foreground">Contact</dt>
        <dd className="min-w-0 break-words">
          {contactName ?? (
            <span className="text-muted-foreground">{EM_DASH}</span>
          )}
        </dd>
        <dt className="text-muted-foreground">Phone</dt>
        <dd className="min-w-0 break-words">
          {contactPhone === null ? (
            <span className="text-muted-foreground">{EM_DASH}</span>
          ) : (
            <StopPhoneLink phone={contactPhone} className="font-price" />
          )}
        </dd>
        {/* Block, floor, buzzer code — absent on most orders, and a labelled
            em dash for it would be a third row of nothing on a card that
            already shows two. Omitted rather than emptied. */}
        {contactDetails === null ? null : (
          <>
            <dt className="text-muted-foreground">Details</dt>
            <dd className="min-w-0 break-words">{contactDetails}</dd>
          </>
        )}
      </dl>

      {/* `mt-auto` pins the action row to the bottom of the card, so two stop
          cards of unequal address length still end with their Call/Navigate
          rows aligned if they are ever placed side by side. Inert in the single
          column this screen actually uses at both widths. */}
      <div className="mt-auto flex gap-3">
        {/* `toTelHref`, not a `tel:` string assembled here. It is the shared
            rule — digits only, a leading `+` kept, `null` when the stored value
            has no digits in it at all — and a stop whose "phone" is the words
            `ask for Nino` must not grow a Call button that dials nothing. The
            number itself is still shown and still selectable in the grid above,
            which is the affordance that survives an undiallable value. */}
        {callHref === null ? null : (
          <Button
            asChild
            variant="outline"
            className={cn(
              TOUCH_TARGET_CLASSES,
              !prominent && "text-muted-foreground",
            )}
          >
            <a href={callHref}>
              <Phone aria-hidden="true" className="size-4" />
              Call
              <span className="sr-only">
                {" "}
                {contactName ?? label} on {contactPhone}
              </span>
            </a>
          </Button>
        )}
        <StopNavigateAction destination={destination} address={address} />
      </div>

      {/* Three destination kinds, two of which say something worth saying.
          A coordinate needs no sentence — Navigate lands on the point. An
          address search does: it is a *guess at the street*, not the loading
          bay, and a driver who knows that reads the address itself before
          setting off rather than trusting the pin. `"unavailable"` gets the
          shared note, which is the one the dashed box above is explaining. */}
      {destination.kind === "coords" ? null : (
        <p className="text-xs leading-[1.5] text-muted-foreground">
          {destination.kind === "unavailable"
            ? NAVIGATION_UNAVAILABLE_NOTE
            : "No map coordinates were recorded for this stop, so Navigate opens a map search on the address text."}
        </p>
      )}
    </HubCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Picked-up strip                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The pick-up, collapsed to one line once the load is on the vehicle.
 *
 * Replaces the full pick-up card in the `IN_TRANSIT` layout rather than sitting
 * alongside it. The contact and the Navigate link for a stop the driver has
 * already left are two 44px controls' worth of screen competing with the stop
 * they are actually driving to, and this screen is 390px wide.
 *
 * It is not, however, deleted: it states *that* the pick-up happened and when,
 * which is the one fact about it still worth having — a driver challenged on
 * their timings needs the number, and it is the only place `inTransitAt`
 * surfaces before the job is complete.
 *
 * The check mark is the same success green `hub-status.ts` gives the completed
 * tone, spread from `HUB_STATUS_TONE_CLASSES.success` rather than respelled as
 * a fresh colour literal.
 */
export function JobSheetPickedUpStrip({
  job,
  className,
}: {
  job: HubJobSheet;
  className?: string;
}) {
  return (
    <HubCard
      className={cn("py-4", className)}
      contentClassName="flex items-center gap-3"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 flex-none items-center justify-center rounded-full",
          // The pale ground and the darker mark are the pair `hub-status.ts`
          // gives the completed tone, spread whole rather than respelled: this
          // dot means the same thing the Delivered pill means, and the two must
          // not be able to drift.
          HUB_STATUS_TONE_CLASSES.success,
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-2.5"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className={LABEL_CLASSES}>Picked up</h2>
        <p className="truncate text-[13px] text-muted-foreground">
          {job.pickupAddress}
          {/* `inTransitAt` is non-null by construction in the IN_TRANSIT
              layout — the endpoint writes both in one update — but the type
              does not know that, and inventing a clock time would be worse
              than dropping the suffix. */}
          {job.inTransitAt === null ? null : (
            <>
              {" · "}
              <span className={NUMERIC_CLASSES}>
                {formatClock(job.inTransitAt)}
              </span>
            </>
          )}
        </p>
      </div>
    </HubCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Cargo card                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What is being moved.
 *
 * The rows, their order, their wording and the em-dash-versus-"None declared"
 * distinctions are all `CargoSpecList`'s, imported from
 * `loads-detail-parts.tsx` and rendered here unchanged. That module exists
 * because two copies of this table had already diverged in ways drivers could
 * see; this is the third surface to render it and it does not get a third copy.
 *
 * **It shows more than the artboards do, and that is the deliberate trade.**
 * The phone artboard trims the table to five rows (Type, Weight, Dimensions,
 * Packaging, Helpers), dropping Volume, Quantity and Handling for space. Taking
 * that trim would have meant forking `cargoRows` — a fourth spelling of the
 * cargo table, to remove three rows of real information from the one reader
 * standing in front of the actual cargo. The grid metrics are identical either
 * way (`96px_1fr`, `gap-x-3 gap-y-2`, 13px), so what the artboard specifies
 * about *layout* is matched exactly; what it specifies about which rows to omit
 * is not, and this is the note recording that.
 *
 * `HandlingTagPills` and `LoadComplianceNotes` come with it. The advisories are
 * arguably more load-bearing here than on the board they were written for: the
 * board's reader is deciding whether to accept a hazmat load, this one is about
 * to put it on a vehicle. `CargoPhotoTiles` is **not** included — they are
 * permanent dashed placeholders for a feature that does not exist, and v1 of
 * this screen captures no media of any kind, so three empty tiles here would
 * promise a proof-of-delivery affordance the product has explicitly refused.
 */
export function JobSheetCargoCard({
  job,
  className,
}: {
  job: HubJobSheet;
  className?: string;
}) {
  return (
    <HubCard className={className} contentClassName="flex flex-col gap-3">
      <h2 className={LABEL_CLASSES}>Cargo</h2>
      {/* `CargoSpecList` sets its own `mt-2`; the card's gap is what separates
          it from the heading, so the two do not both add space. */}
      <div className="-mt-2">
        <CargoSpecList load={job} />
        <HandlingTagPills load={job} />
      </div>
      <LoadComplianceNotes load={job} />
    </HubCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Timeline card                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Filled success green for a step on the record as having happened, a hollow
 * brand-accent ring for the one being waited on, a hollow grey one for a step
 * not reached.
 *
 * The two `oklch` literals here are the file's only ones; see the "Colour"
 * section of the module comment for why neither can go through
 * `HUB_STATUS_TONE_CLASSES`.
 */
const TIMELINE_DOT_CLASSES: Record<HubTimelineStepState, string> = {
  done: "bg-[oklch(44.8%_0.119_151.328)]",
  current: "border-2 border-[oklch(64%_0.19_48)] bg-background",
  pending: "border-2 border-border bg-background",
};

export type JobSheetTimelineCardProps = {
  job: HubJobSheet;
  /**
   * Whether the job is still going — not cancelled and not finished.
   *
   * It decides one thing: whether the first timestamp-less step is painted as
   * *current* (a hollow accent ring, "this is what we are waiting for") or as
   * *pending* (a hollow grey ring, "this has not happened"). On a running job
   * the accent ring is the truth; on a cancelled one it would promise a pickup
   * that is never coming, which is the note the cancelled artboard makes
   * explicitly. `buildHubTimeline` takes the same flag for the same reason and
   * documents why it is a parameter rather than something derived — the two
   * callers hold the status in two different vocabularies.
   */
  running: boolean;
  className?: string;
};

/**
 * The three-step rail, with what the driver reported at completion under it.
 *
 * Which steps exist, what they are called and which count as done is
 * `buildHubTimeline`'s — shared with Job history's panel, which draws the same
 * three steps for the same order in a different shape. **There is no fourth
 * step and there cannot be one**: `Order` has no `acceptedAt` and no
 * `cancelledAt`, so every extra dot would have to be labelled for a timestamp
 * that means something else. See that function.
 *
 * The connector line between the dots is this surface's own chrome — the panel
 * draws bare dots with the time right-aligned, this draws a rail with the
 * timestamp stacked under the label, because a 390px column has no room for a
 * third text column on the right.
 *
 * ## The delivery record is folded in rather than given its own card
 *
 * The artboards draw a separate "Delivery record" card above Progress, holding
 * the completion time, the waiting minutes and the recipient. Two of those
 * three are already *on the rail* — "Dropped off" carries `completedAt` — so a
 * card above it would print the same instant twice under two headings, which is
 * how a reader ends up wondering whether the two are different events. What is
 * genuinely not on the rail is the pair of figures the driver typed into the
 * confirmation dialog, and they sit under it, behind a hairline, wearing their
 * own labels.
 *
 * Both rows come and go independently. `waitingMinutes` is null until the
 * delivery is completed and `receivedBy` is null on any delivery confirmed
 * without a name, so an em dash for either would be a labelled nothing.
 */
export function JobSheetTimelineCard({
  job,
  running,
  className,
}: JobSheetTimelineCardProps) {
  const steps = buildHubTimeline({
    createdAt: job.createdAt,
    inTransitAt: job.inTransitAt,
    completedAt: job.completedAt,
    running,
  });

  /**
   * What the driver reported when they closed the job.
   *
   * `waitingMinutes` is printed whenever it exists, **including `0`** — and
   * that is the case worth being deliberate about. Zero is a real answer to a
   * required question ("I waited no time at all"), it is what the majority of
   * deliveries record, and it is the figure that explains why a job with a long
   * gap between its two timestamps earned no overtime line above. A `!== 0`
   * test here would hide the answer on exactly the jobs where a driver is most
   * likely to be checking what they reported.
   */
  const reported: { label: string; value: string }[] = [
    ...(job.waitingMinutes === null
      ? []
      : [
          {
            label: "Waiting time",
            value: `${job.waitingMinutes} min`,
          },
        ]),
    ...(job.receivedBy === null
      ? []
      : [{ label: "Received by", value: job.receivedBy }]),
  ];

  return (
    <HubCard className={className} contentClassName="flex flex-col gap-3.5">
      <h2 className={LABEL_CLASSES}>Timeline</h2>

      <ol className="flex flex-col">
        {steps.map((step, index) => {
          const last = index === steps.length - 1;

          return (
            <li key={step.id} className="flex gap-3">
              <div className="flex w-3 flex-none flex-col items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-[5px] size-2 flex-none rounded-full",
                    TIMELINE_DOT_CLASSES[step.state],
                  )}
                />
                {/* The rail, not a separator: it is what makes three dots read
                    as one sequence rather than three unrelated bullets. Absent
                    under the last step, which has nothing to connect to. */}
                {last ? null : (
                  <span
                    aria-hidden="true"
                    className="my-1 w-px flex-1 bg-border"
                  />
                )}
              </div>
              <div className={cn("flex flex-col gap-0.5", last ? null : "pb-4")}>
                <p className="text-[13px] font-medium">{step.label}</p>
                <p className={cn(NUMERIC_CLASSES, "text-xs text-muted-foreground")}>
                  {step.at === null
                    ? EM_DASH
                    : formatAbsoluteDateTime(step.at)}
                </p>
              </div>
              {/* The dots carry the state visually; this is how it reaches a
                  screen reader, which cannot see a hollow ring. */}
              <span className="sr-only">
                {step.state === "done" ? " — done" : " — not reached"}
              </span>
            </li>
          );
        })}
      </ol>

      {/* A record of what the driver reported — **not evidence**: v1 captures
          no photo and no signature, and the `COMPLETED` transition is what
          proves the delivery. The rows wear their own labels rather than
          sitting under a heading that would come and go with them. */}
      {reported.length === 0 ? null : (
        <dl className={cn(SPEC_GRID_CLASSES, "border-t border-border pt-3")}>
          {reported.map((row) => (
            <React.Fragment key={row.label}>
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd
                className={cn(
                  "min-w-0 break-words",
                  // The minutes are a figure and take the mono face; a name is
                  // prose and does not.
                  row.label === "Waiting time" ? NUMERIC_CLASSES : null,
                )}
              >
                {row.value}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </HubCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Contacts card                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Both stops' contacts, kept on screen after the job is finished.
 *
 * The completed layout drops the two stop cards — their Call and Navigate
 * actions are for a job in progress — but **not** the numbers. A driver is
 * routinely called back about a delivery they made an hour ago, or needs to
 * ring the recipient about something left behind, and the alternative is
 * hunting through a finished job list on a phone at the roadside. The sentence
 * under the grid says so, because a block of contact details on a completed job
 * otherwise reads as something nobody remembered to remove.
 */
export function JobSheetContactsCard({
  job,
  className,
}: {
  job: HubJobSheet;
  className?: string;
}) {
  const stops = [
    { label: "Pick-up", name: job.pickupContactName, phone: job.pickupContactPhone },
    {
      label: "Drop-off",
      name: job.dropoffContactName,
      phone: job.dropoffContactPhone,
    },
  ];

  return (
    <HubCard className={className} contentClassName="flex flex-col gap-3.5">
      <h2 className={LABEL_CLASSES}>Contacts</h2>
      <dl className={SPEC_GRID_CLASSES}>
        {stops.map((stop) => (
          <React.Fragment key={stop.label}>
            <dt className="text-muted-foreground">{stop.label}</dt>
            <dd className="flex min-w-0 flex-col gap-0.5 break-words">
              {stop.name === null && stop.phone === null ? (
                <span className="text-muted-foreground">{EM_DASH}</span>
              ) : (
                <>
                  {stop.name === null ? null : <span>{stop.name}</span>}
                  {stop.phone === null ? null : (
                    <StopPhoneLink
                      phone={stop.phone}
                      className="font-price text-muted-foreground"
                    />
                  )}
                </>
              )}
            </dd>
          </React.Fragment>
        ))}
      </dl>
      <p className="text-xs leading-[1.45] text-muted-foreground">
        Kept visible after delivery — a driver may still need to call about a
        finished job.
      </p>
    </HubCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Route summary                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The header subhead: where to where, how far, how many stops.
 *
 * `distanceKm` is the load's own pick-up-to-drop-off trip and never how far the
 * driver currently is from the pick-up, which this screen does not measure.
 * "2 stops" is a constant, not a count: `Order` is a single pick-up → single
 * drop-off booking with six columns rather than a `Stop` relation, so two is
 * the only number it can be.
 */
export function jobSheetRouteSummary(job: HubJobSheet): string {
  return `${job.pickupAddress} → ${job.dropoffAddress} · ${formatDistanceKm(
    job.distanceKm,
  )} · 2 stops`;
}

/* -------------------------------------------------------------------------- */
/* Terminal states                                                            */
/* -------------------------------------------------------------------------- */

export type JobSheetNoticeProps = {
  /** The one-line statement — the design's exact copy. */
  title: string;
  /** The sentence under it, or null for a notice that needs none. */
  detail?: string | null;
  children?: React.ReactNode;
};

/** Where a driver goes when there is nothing to do on this job. */
export const BACK_TO_BOARD_HREF = "/dashboard/loads";
export const BACK_TO_BOARD_LABEL = "Back to load board";

/**
 * The boxed statement used by the cancelled and not-found states.
 *
 * Both are dead ends with one way out, so both get the same shape: what
 * happened, why there is nothing more to say about it, and the link back to
 * where work comes from.
 */
export function JobSheetNotice({
  title,
  detail = null,
  children,
}: JobSheetNoticeProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted p-3.5">
      <p className="text-[13px] font-medium">{title}</p>
      {detail === null ? null : (
        <p className="text-xs leading-[1.5] text-muted-foreground">{detail}</p>
      )}
      {children}
    </div>
  );
}

/** The 44px outline link back to the board, shared by both terminal states. */
export function BackToBoardButton({ className }: { className?: string }) {
  return (
    <Button
      asChild
      variant="outline"
      className={cn("h-11 text-sm font-medium", className)}
    >
      <Link href={BACK_TO_BOARD_HREF}>{BACK_TO_BOARD_LABEL}</Link>
    </Button>
  );
}
