-- Additive: historical external IDs remain untouched; only new inbound messages receive a key.
ALTER TABLE "Conversation" ADD COLUMN "salesState" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "PlaygroundSession" ADD COLUMN "salesState" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Message" ADD COLUMN "inboundKey" TEXT;
ALTER TABLE "Message" ADD COLUMN "enginePending" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Message_inboundKey_key" ON "Message"("inboundKey");
CREATE INDEX "Message_enginePending_createdAt_idx" ON "Message"("enginePending", "createdAt");
CREATE TABLE "SalesEngineTurn" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "inboundIds" TEXT[] NOT NULL, "status" TEXT NOT NULL DEFAULT 'STARTED',
  "response" JSONB, "trace" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "SalesEngineTurn_tenantId_conversationId_createdAt_idx" ON "SalesEngineTurn"("tenantId", "conversationId", "createdAt");
CREATE INDEX "SalesEngineTurn_status_updatedAt_idx" ON "SalesEngineTurn"("status", "updatedAt");
CREATE TABLE "SalesCustomerMemory" (
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE, "customerKey" TEXT NOT NULL,
  "facts" JSONB NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("tenantId", "customerKey")
);
CREATE INDEX "SalesCustomerMemory_tenantId_expiresAt_idx" ON "SalesCustomerMemory"("tenantId", "expiresAt");
CREATE TABLE "SalesSearchJob" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "sourceId" TEXT NOT NULL, "documentType" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "SalesSearchJob_tenantId_documentType_sourceId_key" ON "SalesSearchJob"("tenantId", "documentType", "sourceId");
CREATE INDEX "SalesSearchJob_availableAt_idx" ON "SalesSearchJob"("availableAt");

-- Outbox changes commit/rollback with the catalog operation, including imports and deletions.
CREATE FUNCTION sales_search_enqueue() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc RECORD; owner TEXT; source TEXT; kind TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN doc := OLD; ELSE doc := NEW; END IF;
  IF TG_TABLE_NAME = 'ProductVariant' THEN
    SELECT "tenantId" INTO owner FROM "Product" WHERE id = doc."productId";
    source := doc."productId"; kind := 'product';
  ELSE
    owner := doc."tenantId"; source := doc.id;
    kind := CASE WHEN TG_TABLE_NAME = 'Product' THEN 'product' ELSE 'faq' END;
  END IF;
  IF owner IS NOT NULL AND EXISTS (SELECT 1 FROM "Tenant" WHERE id = owner) THEN
    INSERT INTO "SalesSearchJob" (id, "tenantId", "sourceId", "documentType", "updatedAt")
    VALUES (md5(owner || '/' || kind || '/' || source), owner, source, kind, CURRENT_TIMESTAMP)
    ON CONFLICT ("tenantId", "documentType", "sourceId") DO UPDATE
      SET revision = "SalesSearchJob".revision + 1, attempts = 0,
          "availableAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER sales_product_search AFTER INSERT OR UPDATE OR DELETE ON "Product" FOR EACH ROW EXECUTE FUNCTION sales_search_enqueue();
CREATE TRIGGER sales_variant_search AFTER INSERT OR UPDATE OR DELETE ON "ProductVariant" FOR EACH ROW EXECUTE FUNCTION sales_search_enqueue();
CREATE TRIGGER sales_faq_search AFTER INSERT OR UPDATE OR DELETE ON "KnowledgeFaq" FOR EACH ROW EXECUTE FUNCTION sales_search_enqueue();
