ALTER TABLE "household_notification_preferences"
  DROP CONSTRAINT IF EXISTS "household_notification_preferences_due_time_check",
  DROP CONSTRAINT IF EXISTS "household_notification_preferences_workout_time_check";

UPDATE "household_notification_preferences"
SET
  "due_reminder_time" = CASE
    WHEN "due_reminder_time" ~ '^(?:(?:0[5-9]|1[0-9]):[0-5][0-9]|20:[0-5][0-5])$'
      THEN "due_reminder_time"
    ELSE '08:00'
  END,
  "workout_follow_up_time" = CASE
    WHEN "workout_follow_up_time" ~ '^(?:(?:0[5-9]|1[0-9]):[0-5][0-9]|20:[0-5][0-5])$'
      THEN "workout_follow_up_time"
    ELSE '08:00'
  END;

ALTER TABLE "household_notification_preferences"
  ADD CONSTRAINT "household_notification_preferences_due_time_check"
    CHECK ("due_reminder_time" ~ '^(?:(?:0[5-9]|1[0-9]):[0-5][0-9]|20:[0-5][0-5])$'),
  ADD CONSTRAINT "household_notification_preferences_workout_time_check"
    CHECK ("workout_follow_up_time" ~ '^(?:(?:0[5-9]|1[0-9]):[0-5][0-9]|20:[0-5][0-5])$');

INSERT INTO "household_notification_preferences"
  ("household_id", "timezone", "due_reminder_time", "workout_follow_up_time")
SELECT "household_id", "timezone", '08:00', '08:00'
FROM "workout_preferences"
ON CONFLICT ("household_id") DO NOTHING;