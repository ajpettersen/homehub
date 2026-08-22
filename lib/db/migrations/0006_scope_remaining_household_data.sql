ALTER TABLE "todo_lists"
  ADD COLUMN "household_id" integer REFERENCES "households"("id") ON DELETE CASCADE;

UPDATE "todo_lists"
SET "household_id" = (
  SELECT "id"
  FROM "households"
  ORDER BY "id"
  LIMIT 1
)
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