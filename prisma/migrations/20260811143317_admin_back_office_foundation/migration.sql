-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ANALYTICS', 'CONTENT_MANAGER', 'FINANCE_MANAGER', 'USER_MANAGER', 'CRM_MANAGER', 'SUPPORT');

-- CreateEnum
CREATE TYPE "ContentLocale" AS ENUM ('KA', 'EN');

-- CreateEnum
CREATE TYPE "MessagingChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "CrmCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'CANCELLED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "isSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

-- CreateTable
CREATE TABLE "SystemUserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminRole" "AdminRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemUserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "locale" "ContentLocale" NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "placement" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaticPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" "ContentLocale" NOT NULL,
    "title" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaticPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationEntry" (
    "id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "locale" "ContentLocale" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "locale" "ContentLocale" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomePageSection" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "locale" "ContentLocale" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomePageSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethodConfig" (
    "id" TEXT NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethodConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCampaign" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "criteria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segmentId" TEXT,
    "templateId" TEXT,
    "status" "CrmCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSurvey" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemUserProfile_userId_key" ON "SystemUserProfile"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Banner_locale_placement_isActive_idx" ON "Banner"("locale", "placement", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StaticPage_slug_locale_key" ON "StaticPage"("slug", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationEntry_namespace_key_locale_key" ON "TranslationEntry"("namespace", "key", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingTemplate_key_channel_locale_key" ON "MessagingTemplate"("key", "channel", "locale");

-- CreateIndex
CREATE INDEX "HomePageSection_locale_isActive_sortOrder_idx" ON "HomePageSection"("locale", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethodConfig_type_key" ON "PaymentMethodConfig"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCampaign_code_key" ON "PromoCampaign"("code");

-- CreateIndex
CREATE INDEX "CrmCampaign_segmentId_idx" ON "CrmCampaign"("segmentId");

-- CreateIndex
CREATE INDEX "CrmCampaign_templateId_idx" ON "CrmCampaign"("templateId");

-- CreateIndex
CREATE INDEX "CrmSurveyResponse_surveyId_idx" ON "CrmSurveyResponse"("surveyId");

-- AddForeignKey
ALTER TABLE "SystemUserProfile" ADD CONSTRAINT "SystemUserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCampaign" ADD CONSTRAINT "CrmCampaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "CrmSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCampaign" ADD CONSTRAINT "CrmCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessagingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSurveyResponse" ADD CONSTRAINT "CrmSurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "CrmSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSurveyResponse" ADD CONSTRAINT "CrmSurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

