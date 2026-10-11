-- Phone sign-in for the native driver app: the two columns Better Auth's
-- `phoneNumber` plugin reads and writes on its user table.
--
--   * `phoneNumber` is the sign-in identifier, stored in E.164
--     (`+995555123456`). Nullable with no default: every existing account signs
--     in by email and has no verified number, and nothing is backfilled from
--     `DriverProfile.phone` — that column is an unverified contact detail in
--     free format, and promoting it to a sign-in identifier would let whoever
--     holds that number into an account that never agreed to it.
--   * `phoneNumberVerified` is NOT NULL DEFAULT false. A constant default is a
--     catalogue-only change in Postgres 11+, so no row is rewritten.
--
-- Both are additive, so the previous deployment keeps working against them:
-- `scripts/migrate-deploy.mjs` runs this ahead of `next build`, and an insert
-- from the old code names neither column and gets NULL / false.
--
-- The unique index is what makes "one number, one account" hold under two
-- concurrent first verifications of the same number. Postgres treats NULLs as
-- distinct, so the existing rows (all NULL) cannot collide. It is built with a
-- plain CREATE INDEX — Prisma runs a migration inside a transaction, which
-- rules out CONCURRENTLY — and so blocks writes to "user" while it builds; on a
-- column that is NULL in every row that is a single short pass over the table.
ALTER TABLE "user" ADD COLUMN "phoneNumber" TEXT;
ALTER TABLE "user" ADD COLUMN "phoneNumberVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "user_phoneNumber_key" ON "user"("phoneNumber");
