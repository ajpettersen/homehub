-- HomeHub's own email + password sign-in, replacing Clerk. Accounts keep the
-- id they already have in user_profiles.clerk_id (Clerk's id for existing
-- people, a HomeHub-made id for new ones), so nothing else has to move.
CREATE TABLE IF NOT EXISTS "user_credentials" (
  "clerk_id" text PRIMARY KEY REFERENCES "user_profiles"("clerk_id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "display_name" text,
  "password_hash" text,
  "email_verified" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_credentials_email_unique" ON "user_credentials" ("email");

CREATE TABLE IF NOT EXISTS "user_sessions" (
  "token_hash" text PRIMARY KEY,
  "clerk_id" text NOT NULL REFERENCES "user_credentials"("clerk_id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "user_sessions_clerk_id_idx" ON "user_sessions" ("clerk_id");

CREATE TABLE IF NOT EXISTS "password_setup_tokens" (
  "token_hash" text PRIMARY KEY,
  "clerk_id" text NOT NULL REFERENCES "user_credentials"("clerk_id") ON DELETE CASCADE,
  "created_by_clerk_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "password_setup_tokens_clerk_id_idx" ON "password_setup_tokens" ("clerk_id");
