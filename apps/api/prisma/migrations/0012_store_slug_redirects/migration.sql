-- Former store subdomains: redirected to the tenant's current slug and never reassigned.
CREATE TABLE "StoreSlugRedirect" (
    "slug" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreSlugRedirect_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "StoreSlugRedirect_tenantId_createdAt_idx" ON "StoreSlugRedirect"("tenantId", "createdAt");

ALTER TABLE "StoreSlugRedirect" ADD CONSTRAINT "StoreSlugRedirect_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
