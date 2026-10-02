-- Orders paid before stock tracking by state already consumed their units.
UPDATE "Order"
SET "stockState" = 'sold'
WHERE "stockState" = 'none'
  AND "status" IN ('PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED');
