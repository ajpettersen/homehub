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

-- HomeHub historically represented one household. Existing properties and
-- already-approved profiles belong to that legacy household; pending profiles
-- remain unowned until explicitly approved.
UPDATE "properties"
SET "household_id" = (SELECT "id" FROM "households" ORDER BY "id" LIMIT 1)
WHERE "household_id" IS NULL;

UPDATE "user_profiles"
SET "household_id" = (SELECT "id" FROM "households" ORDER BY "id" LIMIT 1)
WHERE "household_id" IS NULL
  AND "role" IN ('family', 'cleaner');

CREATE INDEX IF NOT EXISTS "properties_household_id_idx" ON "properties" ("household_id");
CREATE INDEX IF NOT EXISTS "user_profiles_household_id_idx" ON "user_profiles" ("household_id");