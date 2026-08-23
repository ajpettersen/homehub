ALTER TABLE "todo_lists"
  ADD COLUMN "household_id" integer REFERENCES "households"("id") ON DELETE CASCADE;

CREATE TABLE "unassigned_todo_lists" (
  "legacy_id" integer PRIMARY KEY,
  "name" text NOT NULL,
  "assignee_id" integer,
  "property_id" integer,
  "created_at" timestamp with time zone NOT NULL,
  "quarantine_reason" text NOT NULL,
  "quarantined_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Property and assignee links may each identify a household. Assign the list
-- only when they agree or when exactly one link is available.
WITH ownership_candidates AS (
  SELECT "tl"."id" AS "list_id", "p"."household_id"
  FROM "todo_lists" AS "tl"
  INNER JOIN "properties" AS "p" ON "p"."id" = "tl"."property_id"
  WHERE "tl"."household_id" IS NULL
    AND "p"."household_id" IS NOT NULL

  UNION

  SELECT "tl"."id" AS "list_id", "fm"."household_id"
  FROM "todo_lists" AS "tl"
  INNER JOIN "family_members" AS "fm" ON "fm"."id" = "tl"."assignee_id"
  WHERE "tl"."household_id" IS NULL
    AND "fm"."household_id" IS NOT NULL
),
resolved_lists AS (
  SELECT "list_id", min("household_id") AS "household_id"
  FROM "ownership_candidates"
  GROUP BY "list_id"
  HAVING count(DISTINCT "household_id") = 1
)
UPDATE "todo_lists" AS "tl"
SET "household_id" = "resolved"."household_id"
FROM "resolved_lists" AS "resolved"
WHERE "tl"."id" = "resolved"."list_id"
  AND "tl"."household_id" IS NULL;

INSERT INTO "unassigned_todo_lists" (
  "legacy_id", "name", "assignee_id", "property_id", "created_at", "quarantine_reason"
)
SELECT
  "id", "name", "assignee_id", "property_id", "created_at",
  'No unambiguous household relationship'
FROM "todo_lists"
WHERE "household_id" IS NULL;

DELETE FROM "todo_lists"
WHERE "household_id" IS NULL;

ALTER TABLE "todo_lists"
  ALTER COLUMN "household_id" SET NOT NULL;

ALTER TABLE "push_tokens"
  ADD COLUMN "household_id" integer REFERENCES "households"("id") ON DELETE CASCADE,
  ADD COLUMN "clerk_id" text;

CREATE INDEX "todo_lists_household_id_idx"
  ON "todo_lists" ("household_id");

CREATE INDEX "push_tokens_household_id_idx"
  ON "push_tokens" ("household_id");

CREATE INDEX "push_tokens_clerk_id_idx"
  ON "push_tokens" ("clerk_id");