ALTER TABLE "households"
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp with time zone;

-- Households that existed before this feature are considered already set up,
-- so existing users never see the first-login setup wizard.
UPDATE "households"
SET "onboarding_completed_at" = now()
WHERE "onboarding_completed_at" IS NULL;
