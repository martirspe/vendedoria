-- AlterTable
CREATE UNIQUE INDEX IF NOT EXISTS "Channel_tenantId_type_externalId_key" ON "Channel"("tenantId", "type", "externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Channel_externalId_idx" ON "Channel"("externalId");

-- AlterTable
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_channelId_externalThreadId_key" ON "Conversation"("channelId", "externalThreadId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Conversation_tenantId_markedUnattended_idx" ON "Conversation"("tenantId", "markedUnattended");
