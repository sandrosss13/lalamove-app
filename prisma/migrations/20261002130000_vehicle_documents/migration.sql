-- Vehicle documents: registration and insurance uploads with a review status,
-- an expiry date the reviewer records, and a history (one row per upload).
--
-- Purely additive — two enums and one table nothing in the previous deployment
-- reads or writes — so it is safe against a populated database and against the
-- old code serving traffic for the length of a build.
--
-- Objects live in the existing private `driver-documents` Storage bucket under
-- a `vehicles/` prefix; no new bucket has to be provisioned.
CREATE TYPE "VehicleDocumentType" AS ENUM ('REGISTRATION', 'INSURANCE');

CREATE TYPE "VehicleDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'FLAGGED');

CREATE TABLE "VehicleDocument" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" "VehicleDocumentType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "status" "VehicleDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "flagReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleDocument_storagePath_key" ON "VehicleDocument"("storagePath");

CREATE INDEX "VehicleDocument_vehicleId_type_idx" ON "VehicleDocument"("vehicleId", "type");

CREATE INDEX "VehicleDocument_status_supersededAt_idx" ON "VehicleDocument"("status", "supersededAt");

-- The two "at most one live row" rules from the model's doc comment. Prisma's
-- schema language has no partial-index syntax, so they live here, as
-- `driver_vehicle_assignment_live_*_unique` do.
--
-- One document on file per vehicle and type…
CREATE UNIQUE INDEX "vehicle_document_live_approved_unique"
    ON "VehicleDocument"("vehicleId", "type")
    WHERE "supersededAt" IS NULL AND "status" = 'APPROVED';

-- …and one submission awaiting (or refused by) review beside it.
CREATE UNIQUE INDEX "vehicle_document_live_submission_unique"
    ON "VehicleDocument"("vehicleId", "type")
    WHERE "supersededAt" IS NULL AND "status" <> 'APPROVED';

ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
