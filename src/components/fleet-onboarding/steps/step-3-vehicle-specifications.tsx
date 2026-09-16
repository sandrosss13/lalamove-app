"use client";

/**
 * Step 3 — vehicle specifications: the numbered vehicle table generated from
 * step 2's fleet counts, and the editor dialog that specifies one of them.
 *
 * This step is the **only** writer of `draft.vehicles`. Step 2 writes
 * `draft.fleet.counts` and nothing else; on mount, and whenever those counts
 * change, this step reconciles the vehicle list against them and writes the
 * result back — preserving every already-specified vehicle in each (body ×
 * class) group and adding or removing only at that group's tail. The one field
 * on a vehicle this step does not own is `driverProfileId`, which step 4 writes
 * and which rides along untouched on every preserved row.
 *
 * Nothing here reaches the database. Every value lives in the draft until the
 * submit endpoint validates and persists it, which is also why
 * `Vehicle.plateNumber` — globally unique — is never claimed by an abandoned
 * draft.
 */

import { Fragment, useEffect, useState } from "react";

import {
  FLEET_SCREENS,
  useFleetDraft,
} from "@/components/fleet-onboarding/fleet-draft-context";
import {
  VehicleEditorDialog,
  type VehicleEditorValues,
} from "@/components/fleet-onboarding/vehicle-editor-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  findBodyType,
  findVehicleClass,
} from "@/lib/driver-onboarding/vehicle-classes";
import type { FleetDraftVehicle } from "@/lib/fleet-onboarding/draft-schema";
import {
  firstVehicleMessage,
  formatGroupLabel,
  otherPlatesExcluding,
  reconcileFleetVehicles,
  sameVehicleList,
  validateFleetVehicle,
} from "@/lib/fleet-onboarding/fleet-vehicles";

/**
 * The design's "ready" green, now the `--status-success` token from
 * `globals.css` rather than the arbitrary `oklch` values this used to spell out.
 *
 * One ink, one tint, and they take different halves of the token on purpose.
 *
 * The ink is `status-success`, which lifts to `oklch(0.72)` on the dark card —
 * the light green is close enough in lightness to `oklch(0.205)` to be
 * unreadable on it. No `dark:` variant: the token does that itself.
 *
 * The tint is a `color-mix` against `--card`, already a themed token, so the
 * single 12% wash resolves to a pale green on the light card and a deep one on
 * the dark card. It mixes `status-success-SOLID` — the half that stays at the
 * design's `oklch(0.5 0.13 145)` in both themes — because the wash is meant to
 * sit a hair off the card rather than glow off it; the lifted green would take
 * the dark pill from `#1b211b` to `#202820`.
 *
 * Both names are shared with step 4's "assigned" pill, the fleet status screen,
 * the fleet step rail, the driver wizard and the admin review chips. They agree
 * now because they are one definition in `globals.css`, not because five files
 * were copied carefully.
 */
const READY_PILL_CLASS =
  "border-transparent bg-[color-mix(in_oklch,var(--color-status-success-solid)_12%,var(--card))] text-status-success";

/** Shared pill geometry: the design's 20px radius, 11px mono uppercase. */
const PILL_CLASS =
  "inline-flex items-center rounded-[20px] border px-2.5 py-1 font-price text-[11px] font-semibold tracking-[0.06em] uppercase";

/** The editor's initial values for one draft vehicle. */
function editorValuesFor(vehicle: FleetDraftVehicle): VehicleEditorValues {
  return {
    make: vehicle.make ?? "",
    model: vehicle.model ?? "",
    prefillSource: vehicle.prefillSource ?? null,
    year: vehicle.year,
    plateNumber: vehicle.plateNumber ?? "",
    colour: vehicle.colour ?? "",
    payloadKg: vehicle.payloadKg,
    cargoLengthM: vehicle.cargoLengthM,
    cargoWidthM: vehicle.cargoWidthM,
    cargoHeightM: vehicle.cargoHeightM,
  };
}

export function Step3VehicleSpecifications() {
  const { draft, updateDraft, goToStep, showToast } = useFleetDraft();

  // `editingId` is kept while the dialog animates closed so its copy does not
  // blank mid-transition; `editorOpen` is what actually opens and closes it.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // Raised by a refused Continue, which is what turns an Incomplete pill red.
  const [showErrors, setShowErrors] = useState(false);

  // Counts are NESTED at `draft.fleet.counts` — `draft.fleet` is a
  // `FleetDraftFleet` object, not the count map itself.
  const counts = draft.fleet?.counts;
  const vehicles = draft.vehicles ?? [];

  // Materialise (and re-materialise) the vehicle list from the counts. The
  // write is guarded on `sameVehicleList` — comparing membership by id, since a
  // resumed draft is a fresh parse and reference equality would always differ —
  // because an unguarded write here would loop through `updateDraft` forever.
  useEffect(() => {
    const reconciled = reconcileFleetVehicles(
      counts ?? {},
      draft.vehicles ?? [],
    );
    if (sameVehicleList(reconciled, draft.vehicles ?? [])) return;
    updateDraft({ vehicles: reconciled });
  }, [counts, draft.vehicles, updateDraft]);

  // Recomputed per render, never captured once: a wizard left open across
  // midnight on 31 December must not reject a brand-new vehicle's year.
  const currentYear = new Date().getFullYear();

  /** Every failing field of one vehicle, with the rest of the fleet's plates
   *  (its own excluded) as the duplicate check's reference. */
  function problemsFor(vehicle: FleetDraftVehicle) {
    return validateFleetVehicle(
      vehicle,
      currentYear,
      otherPlatesExcluding(vehicles, vehicle.id),
    );
  }

  const readyCount = vehicles.filter(
    (vehicle) => firstVehicleMessage(problemsFor(vehicle)) === null,
  ).length;

  const editingIndex = vehicles.findIndex(
    (vehicle) => vehicle.id === editingId,
  );
  const editingVehicle = vehicles[editingIndex] ?? null;

  function openEditor(vehicleId: string) {
    setEditingId(vehicleId);
    setEditorOpen(true);
  }

  /**
   * Writes one edited vehicle back into the draft. The existing row is spread
   * first so `chassisType`, `classId`, `id` and step 4's `driverProfileId`
   * survive an edit that knows about none of them.
   */
  function handleSaveVehicle(
    vehicleId: string,
    values: VehicleEditorValues,
  ): void {
    const next = vehicles.map((vehicle) =>
      vehicle.id === vehicleId
        ? {
            ...vehicle,
            make: values.make,
            model: values.model,
            prefillSource: values.prefillSource ?? undefined,
            year: values.year,
            plateNumber: values.plateNumber,
            colour: values.colour,
            payloadKg: values.payloadKg,
            cargoLengthM: values.cargoLengthM,
            cargoWidthM: values.cargoWidthM,
            cargoHeightM: values.cargoHeightM,
          }
        : vehicle,
    );

    updateDraft({ vehicles: next });
  }

  function handleContinue() {
    for (const [index, vehicle] of vehicles.entries()) {
      const message = firstVehicleMessage(problemsFor(vehicle));
      if (message === null) continue;

      setShowErrors(true);
      // Deliberately NOT the form steps' generic "Fix the highlighted fields to
      // continue.": on a table step the failing field is inside a closed dialog,
      // so a message pointing at "highlighted fields" would point at nothing.
      // The row prefix is what tells the company where to look.
      showToast(`Vehicle ${index + 1}: ${message}`, "error");
      return;
    }

    goToStep(FLEET_SCREENS.drivers);
  }

  if (vehicles.length === 0) {
    return (
      <div className="rounded-[14px] border border-border bg-card px-5 py-6">
        <p className="text-sm text-muted-foreground">
          No vehicles yet. Go back and set how many you run in each combination.
        </p>
        <button
          type="button"
          onClick={() => goToStep(FLEET_SCREENS.fleet)}
          className="mt-4 h-11 cursor-pointer rounded-[10px] border border-border bg-card px-5 text-[14.5px] font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Back to fleet composition
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p
        aria-live="polite"
        className="text-right font-price text-[12px] font-semibold tracking-[0.06em] text-muted-foreground uppercase"
      >
        {readyCount} of {vehicles.length} specified
      </p>

      <div className="overflow-hidden rounded-[14px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[52px] pl-4">#</TableHead>
              <TableHead>Class &amp; body</TableHead>
              <TableHead>Make / model</TableHead>
              <TableHead>Plate</TableHead>
              <TableHead>Payload</TableHead>
              <TableHead className="pr-4 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.map((vehicle, index) => {
              const previous = vehicles[index - 1];
              // Reconciliation emits groups body-major then class-minor, so a
              // change of cell against the previous row is exactly a group
              // boundary — and the `#` column keeps counting straight through
              // the heading rows it inserts.
              const startsGroup =
                previous === undefined ||
                previous.chassisType !== vehicle.chassisType ||
                previous.classId !== vehicle.classId;

              const className = findVehicleClass(vehicle.classId).name;
              const bodyLabel = findBodyType(vehicle.chassisType).shortLabel;
              const ready = firstVehicleMessage(problemsFor(vehicle)) === null;
              const failing = !ready && showErrors;
              const number = index + 1;

              return (
                <Fragment key={vehicle.id}>
                  {startsGroup ? (
                    <TableRow className="hover:bg-muted/40">
                      <TableCell
                        colSpan={6}
                        className="bg-muted/40 px-4 py-2 font-price text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
                      >
                        {formatGroupLabel(vehicle.chassisType, vehicle.classId)}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  <TableRow
                    role="button"
                    tabIndex={0}
                    aria-label={`Specify vehicle ${number}, ${className} ${bodyLabel}`}
                    onClick={() => openEditor(vehicle.id)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      // Space would otherwise scroll the page out from under the
                      // dialog that is about to open.
                      event.preventDefault();
                      openEditor(vehicle.id);
                    }}
                    className={`cursor-pointer ${failing ? "bg-destructive/5" : ""}`}
                  >
                    <TableCell className="pl-4 font-price text-[13px] text-muted-foreground">
                      {number}
                    </TableCell>
                    <TableCell>
                      <span className="block text-sm font-medium">
                        {className}
                      </span>
                      <span className="block text-[12px] text-muted-foreground">
                        {bodyLabel}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {vehicle.make && vehicle.model
                        ? `${vehicle.make} ${vehicle.model}`
                        : "—"}
                    </TableCell>
                    <TableCell className="font-price font-semibold tracking-[0.12em]">
                      {vehicle.plateNumber ? vehicle.plateNumber : "—"}
                    </TableCell>
                    <TableCell className="font-price text-[13px]">
                      {vehicle.payloadKg === undefined
                        ? "—"
                        : `${vehicle.payloadKg.toLocaleString("en-US")} kg`}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <span
                        className={`${PILL_CLASS} ${
                          ready
                            ? READY_PILL_CLASS
                            : failing
                              ? "border-transparent bg-destructive/10 text-destructive"
                              : "border-transparent bg-muted text-muted-foreground"
                        }`}
                      >
                        {ready ? "Ready" : "Incomplete"}
                      </span>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-2 flex items-center gap-3.5 border-t border-border pt-5">
        {/* `text-white` on `bg-onboarding-accent` is right in both themes and
            must not grow a `dark:` variant: the brand orange is
            theme-independent by design, so its label is too. */}
        <button
          type="button"
          onClick={handleContinue}
          className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={() => goToStep(FLEET_SCREENS.fleet)}
          className="h-12 cursor-pointer rounded-[11px] border border-border bg-card px-5 text-[14.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Back
        </button>
      </div>

      {editingVehicle !== null ? (
        <VehicleEditorDialog
          // Keyed on the row so a different vehicle can never inherit the
          // previous one's field state, on top of the dialog's own re-seed.
          key={editingVehicle.id}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          index={editingIndex + 1}
          classId={editingVehicle.classId}
          chassisType={editingVehicle.chassisType}
          initial={editorValuesFor(editingVehicle)}
          otherPlates={otherPlatesExcluding(vehicles, editingVehicle.id)}
          onToast={showToast}
          onSave={(values) => {
            handleSaveVehicle(editingVehicle.id, values);
            showToast(`Vehicle ${editingIndex + 1} saved.`);
            return true;
          }}
        />
      ) : null}
    </div>
  );
}
