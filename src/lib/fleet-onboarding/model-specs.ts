/**
 * Published make/model reference figures for the fleet onboarding wizard, and
 * the pure functions that adjust them for a cargo body type.
 *
 * Step 3 of the wizard asks a company to specify up to 40 vehicles. Picking a
 * make and model prefills payload and cargo dimensions from the table below,
 * adjusted for the body type the vehicle was declared under, so the company
 * corrects four figures instead of typing them. The prefill is a convenience:
 * every field stays editable, and a vehicle that is not in this table is
 * specified by hand.
 *
 * These are realistic reference values authored for the design handoff, NOT a
 * manufacturer database — the box payload and internal dimensions of the
 * standard cargo variant of each model, before body adjustment. They prefill a
 * figure a company then attests to on a compliance record, so a wrong number
 * becomes a wrong record: they are flagged for operations review in
 * `specs/business-fleet-onboarding/action-required.md`, and correcting one is a
 * change to this file alone.
 *
 * Pure data and pure functions with no server-only dependency (the
 * `@prisma/client` import is type-only, so it is erased at build time and never
 * reaches the browser bundle) — safe to import from client components and from
 * server routes alike, which is what lets the submit endpoint re-derive a
 * prefill server-side instead of trusting the one the client sent.
 */
import type { ChassisType } from "@prisma/client";

/**
 * The five vehicle classes both onboarding flows offer.
 *
 * Deliberately re-declared here rather than imported from
 * `src/lib/driver-onboarding/vehicle-classes.ts`: that module still declares
 * four classes until task-04 widens it to five, and this module has to typecheck
 * on its own before that lands. The two unions must stay member-for-member
 * identical — once task-04 ships they are structurally the same type and
 * assignable in both directions. These strings are also the `VehicleClass`
 * Prisma enum's member names.
 */
export type VehicleClassId =
  | "SMALL_VAN"
  | "LARGE_VAN"
  | "MEDIUM_TRUCK"
  | "HEAVY_FREIGHT_TRUCK"
  | "TRAILER_TRUCK";

/** A cargo capacity figure set: what a vehicle can carry and the internal
 *  dimensions of its hold. Metres and kilograms throughout. */
export type ModelSpec = {
  payloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
};

/** One published reference row: a make and model plus the capacity of its
 *  standard cargo variant, before any body-type adjustment. */
export type VehicleModelReference = ModelSpec & {
  make: string;
  model: string;
};

/**
 * 31 reference rows grouped by vehicle class. Order within each class is the
 * design's order and is what the make/model dropdown lists; the first row of a
 * class doubles as that class's default prefill (see `defaultSpecForClass`).
 */
export const MODEL_REFERENCES: Record<VehicleClassId, VehicleModelReference[]> =
  {
    SMALL_VAN: [
      {
        make: "Renault",
        model: "Dokker Van",
        payloadKg: 750,
        cargoLengthM: 1.9,
        cargoWidthM: 1.22,
        cargoHeightM: 1.21,
      },
      {
        make: "Fiat",
        model: "Doblò Cargo Maxi",
        payloadKg: 1000,
        cargoLengthM: 2.17,
        cargoWidthM: 1.23,
        cargoHeightM: 1.3,
      },
      {
        make: "Toyota",
        model: "Proace City L2",
        payloadKg: 1000,
        cargoLengthM: 2.16,
        cargoWidthM: 1.23,
        cargoHeightM: 1.24,
      },
      {
        make: "Ford",
        model: "Transit Connect L2",
        payloadKg: 900,
        cargoLengthM: 2.08,
        cargoWidthM: 1.22,
        cargoHeightM: 1.27,
      },
      {
        make: "Citroën",
        model: "Berlingo Van XL",
        payloadKg: 1000,
        cargoLengthM: 2.16,
        cargoWidthM: 1.23,
        cargoHeightM: 1.24,
      },
      {
        make: "Peugeot",
        model: "Partner Long",
        payloadKg: 1000,
        cargoLengthM: 2.16,
        cargoWidthM: 1.23,
        cargoHeightM: 1.24,
      },
    ],
    LARGE_VAN: [
      {
        make: "Fiat",
        model: "Ducato L3H2",
        payloadKg: 1500,
        cargoLengthM: 3.7,
        cargoWidthM: 1.87,
        cargoHeightM: 1.93,
      },
      {
        make: "Ford",
        model: "Transit L3H2",
        payloadKg: 1400,
        cargoLengthM: 3.49,
        cargoWidthM: 1.78,
        cargoHeightM: 1.89,
      },
      {
        make: "Mercedes-Benz",
        model: "Sprinter 315 L3H2",
        payloadKg: 1400,
        cargoLengthM: 3.62,
        cargoWidthM: 1.78,
        cargoHeightM: 1.94,
      },
      {
        make: "Renault",
        model: "Master L3H2",
        payloadKg: 1500,
        cargoLengthM: 3.73,
        cargoWidthM: 1.77,
        cargoHeightM: 1.89,
      },
      {
        make: "Volkswagen",
        model: "Crafter L3H3",
        payloadKg: 1450,
        cargoLengthM: 3.45,
        cargoWidthM: 1.83,
        cargoHeightM: 1.96,
      },
      {
        make: "Iveco",
        model: "Daily 35S L3H2",
        payloadKg: 1500,
        cargoLengthM: 3.54,
        cargoWidthM: 1.8,
        cargoHeightM: 1.9,
      },
    ],
    MEDIUM_TRUCK: [
      {
        make: "Hino",
        model: "916",
        payloadKg: 5500,
        cargoLengthM: 6.2,
        cargoWidthM: 2.35,
        cargoHeightM: 2.35,
      },
      {
        make: "Mitsubishi Fuso",
        model: "Canter 7C15",
        payloadKg: 4200,
        cargoLengthM: 5.6,
        cargoWidthM: 2.2,
        cargoHeightM: 2.25,
      },
      {
        make: "Isuzu",
        model: "NPR 75",
        payloadKg: 4500,
        cargoLengthM: 5.8,
        cargoWidthM: 2.3,
        cargoHeightM: 2.3,
      },
      {
        make: "Iveco",
        model: "Eurocargo 120E",
        payloadKg: 6800,
        cargoLengthM: 7.2,
        cargoWidthM: 2.45,
        cargoHeightM: 2.5,
      },
      {
        make: "Mercedes-Benz",
        model: "Atego 1018",
        payloadKg: 5000,
        cargoLengthM: 6.3,
        cargoWidthM: 2.4,
        cargoHeightM: 2.45,
      },
      {
        make: "Ford",
        model: "Trucks 1026",
        payloadKg: 5800,
        cargoLengthM: 6.8,
        cargoWidthM: 2.45,
        cargoHeightM: 2.5,
      },
    ],
    HEAVY_FREIGHT_TRUCK: [
      {
        make: "MAN",
        model: "TGM 18.290",
        payloadKg: 10500,
        cargoLengthM: 8.6,
        cargoWidthM: 2.45,
        cargoHeightM: 2.7,
      },
      {
        make: "MAN",
        model: "TGL 12.220",
        payloadKg: 6500,
        cargoLengthM: 7.2,
        cargoWidthM: 2.45,
        cargoHeightM: 2.6,
      },
      {
        make: "Volvo",
        model: "FL 280",
        payloadKg: 9500,
        cargoLengthM: 8.4,
        cargoWidthM: 2.45,
        cargoHeightM: 2.65,
      },
      {
        make: "Scania",
        model: "P 280",
        payloadKg: 10000,
        cargoLengthM: 8.5,
        cargoWidthM: 2.45,
        cargoHeightM: 2.7,
      },
      {
        make: "DAF",
        model: "LF 260",
        payloadKg: 8800,
        cargoLengthM: 8.2,
        cargoWidthM: 2.45,
        cargoHeightM: 2.65,
      },
      {
        make: "Mercedes-Benz",
        model: "Atego 1830",
        payloadKg: 9200,
        cargoLengthM: 8.3,
        cargoWidthM: 2.45,
        cargoHeightM: 2.65,
      },
    ],
    TRAILER_TRUCK: [
      {
        make: "Mercedes-Benz",
        model: "Actros 1845 LS",
        payloadKg: 24000,
        cargoLengthM: 13.6,
        cargoWidthM: 2.48,
        cargoHeightM: 2.7,
      },
      {
        make: "Volvo",
        model: "FH 460 4x2",
        payloadKg: 24000,
        cargoLengthM: 13.6,
        cargoWidthM: 2.48,
        cargoHeightM: 2.7,
      },
      {
        make: "Scania",
        model: "R 450 A4x2",
        payloadKg: 24000,
        cargoLengthM: 13.6,
        cargoWidthM: 2.48,
        cargoHeightM: 2.7,
      },
      {
        make: "MAN",
        model: "TGX 18.470",
        payloadKg: 24000,
        cargoLengthM: 13.6,
        cargoWidthM: 2.48,
        cargoHeightM: 2.7,
      },
      {
        make: "DAF",
        model: "XF 480 FT",
        payloadKg: 24000,
        cargoLengthM: 13.6,
        cargoWidthM: 2.48,
        cargoHeightM: 2.7,
      },
      {
        make: "Renault",
        model: "T High 480",
        payloadKg: 24000,
        cargoLengthM: 13.6,
        cargoWidthM: 2.48,
        cargoHeightM: 2.7,
      },
      {
        make: "Iveco",
        model: "S-Way AS440",
        payloadKg: 24000,
        cargoLengthM: 13.6,
        cargoWidthM: 2.48,
        cargoHeightM: 2.7,
      },
    ],
  };

/**
 * Class-level capacity envelope from the design's class cards — the figures a
 * class stands for when no specific model is in play. Unadjusted for body type,
 * like the model rows.
 *
 * `defaultSpecForClass` prefers the class's first model row (which is what the
 * prototype's `syncVehicles` uses when it generates a blank vehicle) and only
 * falls back to these; since every class currently has at least six model rows,
 * the fallback branch is unreachable today. It exists so the function stays
 * total if a class's model list is ever emptied, and because these are the
 * design's published class figures in their own right.
 */
export const CLASS_FALLBACK_SPECS: Record<VehicleClassId, ModelSpec> = {
  SMALL_VAN: {
    payloadKg: 800,
    cargoLengthM: 2.0,
    cargoWidthM: 1.2,
    cargoHeightM: 1.2,
  },
  LARGE_VAN: {
    payloadKg: 1400,
    cargoLengthM: 3.4,
    cargoWidthM: 1.7,
    cargoHeightM: 1.9,
  },
  MEDIUM_TRUCK: {
    payloadKg: 6000,
    cargoLengthM: 6.2,
    cargoWidthM: 2.4,
    cargoHeightM: 2.4,
  },
  HEAVY_FREIGHT_TRUCK: {
    payloadKg: 12000,
    cargoLengthM: 9.6,
    cargoWidthM: 2.45,
    cargoHeightM: 2.7,
  },
  TRAILER_TRUCK: {
    payloadKg: 24000,
    cargoLengthM: 13.6,
    cargoWidthM: 2.48,
    cargoHeightM: 2.7,
  },
};

/**
 * How a cargo body changes the published figures.
 *
 * A refrigerated body loses payload and internal space to insulation and the
 * cooling unit; an open deck carries slightly more, is slightly wider, and has
 * drop sides instead of a ceiling.
 *
 * `heightOffsetM: null` on `OPEN_CHASSIS` is a sentinel, not a zero offset: an
 * open deck has no cargo box, so its "height" is the drop-side height from
 * `DROP_SIDE_HEIGHT_M`, substituted outright rather than added to the model's
 * box height.
 */
const BODY_ADJUSTMENT: Record<
  ChassisType,
  {
    payloadFactor: number;
    lengthOffsetM: number;
    widthOffsetM: number;
    heightOffsetM: number | null;
  }
> = {
  DRY_BOX: {
    payloadFactor: 1,
    lengthOffsetM: 0,
    widthOffsetM: 0,
    heightOffsetM: 0,
  },
  REFRIGERATED: {
    payloadFactor: 0.92,
    lengthOffsetM: -0.25,
    widthOffsetM: -0.12,
    heightOffsetM: -0.16,
  },
  OPEN_CHASSIS: {
    payloadFactor: 1.05,
    lengthOffsetM: 0,
    widthOffsetM: 0.05,
    heightOffsetM: null,
  },
};

/**
 * Drop-side height per class, used in place of a box height on an open chassis.
 *
 * The prototype keys this on three classes and defaults the rest to 0.50 m; it
 * is spelled out for all five here so the lookup is total and no default branch
 * is needed. The two van entries are unreachable through the wizard — the
 * (van × open chassis) cells are locked because no `VehicleTypeSpec` backs them
 * — but they keep the record exhaustive.
 */
const DROP_SIDE_HEIGHT_M: Record<VehicleClassId, number> = {
  SMALL_VAN: 0.5,
  LARGE_VAN: 0.5,
  MEDIUM_TRUCK: 0.5,
  HEAVY_FREIGHT_TRUCK: 0.6,
  TRAILER_TRUCK: 0.6,
};

/** Smallest cargo dimension the wizard will ever prefill, in metres. An offset
 *  can never drive a figure below this. */
const MIN_DIMENSION_M = 0.5;

/** Rounds to the nearest centimetre. Applied to every derived dimension so a
 *  binary-float artefact (2.35 + -0.16 === 2.1899999999999995) never reaches a
 *  form field or the database. */
function roundToCentimetre(metres: number): number {
  return Math.round(metres * 100) / 100;
}

/**
 * Derives the capacity figures to prefill for a vehicle of `classId` with a
 * `chassisType` body, from a published reference row (or from a class fallback —
 * both are `ModelSpec`-shaped).
 *
 * Payload is scaled by the body factor and rounded to the nearest 10 kg, since a
 * payload figure carrying single kilograms reads as a measurement rather than
 * the estimate it is. Length and width take a fixed offset; height takes an
 * offset for a closed body and the class's drop-side height for an open one.
 * Every dimension is floored at 0.5 m and rounded to the centimetre.
 *
 * Pure: same inputs, same output, no clock, no randomness, no I/O.
 */
export function specForModel(
  chassisType: ChassisType,
  classId: VehicleClassId,
  reference: ModelSpec,
): ModelSpec {
  const adjustment = BODY_ADJUSTMENT[chassisType];

  const cargoHeightM =
    adjustment.heightOffsetM === null
      ? DROP_SIDE_HEIGHT_M[classId]
      : roundToCentimetre(
          Math.max(
            MIN_DIMENSION_M,
            reference.cargoHeightM + adjustment.heightOffsetM,
          ),
        );

  return {
    payloadKg:
      Math.round((reference.payloadKg * adjustment.payloadFactor) / 10) * 10,
    cargoLengthM: roundToCentimetre(
      Math.max(
        MIN_DIMENSION_M,
        reference.cargoLengthM + adjustment.lengthOffsetM,
      ),
    ),
    cargoWidthM: roundToCentimetre(
      Math.max(
        MIN_DIMENSION_M,
        reference.cargoWidthM + adjustment.widthOffsetM,
      ),
    ),
    cargoHeightM,
  };
}

/**
 * The figures a freshly generated vehicle row starts with, before the company
 * picks a specific model — the class's first published model, adjusted for the
 * body type, matching the prototype's `syncVehicles`.
 */
export function defaultSpecForClass(
  chassisType: ChassisType,
  classId: VehicleClassId,
): ModelSpec {
  const reference: ModelSpec =
    MODEL_REFERENCES[classId][0] ?? CLASS_FALLBACK_SPECS[classId];

  return specForModel(chassisType, classId, reference);
}

/** Looks a reference row up by its exact make and model, case-insensitively —
 *  what a resumed draft uses to recover the row behind a stored make/model pair
 *  (e.g. to re-render the "Prefilled from …" footer). `null` when the company
 *  typed a vehicle that is not in the table, which is allowed. */
export function findModelReference(
  classId: VehicleClassId,
  make: string,
  model: string,
): VehicleModelReference | null {
  const normalisedMake = make.trim().toLowerCase();
  const normalisedModel = model.trim().toLowerCase();

  return (
    MODEL_REFERENCES[classId].find(
      (reference) =>
        reference.make.toLowerCase() === normalisedMake &&
        reference.model.toLowerCase() === normalisedModel,
    ) ?? null
  );
}

/** Substring filter over "<make> <model>" for the step-3 combobox, matching the
 *  prototype's filter. An empty query returns the class's full list. */
export function searchModelReferences(
  classId: VehicleClassId,
  query: string,
): VehicleModelReference[] {
  const normalised = query.trim().toLowerCase();
  if (normalised === "") return MODEL_REFERENCES[classId];

  return MODEL_REFERENCES[classId].filter((reference) =>
    `${reference.make} ${reference.model}`.toLowerCase().includes(normalised),
  );
}

/** Renders a derived payload for a form field, e.g. `5780`. */
export function formatPayloadKg(value: number): string {
  return String(Math.round(value));
}

/** Renders a derived dimension for a form field, e.g. `6.20` — always two
 *  decimals, matching the design's mono-spaced dimension inputs. */
export function formatDimensionM(value: number): string {
  return value.toFixed(2);
}
