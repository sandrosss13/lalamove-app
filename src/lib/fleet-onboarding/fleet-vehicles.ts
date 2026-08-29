/**
 * Step 3's vehicle list: the order the whole feature numbers by, the generation
 * and preservation algorithm that derives the list from step 2's counts, and the
 * client-side per-vehicle validator.
 *
 * Pure — no React, no clock, no I/O, and no Prisma *value* import (the
 * `ChassisType` import is type-only, so it is erased at build time and never
 * reaches the browser bundle). `currentYear` and the fleet's other plates are
 * arguments rather than things this module reads for itself, which is what keeps
 * every rule a pure function of its inputs.
 *
 * Bounds live where the shape they constrain lives: `FLEET_MAX_PER_CELL` is
 * imported from `draft-schema.ts` rather than restated as an inline `40`. The
 * fleet-size bounds in that same module (`FLEET_MIN_VEHICLES` /
 * `FLEET_MAX_VEHICLES`) are step 2's gate and the submit endpoint's gate, not
 * this module's — step 3 specifies whatever step 2 declared — so they are
 * deliberately neither imported here nor copied.
 */
import type { ChassisType } from "@prisma/client";

import {
  FLEET_MAX_PER_CELL,
  type FleetDraftVehicle,
} from "@/lib/fleet-onboarding/draft-schema";
import {
  BODY_TYPES,
  VEHICLE_CLASSES,
  findBodyType,
  findVehicleClass,
  resolveVehicleTypeSpecCode,
  type VehicleClassId,
} from "@/lib/driver-onboarding/vehicle-classes";

// ── Ordering: the one rule the whole feature numbers by ─────────────────────

/**
 * Cargo body types, in the order the step-2 panels are stacked.
 *
 * Derived from `BODY_TYPES` rather than written out again, so "the order the
 * panels are stacked" stays true by construction instead of by two lists
 * happening to agree. Same reasoning as the ban on a local `BODY_LABEL` map.
 */
export const BODY_ORDER: ChassisType[] = BODY_TYPES.map((body) => body.id);

/** Vehicle classes, in `VEHICLE_CLASSES` order — derived for the same reason. */
export const CLASS_ORDER: VehicleClassId[] = VEHICLE_CLASSES.map(
  (vehicleClass) => vehicleClass.id,
);

/** The draft's count key for one (body × class) cell. */
export function cellKey(
  chassisType: ChassisType,
  classId: VehicleClassId,
): string {
  return `${chassisType}:${classId}`;
}

/**
 * The heading a group of vehicles is introduced by, e.g. `Dry Box · Medium
 * Truck`. Both halves come from `task-04`'s taxonomy so the step-3 table, the
 * step-2 panels and every later summary spell them identically.
 */
export function formatGroupLabel(
  chassisType: ChassisType,
  classId: VehicleClassId,
): string {
  return `${findBodyType(chassisType).shortLabel} · ${findVehicleClass(classId).name}`;
}

// ── Generation and preservation ─────────────────────────────────────────────

/**
 * A freshly generated, entirely unspecified vehicle for one cell.
 *
 * `driverProfileId` is left ABSENT rather than set to null: the canonical
 * `FleetDraftVehicle` types it `driverProfileId?: string`, and absent is what
 * step 4 reads as unassigned.
 *
 * `crypto.randomUUID()` needs no polyfill — it exists in every browser this app
 * targets and in Node 19+ — and this is only ever called client-side.
 */
function createBlankVehicle(
  chassisType: ChassisType,
  classId: VehicleClassId,
): FleetDraftVehicle {
  return { id: crypto.randomUUID(), chassisType, classId };
}

/**
 * Rebuilds the vehicle list from the step-2 counts, preserving every
 * already-specified vehicle in each (body × class) group and adding or removing
 * only at that group's tail.
 *
 * Groups are enumerated body-major, class-minor: all of `DRY_BOX`'s classes in
 * `CLASS_ORDER`, then `REFRIGERATED`'s, then `OPEN_CHASSIS`'s. The flattened
 * result is what the `#` column counts over, continuously across group
 * boundaries, and steps 4 and 5 and the status screen all number the same array
 * the same way — so a vehicle carries one number everywhere.
 *
 * `existing` is read in array order, which is the order a previous run of this
 * same function produced, so the filter below is stable: a preserved vehicle
 * keeps its position relative to its group-mates, and therefore keeps its
 * number unless a group *before* it changed size.
 *
 * Three consequences, all intended:
 *   - A survivor is pushed through as the **same object reference**, never
 *     rebuilt, so its `id` and its `driverProfileId` ride along untouched.
 *   - A cell dropped to zero drops its vehicles entirely, drivers included —
 *     that is what "removes at the tail" means when the tail is the whole group.
 *   - Running this on its own output returns an equal array (idempotent), which
 *     is what lets the caller guard its write and avoid a render loop.
 */
export function reconcileFleetVehicles(
  counts: Record<string, number>,
  existing: FleetDraftVehicle[],
): FleetDraftVehicle[] {
  const next: FleetDraftVehicle[] = [];

  for (const chassisType of BODY_ORDER) {
    for (const classId of CLASS_ORDER) {
      // A locked cell resolves to null and can never carry a count; guarded
      // anyway so a hand-edited draft cannot smuggle one in.
      if (resolveVehicleTypeSpecCode(classId, chassisType) === null) continue;

      const raw = counts[cellKey(chassisType, classId)] ?? 0;
      const count = Number.isInteger(raw)
        ? Math.min(Math.max(raw, 0), FLEET_MAX_PER_CELL)
        : 0;
      if (count === 0) continue;

      const group = existing.filter(
        (vehicle) =>
          vehicle.chassisType === chassisType && vehicle.classId === classId,
      );

      if (group.length >= count) {
        // Shrink: keep the FIRST `count`, drop from the tail. The company
        // filled them in top-down, so the tail is the least-invested end.
        next.push(...group.slice(0, count));
      } else {
        // Grow: every survivor, then blanks appended after them.
        next.push(...group);
        for (let index = group.length; index < count; index += 1) {
          next.push(createBlankVehicle(chassisType, classId));
        }
      }
    }
  }

  return next;
}

/**
 * Whether two vehicle lists are the same list, by length and then `id`
 * pairwise.
 *
 * Reference equality is not enough — a resumed draft is a fresh parse, so every
 * object differs — and a deep compare would report a difference on every
 * keystroke. Comparing ids is exactly the question the reconciling effect asks:
 * "did the *membership* change?". Guarding the write on this is what stops that
 * effect looping through `updateDraft`.
 */
export function sameVehicleList(
  left: FleetDraftVehicle[],
  right: FleetDraftVehicle[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((vehicle, index) => vehicle.id === right[index]?.id);
}

// ── Validation and readiness ────────────────────────────────────────────────

export const MIN_VEHICLE_YEAR = 1995;
export const MIN_PLATE_LENGTH = 4;
export const MIN_PAYLOAD_KG = 100;
export const MAX_PAYLOAD_KG = 40_000;
export const MAX_DIMENSION_M = 20;
/** A tractor unit plus a standard semi-trailer is never shorter than this. */
export const MIN_TRAILER_LENGTH_M = 8;

/** Which fields of one vehicle can carry their own inline message. */
export type VehicleFieldKey =
  "makeModel" | "year" | "plate" | "colour" | "payload" | "dimensions";

export type VehicleFieldErrors = Partial<Record<VehicleFieldKey, string>>;

/**
 * The fixed order the table's toast and the editor's toast read errors in, so
 * "the first message" is deterministic rather than dependent on object key
 * ordering.
 */
export const VEHICLE_FIELD_ORDER: VehicleFieldKey[] = [
  "makeModel",
  "year",
  "plate",
  "colour",
  "payload",
  "dimensions",
];

/** Every message this validator can produce, kept together so the copy is
 *  reviewable in one place. */
export const VEHICLE_MESSAGES = {
  makeModel: "Select or type the make and model.",
  yearMissing: "Enter the year of manufacture.",
  plateMissing: "Enter the licence plate.",
  plateShort: "That plate looks incomplete.",
  colour: "Select the vehicle colour.",
  payloadMissing: "Enter the maximum payload in kg.",
  payloadRange: `Payload must be between ${MIN_PAYLOAD_KG} and ${MAX_PAYLOAD_KG.toLocaleString("en-US")} kg.`,
  dimensionsMissing: "Give length, width and height in metres.",
  dimensionsHigh: "Check the dimensions — metres, not centimetres.",
  trailerLength: `A trailer truck's cargo length must be at least ${MIN_TRAILER_LENGTH_M} m.`,
  noModelMatch: "No match. Type the make and model manually.",
  volumeHint: "Length × width × height of the usable load space.",
} as const;

/**
 * Every failing field of one vehicle at once, so the editor can reveal all of
 * them rather than marching the company through one error at a time, and so a
 * caller can report "the first message" through `VEHICLE_FIELD_ORDER`.
 *
 * Pure: `currentYear` is passed in rather than read here, because the ceiling
 * must be recomputed per render — a wizard left open across midnight on 31
 * December must not reject a brand-new vehicle's year — and because a rule that
 * reads the clock is a rule that cannot be tested.
 *
 * `otherPlates` maps an UPPERCASED plate to the 1-based number of the vehicle
 * that already holds it, and must exclude the vehicle being validated. The
 * duplicate check it powers is a client-side courtesy over what the server
 * enforces for real: `Vehicle.plateNumber` is globally `@unique`, so submit
 * re-checks both in-fleet duplicates (400) and cross-fleet collisions (409 on
 * `P2002`).
 *
 * DELIBERATE DUPLICATE — do not de-duplicate this. It is the client-side half
 * of a pair. The authoritative server-side twin is `validateVehicleInput` in
 * `src/lib/fleet-onboarding/vehicle-validation.ts` (task-14), which re-checks
 * the same rules against the saved draft on submit and against the corrected
 * body on `PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]`.
 * Nothing this function returns is trusted there. The two are kept apart on
 * purpose — this one reports per-FIELD keys so each message can render under its
 * own input, that one accumulates prefixed sentences into a `problems[]` array —
 * and neither imports the other, so this module stays free of any server-only
 * import and the server never trusts a client verdict. If a rule changes, change
 * BOTH, and treat the server's version as the definition.
 */
export function validateFleetVehicle(
  vehicle: FleetDraftVehicle,
  currentYear: number,
  otherPlates: Map<string, number>,
): VehicleFieldErrors {
  const errors: VehicleFieldErrors = {};

  if (
    (vehicle.make ?? "").trim() === "" ||
    (vehicle.model ?? "").trim() === ""
  ) {
    errors.makeModel = VEHICLE_MESSAGES.makeModel;
  }

  const year = vehicle.year;
  if (year === undefined) {
    errors.year = VEHICLE_MESSAGES.yearMissing;
  } else if (
    !Number.isInteger(year) ||
    year < MIN_VEHICLE_YEAR ||
    year > currentYear
  ) {
    errors.year = `Year must be between ${MIN_VEHICLE_YEAR} and ${currentYear}.`;
  }

  const plate = (vehicle.plateNumber ?? "").trim();
  if (plate === "") {
    errors.plate = VEHICLE_MESSAGES.plateMissing;
  } else if (plate.length < MIN_PLATE_LENGTH) {
    errors.plate = VEHICLE_MESSAGES.plateShort;
  } else {
    const duplicateOf = otherPlates.get(plate.toUpperCase());
    if (duplicateOf !== undefined) {
      errors.plate = `That plate is already used by vehicle ${duplicateOf}.`;
    }
  }

  if ((vehicle.colour ?? "").trim() === "") {
    errors.colour = VEHICLE_MESSAGES.colour;
  }

  const payload = vehicle.payloadKg;
  if (payload === undefined) {
    errors.payload = VEHICLE_MESSAGES.payloadMissing;
  } else if (
    !Number.isFinite(payload) ||
    payload < MIN_PAYLOAD_KG ||
    payload > MAX_PAYLOAD_KG
  ) {
    errors.payload = VEHICLE_MESSAGES.payloadRange;
  }

  const dimensions = [
    vehicle.cargoLengthM,
    vehicle.cargoWidthM,
    vehicle.cargoHeightM,
  ];
  if (
    dimensions.some(
      (value) => value === undefined || !Number.isFinite(value) || value <= 0,
    )
  ) {
    errors.dimensions = VEHICLE_MESSAGES.dimensionsMissing;
  } else if (dimensions.some((value) => (value ?? 0) > MAX_DIMENSION_M)) {
    errors.dimensions = VEHICLE_MESSAGES.dimensionsHigh;
  } else if (
    vehicle.classId === "TRAILER_TRUCK" &&
    (vehicle.cargoLengthM ?? 0) < MIN_TRAILER_LENGTH_M
  ) {
    errors.dimensions = VEHICLE_MESSAGES.trailerLength;
  }

  return errors;
}

/** Whether a vehicle is fully and validly specified — the table's Ready pill
 *  and the header counter both read this. */
export function isVehicleReady(
  vehicle: FleetDraftVehicle,
  currentYear: number,
  otherPlates: Map<string, number>,
): boolean {
  return (
    Object.keys(validateFleetVehicle(vehicle, currentYear, otherPlates))
      .length === 0
  );
}

/**
 * The message to lead with for one vehicle, read through `VEHICLE_FIELD_ORDER`,
 * or `null` when nothing is wrong. Both the table's Continue toast and the
 * editor's failed-Save toast go through this so the two always name the same
 * field first.
 */
export function firstVehicleMessage(errors: VehicleFieldErrors): string | null {
  for (const field of VEHICLE_FIELD_ORDER) {
    const message = errors[field];
    if (message !== undefined) return message;
  }
  return null;
}

/**
 * The plates held by every vehicle *except* `excludedId`, uppercased and mapped
 * to that vehicle's 1-based number — the shape `validateFleetVehicle` and the
 * editor dialog both take.
 *
 * Built per subject rather than once for the whole fleet because a vehicle must
 * never be reported as a duplicate of itself. With at most 40 vehicles the
 * quadratic cost of calling this per row is a few hundred string comparisons.
 */
export function otherPlatesExcluding(
  vehicles: FleetDraftVehicle[],
  excludedId: string | null,
): Map<string, number> {
  const plates = new Map<string, number>();

  vehicles.forEach((vehicle, index) => {
    if (vehicle.id === excludedId) return;
    const plate = vehicle.plateNumber?.trim().toUpperCase();
    // A later duplicate must not overwrite the earlier holder: the company is
    // told which row *already* had the plate, which is the earlier one.
    if (plate && !plates.has(plate)) plates.set(plate, index + 1);
  });

  return plates;
}
