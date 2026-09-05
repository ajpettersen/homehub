DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
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