CREATE TABLE IF NOT EXISTS "meal_plan_duplicate_archive" (
  "original_id" integer PRIMARY KEY,
  "week_start" date NOT NULL,
  "day_of_week" integer NOT NULL,
  "meal_type" text NOT NULL,
  "meal" text NOT NULL,
  "notes" text,
  "rating" text,
  "property_id" integer NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL,
  "archived_at" timestamp with time zone NOT NULL DEFAULT now(),
  "archive_reason" text NOT NULL DEFAULT 'duplicate meal plan slot'
);

CREATE TABLE IF NOT EXISTS "meal_plan_rating_duplicate_archive" (
  "original_id" integer PRIMARY KEY,
  "original_meal_plan_id" integer NOT NULL,
  "survivor_meal_plan_id" integer NOT NULL,
  "member_id" integer NOT NULL,
  "rating" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "archived_at" timestamp with time zone NOT NULL DEFAULT now(),
  "archive_reason" text NOT NULL DEFAULT 'rating belonged to a duplicate meal plan slot'
);

UPDATE meal_plans AS winner
SET
  notes = COALESCE(
    winner.notes,
    (
      SELECT candidate.notes
      FROM meal_plans AS candidate
      WHERE candidate.property_id = winner.property_id
        AND candidate.week_start = winner.week_start
        AND candidate.day_of_week = winner.day_of_week
        AND candidate.meal_type = winner.meal_type
        AND lower(trim(candidate.meal)) = lower(trim(winner.meal))
        AND candidate.notes IS NOT NULL
      ORDER BY candidate.id DESC
      LIMIT 1
    )
  ),
  rating = COALESCE(
    winner.rating,
    (
      SELECT candidate.rating
      FROM meal_plans AS candidate
      WHERE candidate.property_id = winner.property_id
        AND candidate.week_start = winner.week_start
        AND candidate.day_of_week = winner.day_of_week
        AND candidate.meal_type = winner.meal_type
        AND lower(trim(candidate.meal)) = lower(trim(winner.meal))
        AND candidate.rating IS NOT NULL
      ORDER BY candidate.id DESC
      LIMIT 1
    )
  )
WHERE winner.id IN (
  SELECT max(id)
  FROM meal_plans
  GROUP BY property_id, week_start, day_of_week, meal_type
  HAVING count(*) > 1
);

WITH ranked AS (
  SELECT
    meal_plans.*,
    row_number() OVER (
      PARTITION BY property_id, week_start, day_of_week, meal_type
      ORDER BY id DESC
    ) AS duplicate_rank
  FROM meal_plans
)
INSERT INTO meal_plan_duplicate_archive (
  original_id,
  week_start,
  day_of_week,
  meal_type,
  meal,
  notes,
  rating,
  property_id,
  created_at
)
SELECT
  id,
  week_start,
  day_of_week,
  meal_type,
  meal,
  notes,
  rating,
  property_id,
  created_at
FROM ranked
WHERE duplicate_rank > 1
ON CONFLICT (original_id) DO NOTHING;

WITH ranked AS (
  SELECT
    meal_plans.*,
    first_value(id) OVER (
      PARTITION BY property_id, week_start, day_of_week, meal_type
      ORDER BY id DESC
    ) AS survivor_id,
    row_number() OVER (
      PARTITION BY property_id, week_start, day_of_week, meal_type
      ORDER BY id DESC
    ) AS duplicate_rank
  FROM meal_plans
)
INSERT INTO meal_plan_rating_duplicate_archive (
  original_id,
  original_meal_plan_id,
  survivor_meal_plan_id,
  member_id,
  rating,
  created_at
)
SELECT
  meal_ratings.id,
  meal_ratings.meal_plan_id,
  ranked.survivor_id,
  meal_ratings.member_id,
  meal_ratings.rating,
  meal_ratings.created_at
FROM meal_ratings
JOIN ranked ON ranked.id = meal_ratings.meal_plan_id
WHERE ranked.duplicate_rank > 1
ON CONFLICT (original_id) DO NOTHING;

WITH ranked AS (
  SELECT
    meal_plans.*,
    first_value(id) OVER (
      PARTITION BY property_id, week_start, day_of_week, meal_type
      ORDER BY id DESC
    ) AS survivor_id,
    row_number() OVER (
      PARTITION BY property_id, week_start, day_of_week, meal_type
      ORDER BY id DESC
    ) AS duplicate_rank
  FROM meal_plans
),
equivalent_duplicate_ratings AS (
  SELECT
    ranked.survivor_id,
    meal_ratings.member_id,
    meal_ratings.rating,
    meal_ratings.created_at
  FROM ranked
  JOIN meal_plans AS survivor ON survivor.id = ranked.survivor_id
  JOIN meal_ratings ON meal_ratings.meal_plan_id = ranked.id
  WHERE ranked.duplicate_rank > 1
    AND lower(trim(ranked.meal)) = lower(trim(survivor.meal))
)
INSERT INTO meal_ratings (meal_plan_id, member_id, rating, created_at)
SELECT survivor_id, member_id, rating, created_at
FROM equivalent_duplicate_ratings
ON CONFLICT (meal_plan_id, member_id) DO NOTHING;

DELETE FROM meal_plans AS duplicate
USING meal_plan_duplicate_archive AS archived
WHERE duplicate.id = archived.original_id;

CREATE UNIQUE INDEX IF NOT EXISTS "meal_plans_property_week_day_type_unique"
  ON "meal_plans" ("property_id", "week_start", "day_of_week", "meal_type");