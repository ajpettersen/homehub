ALTER TABLE "ai_memories"
  DROP CONSTRAINT IF EXISTS "ai_memories_subject_household_family_member_fk";

DROP INDEX IF EXISTS "family_members_id_household_unique";

ALTER TABLE "ai_memories"
  ADD CONSTRAINT "ai_memories_subject_household_family_member_fk"
  FOREIGN KEY ("subject_family_member_id", "household_id")
  REFERENCES "family_members" ("id", "household_id")
  ON DELETE CASCADE;