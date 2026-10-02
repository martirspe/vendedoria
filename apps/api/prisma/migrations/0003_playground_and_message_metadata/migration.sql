-- AlterTable
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlaygroundSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Prueba del vendedor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaygroundSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlaygroundMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "authorType" "MessageAuthorType" NOT NULL,
    "body" TEXT NOT NULL,
    "toolTraces" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaygroundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlaygroundSession_tenantId_updatedAt_idx" ON "PlaygroundSession"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlaygroundMessage_sessionId_createdAt_idx" ON "PlaygroundMessage"("sessionId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PlaygroundSession" ADD CONSTRAINT "PlaygroundSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PlaygroundMessage" ADD CONSTRAINT "PlaygroundMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PlaygroundSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
