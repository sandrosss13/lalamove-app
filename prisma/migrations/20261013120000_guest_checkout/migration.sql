-- Guest checkout: an order may be placed without an account. A guest order has
-- no clientId; it is identified by the sha256 hash of a private tracking token
-- and carries the contact the guest typed at checkout.

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "clientId" DROP NOT NULL,
ADD COLUMN     "guestAccessTokenHash" TEXT,
ADD COLUMN     "guestEmail" TEXT,
ADD COLUMN     "guestFirstName" TEXT,
ADD COLUMN     "guestLastName" TEXT,
ADD COLUMN     "guestPhone" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "cardLast4" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_guestAccessTokenHash_key" ON "Order"("guestAccessTokenHash");

-- Every order belongs to an account or to a guest token, never to neither: an
-- order with both null could be seen by nobody. Prisma has no syntax for this,
-- so it is hand-written, as `vehicle_single_owner_check` is. Every existing row
-- has a clientId, so the constraint validates against the backfill trivially.
ALTER TABLE "Order" ADD CONSTRAINT "Order_client_or_guest_check"
  CHECK ("clientId" IS NOT NULL OR "guestAccessTokenHash" IS NOT NULL);
