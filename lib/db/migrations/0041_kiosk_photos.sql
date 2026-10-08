CREATE TABLE IF NOT EXISTS "kiosk_photos" (
  "household_id" integer PRIMARY KEY REFERENCES "households"("id") ON DELETE CASCADE,
  "mime_type" text NOT NULL,
  "bytes" bytea NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
