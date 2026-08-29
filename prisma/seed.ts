/**
 * Seeds the vehicle taxonomy (`VehicleTypeSpec`) and its pricing rules.
 *
 * IMPORTANT: every rate and spec below is an ILLUSTRATIVE PLACEHOLDER, not a real
 * business figure. They exist so the pricing engine and booking UI have coherent
 * data to work against; replace them before anything goes live.
 *
 * The seed is idempotent — it upserts on `VehicleTypeSpec.code`, so re-running it
 * retunes existing rows rather than duplicating them.
 *
 * Run with: pnpm exec prisma db seed
 */
import {
  LoadingAccessType,
  PrismaClient,
  VehicleCategory,
} from "@prisma/client";

const prisma = new PrismaClient();

type VehicleTypeSeed = {
  code: string;
  label: string;
  category: VehicleCategory;
  maxPayloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  /// `0` marks an open bed with no cargo box (see `FLATBED_TRUCK`), not a
  /// zero-height limit.
  cargoHeightM: number;
  loadingAccessType: LoadingAccessType;
  pricing: {
    baseFare: number;
    pricePerKm: number;
    pricePerMinute: number;
    freeLoadingMinutes: number;
    overtimeRatePerMinute: number;
    helperFee: number;
    minimumFare: number;
  };
};

const VEHICLE_TYPE_SEEDS: VehicleTypeSeed[] = [
  {
    code: "MINIVAN",
    label: "Minivan",
    category: VehicleCategory.MEDIUM_DUTY,
    maxPayloadKg: 500,
    cargoLengthM: 2.0,
    cargoWidthM: 1.4,
    cargoHeightM: 1.3,
    loadingAccessType: LoadingAccessType.REAR_DOOR,
    pricing: {
      baseFare: 8,
      pricePerKm: 1.2,
      pricePerMinute: 0.15,
      freeLoadingMinutes: 15,
      overtimeRatePerMinute: 0.3,
      helperFee: 10,
      minimumFare: 15,
    },
  },
  {
    code: "MPV",
    label: "MPV / Estate",
    category: VehicleCategory.MEDIUM_DUTY,
    maxPayloadKg: 400,
    cargoLengthM: 1.8,
    cargoWidthM: 1.3,
    cargoHeightM: 1.1,
    loadingAccessType: LoadingAccessType.REAR_DOOR,
    pricing: {
      baseFare: 7,
      pricePerKm: 1.1,
      pricePerMinute: 0.13,
      freeLoadingMinutes: 15,
      overtimeRatePerMinute: 0.25,
      helperFee: 10,
      minimumFare: 12,
    },
  },
  {
    code: "CARGO_VAN",
    label: "Cargo Van",
    category: VehicleCategory.MEDIUM_DUTY,
    maxPayloadKg: 1000,
    cargoLengthM: 2.5,
    cargoWidthM: 1.6,
    cargoHeightM: 1.6,
    loadingAccessType: LoadingAccessType.REAR_DOOR,
    pricing: {
      baseFare: 10,
      pricePerKm: 1.4,
      pricePerMinute: 0.18,
      freeLoadingMinutes: 20,
      overtimeRatePerMinute: 0.35,
      helperFee: 12,
      minimumFare: 18,
    },
  },
  {
    code: "CLOSED_BOX_VAN",
    label: "Closed Box Van",
    category: VehicleCategory.MEDIUM_DUTY,
    maxPayloadKg: 1200,
    cargoLengthM: 3.0,
    cargoWidthM: 1.7,
    cargoHeightM: 1.8,
    loadingAccessType: LoadingAccessType.SIDE_DOOR,
    pricing: {
      baseFare: 12,
      pricePerKm: 1.6,
      pricePerMinute: 0.2,
      freeLoadingMinutes: 20,
      overtimeRatePerMinute: 0.4,
      helperFee: 14,
      minimumFare: 20,
    },
  },
  {
    code: "REFRIGERATED_VAN",
    label: "Refrigerated Van",
    category: VehicleCategory.MEDIUM_DUTY,
    maxPayloadKg: 1000,
    cargoLengthM: 2.8,
    cargoWidthM: 1.6,
    cargoHeightM: 1.6,
    loadingAccessType: LoadingAccessType.REAR_DOOR,
    pricing: {
      baseFare: 14,
      pricePerKm: 1.8,
      pricePerMinute: 0.22,
      freeLoadingMinutes: 20,
      overtimeRatePerMinute: 0.4,
      helperFee: 14,
      minimumFare: 22,
    },
  },
  {
    code: "BOX_TRUCK",
    label: "Box Truck",
    category: VehicleCategory.HEAVY_DUTY,
    maxPayloadKg: 3500,
    cargoLengthM: 4.5,
    cargoWidthM: 2.1,
    cargoHeightM: 2.2,
    loadingAccessType: LoadingAccessType.TAIL_LIFT,
    pricing: {
      baseFare: 25,
      pricePerKm: 2.4,
      pricePerMinute: 0.35,
      freeLoadingMinutes: 25,
      overtimeRatePerMinute: 0.6,
      helperFee: 20,
      minimumFare: 35,
    },
  },
  {
    code: "FLATBED_TRUCK",
    label: "Flatbed Truck",
    category: VehicleCategory.HEAVY_DUTY,
    maxPayloadKg: 5000,
    cargoLengthM: 5.0,
    cargoWidthM: 2.3,
    // Open bed, no cargo box — see the `cargoHeightM` note above.
    cargoHeightM: 0,
    loadingAccessType: LoadingAccessType.OPEN_FLATBED,
    pricing: {
      baseFare: 28,
      pricePerKm: 2.6,
      pricePerMinute: 0.38,
      freeLoadingMinutes: 25,
      overtimeRatePerMinute: 0.65,
      helperFee: 22,
      minimumFare: 40,
    },
  },
  {
    code: "CURTAINSIDER_TRUCK",
    label: "Curtainsider Truck",
    category: VehicleCategory.HEAVY_DUTY,
    maxPayloadKg: 6000,
    cargoLengthM: 6.0,
    cargoWidthM: 2.4,
    cargoHeightM: 2.4,
    loadingAccessType: LoadingAccessType.SIDE_DOOR,
    pricing: {
      baseFare: 32,
      pricePerKm: 2.9,
      pricePerMinute: 0.4,
      freeLoadingMinutes: 25,
      overtimeRatePerMinute: 0.7,
      helperFee: 24,
      minimumFare: 45,
    },
  },
  {
    code: "REFRIGERATED_TRUCK",
    label: "Refrigerated Truck",
    category: VehicleCategory.HEAVY_DUTY,
    maxPayloadKg: 4000,
    cargoLengthM: 4.8,
    cargoWidthM: 2.2,
    cargoHeightM: 2.2,
    loadingAccessType: LoadingAccessType.TAIL_LIFT,
    pricing: {
      baseFare: 30,
      pricePerKm: 2.8,
      pricePerMinute: 0.4,
      freeLoadingMinutes: 25,
      overtimeRatePerMinute: 0.68,
      helperFee: 22,
      minimumFare: 42,
    },
  },
  {
    code: "LARGE_FREIGHT_TRUCK",
    label: "Large Freight Truck",
    category: VehicleCategory.HEAVY_DUTY,
    maxPayloadKg: 10000,
    cargoLengthM: 8.0,
    cargoWidthM: 2.5,
    cargoHeightM: 2.6,
    loadingAccessType: LoadingAccessType.TAIL_LIFT,
    pricing: {
      baseFare: 45,
      pricePerKm: 3.5,
      pricePerMinute: 0.5,
      freeLoadingMinutes: 30,
      overtimeRatePerMinute: 0.9,
      helperFee: 30,
      minimumFare: 60,
    },
  },
  {
    // The physical spec (24 t, 13.60 x 2.48 x 2.70 m, HEAVY_DUTY) comes from the
    // approved design handoff. The seven `pricing` figures below do NOT — they
    // are hand-scaled from `LARGE_FREIGHT_TRUCK` (a 2.4x payload step taken at
    // the ~1.4-1.5x money uplift the rest of this catalogue uses) and are
    // UNSIGNED-OFF PLACEHOLDERS pending ops approval. See the first "Before
    // Implementation" item in specs/business-fleet-onboarding/action-required.md.
    //
    // This matters more here than the file header implies: there is no draft or
    // feature-flag state for a `VehicleTypeSpec`. `GET /api/vehicle-types` is a
    // public, unauthenticated, unfiltered `findMany()`, so the moment this row is
    // seeded it is selectable in the booking picker and the landing-page quote
    // calculator, and `src/lib/pricing.ts` charges these numbers on the next
    // order placed against it. Correcting them later is a one-line edit plus a
    // re-seed — the upsert retunes the row in place and keeps its id.
    //
    // Every figure stays strictly above `LARGE_FREIGHT_TRUCK`'s so the catalogue
    // remains monotonic; the "best fit" highlight compares `baseFare`, and a
    // trailer priced under a smaller truck would make that highlight nonsense.
    code: "TRAILER_TRUCK",
    label: "Trailer Truck",
    category: VehicleCategory.HEAVY_DUTY,
    maxPayloadKg: 24000,
    cargoLengthM: 13.6,
    cargoWidthM: 2.48,
    cargoHeightM: 2.7,
    // Rear-door, dock-height loading. Not `TAIL_LIFT` (what the rigid
    // `LARGE_FREIGHT_TRUCK` uses): tail lifts promise kerbside ground-level
    // loading and are not a 24 t articulated semi-trailer's capability, so
    // claiming one here would mis-sell the vehicle to clients reading the picker.
    loadingAccessType: LoadingAccessType.REAR_DOOR,
    pricing: {
      baseFare: 65,
      pricePerKm: 4.6,
      pricePerMinute: 0.65,
      freeLoadingMinutes: 40,
      overtimeRatePerMinute: 1.2,
      helperFee: 40,
      minimumFare: 90,
    },
  },
];

async function main(): Promise<void> {
  for (const { pricing, ...spec } of VEHICLE_TYPE_SEEDS) {
    await prisma.vehicleTypeSpec.upsert({
      where: { code: spec.code },
      create: {
        ...spec,
        pricingRule: { create: pricing },
      },
      // Nested upsert (not `update`) so a spec seeded before its pricing rule
      // existed still gets one on a re-run.
      update: {
        ...spec,
        pricingRule: { upsert: { create: pricing, update: pricing } },
      },
    });
  }

  const seeded = await prisma.vehicleTypeSpec.count();
  // `console.log` is disallowed by the project's lint rules; this is a CLI
  // script, so write to stdout directly.
  process.stdout.write(`Seeded ${seeded} vehicle type specs.\n`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
