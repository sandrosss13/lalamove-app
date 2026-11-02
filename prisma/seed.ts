/**
 * Seeds the data a database needs before the app is usable: the vehicle
 * taxonomy (`VehicleTypeSpec`) with its pricing rules, the pricing model v1
 * tariff (`PricingConfig`, `HelperFloorBand`, `RouteAllowance`), and the
 * payment methods the platform accepts (`PaymentMethodConfig`).
 *
 * The v1 pricing figures (`city*`, `intercity*`, commission rates, bands,
 * corridors) match `prisma/migrations/20261016120000_pricing_model_v1` exactly
 * (the rate table approved for pricing model v1); keep the two in step. The
 * legacy `baseFare`/`pricePerKm`/`pricePerMinute`/`minimumFare` keep their
 * pre-v1 values: the code on main still prices with them.
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
  GeorgianCity,
  LoadingAccessType,
  PaymentMethodType,
  PrismaClient,
  VehicleCategory,
} from "@prisma/client";

const prisma = new PrismaClient();

/**
 * LEGACY: the pre-v1 flat per-helper fee. `PricingRule.helperFee` is NOT NULL
 * and kept (migrations are additive), but the v1 engine ignores it — helpers
 * are priced per location from `HELPER_FLOOR_BAND_SEEDS` below.
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
    /// LEGACY, unused by the v1 engine — always `HELPER_FEE_PER_HELPER`.
    helperFee: number;
    minimumFare: number;
    /// Pricing model v1 CITY rates (the v1 engine reads only these).
    cityBaseFare: number;
    cityPricePerKm: number;
    cityPricePerMinute: number;
    cityMinimumFare: number;
    intercityBaseFare: number;
    intercityPricePerKm: number;
    cityCommissionRate: number;
    intercityCommissionRate: number;
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
      // City rates (pricing model v1).
      cityBaseFare: 15,
      cityPricePerKm: 0.9,
      cityPricePerMinute: 0.2,
      cityMinimumFare: 25,
      intercityBaseFare: 15,
      intercityPricePerKm: 1.1,
      cityCommissionRate: 0.15,
      intercityCommissionRate: 0.12,
      freeLoadingMinutes: 15,
      overtimeRatePerMinute: 0.3,
      helperFee: HELPER_FEE_PER_HELPER,
      // LEGACY pre-v1 rates — what the code on main still prices with.
      // Never changed by v1 (the shared production database serves both).
      baseFare: 8,
      pricePerKm: 1.2,
      pricePerMinute: 0.15,
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
      // City rates (pricing model v1).
      cityBaseFare: 12,
      cityPricePerKm: 0.8,
      cityPricePerMinute: 0.18,
      cityMinimumFare: 20,
      intercityBaseFare: 12,
      intercityPricePerKm: 1.0,
      cityCommissionRate: 0.15,
      intercityCommissionRate: 0.12,
      freeLoadingMinutes: 15,
      overtimeRatePerMinute: 0.25,
      helperFee: HELPER_FEE_PER_HELPER,
      // LEGACY pre-v1 rates — what the code on main still prices with.
      // Never changed by v1 (the shared production database serves both).
      baseFare: 7,
      pricePerKm: 1.1,
      pricePerMinute: 0.13,
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
      // City rates (pricing model v1).
      cityBaseFare: 20,
      cityPricePerKm: 1.2,
      cityPricePerMinute: 0.25,
      cityMinimumFare: 35,
      intercityBaseFare: 20,
      intercityPricePerKm: 1.4,
      cityCommissionRate: 0.15,
      intercityCommissionRate: 0.12,
      freeLoadingMinutes: 20,
      overtimeRatePerMinute: 0.35,
      helperFee: HELPER_FEE_PER_HELPER,
      // LEGACY pre-v1 rates — what the code on main still prices with.
      // Never changed by v1 (the shared production database serves both).
      baseFare: 10,
      pricePerKm: 1.4,
      pricePerMinute: 0.18,
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
      // City rates (pricing model v1).
      cityBaseFare: 30,
      cityPricePerKm: 1.6,
      cityPricePerMinute: 0.3,
      cityMinimumFare: 50,
      intercityBaseFare: 30,
      intercityPricePerKm: 1.8,
      cityCommissionRate: 0.15,
      intercityCommissionRate: 0.12,
      freeLoadingMinutes: 20,
      overtimeRatePerMinute: 0.4,
      helperFee: HELPER_FEE_PER_HELPER,
      // LEGACY pre-v1 rates — what the code on main still prices with.
      // Never changed by v1 (the shared production database serves both).
      baseFare: 12,
      pricePerKm: 1.6,
      pricePerMinute: 0.2,
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
      // City rates (pricing model v1).
      cityBaseFare: 35,
      cityPricePerKm: 1.9,
      cityPricePerMinute: 0.35,
      cityMinimumFare: 60,
      intercityBaseFare: 35,
      intercityPricePerKm: 2.2,
      cityCommissionRate: 0.15,
      intercityCommissionRate: 0.12,
      freeLoadingMinutes: 20,
      overtimeRatePerMinute: 0.4,
      helperFee: HELPER_FEE_PER_HELPER,
      // LEGACY pre-v1 rates — what the code on main still prices with.
      // Never changed by v1 (the shared production database serves both).
      baseFare: 14,
      pricePerKm: 1.8,
      pricePerMinute: 0.22,
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
      // City rates (pricing model v1).
      cityBaseFare: 45,
      cityPricePerKm: 2.2,
      cityPricePerMinute: 0.4,
      cityMinimumFare: 70,
      intercityBaseFare: 45,
      intercityPricePerKm: 2.5,
      cityCommissionRate: 0.12,
      intercityCommissionRate: 0.1,
      freeLoadingMinutes: 25,
      overtimeRatePerMinute: 0.6,
      helperFee: HELPER_FEE_PER_HELPER,
      // LEGACY pre-v1 rates — what the code on main still prices with.
      // Never changed by v1 (the shared production database serves both).
      baseFare: 25,
      pricePerKm: 2.4,
      pricePerMinute: 0.35,
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
      // City rates (pricing model v1).
      cityBaseFare: 50,
      cityPricePerKm: 2.5,
      cityPricePerMinute: 0.45,
      cityMinimumFare: 80,
      intercityBaseFare: 50,
      intercityPricePerKm: 2.8,
      cityCommissionRate: 0.12,
      intercityCommissionRate: 0.1,
      freeLoadingMinutes: 25,
      overtimeRatePerMinute: 0.65,
      helperFee: HELPER_FEE_PER_HELPER,
      // LEGACY pre-v1 rates — what the code on main still prices with.
      // Never changed by v1 (the shared production database serves both).
      baseFare: 28,
      pricePerKm: 2.6,
      pricePerMinute: 0.38,
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
      // City rates (pricing model v1).
      cityBaseFare: 55,
      cityPricePerKm: 2.7,
      cityPricePerMinute: 0.48,
      cityMinimumFare: 85,
      intercityBaseFare: 55,
      intercityPricePerKm: 3.0,
      cityCommissionRate: 0.12,
      intercityCommissionRate: 0.1,
      freeLoadingMinutes: 25,
      overtimeRatePerMinute: 0.7,
      helperFee: HELPER_FEE_PER_HELPER,
      // LEGACY pre-v1 rates — what the code on main still prices with.
      // Never changed by v1 (the shared production database serves both).
      baseFare: 32,
      pricePerKm: 2.9,
      pricePerMinute: 0.4,
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
      // City rates (pricing model v1).
      cityBaseFare: 55,
      cityPricePerKm: 2.8,
      cityPricePerMinute: 0.5,
      cityMinimumFare: 90,
      intercityBaseFare: 55,
      intercityPricePerKm: 3.2,
      cityCommissionRate: 0.12,
      intercityCommissionRate: 0.1,
      freeLoadingMinutes: 25,
      overtimeRatePerMinute: 0.68,
      helperFee: HELPER_FEE_PER_HELPER,
      // LEGACY pre-v1 rates — what the code on main still prices with.
      // Never changed by v1 (the shared production database serves both).
      baseFare: 30,
      pricePerKm: 2.8,
      pricePerMinute: 0.4,
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
      // City rates (pricing model v1).
      cityBaseFare: 70,
      cityPricePerKm: 3.2,
      cityPricePerMinute: 0.55,
      cityMinimumFare: 110,
      intercityBaseFare: 70,
      intercityPricePerKm: 3.6,
      cityCommissionRate: 0.12,
      intercityCommissionRate: 0.1,
      freeLoadingMinutes: 30,
      overtimeRatePerMinute: 0.9,
      helperFee: HELPER_FEE_PER_HELPER,
      // LEGACY pre-v1 rates — what the code on main still prices with.
      // Never changed by v1 (the shared production database serves both).
      baseFare: 45,
      pricePerKm: 3.5,
      pricePerMinute: 0.5,
      minimumFare: 60,
    },
  },
  {
    // The physical spec (24 t, 13.60 x 2.48 x 2.70 m, HEAVY_DUTY) comes from the
    // approved design handoff. The money figures are the pricing model v1 rate
    // table (approved 2026-10), which supersedes the earlier "1.5x
    // LARGE_FREIGHT_TRUCK" rule; the overtime rate below still follows it.
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
      // City rates (pricing model v1).
      cityBaseFare: 90,
      cityPricePerKm: 3.8,
      cityPricePerMinute: 0.65,
      cityMinimumFare: 140,
      intercityBaseFare: 90,
      intercityPricePerKm: 4.2,
      cityCommissionRate: 0.12,
      intercityCommissionRate: 0.1,
      // NOT scaled. This is a time allowance, not a price, so the 1.5x rule
      // does not apply to it. Held at 40 rather than `LARGE_FREIGHT_TRUCK`'s 30
      // because a 24 t semi-trailer genuinely takes longer to load, and this is
      // the number the overtime rate above starts charging after.
      freeLoadingMinutes: 40,
      overtimeRatePerMinute: 1.35,
      helperFee: HELPER_FEE_PER_HELPER,
      // LEGACY pre-v1 rates — what the code on main still prices with.
      // Never changed by v1 (the shared production database serves both).
      baseFare: 67.5,
      pricePerKm: 5.25,
      pricePerMinute: 0.75,
      minimumFare: 90,
    },
  },
];

/**
 * Pricing model v1: the per-helper, per-location rate by floor band (a band
 * runs from its `minFloor` to the next band's `minFloor - 1`). Same rows as the
 * migration.
 */
const HELPER_FLOOR_BAND_SEEDS = [
  { minFloor: 0, ratePerHelper: 15 },
  { minFloor: 4, ratePerHelper: 25 },
  { minFloor: 7, ratePerHelper: 35 },
  { minFloor: 10, ratePerHelper: 50 },
] as const;

/** Major corridors: a return load is easy to find. */
const MAJOR_CORRIDOR_ALLOWANCE = 0.15;
/** Remote mountain destinations: the truck returns empty. */
const REMOTE_ROUTE_ALLOWANCE = 0.65;

/**
 * Pricing model v1: return allowance per unordered city pair. Every other
 * intercity pair uses `PricingConfig.defaultReturnAllowance` (0.35). Same rows
 * as the migration; normalised (cityA < cityB by name) at write time below.
 */
const ROUTE_ALLOWANCE_SEEDS: [GeorgianCity, GeorgianCity, number][] = [
  [GeorgianCity.TBILISI, GeorgianCity.RUSTAVI, MAJOR_CORRIDOR_ALLOWANCE],
  [GeorgianCity.TBILISI, GeorgianCity.BATUMI, MAJOR_CORRIDOR_ALLOWANCE],
  [GeorgianCity.TBILISI, GeorgianCity.KUTAISI, MAJOR_CORRIDOR_ALLOWANCE],
  [GeorgianCity.TBILISI, GeorgianCity.GORI, MAJOR_CORRIDOR_ALLOWANCE],
  [GeorgianCity.KUTAISI, GeorgianCity.BATUMI, MAJOR_CORRIDOR_ALLOWANCE],
  [GeorgianCity.TBILISI, GeorgianCity.ZUGDIDI, MAJOR_CORRIDOR_ALLOWANCE],
  [GeorgianCity.TBILISI, GeorgianCity.POTI, MAJOR_CORRIDOR_ALLOWANCE],
  [GeorgianCity.BATUMI, GeorgianCity.POTI, MAJOR_CORRIDOR_ALLOWANCE],
  [GeorgianCity.TBILISI, GeorgianCity.MESTIA, REMOTE_ROUTE_ALLOWANCE],
  [GeorgianCity.TBILISI, GeorgianCity.ONI, REMOTE_ROUTE_ALLOWANCE],
  [GeorgianCity.TBILISI, GeorgianCity.AMBROLAURI, REMOTE_ROUTE_ALLOWANCE],
  [GeorgianCity.TBILISI, GeorgianCity.TSAGERI, REMOTE_ROUTE_ALLOWANCE],
  [GeorgianCity.TBILISI, GeorgianCity.KHULO, REMOTE_ROUTE_ALLOWANCE],
  [GeorgianCity.TBILISI, GeorgianCity.SHUAKHEVI, REMOTE_ROUTE_ALLOWANCE],
  [GeorgianCity.TBILISI, GeorgianCity.NINOTSMINDA, REMOTE_ROUTE_ALLOWANCE],
  [GeorgianCity.KUTAISI, GeorgianCity.MESTIA, REMOTE_ROUTE_ALLOWANCE],
  [GeorgianCity.BATUMI, GeorgianCity.MESTIA, REMOTE_ROUTE_ALLOWANCE],
  [GeorgianCity.ZUGDIDI, GeorgianCity.MESTIA, REMOTE_ROUTE_ALLOWANCE],
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

  // Pricing model v1 tariff. The config singleton is created at its column
  // defaults; its knobs are admin-owned and never overwritten by a re-run.
  // But a re-run has just re-written every vehicle's rates above (and
  // re-asserts the bands and corridors below), so it is a tariff edit like
  // any admin save: `tariffVersion` moves forward, and a client holding a
  // quote from before the re-seed gets the 409 `tariff_changed` re-quote
  // instead of being booked at figures it was never shown.
  await prisma.pricingConfig.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: { tariffVersion: { increment: 1 } },
  });

  for (const band of HELPER_FLOOR_BAND_SEEDS) {
    await prisma.helperFloorBand.upsert({
      where: { minFloor: band.minFloor },
      create: band,
      update: { ratePerHelper: band.ratePerHelper },
    });
  }

  for (const [first, second, allowance] of ROUTE_ALLOWANCE_SEEDS) {
    // Stored normalised: cityA < cityB by enum name (the migration's CHECK).
    const [cityA, cityB] = first < second ? [first, second] : [second, first];
    await prisma.routeAllowance.upsert({
      where: { cityA_cityB: { cityA, cityB } },
      create: { cityA, cityB, allowance },
      update: { allowance },
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
