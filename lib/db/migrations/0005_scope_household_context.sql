ALTER TABLE "family_members"
  ADD COLUMN "household_id" integer REFERENCES "households"("id") ON DELETE CASCADE;

ALTER TABLE "ai_memories"
  ADD COLUMN "household_id" integer REFERENCES "households"("id") ON DELETE CASCADE;

CREATE TABLE "unassigned_family_members" (
  "legacy_id" integer PRIMARY KEY,
  "name" text NOT NULL,
  "role" text NOT NULL,
  "color" text NOT NULL,
  "avatar_initials" text NOT NULL,
  "photo_url" text,
  "created_at" timestamp with time zone NOT NULL,
  "quarantine_reason" text NOT NULL,
  "quarantined_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- A family member can be assigned only when every available relationship
-- resolves to one household. Multiple or missing candidates are quarantined
-- below rather than guessed.
WITH ownership_candidates AS (
  SELECT "fm"."id" AS "member_id", "up"."household_id"
  FROM "family_members" AS "fm"
  INNER JOIN "user_profiles" AS "up"
    ON "up"."linked_family_member_id" = "fm"."id"
  WHERE "fm"."household_id" IS NULL
    AND "up"."household_id" IS NOT NULL

  UNION

  SELECT "fm"."id" AS "member_id", "p"."household_id"
  FROM "family_members" AS "fm"
  INNER JOIN "chores" AS "c" ON "c"."assignee_id" = "fm"."id"
  INNER JOIN "properties" AS "p" ON "p"."id" = "c"."property_id"
  WHERE "fm"."household_id" IS NULL
    AND "p"."household_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "user_profiles" AS "linked_profile"
      WHERE "linked_profile"."linked_family_member_id" = "fm"."id"
        AND "linked_profile"."household_id" IS NOT NULL
    )

  UNION

  SELECT "fm"."id" AS "member_id", "p"."household_id"
  FROM "family_members" AS "fm"
  INNER JOIN "meal_ratings" AS "mr" ON "mr"."member_id" = "fm"."id"
  INNER JOIN "meal_plans" AS "mp" ON "mp"."id" = "mr"."meal_plan_id"
  INNER JOIN "properties" AS "p" ON "p"."id" = "mp"."property_id"
  WHERE "fm"."household_id" IS NULL
    AND "p"."household_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "user_profiles" AS "linked_profile"
      WHERE "linked_profile"."linked_family_member_id" = "fm"."id"
        AND "linked_profile"."household_id" IS NOT NULL
    )

  UNION

  SELECT "fm"."id" AS "member_id", "p"."household_id"
  FROM "family_members" AS "fm"
  INNER JOIN "todo_lists" AS "tl" ON "tl"."assignee_id" = "fm"."id"
  INNER JOIN "properties" AS "p" ON "p"."id" = "tl"."property_id"
  WHERE "fm"."household_id" IS NULL
    AND "p"."household_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "user_profiles" AS "linked_profile"
      WHERE "linked_profile"."linked_family_member_id" = "fm"."id"
        AND "linked_profile"."household_id" IS NOT NULL
    )
),
resolved_members AS (
  SELECT "member_id", min("household_id") AS "household_id"
  FROM "ownership_candidates"
  GROUP BY "member_id"
  HAVING count(DISTINCT "household_id") = 1
)
UPDATE "family_members" AS "fm"
SET "household_id" = "resolved"."household_id"
FROM "resolved_members" AS "resolved"
WHERE "fm"."id" = "resolved"."member_id"
  AND "fm"."household_id" IS NULL;

INSERT INTO "unassigned_family_members" (
  "legacy_id", "name", "role", "color", "avatar_initials", "photo_url", "created_at", "quarantine_reason"
)
SELECT
  "id", "name", "role", "color", "avatar_initials", "photo_url", "created_at",
  'No unambiguous household relationship'
FROM "family_members"
WHERE "household_id" IS NULL;

DELETE FROM "family_members"
WHERE "household_id" IS NULL;

CREATE TABLE "unassigned_ai_memories" (
  "legacy_id" integer PRIMARY KEY,
  "content" text NOT NULL,
  "category" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "quarantine_reason" text NOT NULL,
  "quarantined_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- AI memories had no property, profile, or family-member relationship before
-- this migration. They cannot be attributed safely, so retain them outside the
-- live table for explicit operator resolution instead of exposing them to an
-- arbitrary household.
INSERT INTO "unassigned_ai_memories" (
  "legacy_id", "content", "category", "created_at", "quarantine_reason"
)
SELECT
  "id", "content", "category", "created_at",
  'No household relationship in legacy ai_memories row'
FROM "ai_memories"
WHERE "household_id" IS NULL;

DELETE FROM "ai_memories"
WHERE "household_id" IS NULL;

ALTER TABLE "family_members"
  ALTER COLUMN "household_id" SET NOT NULL;

ALTER TABLE "ai_memories"
  ALTER COLUMN "household_id" SET NOT NULL;

CREATE INDEX "family_members_household_id_idx"
  ON "family_members" ("household_id");

CREATE INDEX "ai_memories_household_id_idx"
  ON "ai_memories" ("household_id");