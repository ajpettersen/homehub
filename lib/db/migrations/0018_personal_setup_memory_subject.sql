ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS personal_setup_completed_at timestamp with time zone;

-- Existing approved, correctly linked adults predate personal setup. Treat them
-- as complete so this forward-only rollout does not interrupt current users.
UPDATE user_profiles AS up
SET personal_setup_completed_at = COALESCE(up.personal_setup_completed_at, now())
FROM family_members AS fm
WHERE up.role = 'family'
  AND up.linked_family_member_id = fm.id
  AND up.household_id = fm.household_id
  AND fm.role = 'parent'
  AND up.personal_setup_completed_at IS NULL;

ALTER TABLE ai_memories
  ADD COLUMN IF NOT EXISTS subject_family_member_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_memories_subject_family_member_id_family_members_id_fk'
      AND conrelid = 'ai_memories'::regclass
  ) THEN
    ALTER TABLE ai_memories
      ADD CONSTRAINT ai_memories_subject_family_member_id_family_members_id_fk
      FOREIGN KEY (subject_family_member_id)
      REFERENCES family_members(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_memories_household_subject_idx
  ON ai_memories (household_id, subject_family_member_id);