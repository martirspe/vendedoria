-- The free plan is removed: every business starts a 30-day Starter trial instead.
ALTER TABLE "Tenant" ADD COLUMN "planTrial" BOOLEAN NOT NULL DEFAULT true;

-- Paid tenants keep their plan; current FREE tenants get a 30-day trial from today.
UPDATE "Tenant" SET "planTrial" = false WHERE "planTier" <> 'FREE';
UPDATE "Tenant"
SET "planTier" = 'STARTER', "planExpiresAt" = now() + '30 days'::interval
WHERE "planTier" = 'FREE';
UPDATE "Payment" SET "planTier" = NULL WHERE "planTier" = 'FREE';

-- Drop FREE from the enum.
ALTER TYPE "PlanTier" RENAME TO "PlanTier_old";
CREATE TYPE "PlanTier" AS ENUM ('STARTER', 'PRO', 'BUSINESS');
ALTER TABLE "Tenant" ALTER COLUMN "planTier" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "planTier" TYPE "PlanTier" USING ("planTier"::text::"PlanTier");
ALTER TABLE "Tenant" ALTER COLUMN "planTier" SET DEFAULT 'STARTER';
ALTER TABLE "Payment" ALTER COLUMN "planTier" TYPE "PlanTier" USING ("planTier"::text::"PlanTier");
DROP TYPE "PlanTier_old";

-- New businesses get the trial period by default.
ALTER TABLE "Tenant" ALTER COLUMN "planExpiresAt" SET DEFAULT (now() + '30 days'::interval);
