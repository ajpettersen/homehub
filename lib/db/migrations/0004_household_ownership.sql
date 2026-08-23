CREATE TABLE IF NOT EXISTS "households" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "households" ("name")
SELECT 'HomeHub Household'
WHERE NOT EXISTS (SELECT 1 FROM "households");

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "household_id" integer REFERENCES "households"("id") ON DELETE CASCADE;

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "household_id" integer REFERENCES "households"("id") ON DELETE CASCADE;

-- Only assign legacy records automatically when there is exactly one household.
-- In a multi-household database, a default assignment can expose data across
-- household boundaries; those records stay unowned until an operator resolves
-- them through an authorized ownership flow.
UPDATE "properties"
SET "household_id" = (SELECT "id" FROM "households" ORDER BY "id" LIMIT 1)
WHERE "household_id" IS NULL
  AND (SELECT count(*) FROM "households") = 1;

UPDATE "user_profiles"
SET "household_id" = (SELECT "id" FROM "households" ORDER BY "id" LIMIT 1)
WHERE "household_id" IS NULL
  AND "role" IN ('family', 'cleaner')
  AND (SELECT count(*) FROM "households") = 1;

CREATE INDEX IF NOT EXISTS "properties_household_id_idx" ON "properties" ("household_id");
CREATE INDEX IF NOT EXISTS "user_profiles_household_id_idx" ON "user_profiles" ("household_id");