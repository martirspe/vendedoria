-- CreateEnum
CREATE TYPE "StorefrontStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "compareAtPriceCents" INTEGER,
ADD COLUMN     "isPublishedOnStore" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Storefront" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "StorefrontStatus" NOT NULL DEFAULT 'DRAFT',
    "displayName" TEXT NOT NULL,
    "tagline" TEXT,
    "logoUrl" TEXT,
    "heroImageUrl" TEXT,
    "brandColor" TEXT NOT NULL DEFAULT '#0b0d12',
    "accentColor" TEXT NOT NULL DEFAULT '#5b8cff',
    "whatsappPhone" TEXT,
    "contactEmail" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Storefront_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Storefront_tenantId_key" ON "Storefront"("tenantId");

-- CreateIndex
CREATE INDEX "Product_tenantId_isPublishedOnStore_idx" ON "Product"("tenantId", "isPublishedOnStore");

-- AddForeignKey
ALTER TABLE "Storefront" ADD CONSTRAINT "Storefront_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
