-- Structured per-stop "Contact Info" (building, entrance, comment) and a
-- passenger-elevator flag per stop. The floor reuses pickupFloor/dropoffFloor
-- and the cargo elevator reuses pickupCargoElevator/dropoffCargoElevator.
--
-- ADDITIVE ONLY: nullable text columns and defaulted booleans. Nothing is
-- dropped, renamed or backfilled. The legacy free-text pickupContactDetails /
-- dropoffContactDetails stay; new orders simply stop writing them.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "dropoffBuildingName" TEXT,
ADD COLUMN     "dropoffComment" TEXT,
ADD COLUMN     "dropoffEntrance" TEXT,
ADD COLUMN     "dropoffPassengerElevator" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pickupBuildingName" TEXT,
ADD COLUMN     "pickupComment" TEXT,
ADD COLUMN     "pickupEntrance" TEXT,
ADD COLUMN     "pickupPassengerElevator" BOOLEAN NOT NULL DEFAULT false;
