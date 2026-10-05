-- CreateTable
CREATE TABLE "ConversionSettings" (
    "tenantId" TEXT NOT NULL,
    "recoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappTemplate" TEXT,
    "whatsappLanguage" TEXT NOT NULL DEFAULT 'es_PE',
    "delaysMinutes" INTEGER[] DEFAULT ARRAY[15, 120, 1440]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversionSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "RecoveryCart" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "emailConsentAt" TIMESTAMP(3),
    "whatsappConsentAt" TIMESTAMP(3),
    "consentVersion" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "step" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "RecoveryDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreBehaviorEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreBehaviorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecoveryCart_tenantId_expiresAt_idx" ON "RecoveryCart"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "RecoveryCart_expiresAt_idx" ON "RecoveryCart"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCart_tenantId_sessionHash_key" ON "RecoveryCart"("tenantId", "sessionHash");

-- CreateIndex
CREATE INDEX "RecoveryDelivery_tenantId_status_dueAt_idx" ON "RecoveryDelivery"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "RecoveryDelivery_status_dueAt_idx" ON "RecoveryDelivery"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryDelivery_cartId_revision_step_channel_key" ON "RecoveryDelivery"("cartId", "revision", "step", "channel");

-- CreateIndex
CREATE INDEX "StoreBehaviorEvent_tenantId_sessionHash_createdAt_idx" ON "StoreBehaviorEvent"("tenantId", "sessionHash", "createdAt");

-- CreateIndex
CREATE INDEX "StoreBehaviorEvent_createdAt_idx" ON "StoreBehaviorEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "ConversionSettings" ADD CONSTRAINT "ConversionSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCart" ADD CONSTRAINT "RecoveryCart_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryDelivery" ADD CONSTRAINT "RecoveryDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryDelivery" ADD CONSTRAINT "RecoveryDelivery_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "RecoveryCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreBehaviorEvent" ADD CONSTRAINT "StoreBehaviorEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Speeds up tenant-scoped purchase co-occurrence queries.
CREATE INDEX "OrderItem_productId_orderId_idx" ON "OrderItem"("productId", "orderId");
