CREATE TABLE IF NOT EXISTS "hatch_connections" (
  "household_id" integer PRIMARY KEY REFERENCES "households"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "encrypted_password" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
