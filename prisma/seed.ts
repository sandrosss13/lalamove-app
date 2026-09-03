/**
 * Seeds the data a database needs before the app is usable: the vehicle
 * taxonomy (`VehicleTypeSpec`) with its pricing rules, and the payment methods
 * the platform accepts (`PaymentMethodConfig`).
 *
 * IMPORTANT: every rate and spec below is an ILLUSTRATIVE PLACEHOLDER, not a real
 * business figure. They exist so the pricing engine and booking UI have coherent
 * data to work against; replace them before anything goes live.
 *
 * The seed is idempotent — it upserts on `VehicleTypeSpec.code` and on
 * `PaymentMethodConfig.type`, so re-running it retunes existing rows rather than
 * duplicating them.
 *
 * Run with: pnpm exec prisma db seed
 */
import {
  ChassisType,
  LoadingAccessType,
  PaymentMethodType,
  PrismaClient,
  VehicleCategory,
} from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Flat fee in Georgian Lari for ONE extra helper beyond the driver, charged per
 * helper: `src/lib/pricing.ts` multiplies it by the order's `helperCount`.
 *
 * Unlike every other money figure in this file it does not vary by vehicle
 * type — a pair of hands costs the same whether they are loading a minivan or a
 * trailer truck — so it is written once here and shared by every rule below,
 * rather than repeated as eleven independent numbers that could drift apart.
 */
const HELPER_FEE_PER_HELPER = 40;

// `VehicleTypeSpec.imageUrl` is intentionally not part of this type. The
// upsert below spreads a seed entry over the existing row, so a `null` here
// would erase the marketing photo a content manager set every time the seed
// was re-run. Photos are content, owned by the back office, not by the seed.
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
  /// The load spaces this type can serve, in the order a client would think of
  /// them: the body the vehicle is bought for first, then any it also satisfies.
  ///
  /// A reefer can run its box dry, so both refrigerated types offer
  /// `REFRIGERATED` and `DRY_BOX`. A curtainsider opens fully along both sides,
  /// so it satisfies an open-chassis requirement as well as a dry one. A flatbed
  /// has no enclosure at all and offers only `OPEN_CHASSIS`.
  ///
  /// Note this is a capability list, not a price band: there is deliberately no
  /// body surcharge, because the catalogue already prices Refrigerated Van above
  /// Closed Box Van and a surcharge would charge that premium twice.
  ///
  /// AWAITING SIGN-OFF — see specs/client-dashboard-booking-and-payment/
  /// action-required.md. The mapping below is a judgement call from the physical
  /// specs, not an operator's ruling.
  bodyTypes: ChassisType[];
  pricing: {
    baseFare: number;
    pricePerKm: number;
    pricePerMinute: number;
    freeLoadingMinutes: number;
    overtimeRatePerMinute: number;
    /// Charged once per helper on the booking, not once per order — always
    /// `HELPER_FEE_PER_HELPER`, which is the same for every vehicle type.
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
    bodyTypes: [ChassisType.DRY_BOX],
    pricing: {
      baseFare: 8,
      pricePerKm: 1.2,
      pricePerMinute: 0.15,
      freeLoadingMinutes: 15,
      overtimeRatePerMinute: 0.3,
      helperFee: HELPER_FEE_PER_HELPER,
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
    bodyTypes: [ChassisType.DRY_BOX],
    pricing: {
      baseFare: 7,
      pricePerKm: 1.1,
      pricePerMinute: 0.13,
      freeLoadingMinutes: 15,
      overtimeRatePerMinute: 0.25,
      helperFee: HELPER_FEE_PER_HELPER,
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
    bodyTypes: [ChassisType.DRY_BOX],
    pricing: {
      baseFare: 10,
      pricePerKm: 1.4,
      pricePerMinute: 0.18,
      freeLoadingMinutes: 20,
      overtimeRatePerMinute: 0.35,
      helperFee: HELPER_FEE_PER_HELPER,
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
    bodyTypes: [ChassisType.DRY_BOX],
    pricing: {
      baseFare: 12,
      pricePerKm: 1.6,
      pricePerMinute: 0.2,
      freeLoadingMinutes: 20,
      overtimeRatePerMinute: 0.4,
      helperFee: HELPER_FEE_PER_HELPER,
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
    bodyTypes: [ChassisType.REFRIGERATED, ChassisType.DRY_BOX],
    pricing: {
      baseFare: 14,
      pricePerKm: 1.8,
      pricePerMinute: 0.22,
      freeLoadingMinutes: 20,
      overtimeRatePerMinute: 0.4,
      helperFee: HELPER_FEE_PER_HELPER,
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
    bodyTypes: [ChassisType.DRY_BOX],
    pricing: {
      baseFare: 25,
      pricePerKm: 2.4,
      pricePerMinute: 0.35,
      freeLoadingMinutes: 25,
      overtimeRatePerMinute: 0.6,
      helperFee: HELPER_FEE_PER_HELPER,
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
    bodyTypes: [ChassisType.OPEN_CHASSIS],
    pricing: {
      baseFare: 28,
      pricePerKm: 2.6,
      pricePerMinute: 0.38,
      freeLoadingMinutes: 25,
      overtimeRatePerMinute: 0.65,
      helperFee: HELPER_FEE_PER_HELPER,
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
    bodyTypes: [ChassisType.DRY_BOX, ChassisType.OPEN_CHASSIS],
    pricing: {
      baseFare: 32,
      pricePerKm: 2.9,
      pricePerMinute: 0.4,
      freeLoadingMinutes: 25,
      overtimeRatePerMinute: 0.7,
      helperFee: HELPER_FEE_PER_HELPER,
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
    bodyTypes: [ChassisType.REFRIGERATED, ChassisType.DRY_BOX],
    pricing: {
      baseFare: 30,
      pricePerKm: 2.8,
      pricePerMinute: 0.4,
      freeLoadingMinutes: 25,
      overtimeRatePerMinute: 0.68,
      helperFee: HELPER_FEE_PER_HELPER,
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
    bodyTypes: [ChassisType.DRY_BOX],
    pricing: {
      baseFare: 45,
      pricePerKm: 3.5,
      pricePerMinute: 0.5,
      freeLoadingMinutes: 30,
      overtimeRatePerMinute: 0.9,
      helperFee: HELPER_FEE_PER_HELPER,
      minimumFare: 60,
    },
  },
  {
    // The physical spec (24 t, 13.60 x 2.48 x 2.70 m, HEAVY_DUTY) comes from the
    // approved design handoff. The `pricing` figures are the rate owner's rule,
    // recorded 2026-08-29: every vehicle-specific money figure is exactly 1.5x
    // `LARGE_FREIGHT_TRUCK`'s, the largest vehicle in the catalogue. Keep them
    // derived from that row — if `LARGE_FREIGHT_TRUCK` is ever retuned, re-apply
    // the multiplier here rather than editing these numbers independently.
    // `helperFee` is outside that rule: it is the platform-wide flat rate every
    // vehicle type charges (see `HELPER_FEE_PER_HELPER`), and a helper's hour is
    // not worth more for arriving on a bigger truck.
    //
    // This matters more here than the file header implies: there is no draft or
    // feature-flag state for a `VehicleTypeSpec`. `GET /api/vehicle-types` is a
    // public, unauthenticated, unfiltered `findMany()`, so the moment this row is
    // seeded it is selectable in the booking picker and the landing-page quote
    // calculator, and `src/lib/pricing.ts` charges these numbers on the next
    // order placed against it. Correcting them later is a one-line edit plus a
    // re-seed — the upsert retunes the row in place and keeps its id.
    //
    // Every vehicle-specific figure stays strictly above `LARGE_FREIGHT_TRUCK`'s
    // so the catalogue remains monotonic; the "best fit" highlight compares
    // `baseFare`, and a trailer priced under a smaller truck would make that
    // highlight nonsense. (`helperFee` is deliberately equal across the
    // catalogue and plays no part in that ordering.)
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
    bodyTypes: [ChassisType.DRY_BOX],
    pricing: {
      // Exactly 1.5x `LARGE_FREIGHT_TRUCK` — the largest vehicle in the
      // catalogue — on every vehicle-specific money figure, per the rate
      // owner's rule. Derived, not invented: 45/3.5/0.5/0.9/60 x 1.5.
      baseFare: 67.5,
      pricePerKm: 5.25,
      pricePerMinute: 0.75,
      // NOT scaled. This is a time allowance, not a price, so the 1.5x rule
      // does not apply to it. Held at 40 rather than `LARGE_FREIGHT_TRUCK`'s 30
      // because a 24 t semi-trailer genuinely takes longer to load, and this is
      // the number the overtime rate above starts charging after.
      freeLoadingMinutes: 40,
      overtimeRatePerMinute: 1.35,
      helperFee: HELPER_FEE_PER_HELPER,
      minimumFare: 90,
    },
  },
];

/** How one payment method is seeded. See `PAYMENT_METHOD_SEEDS`. */
type PaymentMethodSeed = {
  isEnabled: boolean;
  /**
   * Whether a re-run forces `isEnabled` back to the value above, or leaves
   * whatever the admin finance page last set.
   *
   * This is the one genuinely contested decision in this file, so it is a
   * per-method flag rather than a blanket rule. Stamping over an admin's
   * deliberate toggle on every re-seed would be surprising; but leaving every
   * row alone would mean the seed never fixes the database it was written for.
   * Both halves are true of different methods, so both are expressed.
   */
  reassertOnReseed: boolean;
};

/**
 * The payment methods the platform accepts out of the box, keyed by the
 * generated Prisma enum so a new `PaymentMethodType` is a type error here until
 * somebody decides whether it ships on or off — the same reasoning
 * `GET /api/admin/finance/payment-methods` applies when it derives its table
 * from `Object.values(PaymentMethodType)`.
 *
 * Without these rows the booking flow is unusable rather than merely limited.
 * `POST /api/orders` treats a missing `PaymentMethodConfig` as a disabled one
 * (fail-closed, deliberately), and the rows are otherwise created only lazily —
 * and disabled — the first time an admin opens the finance page. So on a fresh
 * database every `paymentMethodType` is refused and the payment step rejects
 * every booking, including the "Pay later" choice the design makes an
 * always-available first-class option. "Pay later" is `CASH`, which is why
 * `CASH` is the one method seeded on.
 */
const PAYMENT_METHOD_SEEDS: Record<PaymentMethodType, PaymentMethodSeed> = {
  // The platform's floor, not a preference: cash on delivery needs no
  // integration, and the client booking flow's "Pay later" maps onto it, so a
  // database with `CASH` off cannot take a booking at all. That is a broken
  // database rather than a configured one, so a re-seed re-asserts it — the
  // seed's job is to leave a database bookable, and re-seeding is a deliberate
  // developer act on a development database, never something production does.
  // An operator who really wants cash switched off can switch it off after; the
  // finance page still owns the toggle.
  [PaymentMethodType.CASH]: { isEnabled: true, reassertOnReseed: true },
  // Off, and left off by a re-run because whether cards are offered is an
  // operator's decision, not this file's. The switch is real but the
  // integration behind it is not — no gateway is wired up, which is what the
  // admin page tells staff in as many words: "Gateway integration pending —
  // enabling this does not charge cards yet."
  [PaymentMethodType.CARD]: { isEnabled: false, reassertOnReseed: false },
  // Off for the same reason as `CARD`: bank transfer needs settlement details
  // and a reconciliation process the platform has not agreed yet. Turning it on
  // is a business decision, and a re-seed must not undo one.
  [PaymentMethodType.BANK_TRANSFER]: {
    isEnabled: false,
    reassertOnReseed: false,
  },
};

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

  // Iterated over the enum rather than over the record's own keys so the order
  // is the schema's declaration order, and so the loop reads the same way as
  // the admin endpoint that lists the same three methods.
  for (const type of Object.values(PaymentMethodType)) {
    const { isEnabled, reassertOnReseed } = PAYMENT_METHOD_SEEDS[type];

    await prisma.paymentMethodConfig.upsert({
      where: { type },
      create: { type, isEnabled },
      // An empty `update` is a no-op, which is exactly what a method the admin
      // owns should get: the row keeps whatever the finance page last set.
      update: reassertOnReseed ? { isEnabled } : {},
    });
  }

  const seeded = await prisma.vehicleTypeSpec.count();
  const enabledMethods = await prisma.paymentMethodConfig.count({
    where: { isEnabled: true },
  });
  // `console.log` is disallowed by the project's lint rules; this is a CLI
  // script, so write to stdout directly.
  process.stdout.write(
    `Seeded ${seeded} vehicle type specs and ${Object.keys(PAYMENT_METHOD_SEEDS).length} payment methods (${enabledMethods} enabled).\n`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
