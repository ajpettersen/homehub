ALTER TABLE "grocery_items"
  ADD COLUMN IF NOT EXISTS "store_id" integer REFERENCES "household_stores"("id") ON DELETE SET NULL;
