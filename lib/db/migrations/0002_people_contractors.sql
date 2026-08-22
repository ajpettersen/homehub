ALTER TABLE "people"
  ADD COLUMN IF NOT EXISTS "photo_url" text,
  ADD COLUMN IF NOT EXISTS "phone" text,
  ADD COLUMN IF NOT EXISTS "email" text,
  ADD COLUMN IF NOT EXISTS "last_contacted_at" date,
  ADD COLUMN IF NOT EXISTS "next_follow_up_at" date;

CREATE TABLE IF NOT EXISTS "contractors" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "trade" text NOT NULL,
  "phone" text,
  "email" text,
  "notes" text,
  "past_work" text,
  "preferred" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);