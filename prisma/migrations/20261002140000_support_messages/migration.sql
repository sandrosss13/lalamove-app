-- Support messages: what a driver sends from the app's Support screen — a
-- topic, a description and optionally the order it is about — and whether staff
-- have dealt with it.
--
-- Purely additive: two enums and one table the previous deployment never
-- touches.
CREATE TYPE "SupportTopic" AS ENUM ('PICKUP_OR_DROPOFF', 'CARGO_DAMAGED_OR_MISSING', 'PAYMENT_OR_WITHDRAWAL', 'DOCUMENTS_AND_ACCOUNT', 'OTHER');

CREATE TYPE "SupportMessageStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "topic" "SupportTopic" NOT NULL,
    "body" TEXT NOT NULL,
    "orderId" TEXT,
    "status" "SupportMessageStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportMessage_driverProfileId_createdAt_idx" ON "SupportMessage"("driverProfileId", "createdAt");

CREATE INDEX "SupportMessage_status_createdAt_idx" ON "SupportMessage"("status", "createdAt");

CREATE INDEX "SupportMessage_orderId_idx" ON "SupportMessage"("orderId");

ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
