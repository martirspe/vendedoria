-- AlterEnum
ALTER TYPE "ChannelType" ADD VALUE 'TIKTOK_LIVE';

-- AlterEnum
ALTER TYPE "OrderChannel" ADD VALUE 'TIKTOK_LIVE';

-- CreateTable
CREATE TABLE "LiveIntegration" (
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT,
    "healthStatus" "ChannelHealthStatus" NOT NULL DEFAULT 'PENDING',
    "credentialsEncrypted" TEXT,
    "accountId" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "oauthStateHash" TEXT,
    "oauthExpiresAt" TIMESTAMP(3),
    "accessExpiresAt" TIMESTAMP(3),
    "refreshExpiresAt" TIMESTAMP(3),
    "responseMode" TEXT NOT NULL DEFAULT 'HUMAN_APPROVAL',
    "reservationSeconds" INTEGER NOT NULL DEFAULT 300,
    "maxReservationsPerSession" INTEGER NOT NULL DEFAULT 500,
    "lastCheckedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveIntegration_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "LiveCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'TIKTOK_LIVE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "mode" TEXT NOT NULL DEFAULT 'LIVE_LIQUIDATION',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "salesAgentId" TEXT,
    "reservationSeconds" INTEGER NOT NULL DEFAULT 300,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveOffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "livePriceCents" INTEGER NOT NULL,
    "allocatedStock" INTEGER NOT NULL,
    "claimedQty" INTEGER NOT NULL DEFAULT 0,
    "maxPerCustomer" INTEGER NOT NULL DEFAULT 2,
    "durationSeconds" INTEGER NOT NULL DEFAULT 3600,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LiveOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentOfferId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "customerKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "line" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "conversationId" TEXT,
    "intent" TEXT,
    "reservationId" TEXT,
    "suggestedReply" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveIntegration_oauthStateHash_key" ON "LiveIntegration"("oauthStateHash");

-- CreateIndex
CREATE INDEX "LiveCampaign_tenantId_status_createdAt_idx" ON "LiveCampaign"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveCampaign_tenantId_id_key" ON "LiveCampaign"("tenantId", "id");

-- CreateIndex
CREATE INDEX "LiveOffer_tenantId_campaignId_sortOrder_idx" ON "LiveOffer"("tenantId", "campaignId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LiveOffer_tenantId_id_key" ON "LiveOffer"("tenantId", "id");

-- CreateIndex
CREATE INDEX "LiveSession_tenantId_status_startedAt_idx" ON "LiveSession"("tenantId", "status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_tenantId_id_key" ON "LiveSession"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LiveReservation_orderId_key" ON "LiveReservation"("orderId");

-- CreateIndex
CREATE INDEX "LiveReservation_tenantId_sessionId_customerKey_offerId_stat_idx" ON "LiveReservation"("tenantId", "sessionId", "customerKey", "offerId", "status");

-- CreateIndex
CREATE INDEX "LiveReservation_tenantId_status_expiresAt_idx" ON "LiveReservation"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "LiveReservation_status_expiresAt_idx" ON "LiveReservation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveReservation_tenantId_idempotencyKey_key" ON "LiveReservation"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "LiveEvent_tenantId_sessionId_createdAt_idx" ON "LiveEvent"("tenantId", "sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveEvent_tenantId_externalEventId_key" ON "LiveEvent"("tenantId", "externalEventId");

-- AddForeignKey
ALTER TABLE "LiveIntegration" ADD CONSTRAINT "LiveIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveCampaign" ADD CONSTRAINT "LiveCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveCampaign" ADD CONSTRAINT "LiveCampaign_salesAgentId_fkey" FOREIGN KEY ("salesAgentId") REFERENCES "SalesAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOffer" ADD CONSTRAINT "LiveOffer_tenantId_campaignId_fkey" FOREIGN KEY ("tenantId", "campaignId") REFERENCES "LiveCampaign"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOffer" ADD CONSTRAINT "LiveOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOffer" ADD CONSTRAINT "LiveOffer_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_tenantId_campaignId_fkey" FOREIGN KEY ("tenantId", "campaignId") REFERENCES "LiveCampaign"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveReservation" ADD CONSTRAINT "LiveReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveReservation" ADD CONSTRAINT "LiveReservation_tenantId_sessionId_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES "LiveSession"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveReservation" ADD CONSTRAINT "LiveReservation_tenantId_offerId_fkey" FOREIGN KEY ("tenantId", "offerId") REFERENCES "LiveOffer"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveReservation" ADD CONSTRAINT "LiveReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveEvent" ADD CONSTRAINT "LiveEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveEvent" ADD CONSTRAINT "LiveEvent_tenantId_sessionId_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES "LiveSession"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defend financial/inventory invariants independently of DTO validation.
ALTER TABLE "LiveOffer" ADD CONSTRAINT "LiveOffer_limits_check" CHECK ("livePriceCents" >= 100 AND "allocatedStock" > 0 AND "claimedQty" >= 0 AND "claimedQty" <= "allocatedStock" AND "maxPerCustomer" BETWEEN 1 AND 20 AND "durationSeconds" BETWEEN 60 AND 86400);
ALTER TABLE "LiveReservation" ADD CONSTRAINT "LiveReservation_values_check" CHECK ("quantity" BETWEEN 1 AND 20 AND "unitCents" >= 100 AND "status" IN ('PENDING', 'CHECKED_OUT', 'CONVERTED', 'EXPIRED', 'CANCELLED'));
CREATE UNIQUE INDEX "LiveSession_one_active_campaign" ON "LiveSession" ("tenantId", "campaignId") WHERE "status" = 'ACTIVE';
