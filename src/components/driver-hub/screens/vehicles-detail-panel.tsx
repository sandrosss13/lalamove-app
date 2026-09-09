"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HubCard,
  HubStatusBadge,
  SampleNote,
} from "@/components/driver-hub/hub-primitives";
import {
  EMPTY_VALUE,
  formatGel,
  formatKilograms,
  formatOdometer,
} from "@/components/driver-hub/screens/vehicles-format";
import type { HubAccountKind } from "@/lib/dashboard/hub/account";
import type { HubVehicle } from "@/lib/dashboard/hub/vehicles";
import { cn } from "@/lib/utils";

/**
 * The Vehicles screen's right-hand panel: everything known about one vehicle,
 * and the one destructive action that can be taken on it.
 *
 * Split out of `vehicles-screen.tsx` because it owns real state of its own —
 * an in-flight `DELETE`, its error, and the two-step arming the design
 * requires — while the screen owns selection and filtering. The armed flag
 * itself lives *up* in the screen rather than here, so that selecting another
 * row disarms it: a panel-local flag would survive a re-render into a
 * different vehicle and turn one stray click into a deletion of the wrong
 * record.
 *
 * Honesty rule: everything read out of `vehicle.sampled` carries a
 * `<SampleNote />`. Only the identity lines, the class pill, the status and
 * the payload are real.
 *
 * Colours are written as literal Tailwind arbitrary values, never interpolated
 * — the compiler scans source text, so a class built from a variable would
 * never be generated.
 *
 * ## Why this panel takes `kind` and not `persona`
 *
 * Both of the account questions it asks — which `DELETE` route to call, and
 * whether the caller owns the row well enough to be offered Remove at all —
 * are *ownership* questions, and an independent driver and a driver on a
 * company's roster answer both identically. `removable` therefore keys off
 * `vehicle.ownership`, never off the account shape, and stays on `kind`;
 * re-expressing it as `persona !== "BUSINESS"` would make an ownership rule
 * read as a persona rule while deciding exactly the same thing.
 *
 * That is also why the sentence shown when `removable` is `false` — "This
 * vehicle belongs to the fleet you drive for, not to you." — needs no persona
 * test to be accurate: **only a roster driver can reach it.** A BUSINESS
 * account's list is scoped to its own `{ companyId }`, so every row it sees is
 * COMPANY-owned and every row is removable; a driver sees a COMPANY-owned row
 * only through an open `DriverVehicleAssignment`, and
 * `POST /api/logistics-company/vehicles/[id]/assignment` requires the driver to
 * match `{ userId, companyId: company.id }`, so a driver holding one is
 * necessarily on that company's roster. The sentence is a roster-driver
 * sentence by construction. It stays correct for the legacy personal vehicle
 * such a driver may also own, which is DRIVER-owned, removable, and gets the
 * Remove button — removing it being the corrective action for exactly the row
 * the roster guard now stops being created.
 */

const GENERIC_ERROR = "Could not remove this vehicle.";
const NETWORK_ERROR = "Network error. Please check your connection.";

/** The design's destructive button, unarmed: white, red text, red border. */
const REMOVE_UNARMED_CLASSES =
  "border-[oklch(57.7%_0.245_27.325)] bg-background " +
  "text-[oklch(44.4%_0.177_26.899)] hover:bg-[oklch(93.6%_0.032_17.717)] " +
  "hover:text-[oklch(44.4%_0.177_26.899)]";

/**
 * Armed: solid red with white text. Spelled out rather than using `Button`'s
 * `destructive` variant, which is *tinted* (`bg-destructive/10`) in this
 * design system and would read as the unarmed state.
 */
const REMOVE_ARMED_CLASSES =
  "border-transparent bg-[oklch(57.7%_0.245_27.325)] text-white " +
  "hover:bg-[oklch(50%_0.22_27.325)] hover:text-white";

const REMOVE_ARMED_NOTE =
  "Click again to delete this vehicle for good. Its photos go with it, and " +
  "any open driver assignment ends.";

const REMOVE_UNARMED_NOTE =
  "Deletes the vehicle record outright. There is no defleeted state to bring " +
  "it back from, so putting it back on the road means registering it again.";

/**
 * Why the odometer, fuel, weekly job count, operating cities and running costs
 * are placeholders. Transcribed from the retirement notes in
 * `src/lib/dashboard/hub/sample.ts`, so each badge's tooltip names the schema
 * change that would make the figure real.
 */
const SAMPLE_NOTES = {
  specs:
    "Vehicle stores no odometer reading, fuel type or per-vehicle job count. " +
    "Retire with Vehicle.odometerKm and a per-vehicle job rollup.",
  cities:
    "Vehicle has no operating-cities column; only the company's fleet-wide " +
    "citiesOfOperation exists. Retire with Vehicle.operatingCities.",
  costs:
    "Nothing records fuel, service, insurance or toll charges against a " +
    "vehicle. Retire with a VehicleExpense model.",
} as const;

/** The grey pill the design uses for a class and for each operating city. */
const NEUTRAL_PILL_CLASSES =
  "h-auto rounded-full border-transparent bg-muted px-[9px] py-[3px] " +
  "text-[11px] font-semibold tracking-[0.02em] text-muted-foreground";

/**
 * Review verdicts rendered in the design's own status vocabulary: the tone
 * comes from `status` (which `hubStatusTone()` maps to one of the six colour
 * pairs) and the wording from `label`. A flagged vehicle blocks dispatch, so
 * it takes the danger tone the design gives "Suspended" rather than falling
 * through to a grey pill nobody reads as a problem.
 */
const REVIEW_BADGE: Record<
  NonNullable<HubVehicle["reviewStatus"]>,
  { status: string; label: string }
> = {
  PENDING: { status: "Pending", label: "In review" },
  FLAGGED: { status: "Suspended", label: "Flagged" },
  APPROVED: { status: "Verified", label: "Approved" },
};

export type VehiclesDetailPanelProps = {
  vehicle: HubVehicle;
  /** Decides which owner-scoped `DELETE` route applies. */
  kind: HubAccountKind;
  /** Whether the remove action is armed. Owned by the screen — see above. */
  armed: boolean;
  onArmedChange: (armed: boolean) => void;
  /** Fired after a successful delete, so the screen can clear its selection. */
  onRemoved: () => void;
};

/** One box of the 2×2 spec grid. */
function SpecBox({
  label,
  value,
  sampled = false,
}: {
  label: string;
  value: React.ReactNode;
  sampled?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[10px] border border-border p-3">
      <p className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 truncate font-price text-base font-semibold">
        {value}
      </p>
      {sampled ? (
        <SampleNote
          note={SAMPLE_NOTES.specs}
          label="Sample"
          className="mt-1.5"
        />
      ) : null}
    </div>
  );
}

export function VehiclesDetailPanel({
  vehicle,
  kind,
  armed,
  onArmedChange,
  onRemoved,
}: VehiclesDetailPanelProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const title = `${vehicle.make} ${vehicle.model}`;
  const assignedName = vehicle.assignment?.driverName ?? "Unassigned";
  const review =
    vehicle.reviewStatus === null || vehicle.reviewStatus === "APPROVED"
      ? null
      : REVIEW_BADGE[vehicle.reviewStatus];

  // The declared payload is the owner's attestation for this specific vehicle
  // and the spec's is the class-level capacity pricing uses. The design shows
  // one number, and the vehicle-specific one is the more informative of the
  // two whenever it was collected.
  const payloadKg = vehicle.declaredPayloadKg ?? vehicle.maxPayloadKg;

  // Both delete routes are scoped to the caller's own rows, so a rostered
  // driver looking at the company van assigned to them would get a 404 rather
  // than a deletion. Say so instead of offering a button that cannot work.
  const removable =
    kind === "BUSINESS"
      ? vehicle.ownership === "COMPANY"
      : vehicle.ownership === "DRIVER";

  const endpoint =
    kind === "BUSINESS"
      ? `/api/logistics-company/vehicles/${vehicle.id}`
      : `/api/driver-profile/vehicles/${vehicle.id}`;

  async function handleRemove() {
    if (!armed) {
      onArmedChange(true);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(endpoint, { method: "DELETE" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        // The route's own wording ("Vehicle not found.", "Only logistics
        // companies can remove fleet vehicles.") is more useful than ours.
        setError(payload?.error ?? GENERIC_ERROR);
        return;
      }

      onArmedChange(false);
      onRemoved();
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
      <div className="pr-9">
        <h2 className="text-base font-semibold tracking-[-0.01em]">{title}</h2>
        <p className="mt-[3px] font-price text-xs text-muted-foreground">
          {vehicle.plateNumber} · {vehicle.year} · {assignedName}
        </p>
      </div>

      <div className="mt-4 mb-5 flex flex-wrap gap-2">
        <HubStatusBadge status={vehicle.status} />
        <Badge variant="outline" className={NEUTRAL_PILL_CLASSES}>
          {vehicle.vehicleClassLabel}
        </Badge>
        {review ? (
          <HubStatusBadge status={review.status} label={review.label} />
        ) : null}
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <SpecBox label="Payload" value={formatKilograms(payloadKg)} />
        <SpecBox label="Fuel" value={vehicle.sampled.fuel} sampled />
        <SpecBox
          label="Odometer"
          value={formatOdometer(vehicle.sampled.odometerKm)}
          sampled
        />
        <SpecBox
          label="Jobs · week"
          value={vehicle.sampled.jobsThisWeek}
          sampled
        />
      </div>

      <div className="mt-5 mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold">Operating cities</h3>
        <SampleNote note={SAMPLE_NOTES.cities} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {vehicle.sampled.operatingCities.length === 0 ? (
          <span className="text-[13px] text-muted-foreground">
            {EMPTY_VALUE}
          </span>
        ) : (
          vehicle.sampled.operatingCities.map((city) => (
            <Badge key={city} variant="outline" className={NEUTRAL_PILL_CLASSES}>
              {city}
            </Badge>
          ))
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold">Running costs · this month</h3>
        <SampleNote note={SAMPLE_NOTES.costs} />
      </div>
      <dl className="mt-0.5">
        {vehicle.sampled.runningCosts.map((cost) => (
          <div
            key={cost.label}
            className="flex justify-between gap-3 border-t border-muted py-[9px] text-[13px]"
          >
            <dt className="text-muted-foreground">{cost.label}</dt>
            <dd className="font-price font-medium">
              {formatGel(cost.amountGel)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-border pt-3">
        <span className="text-sm font-semibold">Cost per km</span>
        <span className="font-price text-lg font-semibold">
          {formatGel(vehicle.sampled.costPerKmGel)}
        </span>
      </div>

      <div className="mt-[22px] border-t border-border pt-[18px]">
        {removable ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void handleRemove();
              }}
              disabled={submitting}
              className={cn(
                "h-auto rounded-md px-[15px] py-[9px] text-[13px] font-medium",
                armed ? REMOVE_ARMED_CLASSES : REMOVE_UNARMED_CLASSES,
              )}
            >
              {submitting
                ? "Removing…"
                : armed
                  ? "Confirm removal"
                  : "Remove vehicle"}
            </Button>
            <p className="mt-[9px] text-xs leading-relaxed text-muted-foreground">
              {armed ? REMOVE_ARMED_NOTE : REMOVE_UNARMED_NOTE}
            </p>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            This vehicle belongs to the fleet you drive for, not to you. Only
            its owner can remove it.
          </p>
        )}

        {/* Inline, beside the control that failed — never an `alert()`. */}
        {error ? (
          <p
            role="alert"
            className="mt-2 text-xs text-[oklch(44.4%_0.177_26.899)]"
          >
            {error}
          </p>
        ) : null}
      </div>
    </HubCard>
  );
}
