ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Preserve existing household owners' access while new family accounts are members by default.
UPDATE user_profiles SET is_admin = true WHERE role = 'family';

-- Remove legacy direct pending attachments. Pending access is now represented only
-- by a reviewable request and cannot carry household-scoped associations.
UPDATE user_profiles
SET household_id = NULL,
    allowed_property_id = NULL,
    linked_family_member_id = NULL
WHERE role = 'pending';

CREATE TABLE IF NOT EXISTS household_join_requests (
  id serial PRIMARY KEY,
  requester_clerk_id text NOT NULL UNIQUE,
  target_household_id integer NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  requester_display_name text NOT NULL,
  requester_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS household_join_requests_pending_household_idx
  ON household_join_requests (target_household_id, created_at)
  WHERE status = 'pending';