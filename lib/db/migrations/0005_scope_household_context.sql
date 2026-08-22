ALTER TABLE "family_members"
  ADD COLUMN "household_id" integer REFERENCES "households"("id") ON DELETE CASCADE;

ALTER TABLE "ai_memories"
  ADD COLUMN "household_id" integer REFERENCES "households"("id") ON DELETE CASCADE;

UPDATE "family_members"
SET "household_id" = (
  SELECT "id"
  FROM "households"
  ORDER BY "id"
  LIMIT 1
)
WHERE "household_id" IS NULL;

UPDATE "ai_memories"
SET "household_id" = (
  SELECT "id"
  FROM "households"
  ORDER BY "id"
  LIMIT 1
)
WHERE "household_id" IS NULL;

ALTER TABLE "family_members"
  ALTER COLUMN "household_id" SET NOT NULL;

ALTER TABLE "ai_memories"
  ALTER COLUMN "household_id" SET NOT NULL;

CREATE INDEX "family_members_household_id_idx"
  ON "family_members" ("household_id");

CREATE INDEX "ai_memories_household_id_idx"
  ON "ai_memories" ("household_id");