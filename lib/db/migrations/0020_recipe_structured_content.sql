-- Persist the reviewable structured recipe content used by guided cooking.
-- Defaults retain compatibility with existing cookbook entries.
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS instructions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS servings integer,
  ADD COLUMN IF NOT EXISTS prep_minutes integer,
  ADD COLUMN IF NOT EXISTS cook_minutes integer,
  ADD COLUMN IF NOT EXISTS source_type text;