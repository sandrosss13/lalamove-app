/**
 * Maps the onboarding wizard's four vehicle classes onto the existing
 * `VehicleTypeSpec` catalogue seeded in `prisma/seed.ts`.
 *
 * This feature deliberately adds no new `VehicleTypeSpec` rows: order matching
 * (`GET /api/orders`, `POST /api/orders/[id]/accept`, the company dispatch
 * route) keys on an exact `vehicleTypeSpecId`, and the booking/landing pickers
 * treat `pricingRule` as non-nullable — so a new spec row would either break
 * matching for every onboarded driver or duplicate one of the 10 bookable
 * types. The four classes are therefore a presentation grouping only, resolved
 * back to a real seeded `code` at submit time.
 *
 * Not every (class, chassis) pair has a spec that actually matches on payload
 * and loading access. Those cells are `null` rather than a near-miss spec —
 * callers must lock them in the UI instead of falling back to a mismatched
 * vehicle, which would misprice orders and mis-match cargo.
 *
 * Pure data and pure functions with no server-only dependency (the
 * `@prisma/client` import is type-only, so it is erased at build time and
 * never reaches the browser bundle) — safe to import from both client
 * components and server routes. The submit endpoint must re-run this
 * resolution server-side rather than trusting a spec code sent by the client.
 */
import type { ChassisType, LicenceCategory } from "@prisma/client";

/** The four vehicle classes the onboarding wizard offers — a presentation
 *  grouping over the existing `VehicleTypeSpec` catalogue, not a new spec
 *  row. Order matches the design's card order. */
export type VehicleClassId =
  "SMALL_VAN" | "LARGE_VAN" | "MEDIUM_TRUCK" | "HEAVY_FREIGHT_TRUCK";

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
      // No small open-chassis van in the catalogue.
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
    chip: "CAT CE",
    requiredLicenceCategory: "CE",
    capacityLine: "7 t and above · 16+ pallets",
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
