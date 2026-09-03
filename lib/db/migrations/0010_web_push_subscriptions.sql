CREATE TABLE IF NOT EXISTS "web_push_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "household_id" integer NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "clerk_id" text NOT NULL,
  "endpoint" text NOT NULL,
  "keys" jsonb NOT NULL,
  "device_label" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "web_push_subscriptions_endpoint_unique"
  ON "web_push_subscriptions" ("endpoint");
CREATE INDEX IF NOT EXISTS "web_push_subscriptions_household_idx"
  ON "web_push_subscriptions" ("household_id");
CREATE INDEX IF NOT EXISTS "web_push_subscriptions_clerk_idx"
  ON "web_push_subscriptions" ("clerk_id");