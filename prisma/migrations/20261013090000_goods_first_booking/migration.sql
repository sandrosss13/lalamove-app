-- CreateEnum
CREATE TYPE "ItemGroup" AS ENUM ('LIVING_ROOM', 'BEDROOM', 'KITCHEN_APPLIANCES', 'OFFICE', 'BOXES_PARCELS', 'OUTDOOR_SPORTS', 'CHILLED_FOOD', 'BUILDING_MATERIALS', 'EVENT_EQUIPMENT');

-- CreateEnum
CREATE TYPE "OrderItemKind" AS ENUM ('CATALOGUE', 'CUSTOM', 'PALLET');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cargoVolumeM3" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ItemCatalogEntry" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "group" "ItemGroup" NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelKa" TEXT NOT NULL,
    "synonymsEn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "synonymsKa" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weightKg" DOUBLE PRECISION NOT NULL,
    "lengthM" DOUBLE PRECISION NOT NULL,
    "widthM" DOUBLE PRECISION NOT NULL,
    "heightM" DOUBLE PRECISION NOT NULL,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "needsTwoPeople" BOOLEAN NOT NULL DEFAULT false,
    "requiredBody" "ChassisType",
    "handlingTags" "CargoHandlingTag"[] DEFAULT ARRAY[]::"CargoHandlingTag"[],
    "cargoCategory" "CargoCategory" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "OrderItemKind" NOT NULL,
    "catalogEntryId" TEXT,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitWeightKg" DOUBLE PRECISION NOT NULL,
    "lengthM" DOUBLE PRECISION NOT NULL,
    "widthM" DOUBLE PRECISION NOT NULL,
    "heightM" DOUBLE PRECISION NOT NULL,
    "stackable" BOOLEAN NOT NULL,
    "palletType" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemCatalogEntry_code_key" ON "ItemCatalogEntry"("code");

-- CreateIndex
CREATE INDEX "ItemCatalogEntry_group_active_sortOrder_idx" ON "ItemCatalogEntry"("group", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_catalogEntryId_idx" ON "OrderItem"("catalogEntryId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "ItemCatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

