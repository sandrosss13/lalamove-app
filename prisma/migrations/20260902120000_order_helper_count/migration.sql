/*
  Warnings:

  - You are about to drop the column `requiresHelper` on the `Order` table. All the data in the column will be lost.

*/
-- AlterTable
-- Replaces the "did this booking ask for a helper?" flag with a count of the
-- extra helpers requested beyond the driver (0-3). Existing rows are backfilled
-- from the flag: an order that asked for a helper asked for exactly one, which
-- is what its stored `helperFee` (a single flat per-helper fee) was charged at,
-- so the quote it already shows stays correct. The flag is only dropped once
-- every row carries its equivalent count.
ALTER TABLE "Order" ADD COLUMN     "helperCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Order" SET "helperCount" = 1 WHERE "requiresHelper" = true;

ALTER TABLE "Order" DROP COLUMN "requiresHelper";

-- `PricingRule.helperFee` changes meaning with the column above: it used to be a
-- one-off fee for "this booking wants a helper", and is now the rate charged for
-- each helper on the booking. The rate owner set that rate at a flat 40 GEL for
-- every vehicle type, so bring already-seeded databases in line with the new
-- `prisma/seed.ts` here rather than waiting on a re-seed — the seed only runs on
-- demand, and until it does every quote would charge the old per-vehicle figure
-- (10-45) per helper. Already-placed orders are untouched: their `helperFee` is
-- the amount actually charged at booking time and must stay as booked.
UPDATE "PricingRule" SET "helperFee" = 40;
