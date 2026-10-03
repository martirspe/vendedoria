-- The web store became an add-on turned on from Integraciones. Businesses that already set up a
-- store keep it on; new businesses start with the sales agent only.
INSERT INTO "TenantIntegration" ("id", "tenantId", "key", "enabled", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."tenantId", 'store', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Storefront" s
ON CONFLICT ("tenantId", "key") DO NOTHING;
