-- Per-driver push-notification settings (Account → Notifications).
--
-- Purely additive: one table the previous deployment never touches. A driver
-- with no row gets the column defaults, which are the design's initial state.
CREATE TABLE "DriverNotificationSettings" (
    "driverProfileId" TEXT NOT NULL,
    "loadOffers" BOOLEAN NOT NULL DEFAULT true,
    "routeAlerts" BOOLEAN NOT NULL DEFAULT true,
    "jobReminders" BOOLEAN NOT NULL DEFAULT true,
    "payouts" BOOLEAN NOT NULL DEFAULT true,
    "tipsAndPromotions" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStartMinute" INTEGER NOT NULL DEFAULT 1380,
    "quietHoursEndMinute" INTEGER NOT NULL DEFAULT 420,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverNotificationSettings_pkey" PRIMARY KEY ("driverProfileId")
);

ALTER TABLE "DriverNotificationSettings" ADD CONSTRAINT "DriverNotificationSettings_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
