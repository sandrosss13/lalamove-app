"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  HubCard,
  HubStatusBadge,
  SampleNote,
} from "@/components/driver-hub/hub-primitives";
import {
  formatGel,
  formatJoinedMonth,
  formatRating,
  initialsOf,
  shortId,
} from "@/components/driver-hub/screens/drivers-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HubDriver } from "@/lib/dashboard/hub/drivers";
import { cn } from "@/lib/utils";

/**
 * The Drivers screen's right-hand panel: everything the platform knows about
 * one rostered driver, and the one destructive action available on them.
 *
 * Split out of `drivers-screen.tsx` for the same reason
 * `vehicles-detail-panel.tsx` is split out of its screen: this component owns
 * an in-flight `DELETE` and its error, while the screen owns selection and
 * filtering. The two-step *armed* flag lives up in the screen rather than here,
 * so that selecting another row disarms it — a panel-local flag would survive a
 * re-render into a different driver and turn one stray click into the removal
 * of the wrong person.
 *
 * Honesty rule: the identity lines, the status pill, the zone pill, the two
 * left-hand stat boxes and every "Recent jobs" row are read from the database.
 * Acceptance, Rating and the whole Verification list come from
 * `driver.sampled`, and each carries a `<SampleNote />` naming the schema
 * change that would make it real.
 *
 * Colours are written as literal Tailwind arbitrary values, never interpolated
 * — the compiler scans source text, so a class built from a variable would
 * never be generated.
 */

const GENERIC_ERROR = "Could not offboard this driver.";
const NETWORK_ERROR = "Network error. Please check your connection.";

/**
 * The design's destructive button, unarmed.
 *
 * `dangerBtn(false)` in the handoff's script is
 * `border: '1px solid ' + LINE, background: '#fff', color: BAD` — a neutral
 * border with BAD (not BAD_FG) text, which is what separates it from the armed
 * state below. The hover tint is ours: a static artboard has no hover, and a
 * plain white button that does not react reads as disabled.
 */
const OFFBOARD_UNARMED_CLASSES =
  "border-border bg-background text-[oklch(57.7%_0.245_27.325)] " +
  "hover:bg-[oklch(93.6%_0.032_17.717)] " +
  "hover:text-[oklch(57.7%_0.245_27.325)]";

/**
 * Armed: solid red with white text. Spelled out rather than using `Button`'s
 * `destructive` variant, which is *tinted* (`bg-destructive/10`) in this design
 * system and would read as the unarmed state.
 */
const OFFBOARD_ARMED_CLASSES =
  "border-transparent bg-[oklch(57.7%_0.245_27.325)] text-white " +
  "hover:bg-[oklch(50%_0.22_27.325)] hover:text-white";

/**
 * The design ends its offboard flow with a "Reinstate driver" button. There is
 * nothing here to reinstate *from*: `DELETE /api/logistics-company/drivers/
 * [userId]` sets `DriverProfile.companyId` to null and the schema keeps no
 * roster-membership record, so a former member is indistinguishable from
 * someone who was never on the roster. Offering a reversal would be a button
 * that cannot work, so the note says plainly what actually happens instead.
 *
 * The vehicle sentence is not a hedge either: that endpoint touches only
 * `companyId`, and an open `DriverVehicleAssignment` survives it — so the van
 * has to be released from the Vehicles screen or it stays out on loan to
 * somebody who no longer works here.
 */
const OFFBOARD_UNARMED_NOTE =
  "Takes them off your roster. Their account, completed jobs and payouts stay " +
  "theirs. There is no reinstate — nothing records that they were ever on this " +
  "roster, so bringing them back means registering them again.";

const OFFBOARD_ARMED_NOTE =
  "Click again to take them off the roster for good. Any fleet vehicle they " +
  "hold stays assigned to them — release it from Vehicles first if you need it " +
  "back.";

/** Why the rating, the acceptance rate and the document rows are invented. */
const SAMPLE_NOTES = {
  rating:
    "Nothing records a customer rating for an order. Retire with an " +
    "OrderRating model.",
  acceptance:
    "Nothing records an offer a driver was shown but did not take, so an " +
    "acceptance rate cannot be computed. Retire with a JobOffer model.",
  verification:
    "DriverApplication verifies documents once at onboarding and models no " +
    "ongoing validity, so these verdicts are placeholders. Retire with a " +
    "DriverDocument model. The licence expiry date on Today is real.",
} as const;

/** The grey pill the design uses for the zone. */
const NEUTRAL_PILL_CLASSES =
  "h-auto rounded-full border-transparent bg-muted px-[9px] py-[3px] " +
  "text-[11px] font-semibold tracking-[0.02em] text-muted-foreground";

/**
 * The one status word both the roster row and this panel's first pill show.
 *
 * `HubDriver` carries presence and review state as *independent* facts (see
 * `drivers.ts`), and the design gives each surface room for exactly one word:
 * `{{ d.status }}` in a roster row, `{{ selectedDriver.status }}` beside
 * `{{ selectedDriver.zone }}` in the panel. The review state wins whenever it
 * is not "Active", because that is the axis that decides whether the driver can
 * work at all — an operator scanning the screen needs "Suspended" far more than
 * "Online". Neither caller loses the collapsed axis: both print it as
 * screen-reader text on the same element.
 *
 * Defined here rather than in `drivers-screen.tsx` so the screen and its panel
 * can share one rule without importing each other.
 */
export function driverStatusWord(driver: HubDriver): string {
  return driver.reviewState === "Active" ? driver.presence : driver.reviewState;
}

export type DriversDetailPanelProps = {
  driver: HubDriver;
  /** Whether the offboard action is armed. Owned by the screen — see above. */
  armed: boolean;
  onArmedChange: (armed: boolean) => void;
  /** Fired after a successful removal, so the screen can clear its selection. */
  onOffboarded: () => void;
};

/** One box of the 2×2 stat grid. */
function StatBox({
  label,
  value,
  sampleNote,
}: {
  label: string;
  value: React.ReactNode;
  /** Present only on a box fed by `driver.sampled`. */
  sampleNote?: string;
}) {
  return (
    <div className="min-w-0 rounded-[10px] border border-border p-3">
      <p className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 truncate font-price text-[17px] font-semibold">
        {value}
      </p>
      {sampleNote === undefined ? null : (
        <SampleNote note={sampleNote} label="Sample" className="mt-1.5" />
      )}
    </div>
  );
}

export function DriversDetailPanel({
  driver,
  armed,
  onArmedChange,
  onOffboarded,
}: DriversDetailPanelProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // The display id is the driver's profile id, shortened — the same identity
  // the roster rows print, and the key `sampleDriverFacts()` is looked up by.
  // The design's "GE-88214" is a display id no column holds.
  const displayId = shortId(driver.driverProfileId);

  async function handleOffboard(): Promise<void> {
    if (!armed) {
      onArmedChange(true);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/logistics-company/drivers/${driver.userId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        // The route's own wording ("Driver not found.", "Only logistics
        // companies can remove drivers.") is more useful than ours.
        setError(payload?.error ?? GENERIC_ERROR);
        return;
      }

      onArmedChange(false);
      onOffboarded();
      router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <HubCard>
      {/* `pr-9` clears the ✕ that `MasterDetailSplit` positions at the panel's
          top-right; the panel deliberately renders no close button of its own. */}
      <div className="flex min-w-0 items-center gap-3 pr-9">
        <span
          // Decorative: the name sits right beside it, so announcing "GB" as
          // well would only repeat the first two letters of the next line.
          aria-hidden="true"
          className="grid size-[38px] flex-none place-items-center rounded-full bg-muted text-[13px] font-semibold"
        >
          {initialsOf(driver.name)}
        </span>
        <div className="min-w-0">
          {/* No letter-spacing: the design sets none on a driver's name
              (`font-size:16px; font-weight:600`) — the tightened tracking
              belongs to the *vehicle* panel's plate heading. */}
          <h2 className="truncate text-base font-semibold">{driver.name}</h2>
          {/* Full profile id as the title: a truncated id is a label, never an
              identifier. 11px, 2px below the name — the design's
              `font-size:11px; margin-top:2px`. */}
          <p
            title={driver.driverProfileId}
            className="mt-0.5 truncate font-price text-[11px] text-muted-foreground"
          >
            {displayId} · joined {formatJoinedMonth(driver.joinedAt)}
          </p>
        </div>
      </div>

      {/* Two pills, as the design has them: one status word and the zone —
          `<span tagStyle>{{ selectedDriver.status }}</span><span
          zoneTagStyle>{{ selectedDriver.zone }}</span>`. Presence and review
          state are independent axes, so the one `driverStatusWord()` drops
          rides along as screen-reader text, exactly as the roster row does.
          The `sr-only` span is out of flow and so is not a flex item — it adds
          no gap between the two pills. */}
      <div className="mt-4 mb-5 flex flex-wrap gap-2">
        <HubStatusBadge status={driverStatusWord(driver)} />
        <span className="sr-only">
          — {driver.presence}, {driver.reviewState}
        </span>
        <Badge variant="outline" className={NEUTRAL_PILL_CLASSES}>
          {driver.cityLabel}
        </Badge>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-border pb-5">
        <StatBox label="Jobs this week" value={driver.jobsThisWeek} />
        <StatBox label="Earned" value={formatGel(driver.totalEarnedGel)} />
        <StatBox
          label="Acceptance"
          value={`${driver.sampled.acceptanceRatePercent}%`}
          sampleNote={SAMPLE_NOTES.acceptance}
        />
        <StatBox
          label="Rating"
          value={formatRating(driver.sampled.rating)}
          sampleNote={SAMPLE_NOTES.rating}
        />
      </div>

      <h3 className="mt-[18px] mb-1 text-[13px] font-semibold">Recent jobs</h3>
      {driver.recentJobs.length === 0 ? (
        <p className="border-t border-muted py-2.5 text-[13px] text-muted-foreground">
          No completed jobs for this fleet yet.
        </p>
      ) : (
        <ul>
          {driver.recentJobs.map((job) => (
            <li
              key={job.id}
              className="flex items-center justify-between gap-3 border-t border-muted py-2.5 text-[13px]"
            >
              <span title={job.id} className="font-price font-semibold">
                {shortId(job.id)}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {job.pickupAddress} → {job.dropoffAddress}
              </span>
              <span className="font-price font-medium">
                {formatGel(job.fareGel)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-[18px] mb-0.5 flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold">Verification</h3>
        <SampleNote note={SAMPLE_NOTES.verification} />
      </div>
      <ul>
        {driver.sampled.verification.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-3 border-t border-muted py-[9px] text-[13px]"
          >
            <span className="min-w-0 truncate">{row.label}</span>
            <HubStatusBadge status={row.status} />
          </li>
        ))}
      </ul>

      <div className="mt-[22px] border-t border-border pt-[18px]">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void handleOffboard();
          }}
          disabled={submitting}
          className={cn(
            "h-auto rounded-md px-[15px] py-[9px] text-[13px] font-medium",
            armed ? OFFBOARD_ARMED_CLASSES : OFFBOARD_UNARMED_CLASSES,
          )}
        >
          {submitting
            ? "Offboarding…"
            : armed
              ? "Confirm offboarding"
              : "Offboard driver"}
        </Button>
        <p className="mt-[9px] text-xs leading-relaxed text-muted-foreground">
          {armed ? OFFBOARD_ARMED_NOTE : OFFBOARD_UNARMED_NOTE}
        </p>

        {/* Inline, beside the control that failed — never an `alert()`. */}
        {error === null ? null : (
          <p
            role="alert"
            className="mt-2 text-xs text-[oklch(44.4%_0.177_26.899)]"
          >
            {error}
          </p>
        )}
      </div>
    </HubCard>
  );
}
