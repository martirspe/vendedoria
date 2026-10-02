-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('WEB', 'WHATSAPP', 'INSTAGRAM', 'MANUAL');

-- CreateEnum
CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'FIXED', 'FREE_SHIPPING', 'BUY_X_GET_Y');

-- CreateEnum
CREATE TYPE "CouponScope" AS ENUM ('ALL', 'CATEGORY', 'BRAND', 'PRODUCTS');

-- CreateEnum
CREATE TYPE "CouponRedemptionStatus" AS ENUM ('HELD', 'CONFIRMED', 'RELEASED');

-- AlterTable
ALTER TABLE "Storefront" ADD COLUMN     "complaintsBookUrl" TEXT,
ADD COLUMN     "dataBankCode" TEXT,
ADD COLUMN     "deliveryDaysLima" TEXT,
ADD COLUMN     "deliveryDaysProvince" TEXT,
ADD COLUMN     "deliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "exchangeDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "freeShippingFromCents" INTEGER,
ADD COLUMN     "legalAddress" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "pickupAddress" TEXT,
ADD COLUMN     "pickupEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ruc" TEXT,
ADD COLUMN     "shippingLimaCents" INTEGER,
ADD COLUMN     "shippingProvinceCents" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "channel" "OrderChannel" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "checkoutKey" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "customerDocument" TEXT,
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "delivery" JSONB,
ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailClaimedAt" TIMESTAMP(3),
ADD COLUMN     "emailStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "paymentDetail" TEXT,
ADD COLUMN     "paymentHash" TEXT,
ADD COLUMN     "paymentKey" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "paymentState" TEXT,
ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "shippingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockState" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "subtotalCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "handle" TEXT;

-- CreateTable
CREATE TABLE "MerchantPaymentAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mercadopago',
    "accessTokenEnc" TEXT NOT NULL,
    "webhookSecretEnc" TEXT,
    "publicKey" TEXT NOT NULL,
    "liveMode" BOOLEAN NOT NULL DEFAULT false,
    "externalUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantPaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "kind" "CouponKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "maxDiscountCents" INTEGER,
    "buyQuantity" INTEGER,
    "getQuantity" INTEGER,
    "maxApplications" INTEGER,
    "minSubtotalCents" INTEGER NOT NULL DEFAULT 0,
    "minItems" INTEGER NOT NULL DEFAULT 0,
    "scope" "CouponScope" NOT NULL DEFAULT 'ALL',
    "targets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "perCustomerLimit" INTEGER,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerKey" TEXT NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "status" "CouponRedemptionStatus" NOT NULL DEFAULT 'HELD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "key" TEXT NOT NULL,
    "tenantId" TEXT,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantPaymentAccount_tenantId_provider_key" ON "MerchantPaymentAccount"("tenantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_tenantId_code_key" ON "Coupon"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_orderId_key" ON "CouponRedemption"("orderId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_status_idx" ON "CouponRedemption"("couponId", "status");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_customerKey_idx" ON "CouponRedemption"("couponId", "customerKey");

-- CreateIndex
CREATE INDEX "PaymentEvent_orderId_createdAt_idx" ON "PaymentEvent"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_checkoutKey_key" ON "Order"("checkoutKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicToken_key" ON "Order"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentKey_key" ON "Order"("paymentKey");

-- CreateIndex
CREATE INDEX "Order_tenantId_channel_idx" ON "Order"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "Order_stockState_expiresAt_idx" ON "Order"("stockState", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_code_key" ON "Order"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "MerchantPaymentAccount" ADD CONSTRAINT "MerchantPaymentAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing orders had only a total: it becomes their subtotal.
UPDATE "Order" SET "subtotalCents" = "totalCents" WHERE "subtotalCents" = 0 AND "totalCents" > 0;

ALTER TABLE "Order" ADD CONSTRAINT "Order_amounts_check" CHECK (
  "subtotalCents" >= 0 AND "discountCents" >= 0 AND "shippingCents" >= 0
  AND ("discountCents" = 0 OR "discountCents" < "subtotalCents")
  AND "totalCents" = "subtotalCents" - "discountCents" + "shippingCents"
);
ALTER TABLE "Order" ADD CONSTRAINT "Order_stockState_check" CHECK ("stockState" IN ('none', 'held', 'sold', 'released'));

ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_rules_check" CHECK (
  "code" ~ '^[A-Z0-9_-]{3,30}$'
  AND "value" >= 0
  AND ("kind" <> 'PERCENT' OR "value" BETWEEN 1 AND 90)
  AND ("kind" <> 'BUY_X_GET_Y' OR ("value" BETWEEN 1 AND 100 AND "buyQuantity" >= 1 AND "getQuantity" >= 1))
  AND ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt")
);
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_discount_check" CHECK ("discountCents" >= 0);

ALTER TABLE "Storefront" ADD CONSTRAINT "Storefront_shipping_check" CHECK (
  "exchangeDays" BETWEEN 0 AND 60
  AND ("shippingLimaCents" IS NULL OR "shippingLimaCents" BETWEEN 0 AND 100000)
  AND ("shippingProvinceCents" IS NULL OR "shippingProvinceCents" BETWEEN 0 AND 100000)
  AND ("freeShippingFromCents" IS NULL OR "freeShippingFromCents" > 0)
);

