-- Records, on the order, in what capacity its driver claimed it: independent,
-- or on a company's roster (and whose). The wallet decides credit-or-hold from
-- this record instead of from the driver's roster membership at the moment a
-- gateway confirms the payment, which can be long after the claim.
--
-- Purely additive: one enum and two nullable columns with no default — a
-- catalogue-only change, no row rewritten. Deliberately NOT backfilled: for an
-- order claimed before this existed the capacity at the claim is not known, and
-- writing today's roster membership into a column that means "at the claim"
-- would be inventing history. Null keeps the wallet's previous behaviour for
-- those orders (it reads the roster at credit time).
CREATE TYPE "DriverClaimCapacity" AS ENUM ('INDEPENDENT', 'ROSTER');

ALTER TABLE "Order" ADD COLUMN "driverClaimedAs" "DriverClaimCapacity",
ADD COLUMN "driverClaimCompanyId" TEXT;
