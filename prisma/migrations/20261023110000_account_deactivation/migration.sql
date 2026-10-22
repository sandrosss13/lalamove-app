-- Self-service account deletion: a client closes their own account from
-- /account. The row is anonymised and kept (orders cascade from "user", so a
-- real DELETE would take them and drivers' earnings history with it); this
-- column records that it happened and is what src/lib/auth.ts refuses
-- sessions on.
--
-- ADDITIVE ONLY: one new nullable column. Nothing existing is altered, dropped
-- or backfilled — every existing account reads NULL, i.e. "not deactivated".

-- AlterTable
ALTER TABLE "user" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
