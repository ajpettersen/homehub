CREATE TABLE IF NOT EXISTS workout_participants (
  workout_id integer NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  member_id integer NOT NULL REFERENCES family_members(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_participants_workout_member_unique UNIQUE (workout_id, member_id)
);
CREATE INDEX IF NOT EXISTS workout_participants_member_idx ON workout_participants(member_id);

INSERT INTO workout_participants (workout_id, member_id)
SELECT id, member_id FROM workouts
ON CONFLICT (workout_id, member_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS exercise_library (
  id serial PRIMARY KEY,
  household_id integer NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  muscle_groups text[] NOT NULL DEFAULT ARRAY['full_body']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS exercise_library_household_normalized_unique
  ON exercise_library(household_id, normalized_name);

INSERT INTO exercise_library (household_id, name, normalized_name, muscle_groups)
SELECT DISTINCT ON (fm.household_id, lower(regexp_replace(trim(we.name), '\s+', ' ', 'g')))
  fm.household_id, trim(we.name), lower(regexp_replace(trim(we.name), '\s+', ' ', 'g')),
  ARRAY['full_body']::text[]
FROM workout_exercises we
JOIN workouts w ON w.id = we.workout_id
JOIN family_members fm ON fm.id = w.member_id
WHERE trim(we.name) <> ''
ON CONFLICT (household_id, normalized_name) DO NOTHING;

ALTER TABLE workout_exercises
  ADD COLUMN IF NOT EXISTS library_exercise_id integer REFERENCES exercise_library(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS muscle_groups text[] NOT NULL DEFAULT ARRAY['full_body']::text[];

UPDATE workout_exercises we
SET library_exercise_id = el.id,
    muscle_groups = el.muscle_groups
FROM workouts w
JOIN family_members fm ON fm.id = w.member_id
JOIN exercise_library el ON el.household_id = fm.household_id
WHERE w.id = we.workout_id
  AND el.normalized_name = lower(regexp_replace(trim(we.name), '\s+', ' ', 'g'))
  AND we.library_exercise_id IS NULL;

ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_member_id_family_members_id_fk;
ALTER TABLE workouts ADD CONSTRAINT workouts_member_id_family_members_id_fk
  FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS workout_preferences (
  household_id integer PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  days_of_week integer[] NOT NULL DEFAULT ARRAY[]::integer[],
  goals text NOT NULL DEFAULT '',
  session_duration_minutes integer NOT NULL DEFAULT 30,
  equipment text NOT NULL DEFAULT '',
  limitations text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'UTC',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_coach_messages (
  id serial PRIMARY KEY,
  household_id integer NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  draft_json text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workout_coach_messages_household_created_idx
  ON workout_coach_messages(household_id, created_at);