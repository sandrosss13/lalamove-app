-- CreateEnum
CREATE TYPE "DriverAccountType" AS ENUM ('INDIVIDUAL', 'INDIVIDUAL_ENTREPRENEUR', 'BUSINESS');

-- AlterTable
ALTER TABLE "DriverProfile" ADD COLUMN     "accountType" "DriverAccountType" NOT NULL,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "phone" TEXT NOT NULL,
ADD COLUMN     "vatId" TEXT;
