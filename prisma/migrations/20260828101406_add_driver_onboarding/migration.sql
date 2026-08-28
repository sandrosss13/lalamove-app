-- CreateEnum
CREATE TYPE "LicenceCategory" AS ENUM ('B', 'C', 'CE');

-- CreateEnum
CREATE TYPE "DriverApplicationStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTION_REQUIRED', 'APPROVED');

-- CreateEnum
CREATE TYPE "DriverApplicationDocumentType" AS ENUM ('PROFILE_PHOTO', 'LICENCE_FRONT', 'LICENCE_BACK');

-- CreateEnum
CREATE TYPE "DriverApplicationDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "ChassisType" AS ENUM ('DRY_BOX', 'REFRIGERATED', 'OPEN_CHASSIS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GeorgianCity" ADD VALUE 'TKIBULI';
ALTER TYPE "GeorgianCity" ADD VALUE 'KARELI';
ALTER TYPE "GeorgianCity" ADD VALUE 'GURJAANI';
ALTER TYPE "GeorgianCity" ADD VALUE 'KVARELI';
ALTER TYPE "GeorgianCity" ADD VALUE 'LANCHKHUTI';
ALTER TYPE "GeorgianCity" ADD VALUE 'SACHKHERE';
ALTER TYPE "GeorgianCity" ADD VALUE 'TERJOLA';
ALTER TYPE "GeorgianCity" ADD VALUE 'KHOBI';
ALTER TYPE "GeorgianCity" ADD VALUE 'MARTVILI';
ALTER TYPE "GeorgianCity" ADD VALUE 'TSALENJIKHA';
ALTER TYPE "GeorgianCity" ADD VALUE 'ABASHA';
ALTER TYPE "GeorgianCity" ADD VALUE 'AMBROLAURI';
ALTER TYPE "GeorgianCity" ADD VALUE 'TSAGERI';
ALTER TYPE "GeorgianCity" ADD VALUE 'ONI';
ALTER TYPE "GeorgianCity" ADD VALUE 'MESTIA';
ALTER TYPE "GeorgianCity" ADD VALUE 'SIGHNAGHI';
ALTER TYPE "GeorgianCity" ADD VALUE 'DEDOPLISTSQARO';
ALTER TYPE "GeorgianCity" ADD VALUE 'LAGODEKHI';
ALTER TYPE "GeorgianCity" ADD VALUE 'AKHMETA';
ALTER TYPE "GeorgianCity" ADD VALUE 'DUSHETI';
ALTER TYPE "GeorgianCity" ADD VALUE 'TIANETI';
ALTER TYPE "GeorgianCity" ADD VALUE 'TSALKA';
ALTER TYPE "GeorgianCity" ADD VALUE 'DMANISI';
ALTER TYPE "GeorgianCity" ADD VALUE 'TETRITSQARO';
ALTER TYPE "GeorgianCity" ADD VALUE 'NINOTSMINDA';
ALTER TYPE "GeorgianCity" ADD VALUE 'ADIGENI';
ALTER TYPE "GeorgianCity" ADD VALUE 'ASPINDZA';
ALTER TYPE "GeorgianCity" ADD VALUE 'VALE';
ALTER TYPE "GeorgianCity" ADD VALUE 'BAGHDATI';
ALTER TYPE "GeorgianCity" ADD VALUE 'VANI';
ALTER TYPE "GeorgianCity" ADD VALUE 'KHARAGAULI';
ALTER TYPE "GeorgianCity" ADD VALUE 'KHONI';
ALTER TYPE "GeorgianCity" ADD VALUE 'CHKHOROTSQU';
ALTER TYPE "GeorgianCity" ADD VALUE 'JVARI';
ALTER TYPE "GeorgianCity" ADD VALUE 'KEDA';
ALTER TYPE "GeorgianCity" ADD VALUE 'KHELVACHAURI';
ALTER TYPE "GeorgianCity" ADD VALUE 'KHULO';
ALTER TYPE "GeorgianCity" ADD VALUE 'SHUAKHEVI';

-- AlterTable
ALTER TABLE "DriverProfile" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "idNumber" TEXT,
ADD COLUMN     "profilePhotoPath" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "cargoHeightM" DOUBLE PRECISION,
ADD COLUMN     "cargoLengthM" DOUBLE PRECISION,
ADD COLUMN     "cargoWidthM" DOUBLE PRECISION,
ADD COLUMN     "chassisType" "ChassisType",
ADD COLUMN     "colour" TEXT,
ADD COLUMN     "payloadKg" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "DriverLicence" (
    "id" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "licenceNumber" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "categories" "LicenceCategory"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverLicence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverApplication" (
    "id" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "DriverApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "draft" JSONB,
    "draftStep" INTEGER NOT NULL DEFAULT 1,
    "draftUpdatedAt" TIMESTAMP(3),
    "vehicleId" TEXT,
    "firstSubmittedAt" TIMESTAMP(3),
    "lastSubmittedAt" TIMESTAMP(3),
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverApplicationDocument" (
    "id" TEXT NOT NULL,
    "driverApplicationId" TEXT NOT NULL,
    "type" "DriverApplicationDocumentType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "status" "DriverApplicationDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "flagReason" TEXT,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverLicence_driverProfileId_key" ON "DriverLicence"("driverProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverApplication_driverProfileId_key" ON "DriverApplication"("driverProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverApplication_reference_key" ON "DriverApplication"("reference");

-- CreateIndex
CREATE INDEX "DriverApplication_status_idx" ON "DriverApplication"("status");

-- CreateIndex
CREATE INDEX "DriverApplicationDocument_driverApplicationId_idx" ON "DriverApplicationDocument"("driverApplicationId");

-- AddForeignKey
ALTER TABLE "DriverLicence" ADD CONSTRAINT "DriverLicence_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverApplication" ADD CONSTRAINT "DriverApplication_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverApplication" ADD CONSTRAINT "DriverApplication_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverApplicationDocument" ADD CONSTRAINT "DriverApplicationDocument_driverApplicationId_fkey" FOREIGN KEY ("driverApplicationId") REFERENCES "DriverApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one live (non-superseded) document per application per document
-- type. A retake inserts a new row and sets supersededAt on the old one
-- instead of overwriting it, so the review history survives resubmission.
CREATE UNIQUE INDEX "driver_application_document_live_type_unique"
ON "DriverApplicationDocument" ("driverApplicationId", "type")
WHERE "supersededAt" IS NULL;

-- Every driver that already existed before this feature shipped is
-- grandfathered as activated. Only new independent Individual/Individual
-- Entrepreneur sign-ups go through onboarding and start unactivated.
UPDATE "DriverProfile" SET "activatedAt" = now() WHERE "activatedAt" IS NULL;
