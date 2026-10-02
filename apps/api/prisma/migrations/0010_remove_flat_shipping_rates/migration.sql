-- Flat Lima/province rates are replaced by courier rates priced by ubigeo distance.
ALTER TABLE "Storefront" DROP CONSTRAINT "Storefront_shipping_check";

ALTER TABLE "Storefront" DROP COLUMN "shippingLimaCents",
DROP COLUMN "shippingProvinceCents",
DROP COLUMN "deliveryDaysLima",
DROP COLUMN "deliveryDaysProvince";

ALTER TABLE "Storefront" ADD CONSTRAINT "Storefront_shipping_check" CHECK (
  "exchangeDays" BETWEEN 0 AND 60
  AND ("freeShippingFromCents" IS NULL OR "freeShippingFromCents" > 0)
);
