-- CreateEnum
CREATE TYPE "DriverNotificationType" AS ENUM ('LOAD_OFFER', 'ROUTE_ALERT');

-- CreateTable
CREATE TABLE "DriverNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "DriverNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverNotification_userId_createdAt_idx" ON "DriverNotification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DriverNotification" ADD CONSTRAINT "DriverNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
