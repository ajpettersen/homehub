-- Publish must add family_members_id_household_key before it can add the
-- composite AI-memory foreign key. Replit's generated publish diff orders new
-- foreign keys before new unique constraints, so stage the prerequisite first.
-- A follow-up migration restores the foreign key after the prerequisite has
-- reached production.
ALTER TABLE ai_memories
  DROP CONSTRAINT IF EXISTS ai_memories_subject_household_family_member_fk;