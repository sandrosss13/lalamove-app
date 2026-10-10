-- Load offers: a time-boxed invitation for one driver to take one open load,
-- pushed to the driver app while the driver is online.
--
-- Purely additive: one enum and one table the previous deployment never
-- touches.
CREATE TYPE "LoadOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

CREATE TABLE "LoadOffer" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "status" "LoadOfferStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoadOffer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoadOffer_driverProfileId_status_idx" ON "LoadOffer"("driverProfileId", "status");

CREATE INDEX "LoadOffer_orderId_status_expiresAt_idx" ON "LoadOffer"("orderId", "status", "expiresAt");

CREATE INDEX "LoadOffer_status_expiresAt_idx" ON "LoadOffer"("status", "expiresAt");

-- A driver is offered a given load at most once, ever: a declined or expired
-- row stays and blocks a second insert.
CREATE UNIQUE INDEX "LoadOffer_orderId_driverProfileId_key" ON "LoadOffer"("orderId", "driverProfileId");

-- A driver has at most one unanswered offer at a time. Partial, so Prisma's
-- schema cannot express it; it is declared here only and documented on the
-- model. The dispatcher sweeps expired PENDING rows before it inserts, and
-- inserts with ON CONFLICT DO NOTHING, so a collision is skipped, not an error.
CREATE UNIQUE INDEX "LoadOffer_one_pending_per_driver" ON "LoadOffer"("driverProfileId") WHERE "status" = 'PENDING';

ALTER TABLE "LoadOffer" ADD CONSTRAINT "LoadOffer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoadOffer" ADD CONSTRAINT "LoadOffer_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoadOffer" ADD CONSTRAINT "LoadOffer_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
