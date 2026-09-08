ALTER TABLE workout_exercises
  ADD COLUMN IF NOT EXISTS sort_order integer;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY workout_id ORDER BY id) - 1 AS position
  FROM workout_exercises
)
UPDATE workout_exercises AS exercise
SET sort_order = ranked.position
FROM ranked
WHERE exercise.id = ranked.id
  AND exercise.sort_order IS NULL;

ALTER TABLE workout_exercises
  ALTER COLUMN sort_order SET DEFAULT 0,
  ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS workout_exercises_workout_order_idx
  ON workout_exercises(workout_id, sort_order, id);