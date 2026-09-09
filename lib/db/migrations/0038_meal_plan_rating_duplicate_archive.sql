CREATE TABLE IF NOT EXISTS "meal_plan_rating_duplicate_archive" (
  "original_id" integer PRIMARY KEY,
  "original_meal_plan_id" integer NOT NULL,
  "survivor_meal_plan_id" integer NOT NULL,
  "member_id" integer NOT NULL,
  "rating" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "archived_at" timestamp with time zone NOT NULL DEFAULT now(),
  "archive_reason" text NOT NULL DEFAULT 'rating belonged to a duplicate meal plan slot'
);