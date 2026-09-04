-- The AI memory subject foreign key references this exact column pair.
-- PostgreSQL requires a matching unique or primary-key constraint on the
-- referenced columns, even though id alone is already the table primary key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'family_members_id_household_key'
      AND conrelid = 'family_members'::regclass
  ) THEN
    ALTER TABLE family_members
      ADD CONSTRAINT family_members_id_household_key
      UNIQUE (id, household_id);
  END IF;
END $$;