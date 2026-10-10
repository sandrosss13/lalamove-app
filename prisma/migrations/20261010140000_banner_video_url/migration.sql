-- Optional hero video for `Banner` (placement `home_hero`): played over the
-- slide's image, which stays required as the poster and the fallback.
--
-- One nullable column with no default and no backfill: a catalogue-only change
-- in Postgres 11+, and additive, so the previous deployment (which never names
-- this column) keeps working against the new table while
-- `prisma migrate deploy` runs ahead of `next build`.
ALTER TABLE "Banner" ADD COLUMN "videoUrl" TEXT;
