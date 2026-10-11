-- Pending uploads: one row per signed upload URL the server has issued and
-- whose object has not been registered yet. It is what bounds how many such
-- URLs can be outstanding for one order's proof of delivery or one vehicle's
-- documents — in the database, because on a serverless deployment a counter in
-- one instance's memory bounds nothing.
--
-- Purely additive: one table the previous deployment never touches. Uploads
-- already in flight when this ships have no row and are registered exactly as
-- before; only URLs issued from now on are counted.
CREATE TABLE "PendingUpload" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "vehicleId" TEXT,
    "storagePath" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingUpload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingUpload_storagePath_key" ON "PendingUpload"("storagePath");

CREATE INDEX "PendingUpload_orderId_idx" ON "PendingUpload"("orderId");

CREATE INDEX "PendingUpload_vehicleId_idx" ON "PendingUpload"("vehicleId");

ALTER TABLE "PendingUpload" ADD CONSTRAINT "PendingUpload_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PendingUpload" ADD CONSTRAINT "PendingUpload_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A pending upload belongs to exactly one of an order (proof of delivery) or a
-- vehicle (its documents) — never both, never neither. Prisma's schema language
-- has no XOR, so this is hand-written, as `vehicle_single_owner_check` is, and
-- is listed at the top of `schema.prisma` with the other SQL-only constraints.
ALTER TABLE "PendingUpload" ADD CONSTRAINT "PendingUpload_single_scope_check"
  CHECK (
    ("orderId" IS NOT NULL AND "vehicleId" IS NULL) OR
    ("orderId" IS NULL AND "vehicleId" IS NOT NULL)
  );
