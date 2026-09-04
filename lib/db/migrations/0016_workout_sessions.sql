-- Historical workout rows are immutable completed logs. Future planning is
-- represented on the same record type to keep existing workout APIs compatible.
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS scheduled_time text,
  ADD COLUMN IF NOT EXISTS scheduled_timezone text,
  ADD COLUMN IF NOT EXISTS session_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS session_kind text NOT NULL DEFAULT 'ad_hoc',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rescheduled_from_workout_id integer REFERENCES workouts(id) ON DELETE SET NULL;

UPDATE workouts
SET session_status = 'completed',
    session_kind = 'ad_hoc',
    completed_at = COALESCE(completed_at, created_at)
WHERE scheduled_date IS NULL
  AND (
    session_status IS NULL OR session_status <> 'completed'
    OR session_kind IS NULL OR session_kind <> 'ad_hoc'
    OR completed_at IS NULL
  );

ALTER TABLE workouts
  DROP CONSTRAINT IF EXISTS workouts_session_status_check,
  ADD CONSTRAINT workouts_session_status_check
    CHECK (session_status IN ('scheduled', 'completed', 'skipped', 'missed', 'cancelled')),
  DROP CONSTRAINT IF EXISTS workouts_session_kind_check,
  ADD CONSTRAINT workouts_session_kind_check
    CHECK (session_kind IN ('weekly_plan', 'ad_hoc'));

CREATE INDEX IF NOT EXISTS workouts_scheduled_session_idx
  ON workouts (scheduled_date, session_status)
  WHERE session_status = 'scheduled';