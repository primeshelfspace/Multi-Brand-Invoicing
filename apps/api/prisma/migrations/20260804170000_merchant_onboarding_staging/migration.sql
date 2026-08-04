-- Onboarding (FR-ONB): a place to stage a merchant's company details before
-- any Brand exists to hold them, plus the single-vs-multi brand-structure
-- choice. Onboarding's current step is deliberately not its own column —
-- it is computed from whether these are null and whether any Brand exists,
-- so it can never drift out of sync with what actually happened.
CREATE TYPE "BrandStructure" AS ENUM ('SINGLE', 'MULTI');

ALTER TABLE "merchant"
  ADD COLUMN "company_legal_name" TEXT,
  ADD COLUMN "company_business_type" "BusinessType",
  ADD COLUMN "company_phone" TEXT,
  ADD COLUMN "company_email" TEXT,
  ADD COLUMN "company_mailing_address" JSONB,
  ADD COLUMN "company_billing_address" JSONB,
  ADD COLUMN "company_tax_id" TEXT,
  ADD COLUMN "company_logo_key" TEXT,
  ADD COLUMN "brand_structure" "BrandStructure";
