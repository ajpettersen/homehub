-- Forward-only: invite tokens are never persisted; only their SHA-256 hashes are stored.
CREATE TABLE IF NOT EXISTS household_invites (
  id serial PRIMARY KEY,
  household_id integer NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_by_clerk_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by_clerk_id text
);

CREATE INDEX IF NOT EXISTS household_invites_active_household_idx
  ON household_invites (household_id, expires_at)
  WHERE revoked_at IS NULL AND redeemed_at IS NULL;
