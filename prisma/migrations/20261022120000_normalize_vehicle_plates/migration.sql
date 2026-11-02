-- Plates are now stored without hyphens or spaces ("AA-123-BB" -> "AA123BB"),
-- matching normalizePlate in src/lib/vehicles/plate.ts. Checked before writing:
-- no two existing plates collapse to the same value, so the unique index holds.
UPDATE "Vehicle"
SET "plateNumber" = upper(regexp_replace("plateNumber", '[[:space:]-]+', '', 'g'))
WHERE "plateNumber" ~ '[[:space:]-]';

UPDATE "Vehicle"
SET "trailerPlateNumber" = upper(regexp_replace("trailerPlateNumber", '[[:space:]-]+', '', 'g'))
WHERE "trailerPlateNumber" ~ '[[:space:]-]';
