-- Two additive changes for the driver app.
--
-- 1. Five more support topics, for the Orders screen's "Report a problem" flow.
--    Appended: the five existing values keep their meaning and their rows.
--    (`ADD VALUE` may run inside a transaction as long as the new value is not
--    used in it, which nothing here does.)
ALTER TYPE "SupportTopic" ADD VALUE IF NOT EXISTS 'CONTACT_UNREACHABLE';
ALTER TYPE "SupportTopic" ADD VALUE IF NOT EXISTS 'ADDRESS_WRONG_OR_INACCESSIBLE';
ALTER TYPE "SupportTopic" ADD VALUE IF NOT EXISTS 'CARGO_MISMATCH';
ALTER TYPE "SupportTopic" ADD VALUE IF NOT EXISTS 'VEHICLE_BREAKDOWN';
ALTER TYPE "SupportTopic" ADD VALUE IF NOT EXISTS 'ACCIDENT';

-- 2. A driver's emergency contact. Both nullable: no existing row has one.
ALTER TABLE "DriverProfile" ADD COLUMN "emergencyContactName" TEXT;
ALTER TABLE "DriverProfile" ADD COLUMN "emergencyContactPhone" TEXT;
