-- Per-driver work preferences (Account → Work preferences), read by the offer
-- matcher only.
--
-- Purely additive: one table the previous deployment never touches. A driver
-- with no row has no preferences and is offered work exactly as before.
CREATE TABLE "DriverWorkPreferences" (
    "driverProfileId" TEXT NOT NULL,
    "cities" "GeorgianCity"[],
    "intercity" BOOLEAN NOT NULL DEFAULT false,
    "maxTripKm" INTEGER,
    "days" "Weekday"[],
    "startMinute" INTEGER NOT NULL DEFAULT 0,
    "endMinute" INTEGER NOT NULL DEFAULT 0,
    "excludedHandlingTags" "CargoHandlingTag"[] DEFAULT ARRAY[]::"CargoHandlingTag"[],
    "canBringHelper" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverWorkPreferences_pkey" PRIMARY KEY ("driverProfileId")
);

ALTER TABLE "DriverWorkPreferences" ADD CONSTRAINT "DriverWorkPreferences_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
