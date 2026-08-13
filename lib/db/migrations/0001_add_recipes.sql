-- Migration: create recipes table
-- Apply with: psql $DATABASE_URL -f lib/db/migrations/0001_add_recipes.sql
-- Or via the migrate script: cd lib/db && pnpm run migrate

CREATE TABLE IF NOT EXISTS "recipes" (
  "id"               serial PRIMARY KEY,
  "property_id"      integer NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "name"             text NOT NULL,
  "source_url"       text,
  "notes"            text,
  "times_cooked"     integer NOT NULL DEFAULT 0,
  "aggregate_rating" text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now()
);
