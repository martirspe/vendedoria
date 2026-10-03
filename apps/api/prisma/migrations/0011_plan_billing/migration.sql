-- Paid plan periods (flow A): the tenant keeps the plan until planExpiresAt.
ALTER TABLE "Tenant" ADD COLUMN "planExpiresAt" TIMESTAMP(3);

-- Plan bought by a billing payment.
ALTER TABLE "Payment" ADD COLUMN "planTier" "PlanTier";
