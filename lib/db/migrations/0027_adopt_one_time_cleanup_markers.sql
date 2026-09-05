CREATE TABLE IF NOT EXISTS "one_time_cleanups" (
  "key" text PRIMARY KEY,
  "executed_at" timestamp with time zone NOT NULL DEFAULT now()
);