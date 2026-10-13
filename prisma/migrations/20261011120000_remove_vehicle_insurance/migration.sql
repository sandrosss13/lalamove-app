-- Vehicle insurance (MTPL) is no longer collected: the registration certificate
-- is the only vehicle document. Insurance never gated dispatch — it was upload,
-- admin review and expiry warnings only — so nothing else depends on it.
--
-- DESTRUCTIVE: every insurance upload is deleted, history included. Their
-- Storage objects (private `driver-documents` bucket, under
-- `vehicles/<vehicleId>/insurance/`) are not reachable from SQL and are left
-- behind; remove that prefix from the bucket separately if they should go too.
--
-- Postgres cannot drop a value from an enum, so the type is rebuilt without it.

-- 1. Rows that still reference the value.
DELETE FROM "VehicleDocument" WHERE "type" = 'INSURANCE';

-- Signed upload URLs issued for an insurance file and never registered. The
-- table has no type column; the type is the third segment of the object path
-- `vehicleDocumentObjectPath` mints (`vehicles/<vehicleId>/insurance/<file>`).
DELETE FROM "PendingUpload"
WHERE "vehicleId" IS NOT NULL
  AND "storagePath" LIKE 'vehicles/%/insurance/%';

-- 2. Rebuild the enum. Altering the column's type rebuilds every index on it in
-- place with its definition unchanged — including the hand-written partial
-- unique indexes `vehicle_document_live_approved_unique` and
-- `vehicle_document_live_submission_unique`, whose predicates read
-- "supersededAt" and "status" only — so none has to be dropped or recreated.
ALTER TYPE "VehicleDocumentType" RENAME TO "VehicleDocumentType_old";

CREATE TYPE "VehicleDocumentType" AS ENUM ('REGISTRATION');

ALTER TABLE "VehicleDocument"
  ALTER COLUMN "type" TYPE "VehicleDocumentType"
  USING ("type"::text::"VehicleDocumentType");

DROP TYPE "VehicleDocumentType_old";
