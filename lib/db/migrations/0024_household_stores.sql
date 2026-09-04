CREATE TABLE IF NOT EXISTS "household_stores" (
  "id" serial PRIMARY KEY,
  "household_id" integer NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "address" text,
  "notes" text,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "household_stores_one_default"
  ON "household_stores" ("household_id") WHERE "is_default" = true;

CREATE TABLE IF NOT EXISTS "store_departments" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "household_stores"("id") ON DELETE CASCADE,
  "category_key" text NOT NULL,
  "display_name" text NOT NULL,
  "sort_order" integer NOT NULL,
  CONSTRAINT "store_departments_store_category_unique" UNIQUE ("store_id", "category_key"),
  CONSTRAINT "store_departments_store_order_unique" UNIQUE ("store_id", "sort_order"),
  CONSTRAINT "store_departments_sort_order_nonnegative" CHECK ("sort_order" >= 0),
  CONSTRAINT "store_departments_category_key_check" CHECK (
    "category_key" IN ('produce', 'deli', 'meat', 'dairy', 'bread', 'grains', 'canned', 'snacks', 'frozen', 'beverages', 'household', 'other')
  )
);

ALTER TABLE "grocery_lists"
  ADD COLUMN IF NOT EXISTS "store_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grocery_lists_store_id_household_stores_id_fk'
  ) THEN
    ALTER TABLE "grocery_lists"
      ADD CONSTRAINT "grocery_lists_store_id_household_stores_id_fk"
      FOREIGN KEY ("store_id") REFERENCES "household_stores"("id") ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO "household_stores" ("household_id", "name", "is_default")
SELECT h."id", 'My Store', true
FROM "households" h
WHERE NOT EXISTS (
  SELECT 1 FROM "household_stores" s WHERE s."household_id" = h."id"
);

UPDATE "household_stores" candidate
SET "is_default" = true
WHERE candidate."id" = (
  SELECT MIN(store."id")
  FROM "household_stores" store
  WHERE store."household_id" = candidate."household_id"
)
AND NOT EXISTS (
  SELECT 1
  FROM "household_stores" existing_default
  WHERE existing_default."household_id" = candidate."household_id"
    AND existing_default."is_default" = true
);

INSERT INTO "store_departments" ("store_id", "category_key", "display_name", "sort_order")
SELECT s."id", d."category_key", d."display_name", d."sort_order"
FROM "household_stores" s
CROSS JOIN (VALUES
  ('produce', 'Produce', 0),
  ('deli', 'Deli', 1),
  ('meat', 'Meat', 2),
  ('dairy', 'Dairy', 3),
  ('bread', 'Bread', 4),
  ('grains', 'Grains & Pasta', 5),
  ('canned', 'Canned Goods', 6),
  ('snacks', 'Snacks', 7),
  ('frozen', 'Frozen', 8),
  ('beverages', 'Beverages', 9),
  ('household', 'Household', 10),
  ('other', 'Other', 11)
) AS d("category_key", "display_name", "sort_order")
WHERE NOT EXISTS (
  SELECT 1 FROM "store_departments" sd WHERE sd."store_id" = s."id"
)
ON CONFLICT DO NOTHING;

UPDATE "grocery_lists" gl
SET "store_id" = s."id"
FROM "properties" p
JOIN "household_stores" s
  ON s."household_id" = p."household_id" AND s."is_default" = true
WHERE gl."property_id" = p."id"
  AND gl."store_id" IS NULL
  AND p."household_id" IS NOT NULL;