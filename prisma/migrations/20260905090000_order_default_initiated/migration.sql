-- The `Order.status` column default moves from 'PENDING' to 'INITIATED', now
-- that `POST /api/orders` names its own status and settles payment to reach the
-- open market. An order should not be born biddable: a row written without a
-- status now lands off-market rather than in front of every driver, unpaid.
--
-- Metadata only. Changing a column default rewrites no row and touches no
-- existing order: every order already in the database keeps the status it has,
-- and this affects nothing but future inserts that omit the column.

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'INITIATED';
