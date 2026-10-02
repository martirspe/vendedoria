-- Knowledge base, journey templates, and sales-agent hard limits

CREATE TYPE "KnowledgeReviewStatus" AS ENUM ('DRAFT', 'APPROVED');
CREATE TYPE "KnowledgeSource" AS ENUM ('MANUAL', 'PASTE_IMPORT');
CREATE TYPE "JourneyStage" AS ENUM ('DISCOVER', 'RECOMMEND', 'CLOSE', 'SUPPORT');

ALTER TABLE "SalesAgent"
ADD COLUMN "neverOfferDiscount" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "neverInventShipping" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "catalogOnlyFacts" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "KnowledgeFaq" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "KnowledgeSource" NOT NULL DEFAULT 'MANUAL',
    "reviewStatus" "KnowledgeReviewStatus" NOT NULL DEFAULT 'APPROVED',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeFaq_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JourneyTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "JourneyStage" NOT NULL DEFAULT 'DISCOVER',
    "scriptText" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JourneyTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KnowledgeFaq_tenantId_isPublished_reviewStatus_idx" ON "KnowledgeFaq"("tenantId", "isPublished", "reviewStatus");
CREATE INDEX "JourneyTemplate_tenantId_isActive_idx" ON "JourneyTemplate"("tenantId", "isActive");

ALTER TABLE "KnowledgeFaq" ADD CONSTRAINT "KnowledgeFaq_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JourneyTemplate" ADD CONSTRAINT "JourneyTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
