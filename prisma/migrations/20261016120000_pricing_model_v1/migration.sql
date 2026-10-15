-- Pricing model v1 (ZOMO_Full_Pricing_Model.xlsx): city vs intercity transport,
-- per-location helpers priced by floor band, return allowance per city pair,
-- per-vehicle/per-trip-type commission, 600 km manual-quote threshold, quote
-- validity + tariff version. Engine: src/lib/pricing-engine.ts (pure) and
-- src/lib/pricing.ts (Prisma-reading).
--
-- ADDITIVE ONLY: new enum, new tables, new columns that are nullable or
-- defaulted. Nothing is dropped or renamed.
--
-- DECOUPLED FROM THE LEGACY PRICING. The production database is shared by the
-- pre-v1 code (main) and this branch while v1 is staged, so this migration
-- never writes a column the old code prices with: `PricingRule.baseFare`,
-- `pricePerKm`, `pricePerMinute`, `minimumFare`, `helperFee`,
-- `freeLoadingMinutes` and `overtimeRatePerMinute` are left exactly as they
-- are. The v1 rates live in NEW columns (`cityBaseFare`, `cityPricePerKm`,
-- `cityPricePerMinute`, `cityMinimumFare`, `intercityBaseFare`,
-- `intercityPricePerKm`, `cityCommissionRate`, `intercityCommissionRate`),
-- read only by the v1 engine. Vehicle waiting overtime keeps using the shared
-- `freeLoadingMinutes` / `overtimeRatePerMinute` in both code paths.
--
-- NOT RE-RUNNABLE AS A WHOLE: like every Prisma migration it runs once (the
-- CREATE TYPE / ADD COLUMN / CREATE TABLE statements fail on a second run).
-- The data statements below are individually idempotent, though, so any of
-- them can be re-applied by hand without harm:
--   * The new PricingRule columns are UPDATEd to the v1 rate table by vehicle
--     code (approved), matching prisma/seed.ts. A rule whose vehicle code is
--     not in that table gets its v1 columns copied from its legacy rates, so
--     no vehicle ever prices at 0. Orders already booked are unaffected: every
--     order stores its own itemised figures.
--   * The PricingConfig singleton, the four HelperFloorBand rows and the seed
--     RouteAllowance corridors are INSERTed with ON CONFLICT DO NOTHING, so a
--     row an admin has since edited is never overwritten.
--   * Existing orders get pickupHelpers = dropoffHelpers = helperCount, the
--     same legacy mapping the API applies to a client that still sends only
--     `helperCount`. They keep tariffVersion NULL, which marks them pre-v1.
--
-- Ids: gen_random_uuid()::text (Prisma's cuid() is client-side only).
-- "updatedAt" has no database default (Prisma's @updatedAt is client-side), so
-- it is set explicitly.

-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('CITY', 'INTERCITY');

-- AlterTable
ALTER TABLE "PricingRule" ADD COLUMN     "cityBaseFare" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "cityMinimumFare" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "cityPricePerKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "cityPricePerMinute" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "cityCommissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
ADD COLUMN     "intercityBaseFare" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "intercityCommissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.12,
ADD COLUMN     "intercityPricePerKm" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "dropoffCargoElevator" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dropoffFloor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dropoffHelperFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "dropoffHelperMinutes" INTEGER,
ADD COLUMN     "dropoffHelpers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "helperOvertimeFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "helperPayout" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "pickupCargoElevator" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pickupFloor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pickupHelperFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "pickupHelperMinutes" INTEGER,
ADD COLUMN     "pickupHelpers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quotedAt" TIMESTAMP(3),
ADD COLUMN     "returnAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "returnFare" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "tariffVersion" INTEGER,
ADD COLUMN     "transportFare" DOUBLE PRECISION,
ADD COLUMN     "tripType" "TripType";

-- CreateTable
CREATE TABLE "PricingConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "intercityThresholdKm" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "manualQuoteThresholdKm" DOUBLE PRECISION NOT NULL DEFAULT 600,
    "defaultReturnAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    "quoteValidityMinutes" INTEGER NOT NULL DEFAULT 20,
    "tariffVersion" INTEGER NOT NULL DEFAULT 1,
    "maxHelpers" INTEGER NOT NULL DEFAULT 4,
    "helperIncludedMinutes" INTEGER NOT NULL DEFAULT 60,
    "helperOvertimeIncrementMinutes" INTEGER NOT NULL DEFAULT 30,
    "helperOvertimeFeePerIncrement" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "elevatorDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelperFloorBand" (
    "id" TEXT NOT NULL,
    "minFloor" INTEGER NOT NULL,
    "ratePerHelper" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelperFloorBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteAllowance" (
    "id" TEXT NOT NULL,
    "cityA" "GeorgianCity" NOT NULL,
    "cityB" "GeorgianCity" NOT NULL,
    "allowance" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelperFloorBand_minFloor_key" ON "HelperFloorBand"("minFloor");

-- CreateIndex
CREATE UNIQUE INDEX "RouteAllowance_cityA_cityB_key" ON "RouteAllowance"("cityA", "cityB");

-- Hand-written constraints Prisma has no syntax for.
-- PricingConfig is a singleton: only the row with id 1 may exist.
ALTER TABLE "PricingConfig" ADD CONSTRAINT "PricingConfig_singleton_check" CHECK ("id" = 1);
-- A pair is stored once, normalised by enum NAME (text comparison, the same
-- ordering `normaliseCityPair` uses in JS), and the allowance is a fraction.
ALTER TABLE "RouteAllowance" ADD CONSTRAINT "RouteAllowance_pair_order_check"
  CHECK ("cityA"::text < "cityB"::text);
ALTER TABLE "RouteAllowance" ADD CONSTRAINT "RouteAllowance_allowance_check"
  CHECK ("allowance" >= 0 AND "allowance" <= 1);
ALTER TABLE "HelperFloorBand" ADD CONSTRAINT "HelperFloorBand_values_check"
  CHECK ("minFloor" >= 0 AND "ratePerHelper" >= 0);

-- Fill the v1 rate columns from the approved table, by vehicle code. ONLY the
-- new columns are written — never a legacy rate (see the header), and not
-- "updatedAt" either, so the old code's view of these rows is untouched.
UPDATE "PricingRule" AS r
SET "cityBaseFare" = v.city_base,
    "cityPricePerKm" = v.city_per_km,
    "cityPricePerMinute" = v.city_per_min,
    "cityMinimumFare" = v.city_min,
    "intercityBaseFare" = v.ic_base,
    "intercityPricePerKm" = v.ic_per_km,
    "cityCommissionRate" = v.comm_city,
    "intercityCommissionRate" = v.comm_ic
FROM (VALUES
  ('MINIVAN',             15::float8, 0.9::float8, 0.20::float8,  25::float8, 15::float8, 1.1::float8, 0.15::float8, 0.12::float8),
  ('CARGO_VAN',           20, 1.2, 0.25,  35, 20, 1.4, 0.15, 0.12),
  ('CLOSED_BOX_VAN',      30, 1.6, 0.30,  50, 30, 1.8, 0.15, 0.12),
  ('BOX_TRUCK',           45, 2.2, 0.40,  70, 45, 2.5, 0.12, 0.10),
  ('FLATBED_TRUCK',       50, 2.5, 0.45,  80, 50, 2.8, 0.12, 0.10),
  ('REFRIGERATED_VAN',    35, 1.9, 0.35,  60, 35, 2.2, 0.15, 0.12),
  ('MPV',                 12, 0.8, 0.18,  20, 12, 1.0, 0.15, 0.12),
  ('CURTAINSIDER_TRUCK',  55, 2.7, 0.48,  85, 55, 3.0, 0.12, 0.10),
  ('REFRIGERATED_TRUCK',  55, 2.8, 0.50,  90, 55, 3.2, 0.12, 0.10),
  ('LARGE_FREIGHT_TRUCK', 70, 3.2, 0.55, 110, 70, 3.6, 0.12, 0.10),
  ('TRAILER_TRUCK',       90, 3.8, 0.65, 140, 90, 4.2, 0.12, 0.10)
) AS v(code, city_base, city_per_km, city_per_min, city_min, ic_base, ic_per_km, comm_city, comm_ic)
JOIN "VehicleTypeSpec" AS s ON s."code" = v.code
WHERE r."vehicleTypeSpecId" = s."id";

-- Any other vehicle (a code not in the table above, e.g. one an admin added):
-- its v1 columns start from its legacy rates — city from the legacy city
-- figures, intercity base/per-km from the legacy base/per-km — so it never
-- quotes at 0. Only rows still at the column defaults are touched, which keeps
-- this idempotent and leaves the table-filled rows alone.
UPDATE "PricingRule" AS r
SET "cityBaseFare" = r."baseFare",
    "cityPricePerKm" = r."pricePerKm",
    "cityPricePerMinute" = r."pricePerMinute",
    "cityMinimumFare" = r."minimumFare",
    "intercityBaseFare" = r."baseFare",
    "intercityPricePerKm" = r."pricePerKm"
WHERE r."cityMinimumFare" = 0
  AND r."intercityPricePerKm" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "VehicleTypeSpec" AS s
    WHERE s."id" = r."vehicleTypeSpecId"
      AND s."code" IN ('MINIVAN', 'CARGO_VAN', 'CLOSED_BOX_VAN', 'BOX_TRUCK',
                       'FLATBED_TRUCK', 'REFRIGERATED_VAN', 'MPV',
                       'CURTAINSIDER_TRUCK', 'REFRIGERATED_TRUCK',
                       'LARGE_FREIGHT_TRUCK', 'TRAILER_TRUCK')
  );

-- The config singleton, at the column defaults.
INSERT INTO "PricingConfig" ("id", "updatedAt")
VALUES (1, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Helper rate per helper per location by floor: 0-3, 4-6, 7-9, 10+.
INSERT INTO "HelperFloorBand" ("id", "minFloor", "ratePerHelper", "updatedAt") VALUES
  (gen_random_uuid()::text, 0, 15, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 4, 25, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 7, 35, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 10, 50, CURRENT_TIMESTAMP)
ON CONFLICT ("minFloor") DO NOTHING;

-- Return allowance corridors. Major corridors (a backhaul is easy to find)
-- 0.15; remote mountain destinations (the truck returns empty) 0.65. Every
-- other intercity pair uses PricingConfig.defaultReturnAllowance (0.35).
-- Pairs are written normalised: cityA < cityB alphabetically.
INSERT INTO "RouteAllowance" ("id", "cityA", "cityB", "allowance", "updatedAt") VALUES
  (gen_random_uuid()::text, 'RUSTAVI', 'TBILISI', 0.15, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BATUMI', 'TBILISI', 0.15, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'KUTAISI', 'TBILISI', 0.15, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GORI', 'TBILISI', 0.15, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BATUMI', 'KUTAISI', 0.15, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'TBILISI', 'ZUGDIDI', 0.15, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'POTI', 'TBILISI', 0.15, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BATUMI', 'POTI', 0.15, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MESTIA', 'TBILISI', 0.65, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ONI', 'TBILISI', 0.65, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'AMBROLAURI', 'TBILISI', 0.65, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'TBILISI', 'TSAGERI', 0.65, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'KHULO', 'TBILISI', 0.65, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SHUAKHEVI', 'TBILISI', 0.65, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'NINOTSMINDA', 'TBILISI', 0.65, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'KUTAISI', 'MESTIA', 0.65, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BATUMI', 'MESTIA', 0.65, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MESTIA', 'ZUGDIDI', 0.65, CURRENT_TIMESTAMP)
ON CONFLICT ("cityA", "cityB") DO NOTHING;

-- Legacy orders: one crew size applied at both ends, as the API maps a
-- `helperCount`-only request.
UPDATE "Order"
SET "pickupHelpers" = "helperCount",
    "dropoffHelpers" = "helperCount"
WHERE "helperCount" > 0
  AND "tariffVersion" IS NULL
  AND "pickupHelpers" = 0
  AND "dropoffHelpers" = 0;
