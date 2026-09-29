/**
 * The authoritative, server-side validation of one fleet vehicle.
 *
 * Shared by the two endpoints that can ever write a company's `Vehicle` rows:
 * `POST /api/logistics-company/onboarding/submit` (which runs it over every
 * vehicle in the saved draft) and
 * `PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]` (which runs it
 * over the one corrected vehicle during an action-required round trip). They
 * share this module rather than each carrying their own copy precisely because
 * two copies of a rule set are two rule sets: a value the submit path rejects
 * must stay rejected when the same company sends it back through the correction
 * path, and vice versa.
 *
 * DELIBERATE DUPLICATE, AND THE AUTHORITATIVE HALF. `validateFleetVehicle` in
 * `src/lib/fleet-onboarding/fleet-vehicles.ts` applies the same rules in the
 * browser so the company sees a message under the field it belongs to. That one
 * is a courtesy; THIS one decides. Nothing the client reports is trusted here,
 * and neither module imports the other — the client half must stay free of
 * server-only imports. If a rule changes, change both.
 *
 * Pure functions with no Prisma *client* import (the `@prisma/client` import
 * below is type-only, so it is erased at build time), which is what lets both
 * route handlers pull it in without dragging a database connection into a
 * module that only reasons about values.
 */
import type { ChassisType } from "@prisma/client";

import type { Translator } from "@/i18n/translator";
import {
  BODY_TYPES,
  VEHICLE_CLASSES,
  resolveVehicleTypeSpecCode,
  type VehicleClassId,
} from "@/lib/driver-onboarding/vehicle-classes";
import {
  FLEET_MAX_VEHICLES,
  FLEET_MIN_VEHICLES,
} from "@/lib/fleet-onboarding/draft-schema";

/**
 * Oldest manufacturing year the fleet wizard accepts — the same 1995 floor the
 * individual driver wizard uses, because it is the same declaration about the
 * same kind of vehicle.
 */
export const MIN_VEHICLE_YEAR = 1995;

/** Shortest string that can plausibly be a Georgian licence plate. */
export const MIN_PLATE_LENGTH = 4;

export const MIN_PAYLOAD_KG = 100;
export const MAX_PAYLOAD_KG = 40_000;

/** Metres. A cargo hold larger than this is a centimetres-for-metres typo. */
export const MAX_CARGO_DIMENSION_M = 20;

/**
 * Metres. An articulated combination shorter than this is not a trailer truck —
 * it is a rigid that was filed under the wrong class, and pricing a 24 t
 * articulated job onto it would put freight on a vehicle that cannot take it.
 */
export const MIN_TRAILER_LENGTH_M = 8;

/**
 * The class ids and body types accepted here, derived from the taxonomy rather
 * than restated as literal arrays: a sixth class added to `VEHICLE_CLASSES`
 * must not silently stay unacceptable to the endpoint that writes it.
 */
const VEHICLE_CLASS_IDS: VehicleClassId[] = VEHICLE_CLASSES.map(
  (vehicleClass) => vehicleClass.id,
);
const CHASSIS_TYPES: ChassisType[] = BODY_TYPES.map((body) => body.id);

/** One vehicle, normalised and known to satisfy every rule below. */
export type ValidatedVehicle = {
  classId: VehicleClassId;
  chassisType: ChassisType;
  /** Resolved from (class, body) HERE — never taken from the client. */
  specCode: string;
  /** Trimmed and UPPERCASED, so the globally unique index sees one spelling. */
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  colour: string;
  payloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
};

/**
 * The `next-intl` message path of every rule's sentence, for answering the
 * company in its own language — mirroring `VEHICLE_MESSAGE_KEYS` in
 * `fleet-vehicles.ts`. The English sentences inline below stay as the fallback
 * for a caller that passes no translator. Most paths reuse the driver
 * wizard's submit copy, which states the same rule.
 */
export const VEHICLE_VALIDATION_MESSAGE_KEYS = {
  /** `"{label}: {message}"` — prefixes a rule's sentence with its vehicle. */
  labelled: "errors.fleetVehicleValidation.labelled",
  /** `"Vehicle {number}"` — the submit path's per-row label. */
  vehicleNumber: "fleet.step5ReviewSubmit.vehicleN",
  tooFewVehicles: "fleet.step2FleetComposition.minVehicles",
  tooManyVehicles: "errors.fleetVehicleValidation.tooManyVehicles",
  bodyType: "errors.driverProfileOnboardingSubmit.chooseBodyType",
  vehicleClass: "errors.driverProfileOnboardingSubmit.chooseVehicleClass",
  classUnavailable:
    "errors.driverProfileOnboardingSubmit.classUnavailableForBody",
  make: "errors.driverProfileOnboardingSubmit.enterMake",
  model: "errors.driverProfileOnboardingSubmit.enterModel",
  yearRange: "errors.driverProfileOnboardingSubmit.yearRange",
  plate: "errors.driverProfileOnboardingSubmit.enterPlate",
  colour: "errors.driverProfileOnboardingSubmit.chooseColour",
  payloadRange: "errors.driverProfileOnboardingSubmit.payloadRange",
  dimensions: "errors.driverProfileOnboardingSubmit.checkDimensions",
  trailerLength: "fleet.fleetVehicles.trailerLength",
} as const;

/**
 * How the submit path names the vehicle at `index` (0-based) in its messages:
 * "Vehicle 3", in the reader's language when a translator is given.
 */
export function numberedVehicleLabel(
  index: number,
  translate?: Translator,
): string {
  const number = index + 1;
  return translate
    ? translate(VEHICLE_VALIDATION_MESSAGE_KEYS.vehicleNumber, { number })
    : `Vehicle ${number}`;
}

/** True for a plain JSON object — an array is not a vehicle. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A trimmed non-empty string, or null. */
function trimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** A finite number, or null. Rejects `NaN` and the infinities alike. */
function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The fleet's grand total, re-checked server-side.
 *
 * Step 2's per-cell stepper caps each cell at 40, which is a UI affordance and
 * says nothing about the sum of fifteen cells; this is the bound that is
 * actually enforced. The bounds themselves are imported from `draft-schema.ts`
 * rather than redeclared here — a second pair of constants is exactly how a
 * client that lets a company add a 41st vehicle and a server that silently
 * refuses it come about.
 */
export function validateFleetSize(
  count: number,
  problems: string[],
  /** Renders each message in the reader's language; English when omitted. */
  translate?: Translator,
): void {
  if (count < FLEET_MIN_VEHICLES) {
    // The word "two" is spelled out because this sentence is shown to a person,
    // not assembled from a constant; `FLEET_MIN_VEHICLES` is what decides.
    problems.push(
      translate
        ? translate(VEHICLE_VALIDATION_MESSAGE_KEYS.tooFewVehicles)
        : "A business account needs at least two vehicles. Use the individual driver flow for a single vehicle.",
    );
  }

  if (count > FLEET_MAX_VEHICLES) {
    problems.push(
      translate
        ? translate(VEHICLE_VALIDATION_MESSAGE_KEYS.tooManyVehicles, {
            max: FLEET_MAX_VEHICLES,
          })
        : `An application can hold at most ${FLEET_MAX_VEHICLES} vehicles.`,
    );
  }
}

/**
 * One vehicle's field rules.
 *
 * `label` is how this vehicle is named in the messages — "Vehicle 3" from the
 * submit path, where the company knows its vehicles by their position in the
 * table, and the plate from the correction path, where it is editing one
 * specific row.
 *
 * Appends every failure to `problems` rather than returning at the first, so a
 * single pass reports the same first message a caller would see either way, and
 * so a company with three broken fields is not walked through three round
 * trips. Returns `null` when the vehicle is unusable — a caller that gets
 * `null` must not write anything.
 *
 * `now` is passed in rather than read here so every time-dependent rule in one
 * request agrees about what day it is: a request landing on 1 January must
 * accept a vehicle built that year.
 */
export function validateVehicleInput(
  input: unknown,
  label: string,
  now: Date,
  problems: string[],
  /** Renders each message in the reader's language; English when omitted. */
  translate?: Translator,
): ValidatedVehicle | null {
  const record = isRecord(input) ? input : {};

  /**
   * Records one failure: the catalog sentence prefixed with `label` when
   * translating, else the inline English (already prefixed).
   */
  const report = (
    key: keyof typeof VEHICLE_VALIDATION_MESSAGE_KEYS,
    english: string,
    values?: Record<string, string | number>,
  ) => {
    problems.push(
      translate
        ? translate(VEHICLE_VALIDATION_MESSAGE_KEYS.labelled, {
            label,
            message: translate(VEHICLE_VALIDATION_MESSAGE_KEYS[key], values),
          })
        : english,
    );
  };

  const chassisType = CHASSIS_TYPES.includes(record.chassisType as ChassisType)
    ? (record.chassisType as ChassisType)
    : null;
  if (chassisType === null) {
    report("bodyType", `${label}: choose a cargo body type.`);
  }

  const classId = VEHICLE_CLASS_IDS.includes(record.classId as VehicleClassId)
    ? (record.classId as VehicleClassId)
    : null;
  if (classId === null) {
    report("vehicleClass", `${label}: choose a vehicle class.`);
  }

  // Seven of the fifteen (class, body) cells have no matching spec in the
  // seeded catalogue. The wizard renders those locked, which is trivially
  // bypassed, so the pair is re-resolved here and a locked cell is a hard
  // rejection — never a fallback to a near-miss spec, which would misprice
  // every order the vehicle is ever matched to.
  let specCode: string | null = null;
  if (chassisType !== null && classId !== null) {
    specCode = resolveVehicleTypeSpecCode(classId, chassisType);
    if (specCode === null) {
      report(
        "classUnavailable",
        `${label}: that class isn't available with the selected body type.`,
      );
    }
  }

  // Free text by design: the wizard's model picker is a convenience over a
  // short catalogue, not a closed list, so there is nothing to check beyond
  // presence.
  const make = trimmed(record.make);
  if (make === null) {
    report("make", `${label}: enter the vehicle's make.`);
  }

  const model = trimmed(record.model);
  if (model === null) {
    report("model", `${label}: enter the vehicle's model.`);
  }

  const maxVehicleYear = now.getFullYear();
  const year = finiteNumber(record.year);
  const isValidYear =
    year !== null &&
    Number.isInteger(year) &&
    year >= MIN_VEHICLE_YEAR &&
    year <= maxVehicleYear;
  if (!isValidYear) {
    report(
      "yearRange",
      `${label}: enter a manufacturing year between ${MIN_VEHICLE_YEAR} and ${maxVehicleYear}.`,
      // Strings, not numbers: ICU groups a numeric argument ("2,026").
      { min: String(MIN_VEHICLE_YEAR), max: String(maxVehicleYear) },
    );
  }

  // Uppercased *before* the length check and before the write, so the globally
  // unique `plateNumber` index only ever sees one canonical spelling of a plate
  // and "aa 123 bb" cannot claim a second row beside "AA 123 BB".
  const plateNumber = trimmed(record.plateNumber)?.toUpperCase() ?? null;
  const isValidPlate =
    plateNumber !== null && plateNumber.length >= MIN_PLATE_LENGTH;
  if (!isValidPlate) {
    report("plate", `${label}: enter the licence plate.`);
  }

  const colour = trimmed(record.colour);
  if (colour === null) {
    report("colour", `${label}: choose the vehicle's colour.`);
  }

  const payloadKg = finiteNumber(record.payloadKg);
  const isValidPayload =
    payloadKg !== null &&
    payloadKg >= MIN_PAYLOAD_KG &&
    payloadKg <= MAX_PAYLOAD_KG;
  if (!isValidPayload) {
    report(
      "payloadRange",
      `${label}: maximum payload must be between ${MIN_PAYLOAD_KG.toLocaleString("en-US")} and ${MAX_PAYLOAD_KG.toLocaleString("en-US")} kg.`,
      // Numbers, so ICU groups them in the reader's locale.
      { min: MIN_PAYLOAD_KG, max: MAX_PAYLOAD_KG },
    );
  }

  const cargoLengthM = finiteNumber(record.cargoLengthM);
  const cargoWidthM = finiteNumber(record.cargoWidthM);
  const cargoHeightM = finiteNumber(record.cargoHeightM);
  const hasValidDimensions = [cargoLengthM, cargoWidthM, cargoHeightM].every(
    (value) => value !== null && value > 0 && value <= MAX_CARGO_DIMENSION_M,
  );
  if (!hasValidDimensions) {
    report(
      "dimensions",
      `${label}: check the dimensions — metres, not centimetres.`,
    );
  }

  // Gated on `hasValidDimensions` so a vehicle with no length at all reports
  // the dimensions message once rather than that message plus a second one
  // about a length it never gave.
  if (
    classId === "TRAILER_TRUCK" &&
    hasValidDimensions &&
    cargoLengthM !== null &&
    cargoLengthM < MIN_TRAILER_LENGTH_M
  ) {
    report(
      "trailerLength",
      `${label}: a trailer truck's cargo length must be at least ${MIN_TRAILER_LENGTH_M} m.`,
      { min: MIN_TRAILER_LENGTH_M },
    );
  }

  if (
    chassisType === null ||
    classId === null ||
    specCode === null ||
    make === null ||
    model === null ||
    !isValidYear ||
    year === null ||
    !isValidPlate ||
    plateNumber === null ||
    colour === null ||
    !isValidPayload ||
    payloadKg === null ||
    !hasValidDimensions ||
    cargoLengthM === null ||
    cargoWidthM === null ||
    cargoHeightM === null
  ) {
    return null;
  }

  return {
    classId,
    chassisType,
    specCode,
    plateNumber,
    make,
    model,
    year,
    colour,
    payloadKg,
    cargoLengthM,
    cargoWidthM,
    cargoHeightM,
  };
}
