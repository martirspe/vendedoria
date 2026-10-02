-- Store templates by industry, courier rates by distance, product sets and logistics.

ALTER TYPE "CouponScope" ADD VALUE 'LINE' BEFORE 'PRODUCTS';

ALTER TABLE "Coupon" ADD COLUMN "applyToSets" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Storefront"
  ADD COLUMN "shippingOriginUbigeo" TEXT,
  ADD COLUMN "carrierRates" JSONB,
  ADD COLUMN "industry" TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN "template" TEXT NOT NULL DEFAULT 'classic',
  ADD COLUMN "templateCopy" JSONB;

ALTER TABLE "Product"
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "line" TEXT,
  ADD COLUMN "details" JSONB;

ALTER TABLE "ProductMedia"
  ADD COLUMN "alt" TEXT,
  ADD COLUMN "caption" TEXT;

ALTER TABLE "Order" ADD COLUMN "trackingCode" TEXT;

ALTER TABLE "OrderItem" ADD COLUMN "allocations" JSONB;

CREATE TABLE "ProductComponent" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProductComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductComponent_setId_componentId_key" ON "ProductComponent"("setId", "componentId");
CREATE INDEX "ProductComponent_componentId_idx" ON "ProductComponent"("componentId");

ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
