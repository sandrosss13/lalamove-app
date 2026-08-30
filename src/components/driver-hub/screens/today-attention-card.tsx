"use client";

import Link from "next/link";

import { HubCard, SampleNote } from "@/components/driver-hub/hub-primitives";
import {
  formatShortDate,
  pluralise,
} from "@/components/driver-hub/screens/today-format";
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
 */
const ROW_WARNING =
  "bg-[oklch(97.3%_0.071_103.193)] border-[oklch(97.3%_0.071_103.193)]";

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
function vehicleAlertBody(alert: HubTodayVehicleAlert): string {
  return alert.kind === "INSURANCE"
    ? `${alert.vehiclePlate} · renew the policy to keep taking jobs.`
    : `Book the annual inspection for ${alert.vehiclePlate}.`;
}

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export type TodayAttentionCardProps = {
  /** Real. `null` for a business account, which holds no licence of its own. */
  licenceAlert: HubLicenceAlert | null;
  /** Sampled. Empty when the account has no vehicle to hang a row off. */
  vehicleAlerts: readonly HubTodayVehicleAlert[];
  className?: string;
};

export function TodayAttentionCard({
  licenceAlert,
  vehicleAlerts,
  className,
}: TodayAttentionCardProps) {
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
      title="Needs your attention"
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
          // One row per kind, and `today.ts` emits each kind at most once.
          key={alert.kind}
          tone="plain"
          title={vehicleAlertTitle(alert)}
          body={vehicleAlertBody(alert)}
          sampleNote={VEHICLE_ALERT_NOTE}
        />
      ))}

      {hasRows ? null : (
        // Not `HubEmptyState`: nothing is missing here. An empty attention list
        // is the outcome the driver wants, so it is stated as good news rather
        // than as an absence of rows.
        <div className="py-2">
          <p className="text-sm font-medium">Nothing needs your attention</p>
          <p className="mt-1.5 text-[13px] leading-normal text-muted-foreground">
            Your licence and vehicle documents are in order. Anything that is
            about to expire shows up here.
          </p>
        </div>
      )}
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
