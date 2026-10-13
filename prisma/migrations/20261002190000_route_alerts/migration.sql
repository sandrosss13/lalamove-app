-- Route alerts (Loads → alerts): a driver's saved routes, and the record that
-- one fired for a load.
--
-- Purely additive: one enum and two tables the previous deployment never
-- touches. `RouteAlertFire`'s unique index on (orderId, driverProfileId) is
-- what makes "one push per driver per load" true by construction.
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

CREATE TABLE "RouteAlert" (
    "id" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "fromCity" "GeorgianCity" NOT NULL,
    "toCity" "GeorgianCity",
    "minPayout" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "days" "Weekday"[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RouteAlertFire" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "alertId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteAlertFire_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RouteAlert_driverProfileId_idx" ON "RouteAlert"("driverProfileId");

CREATE INDEX "RouteAlert_enabled_fromCity_idx" ON "RouteAlert"("enabled", "fromCity");

CREATE UNIQUE INDEX "RouteAlertFire_orderId_driverProfileId_key" ON "RouteAlertFire"("orderId", "driverProfileId");

CREATE INDEX "RouteAlertFire_driverProfileId_idx" ON "RouteAlertFire"("driverProfileId");

CREATE INDEX "RouteAlertFire_alertId_idx" ON "RouteAlertFire"("alertId");

ALTER TABLE "RouteAlert" ADD CONSTRAINT "RouteAlert_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RouteAlertFire" ADD CONSTRAINT "RouteAlertFire_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RouteAlertFire" ADD CONSTRAINT "RouteAlertFire_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RouteAlertFire" ADD CONSTRAINT "RouteAlertFire_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "RouteAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;
