/*
  Warnings:

  - Added the required column `city` to the `DriverProfile` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "GeorgianCity" AS ENUM ('TBILISI', 'BATUMI', 'KUTAISI', 'RUSTAVI', 'ZUGDIDI', 'GORI', 'POTI', 'SAMTREDIA', 'KHASHURI', 'SENAKI', 'ZESTAPONI', 'MARNEULI', 'TELAVI', 'AKHALTSIKHE', 'OZURGETI', 'KOBULETI', 'CHIATURA', 'TSKALTUBO', 'SAGAREJO', 'GARDABANI', 'BOLNISI', 'AKHALKALAKI', 'BORJOMI', 'KASPI', 'MTSKHETA');

-- AlterTable
ALTER TABLE "DriverProfile" ADD COLUMN     "city" "GeorgianCity" NOT NULL;
