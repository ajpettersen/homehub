CREATE TABLE IF NOT EXISTS "household_notification_preferences" (
  "household_id" integer PRIMARY KEY REFERENCES "households"("id") ON DELETE CASCADE,
  "timezone" text NOT NULL DEFAULT 'UTC',
  "due_reminder_time" text NOT NULL DEFAULT '08:00',
  "workout_follow_up_time" text NOT NULL DEFAULT '08:00',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "household_notification_preferences_due_time_check"
    CHECK ("due_reminder_time" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "household_notification_preferences_workout_time_check"
    CHECK ("workout_follow_up_time" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
);

CREATE TABLE IF NOT EXISTS "notification_delivery" (
  "id" serial PRIMARY KEY,
  "dedupe_key" text NOT NULL,
  "household_id" integer NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "recipient" text NOT NULL,
  "channel" text NOT NULL,
  "kind" text NOT NULL,
  "entity_id" integer NOT NULL,
  "local_date" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "claimed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "sent_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_delivery_dedupe_key_unique"
  ON "notification_delivery" ("dedupe_key");
CREATE INDEX IF NOT EXISTS "notification_delivery_reclaim_idx"
  ON "notification_delivery" ("sent_at", "claimed_at");
CREATE INDEX IF NOT EXISTS "notification_delivery_household_idx"
  ON "notification_delivery" ("household_id");