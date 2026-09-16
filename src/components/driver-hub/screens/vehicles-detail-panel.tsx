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

/**
 * The design's destructive button, unarmed: white fill, red text, **grey**
 * border — `border: '1px solid ' + (armed ? BAD : LINE)` and
 * `color: armed ? '#fff' : BAD` in the handoff's `dangerBtn`.
 *
 * Two things about that pairing are easy to get wrong in opposite directions.
 * The text is BAD, not the duller BAD_FG: BAD_FG is the *pill* red, tuned to sit
 * on a BAD_BG wash, and on the card's own ground it reads as a disabled control
 * rather than a destructive one. The border, though, is plain LINE — the same
 * hairline as every other border on the screen. Only arming it turns the border
 * red, and that is the whole point of the two-step: an unarmed Remove is a quiet
 * button with red lettering, and the red outline is the thing that appears when
 * the next click actually deletes.
 *
 * BAD is named as `text-destructive` rather than spelled out because the
 * handoff's BAD *is* `--destructive`'s light value, to the digit — so the token
 * is not a colour change here, it is the same colour with a dark value attached,
 * and the lettering lightens on the dark card instead of staying a deep red on
 * near-black. Its hover wash has no such token behind it, so that one carries a
 * hand-written `dark:` pair on the same hue with the lightness inverted, which
 * is how every tint on the hub is darkened and what keeps them distinguishable
 * from one another in both themes.
 */
/*
 * ## Why the two `dark:` restatements of classes that are already here
 *
 * This button is a `Button variant="outline"`, and that variant carries
 * `dark:border-input dark:bg-input/30 dark:hover:bg-input/50` (see
 * `buttonVariants` in `src/components/ui/button.tsx`). Those were inert while
 * the app had no `.dark` class and are live now.
 *
 * `cn()` cannot resolve them away. tailwind-merge only collapses classes in the
 * *same* variant scope, so `bg-background` here and `dark:bg-input/30` on the
 * variant are two different declarations that both survive the merge — and in
 * dark mode the `dark:` one is the one that applies, laying a 30% white wash
 * over this button. `dark:bg-background` is therefore not redundant with
 * `bg-background`: it is the only thing that outranks the variant in the theme
 * where the variant speaks. The same holds for `dark:border-border`.
 */
const REMOVE_UNARMED_CLASSES =
  "border-border bg-background dark:border-border dark:bg-background " +
  "text-destructive hover:bg-[oklch(93.6%_0.032_17.717)] " +
  "dark:hover:bg-[oklch(28%_0.06_17.717)] hover:text-destructive";

/**
 * Armed: solid red with white text. The fill is named directly rather than
 * reached for through `Button`'s `destructive` *variant*, which is *tinted*
 * (`bg-destructive/10`) in this design system and would read as the unarmed
 * state — the variant is what is being avoided, not the token, which is the
 * handoff's BAD exactly and so flips the fill for free.
 *
 * The white lettering is not themed and should not be: `text-white` here is
 * contrast against a saturated red fill, not against the page, and red stays
 * red in both themes.
 */
/*
 * The `dark:` half is the same point the unarmed block above makes, and this is
 * where it bites hardest: without it, `outline`'s `dark:bg-input/30` paints its
 * wash straight over `bg-destructive` and the armed button — the one that
 * actually deletes on the next click — renders as a plain dark-grey rectangle
 * in dark mode. Verified in Chromium before the fix. A destructive confirm that
 * does not read as destructive is the failure this whole two-step exists to
 * prevent, so the fill, the hover and the border are all restated under `dark:`.
 */
/*
 * The dark fill is the handoff's BAD spelled out rather than `bg-destructive`,
 * and that is deliberate: `--destructive` is a *lighter* red after dark
 * (`oklch(0.704 0.191 22.216)`), which is right for the token's usual jobs here
 * — `text-destructive` lettering and the `bg-destructive/10` tint the `Button`
 * variant uses — but wrong as a solid fill under `text-white`. Measured in
 * Chromium, white on the dark token is **2.89:1**, under the 3:1 floor and well
 * under AA; white on BAD is 4.77:1, and BAD is what the light half already
 * paints. So the armed button keeps one red in both themes, and a deep
 * saturated red on a near-black page still reads as loud as it needs to.
 */
const REMOVE_ARMED_CLASSES =
  "border-transparent bg-destructive text-white " +
  "hover:bg-destructive/90 hover:text-white " +
  "dark:border-transparent dark:bg-[oklch(57.7%_0.245_27.325)] " +
  "dark:hover:bg-[oklch(52%_0.235_27.325)]";

const REMOVE_ARMED_NOTE =
  "Click again to delete this vehicle for good. Its photos go with it, and " +
  "any open driver assignment ends.";

const REMOVE_UNARMED_NOTE =
  "Deletes the vehicle record outright. There is no defleeted state to bring " +
  "it back from, so putting it back on the road means registering it again.";

/**
 * ## Why this is "Remove vehicle" and not the design's "Defleet vehicle"
 *
 * The handoff's button reads `Defleet vehicle` → `Confirm defleet`, with a
 * third `Return to fleet` state and the note "Takes it out of service and
 * unassigns its driver. **Reversible.**" Every word of that is a promise about
 * a lifecycle column: its `defleet()` handler pushes the plate onto a
 * `defleeted` array and its `Defleeted` status is derived from that list.
 *
 * `Vehicle` has no status column, and both routes behind this button
 * (`DELETE /api/{logistics-company,driver-profile}/vehicles/[id]`) end in
 * `prisma.vehicle.delete()` — the row goes, and `deleteVehiclePhotos()` takes
 * its Storage objects with it. Nothing reinstates one. Borrowing the design's
 * softer word for that would tell an operator their van is parked when it has
 * been destroyed, and `Return to fleet` would be a button with no endpoint to
 * call. So the label names what the endpoint does.
 *
 * Retire this note alongside the `HubVehicleStatus` narrowing in
 * `src/lib/dashboard/hub/vehicles.ts`: once a lifecycle column exists and the
 * routes become state changes, the design's three labels are all reachable.
 */

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
    "Nothing records fuel, service, parking or toll charges against a " +
    "vehicle. Retire with a VehicleExpense model.",
} as const;

/** The grey pill the design uses for a class and for each operating city. */
const NEUTRAL_PILL_CLASSES =
  "h-auto rounded-full border-transparent bg-muted px-[9px] py-[3px] " +
  "text-[11px] font-semibold tracking-[0.02em] text-muted-foreground";

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

      {/* Two pills, as the design has it: status then class. A blocking review
          verdict used to ride here as a third; it is reachable through the
          screen's "Needs review" tab instead, which is now the only surface for
          it — see the note in `vehicles-screen.tsx`. */}
      <div className="mt-4 mb-5 flex flex-wrap gap-2">
        <HubStatusBadge status={vehicle.status} />
        <Badge variant="outline" className={NEUTRAL_PILL_CLASSES}>
          {vehicle.vehicleClassLabel}
        </Badge>
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

        {/* Inline, beside the control that failed — never an `alert()`. The
            handoff's darker error red is dropped in favour of `--destructive`:
            it was chosen to carry small text on a white card, which is a
            judgement the token now makes per theme, and a frozen 44% red would
            be all but unreadable on the dark one. */}
        {error ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </HubCard>
  );
}
