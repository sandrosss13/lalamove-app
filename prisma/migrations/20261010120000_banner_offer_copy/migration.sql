-- Optional card copy for `Banner`, used by the v4 home page's offer banners
-- (placement `home_secondary`): an eyebrow above the title, a body sentence
-- and the CTA label for `linkUrl`.
--
-- Three nullable columns with no default and no backfill: a catalogue-only
-- change in Postgres 11+, and additive, so the previous deployment (which
-- never names these columns) keeps working against the new table while
-- `prisma migrate deploy` runs ahead of `next build`.
ALTER TABLE "Banner" ADD COLUMN "eyebrow" TEXT;
ALTER TABLE "Banner" ADD COLUMN "body" TEXT;
ALTER TABLE "Banner" ADD COLUMN "ctaLabel" TEXT;
