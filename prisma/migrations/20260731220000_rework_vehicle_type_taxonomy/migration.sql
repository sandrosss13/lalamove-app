-- AlterEnum
-- Replaces the flat BIKE/CAR/VAN VehicleType enum with the new 14-value
-- light-truck / cargo-van taxonomy. Existing rows using the removed values
-- are remapped to their closest new equivalent before the cast:
--   CAR  -> PICKUP              (closest light-truck analog to a car-based delivery)
--   VAN  -> CARGO_DERIVED_VAN   (closest cargo-van analog to a generic van)
--   BIKE -> PICKUP              (no BIKE rows exist today; fallback only, never expected to hit)
BEGIN;
CREATE TYPE "VehicleType_new" AS ENUM ('FLATBED', 'PICKUP', 'VENDING_TRUCK', 'REFRIGERATED_TRUCK', 'ICE_CREAM_TRUCK', 'CURTAINSIDER_TRUCK', 'BOX_TRUCK', 'CHASSIS_TRUCK', 'DUMP_TRUCK', 'CARGO_DERIVED_VAN', 'CLOSED_BOX_VAN', 'COMBO_VAN', 'ISOTHERMAL_VAN', 'REFRIGERATED_VAN');
ALTER TABLE "DriverProfile" ALTER COLUMN "vehicleType" TYPE "VehicleType_new" USING (
  CASE "vehicleType"::text
    WHEN 'CAR' THEN 'PICKUP'
    WHEN 'VAN' THEN 'CARGO_DERIVED_VAN'
    WHEN 'BIKE' THEN 'PICKUP'
    ELSE "vehicleType"::text
  END
)::"VehicleType_new";
ALTER TABLE "Order" ALTER COLUMN "vehicleType" TYPE "VehicleType_new" USING (
  CASE "vehicleType"::text
    WHEN 'CAR' THEN 'PICKUP'
    WHEN 'VAN' THEN 'CARGO_DERIVED_VAN'
    WHEN 'BIKE' THEN 'PICKUP'
    ELSE "vehicleType"::text
  END
)::"VehicleType_new";
ALTER TYPE "VehicleType" RENAME TO "VehicleType_old";
ALTER TYPE "VehicleType_new" RENAME TO "VehicleType";
DROP TYPE "public"."VehicleType_old";
COMMIT;
