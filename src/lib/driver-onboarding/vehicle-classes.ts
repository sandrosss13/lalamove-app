/**
 * Maps the onboarding wizards' five vehicle classes onto the existing
 * `VehicleTypeSpec` catalogue seeded in `prisma/seed.ts`.
 *
 * One taxonomy, both flows: the individual driver wizard
 * (`src/components/driver-onboarding`) and the business fleet wizard
 * (`src/components/fleet-onboarding`) render their class cards, gate them on
 * licence category, and resolve a (class, chassis) pair back to a real spec
 * code from this one constant. Letting the two flows keep separate copies is
 * the failure mode `specs/business-fleet-onboarding/requirements.md` exists to
 * prevent, so a change here is deliberately a change to both.
 *
 * Exactly one new `VehicleTypeSpec` row was added for this taxonomy —
 * `TRAILER_TRUCK` — because the class is otherwise unreachable: every other
 * seeded spec tops out at 10,000 kg. Adding rows is otherwise avoided, and that
 * reasoning still governs: order matching (`GET /api/orders`,
 * `POST /api/orders/[id]/accept`, the company dispatch route) keys on an exact
 * `vehicleTypeSpecId`, and the booking/landing pickers treat `pricingRule` as
 * non-nullable — so a new spec row would either break matching for every
 * onboarded driver or duplicate one of the bookable types. That is why only
 * one was added and why it ships with a `PricingRule` of its own. The classes
 * remain a presentation grouping, resolved back to a real seeded `code` at
 * submit time.
 *
 * `HEAVY_FREIGHT_TRUCK` moved from licence category CE to C with the approved
 * business fleet design: a three-axle rigid is a Category C vehicle in Georgia,
 * and CE is what an articulated combination needs — which is now the separate
 * `TRAILER_TRUCK` class. This loosens a gate the individual driver wizard
 * already shipped (a C-only licence can now select Heavy Freight Truck); it is
 * intentional and logged for ops confirmation in
 * `specs/business-fleet-onboarding/action-required.md`. It is a decision, not a
 * typo — and if ops reverses it, this file is the only place to change.
 *
 * Not every (class, chassis) pair has a spec that actually matches on payload
 * and loading access. Those cells are `null` rather than a near-miss spec —
 * callers must lock them in the UI instead of falling back to a mismatched
 * vehicle, which would misprice orders and mis-match cargo.
 *
 * Pure data and pure functions with no server-only dependency (the
 * `@prisma/client` import is type-only, so it is erased at build time and
 * never reaches the browser bundle) — safe to import from both client
 * components and server routes. The submit endpoints must re-run this
 * resolution server-side rather than trusting a spec code sent by the client.
 */
import type { ChassisType, LicenceCategory } from "@prisma/client";

/** The five vehicle classes the onboarding wizards offer — a presentation
 *  grouping over the existing `VehicleTypeSpec` catalogue. Order matches the
 *  design's card order, smallest first. */
export type VehicleClassId =
  | "SMALL_VAN"
  | "LARGE_VAN"
  | "MEDIUM_TRUCK"
  | "HEAVY_FREIGHT_TRUCK"
  | "TRAILER_TRUCK";

export type VehicleClass = {
  id: VehicleClassId;
  name: string;
  /** Mono category chip shown on the card, e.g. "CAT B". */
  chip: string;
  requiredLicenceCategory: LicenceCategory;
  /** Capacity line shown on the card, e.g. "Up to 800 kg · 2 pallets". */
  capacityLine: string;
  /** Sample-models line shown on the card. */
  samplesLine: string;
  /** (chassis type) -> existing VehicleTypeSpec.code, or null if this
   *  combination has no matching spec in the current catalogue and must be
   *  locked in the UI. */
  specCodeByChassis: Record<ChassisType, string | null>;
};

export const VEHICLE_CLASSES: VehicleClass[] = [
  {
    id: "SMALL_VAN",
    name: "Small Van",
    chip: "CAT B",
    requiredLicenceCategory: "B",
    capacityLine: "Up to 800 kg · 2 pallets",
    samplesLine:
      "Renault Dokker · Fiat Doblò · Toyota Proace City · Ford Transit Connect",
    specCodeByChassis: {
      DRY_BOX: "MINIVAN",
      // No small refrigerated van in the catalogue — REFRIGERATED_VAN is a
      // 1,000 kg large van, well past this class's 800 kg ceiling.
      REFRIGERATED: null,
      // No small open-chassis van in the catalogue, and the design does not
      // sell vans as flatbeds on this platform.
      OPEN_CHASSIS: null,
    },
  },
  {
    id: "LARGE_VAN",
    name: "Large Van",
    chip: "CAT B",
    requiredLicenceCategory: "B",
    capacityLine: "800–1,500 kg · 4 pallets",
    samplesLine:
      "Fiat Ducato · Ford Transit · Mercedes-Benz Sprinter · Renault Master",
    specCodeByChassis: {
      DRY_BOX: "CARGO_VAN",
      REFRIGERATED: "REFRIGERATED_VAN",
      // No open-chassis van in the catalogue — FLATBED_TRUCK is a 5,000 kg
      // Cat C truck, not a Cat B van.
      OPEN_CHASSIS: null,
    },
  },
  {
    id: "MEDIUM_TRUCK",
    name: "Medium Truck",
    chip: "CAT C",
    requiredLicenceCategory: "C",
    capacityLine: "1.5–7 t · 8 pallets",
    samplesLine:
      "Hino 916 · Mitsubishi Fuso Canter · Isuzu NPR · Iveco Eurocargo",
    specCodeByChassis: {
      DRY_BOX: "BOX_TRUCK",
      REFRIGERATED: "REFRIGERATED_TRUCK",
      OPEN_CHASSIS: "FLATBED_TRUCK",
    },
  },
  {
    id: "HEAVY_FREIGHT_TRUCK",
    name: "Heavy Freight Truck",
    chip: "CAT C",
    // Moved from CE to C by the approved business design: a three-axle rigid
    // is a Category C vehicle in Georgia; CE is what an articulated
    // combination needs, which is now its own class below. See
    // `specs/business-fleet-onboarding/action-required.md`.
    requiredLicenceCategory: "C",
    capacityLine: "7–18 t · 16 pallets · 3 axles",
    samplesLine: "MAN TGM · MAN TGL · Volvo FL · Scania P-series",
    specCodeByChassis: {
      DRY_BOX: "LARGE_FREIGHT_TRUCK",
      // No refrigerated truck above 7 t in the catalogue —
      // REFRIGERATED_TRUCK tops out at 4,000 kg.
      REFRIGERATED: null,
      // No open-chassis truck above 7 t in the catalogue — FLATBED_TRUCK
      // tops out at 5,000 kg.
      OPEN_CHASSIS: null,
    },
  },
  {
    id: "TRAILER_TRUCK",
    name: "Trailer Truck",
    chip: "CAT CE",
    requiredLicenceCategory: "CE",
    capacityLine: "18–24 t · 33 pallets · articulated",
    samplesLine: "Mercedes-Benz Actros · Volvo FH · Scania R-series · MAN TGX",
    specCodeByChassis: {
      // The one spec row this feature adds (see `prisma/seed.ts`): 24,000 kg,
      // 13.60 × 2.48 × 2.70 m, HEAVY_DUTY. Without it the class would be
      // unreachable — every other seeded spec tops out at 10,000 kg.
      DRY_BOX: "TRAILER_TRUCK",
      // Refrigerated and open-chassis trailers are an explicit non-goal of
      // `specs/business-fleet-onboarding` — no spec backs them, so they lock
      // like any other unbacked cell rather than falling back to a rigid.
      REFRIGERATED: null,
      OPEN_CHASSIS: null,
    },
  },
];

export function findVehicleClass(id: VehicleClassId): VehicleClass {
  const found = VEHICLE_CLASSES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown vehicle class: ${id}`);
  return found;
}

/** Resolves a (class, chassis) pair to a real `VehicleTypeSpec.code`, or
 *  `null` if that combination isn't offered — callers (the class-selection
 *  step, and the submit-time server validation) must treat `null` as
 *  "not selectable", never fall back to a mismatched spec. */
export function resolveVehicleTypeSpecCode(
  classId: VehicleClassId,
  chassisType: ChassisType,
): string | null {
  return findVehicleClass(classId).specCodeByChassis[chassisType];
}

/** Whether a class card should render locked because the driver's licence
 *  doesn't include the class's required category. Does not account for the
 *  chassis-availability lock above — that's evaluated separately once a
 *  chassis type has been chosen, since chassis (step 3a) precedes class
 *  (step 3b) in the design's flow. */
export function isClassLockedByLicence(
  classId: VehicleClassId,
  heldCategories: LicenceCategory[],
): boolean {
  return !heldCategories.includes(
    findVehicleClass(classId).requiredLicenceCategory,
  );
}

export type BodyType = {
  id: ChassisType;
  /** Full label, used as a panel heading and a radio label. */
  label: string;
  /** Compact label for table rows, chips and summary lines. */
  shortLabel: string;
  /** One-line description shown under the panel heading. */
  description: string;
};

/** The three cargo body types, in the design's panel order. Reuses the
 *  existing `ChassisType` enum rather than introducing a second vocabulary —
 *  `Vehicle.chassisType` is exactly this value. */
export const BODY_TYPES: BodyType[] = [
  {
    id: "DRY_BOX",
    label: "Dry Box",
    shortLabel: "Dry Box",
    description: "Enclosed rigid body. General palletised and boxed cargo.",
  },
  {
    id: "REFRIGERATED",
    label: "Refrigerated Vehicle",
    shortLabel: "Refrigerated",
    description:
      "Temperature-controlled, −20 °C to +8 °C. Cooling unit service record required per vehicle.",
  },
  {
    id: "OPEN_CHASSIS",
    label: "Open Chassis",
    shortLabel: "Open Chassis",
    description:
      "Flatbed or curtain-side with drop sides. Oversized, construction and machinery loads.",
  },
];

export function findBodyType(id: ChassisType): BodyType {
  const found = BODY_TYPES.find((body) => body.id === id);
  if (!found) throw new Error(`Unknown body type: ${id}`);
  return found;
}

/** The classes a given cargo body actually offers — the design's per-body
 *  class list intersected with the catalogue's lock map. Derived from
 *  `specCodeByChassis` rather than restated as its own list, so a change to
 *  the map cannot leave a second copy of the truth behind.
 *
 *  Today this returns: DRY_BOX -> all five; REFRIGERATED -> Large Van and
 *  Medium Truck; OPEN_CHASSIS -> Medium Truck only. Eight cells in total.
 *
 *  INTENTIONALLY UNUSED by this feature — do not delete it as dead code, and
 *  do not go looking for the caller. Every screen that lists classes for a body
 *  needs to render the *locked* cells too (greyed, with a short note), not omit
 *  them, so `task-11`'s fleet composition grid iterates `VEHICLE_CLASSES` and
 *  tests `resolveVehicleTypeSpecCode(...) === null` per cell instead. This
 *  function is the machine-checkable form of the design's per-body prose: the
 *  acceptance criterion below pins 5 / 2 / 1, so if the lock map is ever edited
 *  in a way that contradicts the design's own description of what each body
 *  offers, that criterion fails and someone has to reconcile the two on
 *  purpose. It is also the correct helper for any future surface that genuinely
 *  wants to hide unavailable classes rather than grey them. */
export function vehicleClassesForBodyType(
  bodyType: ChassisType,
): VehicleClass[] {
  return VEHICLE_CLASSES.filter(
    (vehicleClass) => vehicleClass.specCodeByChassis[bodyType] !== null,
  );
}
