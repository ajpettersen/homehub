-- A personal memory's subject must be a member of that same household. The
-- primary key already makes this pair unique in practice; this explicit unique
-- key allows PostgreSQL to enforce the composite relationship.
CREATE UNIQUE INDEX IF NOT EXISTS family_members_id_household_unique
  ON family_members (id, household_id);

ALTER TABLE ai_memories
  DROP CONSTRAINT IF EXISTS ai_memories_subject_family_member_id_family_members_id_fk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_memories_subject_household_family_member_fk'
      AND conrelid = 'ai_memories'::regclass
  ) THEN
    ALTER TABLE ai_memories
      ADD CONSTRAINT ai_memories_subject_household_family_member_fk
      FOREIGN KEY (subject_family_member_id, household_id)
      REFERENCES family_members(id, household_id)
      ON DELETE CASCADE;
  END IF;
END $$;