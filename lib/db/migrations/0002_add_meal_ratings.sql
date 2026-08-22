-- Migration: create meal_ratings table for per-member meal ratings
-- Apply with: psql $DATABASE_URL -f lib/db/migrations/0002_add_meal_ratings.sql

CREATE TABLE IF NOT EXISTS "meal_ratings" (
  "id"           serial PRIMARY KEY,
  "meal_plan_id" integer NOT NULL REFERENCES "meal_plans"("id") ON DELETE CASCADE,
  "member_id"    integer NOT NULL REFERENCES "family_members"("id") ON DELETE CASCADE,
  "rating"       text NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "meal_ratings_meal_member_unique" UNIQUE ("meal_plan_id", "member_id")
);
