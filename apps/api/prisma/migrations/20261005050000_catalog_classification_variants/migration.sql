-- Additive: legacy products and variant IDs are preserved. Null options use legacy pairs.
CREATE TABLE "CatalogCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "ProductKind" NOT NULL DEFAULT 'PRODUCT',
  "parentId" TEXT,
  "attributes" JSONB NOT NULL,
  CONSTRAINT "CatalogCategory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CatalogCategory_parentId_idx" ON "CatalogCategory"("parentId");
ALTER TABLE "CatalogCategory" ADD CONSTRAINT "CatalogCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CatalogCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT, ADD COLUMN "attributeValues" JSONB;
CREATE INDEX "Product_tenantId_categoryId_idx" ON "Product"("tenantId", "categoryId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CatalogCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD COLUMN "options" JSONB, ADD COLUMN "combinationKey" TEXT, ADD COLUMN "priceInherited" BOOLEAN NOT NULL DEFAULT false;
-- Existing duplicates remain readable with null keys; an explicit edit validates them.
CREATE UNIQUE INDEX "ProductVariant_productId_combinationKey_key" ON "ProductVariant"("productId", "combinationKey");

INSERT INTO "CatalogCategory" ("id", "name", "kind", "parentId", "attributes") VALUES
('fashion', 'Moda', 'PRODUCT', NULL, '[{"key":"material","name":"Material","group":"Composición","variant":true},{"key":"audience","name":"Público","group":"Uso"}]'),
('beauty', 'Belleza y cuidado', 'PRODUCT', NULL, '[{"key":"contents","name":"Contenido neto","group":"Presentación","maxLength":60},{"key":"skin_type","name":"Tipo de piel","group":"Uso"}]'),
('electronics', 'Electrónica', 'PRODUCT', NULL, '[{"key":"model","name":"Modelo","variant":true},{"key":"capacity","name":"Capacidad","variant":true},{"key":"compatibility","name":"Compatibilidad"}]'),
('home', 'Hogar', 'PRODUCT', NULL, '[{"key":"material","name":"Material","variant":true},{"key":"dimensions","name":"Dimensiones"},{"key":"color","name":"Color","variant":true}]'),
('services', 'Servicios', 'SERVICE', NULL, '[{"key":"scope","name":"Alcance del servicio","required":true},{"key":"modality","name":"Modalidad","variant":true}]'),
('digital', 'Contenido digital', 'DIGITAL', NULL, '[{"key":"format","name":"Formato","required":true},{"key":"license","name":"Licencia","variant":true}]'),
('footwear', 'Calzado', 'PRODUCT', 'fashion', '[{"key":"color","name":"Color","group":"Variaciones","variant":true,"required":true},{"key":"size","name":"Talla","group":"Variaciones","variant":true,"required":true},{"key":"sole","name":"Material de suela","group":"Composición"},{"key":"footwear_type","name":"Tipo de calzado","group":"Uso"}]'),
('sneakers', 'Zapatillas', 'PRODUCT', 'footwear', '[]'),
('skin_care', 'Cuidado facial', 'PRODUCT', 'beauty', '[]'),
('creams', 'Cremas', 'PRODUCT', 'skin_care', '[]'),
('fragrances', 'Fragancias', 'PRODUCT', 'beauty', '[{"key":"family","name":"Familia olfativa","group":"Fragancia"},{"key":"intensity","name":"Intensidad","group":"Fragancia"}]');
