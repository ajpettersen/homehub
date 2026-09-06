CREATE TABLE IF NOT EXISTS "kitchen_inventory_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "property_id" integer NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "category_key" text DEFAULT 'other' NOT NULL,
  "quantity" text,
  "source_type" text DEFAULT 'manual' NOT NULL,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kitchen_inventory_category_check" CHECK ("category_key" IN ('produce', 'deli', 'meat', 'dairy', 'bread', 'grains', 'canned', 'snacks', 'frozen', 'beverages', 'household', 'other')),
  CONSTRAINT "kitchen_inventory_source_check" CHECK ("source_type" IN ('photo', 'manual'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "kitchen_inventory_property_name_unique"
  ON "kitchen_inventory_items" ("property_id", "normalized_name");
CREATE INDEX IF NOT EXISTS "kitchen_inventory_property_category_idx"
  ON "kitchen_inventory_items" ("property_id", "category_key");