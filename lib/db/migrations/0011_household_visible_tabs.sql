DO $$
BEGIN
  CREATE TYPE "homehub_web_tab" AS ENUM (
    'home',
    'properties',
    'chores',
    'meals',
    'tasks',
    'workouts',
    'people',
    'settings'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "households"
  ADD COLUMN IF NOT EXISTS "visible_tabs" "homehub_web_tab"[] NOT NULL
  DEFAULT ARRAY[
    'home',
    'properties',
    'chores',
    'meals',
    'tasks',
    'workouts',
    'people',
    'settings'
  ]::"homehub_web_tab"[];

DO $$
BEGIN
  ALTER TABLE "households"
    ADD CONSTRAINT "households_required_visible_tabs"
    CHECK (
      'home'::"homehub_web_tab" = ANY ("visible_tabs")
      AND 'settings'::"homehub_web_tab" = ANY ("visible_tabs")
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;