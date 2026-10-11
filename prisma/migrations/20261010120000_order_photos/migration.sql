-- Cargo photos: up to three images of the load, attached by the client after
-- `POST /api/orders` creates the order and before checkout pays for it. They
-- replace the measured cargo envelope as the booking form's way of describing
-- a load; the objects themselves live in the private `driver-documents`
-- Supabase bucket under `order-photos/<orderId>/`, and only the path is kept
-- here.
--
-- One new table and nothing else, which is what makes this safe to run against
-- a populated production database:
--
--   * Additive, so the previous deployment keeps working against it.
--     `scripts/migrate-deploy.mjs` runs `prisma migrate deploy` ahead of
--     `next build`, so the *old* code serves traffic against this schema for the
--     length of a build — and the old code never reads or writes this table.
--   * No backfill: every existing order genuinely has no photos.
--   * `ON DELETE CASCADE` on the order, matching `LoadRejection`: a photo row
--     means nothing without its order.
--
-- The three-per-order cap is enforced by the upload route rather than here, the
-- same place the type and size rules live (`src/lib/order-photos/rules.ts`).

-- CreateTable
CREATE TABLE "OrderPhoto" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderPhoto_storagePath_key" ON "OrderPhoto"("storagePath");

-- CreateIndex
CREATE INDEX "OrderPhoto_orderId_idx" ON "OrderPhoto"("orderId");

-- AddForeignKey
ALTER TABLE "OrderPhoto" ADD CONSTRAINT "OrderPhoto_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
