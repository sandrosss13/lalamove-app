-- Schema for the driver load board: the physical description of a load (weight
-- and L/W/H) that makes the board's vehicle-fit filter possible, the
-- handling-requirement vocabulary, a human-readable order reference, the stored
-- commission rate and driver payout, and the `LoadRejection` table recording a
-- driver hiding a load from their own board.
--
-- Every new `Order` column is nullable or defaulted, so no existing row is
-- rewritten in a way that loses data. Two backfills run against existing rows:
-- the payout columns (at the same 15% the default records) and `reference`,
-- which is `NOT NULL UNIQUE` and therefore needs the add-nullable /
-- backfill / constrain sequence below rather than a single ADD COLUMN.
--
-- `pickupCity`/`dropoffCity` are deliberately NOT backfilled: `pickupAddress`
-- is free text a client typed, and there is no string match against it reliable
-- enough to pin an order to one of 63 enum cities.

-- CreateEnum
-- Handling requirements a client can attach to a load.
CREATE TYPE "CargoHandlingTag" AS ENUM (
  'FRAGILE', 'COLD_CHAIN', 'HAZMAT', 'TIME_CRITICAL', 'UPRIGHT_ONLY', 'HEAVY_ITEM'
);

-- CreateSequence
-- Load reference sequence. Starts high so the first reference reads as an
-- established business rather than advertising that this is order number one.
CREATE SEQUENCE "order_reference_seq" START WITH 48200 INCREMENT BY 1;

-- AlterTable
-- Physical description of the load. All nullable: pre-existing orders have none.
ALTER TABLE "Order"
  ADD COLUMN "cargoWeightKg"        DOUBLE PRECISION,
  ADD COLUMN "cargoLengthM"         DOUBLE PRECISION,
  ADD COLUMN "cargoWidthM"          DOUBLE PRECISION,
  ADD COLUMN "cargoHeightM"         DOUBLE PRECISION,
  ADD COLUMN "packagingDescription" TEXT,
  ADD COLUMN "itemQuantity"         TEXT,
  ADD COLUMN "handlingTags"         "CargoHandlingTag"[] DEFAULT ARRAY[]::"CargoHandlingTag"[],
  ADD COLUMN "pickupWindowStart"    TIMESTAMP(3),
  ADD COLUMN "pickupWindowEnd"      TIMESTAMP(3),
  ADD COLUMN "deliveryDeadline"     TIMESTAMP(3),
  ADD COLUMN "pickupCity"           "GeorgianCity",
  ADD COLUMN "dropoffCity"          "GeorgianCity",
  ADD COLUMN "commissionRate"       DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  ADD COLUMN "driverPayout"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "overtimeDriverPayout" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- `handlingTags` is documented as "empty array, never null", so the column says
-- so too. The DEFAULT above has already filled every pre-existing row with `{}`,
-- which is what lets this be set in the same migration without a separate
-- backfill pass.
ALTER TABLE "Order" ALTER COLUMN "handlingTags" SET NOT NULL;

-- Backfill the payout for every existing order at the same 15% rate the default
-- records, rounded to whole tetri exactly as the application does.
--
-- The basis is `price + serviceLevelAdjustment`, not `price` alone: the tier
-- adjustment is itemised beside the price rather than folded into it, and
-- `POST /api/orders/[id]/pay` charges the client the sum of the two. Taking the
-- commission off `price` by itself would hand the platform the whole Priority
-- uplift — a 32% take on a 100 GEL PRIORITY fare instead of 15%.
--
-- `FLOOR(x * 100 + 0.5) / 100` in float8, NOT `ROUND(x::numeric, 2)`. This is
-- the one place the obvious spelling is the wrong one, so it is worth being
-- precise about why. `roundCurrency` in `src/lib/orders/payout.ts` is JS
-- `Math.round(value * 100) / 100`, which evaluates on an IEEE 754 double
-- carrying binary-fraction dust; casting to `numeric` first scrubs that dust,
-- and the two then disagree whenever the exact half-tetri tie is in play,
-- because they are breaking the tie on different numbers. Price 13.00 with a
-- -1.30 adjustment is the canonical case: the application stores 9.94, a
-- `numeric` round stores 9.95. Measured across 90,000 realistic
-- (price, adjustment) pairs, that tie-break alone accounts for 386 one-tetri
-- disagreements. Staying in float8 and adding 0.5 before flooring reproduces
-- `Math.round`'s semantics — including how it treats the dusty tie — and brings
-- the disagreement count to 0.
--
-- The nested FLOOR on `driverPayout` is the second half of the fix, and it is
-- load-bearing: it rounds the BASIS before commissioning it, mirroring
-- `driverPayoutFor(roundCurrency(price + serviceLevelAdjustment), rate)` exactly.
-- Adding two float8 columns leaves dust on the sum, and commissioning the dusty
-- sum lands a tetri away from commissioning the cleaned one. Measured against
-- the real `driverPayoutFor` over the same 90,000 pairs: fixing only the
-- tie-break still left 505 disagreements, every one of them a row where the
-- basis needed rounding first; adding this inner FLOOR takes it to 0. The
-- effect only shows up once the sample includes PRIORITY-style adjustments
-- (`+25%` of price), which is where `price + serviceLevelAdjustment` most often
-- lands on a dusty sum — a sample without them measures 0 either way and makes
-- this step look redundant. It is not.
--
-- `overtimeDriverPayout` needs no inner round: it commissions a single stored
-- column rather than a sum, so there is no addition to leave dust.
--
-- Do not "simplify" either expression back to ROUND.
UPDATE "Order" SET
  "driverPayout"         = FLOOR(FLOOR(("price" + "serviceLevelAdjustment") * 100 + 0.5) / 100 * 0.85 * 100 + 0.5) / 100,
  "overtimeDriverPayout" = FLOOR("overtimeFee" * 0.85 * 100 + 0.5) / 100;

-- Reference: add nullable, backfill in creation order so early orders get low
-- numbers, then constrain.
ALTER TABLE "Order" ADD COLUMN "reference" TEXT;

-- The number comes from `row_number()`, NOT from `nextval` called per row.
-- `ORDER BY` inside a `FROM` subquery orders the subquery's own output; it does
-- not constrain the order in which the planner evaluates a volatile function
-- across the join, so `nextval` there hands out values in whatever order rows
-- happen to be joined. It looks correct on a small table and stops being correct
-- on a large one: measured on a 300,000-row table, 299,999 of 300,000 positions
-- came out in the wrong order — the earliest order drew GE-123259 while the
-- fourth-earliest drew GE-48200. A window function is evaluated over an ordered
-- frame by definition, so the number is pinned to the row's rank rather than to
-- when the executor got to it.
--
-- `, "id" ASC` breaks ties between orders sharing a `createdAt` millisecond,
-- which keeps the assignment deterministic and the migration reproducible.
--
-- 48199 + rn rather than 48200 + rn because `row_number()` is 1-based: the first
-- order must land on GE-48200, the sequence's own START WITH.
UPDATE "Order" o
SET "reference" = 'GE-' || (48199 + ordered.rn)
FROM (
  SELECT "id", row_number() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "Order"
) ordered
WHERE o."id" = ordered."id";

-- Advance the sequence past the block the backfill just consumed. It is
-- untouched above — the backfill computes its numbers arithmetically and never
-- calls `nextval` — so without this the column default below would start issuing
-- GE-48200 again and collide with the backfilled rows on the unique index.
-- `setval` sets `last_value`, so the next draw is 48200 + count: correct for an
-- empty table too, where it leaves the sequence at 48199 and the first real
-- order still gets GE-48200.
SELECT setval('order_reference_seq', 48199 + (SELECT count(*) FROM "Order"));

ALTER TABLE "Order" ALTER COLUMN "reference" SET NOT NULL;

-- Attach the default only now, after the backfill above has already numbered the
-- existing rows in `createdAt` order — a default set before the UPDATE would
-- have numbered them in physical order instead.
--
-- The default is what makes this migration safe to apply ahead of the code that
-- knows about the column. `scripts/migrate-deploy.mjs` runs `prisma migrate
-- deploy` before `next build`, so the previous deployment keeps serving traffic
-- against this new NOT NULL column for the length of a build; an insert from
-- that older code names no reference and would otherwise fail outright.
ALTER TABLE "Order"
  ALTER COLUMN "reference" SET DEFAULT ('GE-' || nextval('order_reference_seq'));

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateTable
-- Driver-scoped hide of an open load.
CREATE TABLE "LoadRejection" (
  "id"              TEXT NOT NULL,
  "orderId"         TEXT NOT NULL,
  "driverProfileId" TEXT,
  "companyId"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LoadRejection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One rejection per order per account. Postgres treats NULLs as distinct in a
-- unique index, so each of these two constrains only the rows of its own kind:
-- the first ignores company rejections (NULL `driverProfileId`) and the second
-- ignores driver ones. That is what makes the pair equivalent to the partial
-- indexes Prisma cannot express.
CREATE UNIQUE INDEX "LoadRejection_orderId_driverProfileId_key"
  ON "LoadRejection"("orderId", "driverProfileId");
CREATE UNIQUE INDEX "LoadRejection_orderId_companyId_key"
  ON "LoadRejection"("orderId", "companyId");
CREATE INDEX "LoadRejection_driverProfileId_idx" ON "LoadRejection"("driverProfileId");
CREATE INDEX "LoadRejection_companyId_idx"       ON "LoadRejection"("companyId");

-- AddForeignKey
ALTER TABLE "LoadRejection"
  ADD CONSTRAINT "LoadRejection_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoadRejection"
  ADD CONSTRAINT "LoadRejection_driverProfileId_fkey"
  FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoadRejection"
  ADD CONSTRAINT "LoadRejection_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "LogisticsCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
-- The board's hot query filters open, unassigned work.
CREATE INDEX "Order_status_driverId_companyId_idx"
  ON "Order"("status", "driverId", "companyId");

-- CreateIndex
-- The board's city dropdowns filter on these.
CREATE INDEX "Order_pickupCity_idx"  ON "Order"("pickupCity");
CREATE INDEX "Order_dropoffCity_idx" ON "Order"("dropoffCity");
