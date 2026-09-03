-- Schema for the client dashboard's booking and payment work: stop contacts,
-- service levels, the load-space (body) filter, saved cards and a Business-only
-- purchase-order reference.
--
-- Every statement below is additive. Every new column is nullable or defaulted,
-- so no row is rewritten and no data is dropped: existing orders take
-- `serviceLevel = REGULAR` (the tier they were in fact served at) and a zero
-- adjustment, and null for everything else. `PricingRule` is deliberately
-- untouched — the catalogue already prices refrigerated bodies above dry ones,
-- so there is no body surcharge to add.

-- CreateEnum
CREATE TYPE "ServiceLevel" AS ENUM ('PRIORITY', 'REGULAR', 'POOLING');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "bodyType" "ChassisType",
ADD COLUMN     "dropoffContactDetails" TEXT,
ADD COLUMN     "dropoffContactName" TEXT,
ADD COLUMN     "dropoffContactPhone" TEXT,
ADD COLUMN     "paymentMethodType" "PaymentMethodType",
ADD COLUMN     "pickupContactDetails" TEXT,
ADD COLUMN     "pickupContactName" TEXT,
ADD COLUMN     "pickupContactPhone" TEXT,
ADD COLUMN     "purchaseOrderRef" TEXT,
ADD COLUMN     "savedCardId" TEXT,
ADD COLUMN     "serviceLevel" "ServiceLevel" NOT NULL DEFAULT 'REGULAR',
ADD COLUMN     "serviceLevelAdjustment" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VehicleTypeSpec" ADD COLUMN     "bodyTypes" "ChassisType"[];

-- CreateTable
CREATE TABLE "SavedCard" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "providerToken" TEXT,
    "provider" TEXT,
    "brand" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "expMonth" INTEGER NOT NULL,
    "expYear" INTEGER NOT NULL,
    "holderName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedCard_providerToken_key" ON "SavedCard"("providerToken");

-- CreateIndex
CREATE INDEX "SavedCard_clientId_idx" ON "SavedCard"("clientId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_savedCardId_fkey" FOREIGN KEY ("savedCardId") REFERENCES "SavedCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCard" ADD CONSTRAINT "SavedCard_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
