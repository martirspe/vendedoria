-- CreateTable
CREATE TABLE "WhatsAppSignupSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "accessTokenEnc" TEXT,
    "channelId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSignupSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSignupSession_stateHash_key" ON "WhatsAppSignupSession"("stateHash");

-- CreateIndex
CREATE INDEX "WhatsAppSignupSession_tenantId_userId_expiresAt_idx" ON "WhatsAppSignupSession"("tenantId", "userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "WhatsAppSignupSession" ADD CONSTRAINT "WhatsAppSignupSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

