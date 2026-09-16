"use client";

import Link from "next/link";

import { HubCard, SampleNote } from "@/components/driver-hub/hub-primitives";
import {
  formatShortDate,
  pluralise,
} from "@/components/driver-hub/screens/today-format";
import type { HubPersona } from "@/lib/dashboard/hub/account";
import type {
  HubLicenceAlert,
  HubTodayVehicleAlert,
} from "@/lib/dashboard/hub/today";
import { cn } from "@/lib/utils";

/**
 * "Needs your attention" — the right card of Today's second row, and the one
 * place on the screen where real and sampled content sit in the same list.
 *
 * The **licence row is real**: `DriverLicence.expiresAt` is written at
 * onboarding submit, and `today.ts` already reduced it to a whole-day count
 * against the same Tbilisi day boundary the rest of the screen uses. It gets the
 * design's warning surface.
 *
 * The **insurance and inspection rows are invented**: `Vehicle` records neither
 * a policy nor an inspection, so the plate on them is the only true part.
 * They get the design's plain white surface and each carries its own
 * `<SampleNote />` — per row rather than per card, because a reader has to be
 * able to tell *which* of two adjacent rows is the fabricated one, which is
 * precisely what a single card-level badge would hide.
 *
 * ## Who is reading it
 *
 * The vehicle rows are no longer about one van. A `BUSINESS` account's rows
 * cover several vehicles — two per vehicle, unique on `(vehiclePlate, kind)`
 * rather than on `kind` alone — which changes three things about this card.
 * The per-row badge matters *more* with more rows, not less: a reader now has
 * to be able to tell which of many adjacent rows is fabricated, and a
 * card-level badge over eight rows would say nothing about any of them. The
 * rows only ever cover a slice of the fleet, so a fleet's card states how much
 * of it they looked at and links to the Vehicles screen for the rest —
 * otherwise three clean rows about three vans would read as a clean bill of
 * health for twelve. And the licence row is **structurally absent** for a fleet
 * rather than merely empty: `resolveHubAccount()` gives a COMPANY session no
 * `driverProfileId`, a company holds no licence of its own, and its drivers'
 * licences belong on the Drivers screen where each can be attached to a named
 * person who can actually be called about one.
 *
 * The second person is therefore right for `INDEPENDENT` and `ROSTER`, who are
 * both reading about their own licence and their own van, and wrong for
 * `BUSINESS`, whose own attention is not what any of these rows is about. Only
 * the `BUSINESS` copy differs; a roster driver reads this card exactly as an
 * independent one does.
 *
 * Every row links to `/dashboard/vehicles`, where the documents behind them
 * live. That is true of the licence too: the hub has no standalone document
 * screen, and the Vehicles screen is where compliance is surfaced.
 *
 * Nothing here writes — renewing a document is not a hub action, and a control
 * with no endpoint behind it would be worse than a link to where the record is.
 */

/* -------------------------------------------------------------------------- */
/* What counts as "needs attention"                                           */
/* -------------------------------------------------------------------------- */

/**
 * How close a licence expiry has to be before it belongs on this card.
 *
 * `today.ts` returns the licence whenever there is one, expiry date and all —
 * it reports the fact and leaves the judgement to the screen. A licence good
 * for another eleven months is not something that needs the driver's attention
 * today, and listing it would train them to ignore this card. Thirty days is
 * the design's own register: its example row reads "expires in 12 days".
 */
const LICENCE_ATTENTION_WINDOW_DAYS = 30;

/** What would make the two compliance rows real. */
const VEHICLE_ALERT_NOTE =
  "Vehicle records no insurance policy and no inspection at all — only the " +
  "plate on this row is real. Retire with a VehicleCompliance model holding " +
  "the policy and inspection dates.";

/* -------------------------------------------------------------------------- */
/* Row surfaces                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The handoff's warning surface, used as both background and border so the row
 * reads as one tinted block. No `--color-*` token exists for it, so it is a
 * Tailwind arbitrary value, the same as the tones in `hub-status.ts`.
 *
 * That missing token is exactly why the `dark:` half has to be written out by
 * hand. A literal has nothing behind it to flip, so the pale wash would survive
 * onto the dark ground and print near-white on near-white — the row would keep
 * its warning colour and lose the fact that it *is* a row. The dark value holds
 * the hue and inverts the lightness rather than picking a fresh yellow, which is
 * what keeps this tone recognisably the same warning in both themes and keeps
 * it distinguishable from the hub's other five tinted tones, every one of which
 * is inverted the same way. Both halves are applied to the background and the
 * border together, because the whole point of the pair is that the row reads as
 * one block rather than a tint inside a rule.
 */
const ROW_WARNING =
  "bg-[oklch(97.3%_0.071_103.193)] dark:bg-[oklch(29%_0.05_85)] " +
  "border-[oklch(97.3%_0.071_103.193)] dark:border-[oklch(29%_0.05_85)]";

/** The plain surface the design gives its second, less urgent row. */
const ROW_PLAIN = "bg-background border-border";

/** Shared geometry: 10px radius, 14px × 16px padding, chevron on the right. */
const ROW_BASE =
  "flex items-center justify-between gap-3 rounded-[10px] border px-4 py-3.5 " +
  "outline-none transition-colors hover:bg-muted/60 " +
  "focus-visible:ring-3 focus-visible:ring-ring/50";

/** Where every row on this card goes. */
const VEHICLES_HREF = "/dashboard/vehicles";

/* -------------------------------------------------------------------------- */
/* Copy                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The licence headline, in the design's voice.
 *
 * Four cases rather than one template, because "expires in 0 days" and
 * "expires in -3 days" are both things a naive count would print. `isExpired`
 * is compared at full precision by `today.ts`, so a licence that lapsed earlier
 * today is expired while its day count is still zero — that pair is the reason
 * the two flags are read separately here.
 */
function licenceTitle(alert: HubLicenceAlert): string {
  if (!alert.isExpired) {
    return alert.daysRemaining <= 0
      ? "Driving licence expires today"
      : `Driving licence expires in ${pluralise(alert.daysRemaining, "day")}`;
  }

  const daysAgo = Math.abs(alert.daysRemaining);

  return daysAgo === 0
    ? "Driving licence expired today"
    : `Driving licence expired ${pluralise(daysAgo, "day")} ago`;
}

/**
 * The sampled compliance headline. `due` is either a human date or the sample
 * module's "not on file" fallback, so the two read differently: a date is
 * something to act on by, a missing record is something to supply.
 */
function vehicleAlertTitle(alert: HubTodayVehicleAlert): string {
  const subject =
    alert.kind === "INSURANCE" ? "MTPL insurance" : "Technical inspection";

  return alert.due === "not on file"
    ? `${subject} not on file`
    : `${subject} due ${alert.due}`;
}

/** The muted second line under a compliance headline. */
function vehicleAlertBody(
  alert: HubTodayVehicleAlert,
  persona: HubPersona,
): string {
  if (alert.kind !== "INSURANCE") {
    return `Book the annual inspection for ${alert.vehiclePlate}.`;
  }

  // "Keep taking jobs" is what a driver does with their own van. A fleet owner
  // is not the one taking the job — they are the one who loses a vehicle from
  // the roster when its cover lapses.
  return persona === "BUSINESS"
    ? `${alert.vehiclePlate} · renew the policy to keep this vehicle on the road.`
    : `${alert.vehiclePlate} · renew the policy to keep taking jobs.`;
}

/**
 * Whose attention the card is asking for.
 *
 * A driver reads it about their own licence and their own van, so the second
 * person is right for both `INDEPENDENT` and `ROSTER`. A fleet owner reads it
 * about their vehicles — none of the rows is about a document of *theirs*, and
 * `licenceAlert` is structurally `null` for them — so addressing them in the
 * second person points at the wrong party. "Fleet attention" names the subject
 * instead of the reader, which is what the rows are actually about.
 */
function attentionTitle(persona: HubPersona): string {
  return persona === "BUSINESS" ? "Fleet attention" : "Needs your attention";
}

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export type TodayAttentionCardProps = {
  /** Picks the card's voice — see `attentionTitle` above. */
  persona: HubPersona;
  /**
   * Real. `null` for a BUSINESS account, which holds no licence of its own —
   * `resolveHubAccount()` gives a COMPANY session no `driverProfileId`, and its
   * drivers' licences belong on the Drivers screen where they can be attached
   * to a named person who can actually be called about one.
   */
  licenceAlert: HubLicenceAlert | null;
  /**
   * Sampled. Two rows per vehicle covered — one insurance, one inspection —
   * and unique on `(vehiclePlate, kind)` rather than on `kind` alone, which is
   * what it used to be when only one vehicle was ever covered.
   */
  vehicleAlerts: readonly HubTodayVehicleAlert[];
  /** How many distinct vehicles `vehicleAlerts` covers. Real. */
  vehicleAlertVehicleCount: number;
  /** The fleet's real registered vehicle count; `null` when not a fleet. */
  fleetVehicleCount: number | null;
  className?: string;
};

export function TodayAttentionCard({
  persona,
  licenceAlert,
  vehicleAlerts,
  vehicleAlertVehicleCount,
  fleetVehicleCount,
  className,
}: TodayAttentionCardProps) {
  const isFleet = persona === "BUSINESS";

  const licenceNeedsAttention =
    licenceAlert !== null &&
    (licenceAlert.isExpired ||
      licenceAlert.daysRemaining <= LICENCE_ATTENTION_WINDOW_DAYS);

  // A "Valid" policy is not an alert. The statuses that survive are the ones
  // the design's own two rows carry — something expiring, expired, or never
  // recorded — so a fleet whose sampled facts happen to be in order gets the
  // calm state rather than two rows of good news filed under "attention".
  const openVehicleAlerts = vehicleAlerts.filter(
    (alert) => alert.status !== "Valid",
  );

  const hasRows = licenceNeedsAttention || openVehicleAlerts.length > 0;

  return (
    <HubCard
      className={cn("h-full", className)}
      title={attentionTitle(persona)}
      contentClassName={hasRows ? "flex flex-col gap-2.5" : undefined}
    >
      {licenceNeedsAttention && licenceAlert !== null ? (
        <AttentionRow
          tone="warning"
          title={licenceTitle(licenceAlert)}
          body={`${
            licenceAlert.isExpired ? "Expired" : "Expires"
          } ${formatShortDate(licenceAlert.expiresAt)}. Renew it and upload the new document.`}
        />
      ) : null}

      {openVehicleAlerts.map((alert) => (
        <AttentionRow
          // Rows are unique on `(vehiclePlate, kind)`, not on `kind`: a fleet's
          // card covers several vehicles, so a key of `alert.kind` alone would
          // repeat across plates and give React duplicate sibling keys.
          key={`${alert.vehiclePlate}-${alert.kind}`}
          tone="plain"
          title={vehicleAlertTitle(alert)}
          body={vehicleAlertBody(alert, persona)}
          sampleNote={VEHICLE_ALERT_NOTE}
        />
      ))}

      {hasRows ? null : (
        // Not `HubEmptyState`: nothing is missing here. An empty attention list
        // is the outcome the driver wants, so it is stated as good news rather
        // than as an absence of rows.
        <div className="py-2">
          <p className="text-sm font-medium">
            {isFleet
              ? "Nothing needs attention"
              : "Nothing needs your attention"}
          </p>
          <p className="mt-1.5 text-[13px] leading-normal text-muted-foreground">
            {/* "Every vehicle we checked" rather than "every vehicle": the rows
                cover at most three of the fleet, and the wider claim would be
                asserting something about vans this card never looked at. */}
            {isFleet
              ? "Every vehicle we checked has its documents in order. Anything that is about to expire shows up here."
              : "Your licence and vehicle documents are in order. Anything that is about to expire shows up here."}
          </p>
        </div>
      )}

      {/* Only a fleet needs this: a driver's rows cover the one vehicle they
          have. The two numbers are real — a plate count and a `COUNT(*)` on
          `Vehicle` — even though the rows they describe are sampled, so this
          line carries no sample badge of its own. The rows keep theirs. */}
      {isFleet && fleetVehicleCount !== null ? (
        <p className="pt-1 text-xs text-muted-foreground">
          {fleetVehicleCount === 0
            ? "No vehicles registered yet."
            : `Covering ${vehicleAlertVehicleCount} of ${pluralise(fleetVehicleCount, "vehicle")}. `}
          {fleetVehicleCount > vehicleAlertVehicleCount ? (
            <Link href={VEHICLES_HREF} className="underline underline-offset-4">
              See the whole fleet
            </Link>
          ) : null}
        </p>
      ) : null}
    </HubCard>
  );
}

type AttentionRowProps = {
  tone: "warning" | "plain";
  title: string;
  body: string;
  /** Present only on a fabricated row — see the file header. */
  sampleNote?: string;
};

function AttentionRow({ tone, title, body, sampleNote }: AttentionRowProps) {
  return (
    <Link
      href={VEHICLES_HREF}
      className={cn(ROW_BASE, tone === "warning" ? ROW_WARNING : ROW_PLAIN)}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {body}
        </span>
        {sampleNote === undefined ? null : (
          <SampleNote note={sampleNote} className="mt-2" />
        )}
      </span>
      {/* Decorative: the link's own text already says where it goes. */}
      <span aria-hidden="true" className="text-[18px] text-muted-foreground">
        ›
      </span>
    </Link>
  );
}
