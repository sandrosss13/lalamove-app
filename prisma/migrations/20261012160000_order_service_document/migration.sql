-- CreateEnum
CREATE TYPE "ServiceProviderKind" AS ENUM ('COMPANY', 'DRIVER');

-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN     "legalAddress" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "trailerPlateNumber" TEXT;

-- CreateTable
CREATE TABLE "OrderServiceSnapshot" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerKind" "ServiceProviderKind" NOT NULL,
    "providerName" TEXT,
    "providerTaxId" TEXT,
    "providerAddress" TEXT,
    "driverFirstName" TEXT,
    "driverLastName" TEXT,
    "driverPersonalId" TEXT,
    "vehicleMake" TEXT,
    "vehicleModel" TEXT,
    "vehiclePlate" TEXT,
    "trailerPlate" TEXT,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderServiceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderServiceSnapshot_orderId_key" ON "OrderServiceSnapshot"("orderId");

-- AddForeignKey
ALTER TABLE "OrderServiceSnapshot" ADD CONSTRAINT "OrderServiceSnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

