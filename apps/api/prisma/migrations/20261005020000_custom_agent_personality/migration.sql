-- Retain a merchant's explicit custom personality selection without changing its instructions.
ALTER TABLE "SalesAgent" ADD COLUMN "personalityPreset" TEXT;
