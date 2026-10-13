-- Device tokens: where a push notification for an account is sent. One row per
-- device token, tied to the session that registered it so that signing out
-- (which deletes the session row) removes it.
--
-- Purely additive: one enum and one table the previous deployment never
-- touches.
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');

CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "token" TEXT NOT NULL,
    "locale" "ContentLocale" NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

CREATE INDEX "DeviceToken_sessionId_idx" ON "DeviceToken"("sessionId");

ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
