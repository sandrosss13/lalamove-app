-- Marketing consent for clients: the current answer on "ClientProfile", an
-- append-only "MarketingConsentEvent" audit trail of every answer, and the
-- placeholder "Marketing Privacy Policy" static page the consent text links to.
--
-- ADDITIVE ONLY. Two new columns, one enum, one table with its index and foreign
-- key to "user", and two INSERT-only static-page rows. Nothing existing is
-- dropped or rewritten.
--
-- EXISTING CLIENTS: "marketingConsent" is NOT NULL DEFAULT true, so Postgres
-- fills every pre-existing "ClientProfile" row with true — the same answer the
-- UI pre-selects for a new client. "marketingConsentAt" stays NULL for them
-- (they never answered themselves), and no "MarketingConsentEvent" row is
-- backfilled: the audit trail records decisions a client actually made.

-- CreateEnum
CREATE TYPE "MarketingConsentSource" AS ENUM ('SIGN_UP', 'ACCOUNT');

-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "marketingConsentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MarketingConsentEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" "MarketingConsentSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingConsentEvent_userId_createdAt_idx" ON "MarketingConsentEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MarketingConsentEvent" ADD CONSTRAINT "MarketingConsentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the policy page the consent text links to (`/pages/marketing-privacy-policy`),
-- published so the link never 404s, with placeholder copy for staff to replace
-- from Content → Pages in the back office.
--
-- INSERT-ONLY: ON CONFLICT ("slug", "locale") DO NOTHING, so a page staff have
-- already written is never overwritten and re-running this is a no-op.
--
-- Ids: gen_random_uuid()::text, as in 20261013090100_seed_item_catalogue —
-- Prisma's cuid() default is client-side and the id column is plain TEXT.
-- "updatedAt" has no database default (@updatedAt is client-side), so it is set.
INSERT INTO "StaticPage" ("id", "slug", "locale", "title", "bodyHtml", "isPublished", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'marketing-privacy-policy', 'EN'::"ContentLocale", 'Marketing Privacy Policy', '<p>The Marketing Privacy Policy text is to be added by the administrator.</p>', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'marketing-privacy-policy', 'KA'::"ContentLocale", 'მარკეტინგის კონფიდენციალურობის პოლიტიკა', '<p>მარკეტინგის კონფიდენციალურობის პოლიტიკის ტექსტს ადმინისტრატორი დაამატებს.</p>', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug", "locale") DO NOTHING;
