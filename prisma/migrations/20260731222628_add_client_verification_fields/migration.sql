-- CreateEnum
CREATE TYPE "ClientGender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "gender" "ClientGender",
ADD COLUMN     "idNumber" TEXT;
