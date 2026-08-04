-- The one onboarding fact that cannot be derived: whether a MULTI merchant
-- has decided it is done adding brands (SINGLE completes itself the instant
-- its one brand is created — see MerchantService.chooseBrandStructure).
ALTER TABLE "merchant" ADD COLUMN "onboarding_complete" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any merchant that already has a brand predates this onboarding
-- flow entirely and must not be sent back through it on next login.
UPDATE "merchant" m
SET "onboarding_complete" = true
WHERE EXISTS (SELECT 1 FROM "brand" b WHERE b.merchant_id = m.id);
