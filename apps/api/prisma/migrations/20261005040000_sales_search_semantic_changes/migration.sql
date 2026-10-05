-- Prices, stock and visual changes do not require new paid semantic embeddings.
CREATE OR REPLACE FUNCTION sales_search_enqueue() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc RECORD; owner TEXT; source TEXT; kind TEXT; previous JSONB; current_doc JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    previous := to_jsonb(OLD); current_doc := to_jsonb(NEW);
    IF TG_TABLE_NAME = 'Product' THEN
      IF (previous->'name', previous->'brand', previous->'line', previous->'categories', previous->'descriptionShort', previous->'descriptionFull', previous->'details', previous->'isAvailable')
        IS NOT DISTINCT FROM
        (current_doc->'name', current_doc->'brand', current_doc->'line', current_doc->'categories', current_doc->'descriptionShort', current_doc->'descriptionFull', current_doc->'details', current_doc->'isAvailable') THEN RETURN NULL; END IF;
    ELSIF TG_TABLE_NAME = 'ProductVariant' THEN
      IF (previous->'option1Value', previous->'option2Value', previous->'option3Value', previous->'isAvailable')
        IS NOT DISTINCT FROM
        (current_doc->'option1Value', current_doc->'option2Value', current_doc->'option3Value', current_doc->'isAvailable') THEN RETURN NULL; END IF;
    ELSIF TG_TABLE_NAME = 'KnowledgeFaq' THEN
      IF (previous->'question', previous->'answer', previous->'tags', previous->'reviewStatus', previous->'isPublished')
        IS NOT DISTINCT FROM
        (current_doc->'question', current_doc->'answer', current_doc->'tags', current_doc->'reviewStatus', current_doc->'isPublished') THEN RETURN NULL; END IF;
    END IF;
  END IF;
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
