-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "fulfillment" JSONB;

-- CreateIndex
CREATE INDEX "Product_tenantId_isAvailable_sortOrder_updatedAt_idx" ON "Product"("tenantId", "isAvailable", "sortOrder", "updatedAt");

-- Do not index private access URLs or delivery instructions.
CREATE FUNCTION catalog_search_document(text, text, text, text[], text, text, jsonb)
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT
    setweight(to_tsvector('spanish', translate(lower(coalesce($1, '') || ' ' || coalesce($7->'keywords', '[]')::text),
      'áéíóúüñ', 'aeiouun')), 'A') ||
    setweight(to_tsvector('spanish', translate(lower(coalesce($2, '') || ' ' || coalesce($3, '') || ' ' ||
      coalesce(array_to_string($4, ' '), '') || ' ' || coalesce($5, '')), 'áéíóúüñ', 'aeiouun')), 'B') ||
    setweight(to_tsvector('spanish', translate(lower(coalesce($6, '') || ' ' || coalesce($7, '{}')::text),
      'áéíóúüñ', 'aeiouun')), 'C');
$$;

CREATE INDEX "Product_catalog_search_idx" ON "Product" USING GIN
  (catalog_search_document(name, brand, line, categories, "descriptionShort", "descriptionFull", details));

-- Preserve the currently promised delivery for existing order lines, scoped through their order.
UPDATE "OrderItem" i SET fulfillment = jsonb_build_object(
  'kind', p.kind, 'url', p."digitalAccessUrl", 'instructions', p."digitalInstructions")
FROM "Product" p, "Order" o
WHERE i."orderId" = o.id AND i."productId" = p.id AND p."tenantId" = o."tenantId";
