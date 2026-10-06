-- Additive migration: preserve all merchant content, drafts and business records.
ALTER TABLE "Storefront"
  ADD COLUMN "themeVersion" TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN "themeDraftTemplate" TEXT,
  ADD COLUMN "themeDraftVersion" TEXT;
ALTER TABLE "StorefrontVersion"
  ADD COLUMN "template" TEXT,
  ADD COLUMN "themeVersion" TEXT;
-- Legacy snapshots deliberately retain unknown identity rather than inventing a theme.
