-- CreateEnum
CREATE TYPE "BusinessApplicationStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTION_REQUIRED', 'APPROVED');

-- CreateEnum
CREATE TYPE "CompanyReviewStatus" AS ENUM ('PENDING', 'VERIFIED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "BusinessApplicationVehicleStatus" AS ENUM ('PENDING', 'APPROVED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "VehicleClass" AS ENUM ('SMALL_VAN', 'LARGE_VAN', 'MEDIUM_TRUCK', 'HEAVY_FREIGHT_TRUCK', 'TRAILER_TRUCK');

-- AlterTable
ALTER TABLE "LogisticsCompany" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "bankAccountIban" TEXT,
ADD COLUMN     "citiesOfOperation" "GeorgianCity"[],
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactRole" TEXT,
ADD COLUMN     "registeredAddress" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "vehicleClass" "VehicleClass";

-- CreateTable
CREATE TABLE "BusinessApplication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "BusinessApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "draft" JSONB,
    "draftStep" INTEGER NOT NULL DEFAULT 1,
    "draftUpdatedAt" TIMESTAMP(3),
    "companyReviewStatus" "CompanyReviewStatus" NOT NULL DEFAULT 'PENDING',
    "companyFlagReason" TEXT,
    "firstSubmittedAt" TIMESTAMP(3),
    "lastSubmittedAt" TIMESTAMP(3),
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessApplicationVehicle" (
    "id" TEXT NOT NULL,
    "businessApplicationId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "vehicleClass" "VehicleClass" NOT NULL,
    "chassisType" "ChassisType" NOT NULL,
    "status" "BusinessApplicationVehicleStatus" NOT NULL DEFAULT 'PENDING',
    "flagReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessApplicationVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessApplication_companyId_key" ON "BusinessApplication"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessApplication_reference_key" ON "BusinessApplication"("reference");

-- CreateIndex
CREATE INDEX "BusinessApplication_status_idx" ON "BusinessApplication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessApplicationVehicle_vehicleId_key" ON "BusinessApplicationVehicle"("vehicleId");

-- CreateIndex
CREATE INDEX "BusinessApplicationVehicle_businessApplicationId_idx" ON "BusinessApplicationVehicle"("businessApplicationId");

-- AddForeignKey
ALTER TABLE "BusinessApplication" ADD CONSTRAINT "BusinessApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "LogisticsCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessApplicationVehicle" ADD CONSTRAINT "BusinessApplicationVehicle_businessApplicationId_fkey" FOREIGN KEY ("businessApplicationId") REFERENCES "BusinessApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessApplicationVehicle" ADD CONSTRAINT "BusinessApplicationVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one live (non-closed) assignment per vehicle. Until now this was
-- enforced only inside the assignment route's transaction, which under
-- Postgres' default READ COMMITTED narrows the race window without closing it:
-- two concurrent assigns can each read "no live assignment" and both insert.
CREATE UNIQUE INDEX "driver_vehicle_assignment_live_vehicle_unique"
ON "DriverVehicleAssignment" ("vehicleId")
WHERE "unassignedAt" IS NULL;

-- The mirror rule: at most one live assignment per driver, so one person can
-- never be "currently driving" two vehicles and leave dispatch unable to tell
-- which. Same race, same fix.
CREATE UNIQUE INDEX "driver_vehicle_assignment_live_driver_unique"
ON "DriverVehicleAssignment" ("driverProfileId")
WHERE "unassignedAt" IS NULL;

-- Every logistics company that already existed before this feature shipped is
-- grandfathered as activated. `activatedAt` has no default, so without this
-- every currently-dispatching company would be locked out by task-21's gate the
-- moment it ships. Only companies that register through the new wizard start
-- unactivated. Mirrors the `DriverProfile.activatedAt` backfill in
-- 20260828101406_add_driver_onboarding.
--
-- `createdAt`, NOT `now()`: the column answers "since when has this company been
-- able to dispatch", and every one of these companies has been dispatching since
-- the day it was created. Stamping the migration's own clock would make every
-- grandfathered company look like it was activated the minute this feature
-- deployed — a timestamp that is wrong, that reads as a mass activation event in
-- any audit or cohort query, and that is unrecoverable once the real value is
-- overwritten. `createdAt` is non-null on every row, so this cannot leave a NULL.
UPDATE "LogisticsCompany" SET "activatedAt" = "createdAt" WHERE "activatedAt" IS NULL;

-- Prisma adds a scalar-list column without a DEFAULT, so pre-existing rows hold
-- a SQL NULL array. Prisma Client surfaces that as `[]`, but normalising it here
-- keeps raw SQL and any future direct reads honest. This is a data statement,
-- not a schema change, so it introduces no drift.
UPDATE "LogisticsCompany"
SET "citiesOfOperation" = ARRAY[]::"GeorgianCity"[]
WHERE "citiesOfOperation" IS NULL;
