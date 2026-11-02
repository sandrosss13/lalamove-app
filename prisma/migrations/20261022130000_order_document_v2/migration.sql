-- Order-details document v2: a stable document number per order, and the
-- driver's phone frozen into the start-of-trip snapshot.
--
-- Additive only: one sequence, two nullable columns, one unique index. No
-- existing row is rewritten — `documentNumber` is assigned lazily by the
-- application the first time an order's document is built (see the column's
-- comment in `schema.prisma`), and snapshots taken before this migration
-- simply have no driver phone.

-- CreateSequence
-- Draws the numeric part of `Order.documentNumber` ("INV-2026-0012489"). One
-- sequence across years: the year in the number is for the reader, the
-- sequence alone already makes it unique.
CREATE SEQUENCE "order_document_number_seq" START WITH 1 INCREMENT BY 1;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "documentNumber" TEXT;

-- AlterTable
ALTER TABLE "OrderServiceSnapshot" ADD COLUMN "driverPhone" TEXT;

-- CreateIndex
-- Postgres treats NULLs as distinct, so every not-yet-numbered order coexists.
CREATE UNIQUE INDEX "Order_documentNumber_key" ON "Order"("documentNumber");
