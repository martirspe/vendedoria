-- Business becomes a paid plan bought online; the custom plan quoted by the team is ENTERPRISE.
ALTER TYPE "PlanTier" RENAME TO "PlanTier_old";
CREATE TYPE "PlanTier" AS ENUM ('STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE');
ALTER TABLE "Tenant" ALTER COLUMN "planTier" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "planTier" TYPE "PlanTier" USING ("planTier"::text::"PlanTier");
ALTER TABLE "Tenant" ALTER COLUMN "planTier" SET DEFAULT 'STARTER';
ALTER TABLE "Payment" ALTER COLUMN "planTier" TYPE "PlanTier" USING ("planTier"::text::"PlanTier");
DROP TYPE "PlanTier_old";

-- Business plans granted by the team without expiry keep their custom limits.
UPDATE "Tenant" SET "planTier" = 'ENTERPRISE' WHERE "planTier" = 'BUSINESS' AND "planExpiresAt" IS NULL;
