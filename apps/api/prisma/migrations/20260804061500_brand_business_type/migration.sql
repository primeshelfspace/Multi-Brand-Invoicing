-- Company Details onboarding: legal structure of the business behind a
-- brand. Nullable — existing brands predate this field and have no value to
-- backfill; new brands always send one (brandSchema requires it).
CREATE TYPE "BusinessType" AS ENUM ('SOLE_PROPRIETORSHIP', 'LLC', 'CORPORATION', 'PARTNERSHIP', 'NONPROFIT');

ALTER TABLE "brand" ADD COLUMN "business_type" "BusinessType";
