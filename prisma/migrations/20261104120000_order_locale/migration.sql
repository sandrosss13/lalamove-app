-- The language a client booked in, kept on the order so the emails about it
-- (confirmation, driver assigned, delivered, cancelled) are written in that
-- language. Set by POST /api/orders/[id]/pay from the request locale.
--
-- ADDITIVE ONLY: one new nullable column on "Order", reusing the existing
-- "ContentLocale" enum ('KA', 'EN'). Nothing existing is altered, dropped or
-- backfilled — every existing order reads NULL, and the emails fall back to
-- the request locale and then to Georgian. No default, so old code running
-- against the new column during a deploy is unaffected.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "locale" "ContentLocale";
