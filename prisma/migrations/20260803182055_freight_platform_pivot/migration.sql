/*
  Warnings:

  - You are about to drop the column `vehicleType` on the `DriverProfile` table. All the data in the column will be lost.
  - You are about to drop the column `packageType` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleType` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `capacityKg` on the `Vehicle` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleType` on the `Vehicle` table. All the data in the column will be lost.
  - Added the required column `baseFare` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cargoCategory` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `distanceFare` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timeFare` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicleTypeSpecId` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicleTypeSpecId` to the `Vehicle` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VehicleCategory" AS ENUM ('MEDIUM_DUTY', 'HEAVY_DUTY');

-- CreateEnum
CREATE TYPE "LoadingAccessType" AS ENUM ('REAR_DOOR', 'SIDE_DOOR', 'RAMP', 'TAIL_LIFT', 'OPEN_FLATBED');

-- CreateEnum
CREATE TYPE "CargoCategory" AS ENUM ('FURNITURE_FURNISHINGS', 'APPLIANCES', 'RETAIL_STOCK', 'EVENT_EQUIPMENT', 'FULL_RELOCATION', 'INDUSTRIAL_SUPPLIES', 'CONSTRUCTION_MATERIALS');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'CLAIMED';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'COMPANY';

-- AlterTable
ALTER TABLE "DriverProfile" DROP COLUMN "vehicleType",
ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "packageType",
DROP COLUMN "vehicleType",
ADD COLUMN     "baseFare" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "cargoCategory" "CargoCategory" NOT NULL,
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "distanceFare" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "helperFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "inTransitAt" TIMESTAMP(3),
ADD COLUMN     "overtimeFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "requiresHelper" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timeFare" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "vehicleTypeSpecId" TEXT NOT NULL,
ADD COLUMN     "waitingMinutes" INTEGER;

-- AlterTable
ALTER TABLE "Vehicle" DROP COLUMN "capacityKg",
DROP COLUMN "vehicleType",
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "vehicleTypeSpecId" TEXT NOT NULL,
ALTER COLUMN "driverProfileId" DROP NOT NULL;

-- DropEnum
DROP TYPE "PackageType";

-- DropEnum
DROP TYPE "VehicleType";

-- CreateTable
CREATE TABLE "VehicleTypeSpec" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "VehicleCategory" NOT NULL,
    "maxPayloadKg" DOUBLE PRECISION NOT NULL,
    "cargoLengthM" DOUBLE PRECISION NOT NULL,
    "cargoWidthM" DOUBLE PRECISION NOT NULL,
    "cargoHeightM" DOUBLE PRECISION NOT NULL,
    "loadingAccessType" "LoadingAccessType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleTypeSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "vehicleTypeSpecId" TEXT NOT NULL,
    "baseFare" DOUBLE PRECISION NOT NULL,
    "pricePerKm" DOUBLE PRECISION NOT NULL,
    "pricePerMinute" DOUBLE PRECISION NOT NULL,
    "freeLoadingMinutes" INTEGER NOT NULL,
    "overtimeRatePerMinute" DOUBLE PRECISION NOT NULL,
    "helperFee" DOUBLE PRECISION NOT NULL,
    "minimumFare" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsCompany" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "vatId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" "GeorgianCity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleTypeSpec_code_key" ON "VehicleTypeSpec"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_vehicleTypeSpecId_key" ON "PricingRule"("vehicleTypeSpecId");

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsCompany_userId_key" ON "LogisticsCompany"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsCompany_phone_key" ON "LogisticsCompany"("phone");

-- CreateIndex
CREATE INDEX "DriverProfile_companyId_idx" ON "DriverProfile"("companyId");

-- CreateIndex
CREATE INDEX "Order_companyId_idx" ON "Order"("companyId");

-- CreateIndex
CREATE INDEX "Vehicle_companyId_idx" ON "Vehicle"("companyId");

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_vehicleTypeSpecId_fkey" FOREIGN KEY ("vehicleTypeSpecId") REFERENCES "VehicleTypeSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsCompany" ADD CONSTRAINT "LogisticsCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "LogisticsCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "LogisticsCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_vehicleTypeSpecId_fkey" FOREIGN KEY ("vehicleTypeSpecId") REFERENCES "VehicleTypeSpec"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A vehicle is owned by exactly one of an independent driver or a logistics
-- company — never both, never neither. Prisma's schema language has no native
-- XOR, so this is hand-written and must be kept in the migration history.
ALTER TABLE "Vehicle" ADD CONSTRAINT "vehicle_single_owner_check"
  CHECK (
    ("driverProfileId" IS NOT NULL AND "companyId" IS NULL) OR
    ("driverProfileId" IS NULL AND "companyId" IS NOT NULL)
  );

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_vehicleTypeSpecId_fkey" FOREIGN KEY ("vehicleTypeSpecId") REFERENCES "VehicleTypeSpec"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "LogisticsCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
