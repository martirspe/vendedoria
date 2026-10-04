-- Store editor: scheduled publishing of the draft and history of the replaced published content.
ALTER TABLE "Storefront" ADD COLUMN "templatePublishAt" TIMESTAMP(3);

CREATE TABLE "StorefrontVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorefrontVersion_tenantId_replacedAt_idx" ON "StorefrontVersion"("tenantId", "replacedAt");

CREATE INDEX "Storefront_templatePublishAt_idx" ON "Storefront"("templatePublishAt");

ALTER TABLE "StorefrontVersion" ADD CONSTRAINT "StorefrontVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
