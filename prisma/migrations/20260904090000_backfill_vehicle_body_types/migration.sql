-- Backfill VehicleTypeSpec.bodyTypes.
--
-- Migration 20260903051048_client_dashboard_booking added this column with no
-- DEFAULT and no backfill, so every pre-existing row holds an empty array. The
-- client booking form filters the vehicle list by body type, and a vehicle whose
-- bodyTypes is empty offers nothing — so on an un-backfilled database the
-- vehicle grid is empty for every selection, which reads as a total failure of
-- the booking form rather than as missing data.
--
-- The development database was corrected by re-running `prisma db seed`. That is
-- NOT a safe instruction for staging or production: the seed's update branch is
-- `{ ...spec, pricingRule: { upsert: { create: pricing, update: pricing } } }`,
-- which rewrites every VehicleTypeSpec field and every PricingRule — baseFare,
-- perKm, perMinute, minimumFare, helperFee — back to the constants in
-- prisma/seed.ts, discarding any rate the rate owner has tuned in place.
--
-- This migration therefore writes bodyTypes and nothing else, so the fix travels
-- with `prisma migrate deploy` and needs no seed run in any environment.
--
-- Only rows that are still empty are touched, so an environment already seeded
-- (development) is a no-op, and a body type deliberately changed by an operator
-- after this ships is not reverted.
--
-- The mapping is the one recorded in prisma/seed.ts and is AWAITING SIGN-OFF —
-- see specs/client-dashboard-booking-and-payment/action-required.md. The two
-- judgement calls in it: a curtainsider opens fully along both sides, so it
-- satisfies an open-chassis requirement as well as a dry one; and a reefer can
-- run its box dry, so both refrigerated types offer DRY_BOX as well.

UPDATE "VehicleTypeSpec" SET "bodyTypes" = ARRAY['DRY_BOX']::"ChassisType"[]
WHERE "code" IN (
  'MINIVAN', 'MPV', 'CARGO_VAN', 'CLOSED_BOX_VAN', 'BOX_TRUCK',
  'LARGE_FREIGHT_TRUCK', 'TRAILER_TRUCK'
) AND cardinality("bodyTypes") = 0;

UPDATE "VehicleTypeSpec" SET "bodyTypes" = ARRAY['REFRIGERATED', 'DRY_BOX']::"ChassisType"[]
WHERE "code" IN ('REFRIGERATED_VAN', 'REFRIGERATED_TRUCK')
  AND cardinality("bodyTypes") = 0;

UPDATE "VehicleTypeSpec" SET "bodyTypes" = ARRAY['OPEN_CHASSIS']::"ChassisType"[]
WHERE "code" = 'FLATBED_TRUCK' AND cardinality("bodyTypes") = 0;

UPDATE "VehicleTypeSpec" SET "bodyTypes" = ARRAY['DRY_BOX', 'OPEN_CHASSIS']::"ChassisType"[]
WHERE "code" = 'CURTAINSIDER_TRUCK' AND cardinality("bodyTypes") = 0;
