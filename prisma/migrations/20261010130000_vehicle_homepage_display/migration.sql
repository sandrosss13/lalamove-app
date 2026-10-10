-- Homepage display controls for `VehicleTypeSpec`, set from Admin → Content →
-- Vehicle photos: whether a type is shown on the public marketing surfaces, and
-- its position within its duty class (Medium / Heavy) there.
--
-- Additive with defaults, so the previous deployment (which never names these
-- columns) keeps working against the new table while `prisma migrate deploy`
-- runs ahead of `next build`. Every existing type stays visible.
ALTER TABLE "VehicleTypeSpec" ADD COLUMN "showOnHomepage" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "VehicleTypeSpec" ADD COLUMN "homepageSortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill the order the homepage shows today — category, then label — so the
-- release changes nothing a visitor sees until an admin reorders. Dense
-- `0..n-1` per category, the same shape the reorder endpoint writes.
UPDATE "VehicleTypeSpec" AS v
SET "homepageSortOrder" = ranked."position"
FROM (
  SELECT
    "id",
    (ROW_NUMBER() OVER (PARTITION BY "category" ORDER BY "label", "id") - 1)::INTEGER AS "position"
  FROM "VehicleTypeSpec"
) AS ranked
WHERE v."id" = ranked."id";
