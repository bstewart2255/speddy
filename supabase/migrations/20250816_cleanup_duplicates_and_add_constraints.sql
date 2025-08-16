-- First, add the content_hash columns without constraints
ALTER TABLE special_activities 
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

ALTER TABLE bell_schedules 
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Clean up duplicate special_activities
-- Keep only the most recently created record for each unique combination
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY provider_id, school_id, teacher_name, activity_name, day_of_week, start_time 
      ORDER BY created_at DESC, id DESC
    ) as rn
  FROM special_activities
  WHERE school_id IS NOT NULL
)
DELETE FROM special_activities
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Clean up duplicate bell_schedules
-- Keep only the most recently created record for each unique combination
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY provider_id, school_id, grade_level, period_name, day_of_week, start_time 
      ORDER BY created_at DESC, id DESC
    ) as rn
  FROM bell_schedules
  WHERE school_id IS NOT NULL
)
DELETE FROM bell_schedules
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Now create the unique indexes after cleaning up duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_special_activities_unique 
ON special_activities (
  provider_id, 
  school_id, 
  teacher_name, 
  activity_name, 
  day_of_week, 
  start_time
) WHERE school_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bell_schedules_unique 
ON bell_schedules (
  provider_id, 
  school_id, 
  grade_level, 
  period_name, 
  day_of_week, 
  start_time
) WHERE school_id IS NOT NULL;

-- Create index on content_hash for faster lookups
CREATE INDEX IF NOT EXISTS idx_special_activities_content_hash 
ON special_activities (provider_id, school_id, content_hash) 
WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bell_schedules_content_hash 
ON bell_schedules (provider_id, school_id, content_hash) 
WHERE content_hash IS NOT NULL;


-- Report on duplicates that were removed
DO $$
DECLARE
  special_activities_removed INTEGER;
  bell_schedules_removed INTEGER;
BEGIN
  -- Count removed duplicates (this is just for logging, actual removal happened above)
  SELECT COUNT(*) INTO special_activities_removed
  FROM (
    SELECT COUNT(*) as cnt
    FROM special_activities
    WHERE school_id IS NOT NULL
    GROUP BY provider_id, school_id, teacher_name, activity_name, day_of_week, start_time
    HAVING COUNT(*) > 1
  ) as duplicates;
  
  SELECT COUNT(*) INTO bell_schedules_removed
  FROM (
    SELECT COUNT(*) as cnt
    FROM bell_schedules
    WHERE school_id IS NOT NULL
    GROUP BY provider_id, school_id, grade_level, period_name, day_of_week, start_time
    HAVING COUNT(*) > 1
  ) as duplicates;
  
  RAISE NOTICE 'Cleaned up duplicate entries - Special Activities: %, Bell Schedules: %', 
    special_activities_removed, bell_schedules_removed;
END;
$$;