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

-- Function to handle upsert for special_activities
CREATE OR REPLACE FUNCTION upsert_special_activity(
  p_provider_id UUID,
  p_school_id TEXT,
  p_teacher_name TEXT,
  p_activity_name TEXT,
  p_day_of_week INTEGER,
  p_start_time TIME,
  p_end_time TIME,
  p_school_site TEXT,
  p_content_hash VARCHAR(64)
) RETURNS TABLE (
  id UUID,
  action TEXT
) AS $$
DECLARE
  v_id UUID;
  v_action TEXT;
  v_existing_id UUID;
BEGIN
  -- Check if record exists
  SELECT special_activities.id INTO v_existing_id
  FROM special_activities
  WHERE provider_id = p_provider_id
    AND school_id = p_school_id
    AND teacher_name = p_teacher_name
    AND activity_name = p_activity_name
    AND day_of_week = p_day_of_week
    AND start_time = p_start_time;
  
  IF v_existing_id IS NOT NULL THEN
    -- Update existing record
    UPDATE special_activities
    SET end_time = p_end_time,
        content_hash = p_content_hash,
        updated_at = NOW()
    WHERE id = v_existing_id
    RETURNING special_activities.id INTO v_id;
    v_action := 'updated';
  ELSE
    -- Insert new record
    INSERT INTO special_activities (
      provider_id, school_id, teacher_name, activity_name, 
      day_of_week, start_time, end_time, school_site, content_hash
    ) VALUES (
      p_provider_id, p_school_id, p_teacher_name, p_activity_name,
      p_day_of_week, p_start_time, p_end_time, p_school_site, p_content_hash
    )
    RETURNING special_activities.id INTO v_id;
    v_action := 'inserted';
  END IF;
  
  RETURN QUERY SELECT v_id, v_action;
END;
$$ LANGUAGE plpgsql;

-- Function to handle upsert for bell_schedules
CREATE OR REPLACE FUNCTION upsert_bell_schedule(
  p_provider_id UUID,
  p_school_id TEXT,
  p_grade_level TEXT,
  p_period_name TEXT,
  p_day_of_week INTEGER,
  p_start_time TIME,
  p_end_time TIME,
  p_school_site TEXT,
  p_content_hash VARCHAR(64)
) RETURNS TABLE (
  id UUID,
  action TEXT
) AS $$
DECLARE
  v_id UUID;
  v_action TEXT;
  v_existing_id UUID;
BEGIN
  -- Check if record exists
  SELECT bell_schedules.id INTO v_existing_id
  FROM bell_schedules
  WHERE provider_id = p_provider_id
    AND school_id = p_school_id
    AND grade_level = p_grade_level
    AND period_name = p_period_name
    AND day_of_week = p_day_of_week
    AND start_time = p_start_time;
  
  IF v_existing_id IS NOT NULL THEN
    -- Update existing record
    UPDATE bell_schedules
    SET end_time = p_end_time,
        content_hash = p_content_hash,
        updated_at = NOW()
    WHERE id = v_existing_id
    RETURNING bell_schedules.id INTO v_id;
    v_action := 'updated';
  ELSE
    -- Insert new record
    INSERT INTO bell_schedules (
      provider_id, school_id, grade_level, period_name, 
      day_of_week, start_time, end_time, school_site, content_hash
    ) VALUES (
      p_provider_id, p_school_id, p_grade_level, p_period_name,
      p_day_of_week, p_start_time, p_end_time, p_school_site, p_content_hash
    )
    RETURNING bell_schedules.id INTO v_id;
    v_action := 'inserted';
  END IF;
  
  RETURN QUERY SELECT v_id, v_action;
END;
$$ LANGUAGE plpgsql;

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