ALTER TABLE "people"
  ADD COLUMN IF NOT EXISTS "property_id" integer REFERENCES "properties"("id") ON DELETE CASCADE;

ALTER TABLE "contractors"
  ADD COLUMN IF NOT EXISTS "property_id" integer REFERENCES "properties"("id") ON DELETE CASCADE;

-- Existing rows intentionally remain unscoped and therefore hidden by the
-- property-scoped API. Ownership cannot be inferred safely from a global
-- property list; an authorized household owner must assign any legacy record.

CREATE INDEX IF NOT EXISTS "people_property_id_idx" ON "people" ("property_id");
CREATE INDEX IF NOT EXISTS "contractors_property_id_idx" ON "contractors" ("property_id");