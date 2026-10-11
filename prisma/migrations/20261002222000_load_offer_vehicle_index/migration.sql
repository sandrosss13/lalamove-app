-- `LoadOffer.vehicleId` is `ON DELETE SET NULL` and had no index, so deleting a
-- vehicle made Postgres scan every offer to find the rows to null.
--
-- Additive. Not CONCURRENTLY: Prisma runs a migration inside a transaction,
-- which that form cannot be part of, and the table is small and short-lived
-- (offers last seconds), so the brief write lock is not a concern here.
CREATE INDEX "LoadOffer_vehicleId_idx" ON "LoadOffer"("vehicleId");
