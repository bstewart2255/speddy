-- Migration: Generate session instances from templates
-- Description: Creates 8 weeks of dated instances for all template sessions
-- This eliminates the need for temporary session IDs and ensures lessons/documents persist

WITH template_sessions AS (
  -- Get all template sessions (scheduled but without dates)
  SELECT *
  FROM schedule_sessions
  WHERE session_date IS NULL
    AND day_of_week IS NOT NULL
    AND start_time IS NOT NULL
    AND end_time IS NOT NULL
),
date_series AS (
  -- Generate next 8 weeks of dates for each template
  -- Calculates the next occurrence of each day_of_week and generates 8 instances
  SELECT
    t.id as template_id,
    t.student_id,
    t.provider_id,
    t.day_of_week,
    t.start_time,
    t.end_time,
    t.service_type,
    t.delivered_by,
    t.assigned_to_specialist_id,
    t.assigned_to_sea_id,
    t.manually_placed,
    t.group_id,
    t.group_name,
    t.status,
    d.instance_date
  FROM template_sessions t
  CROSS JOIN LATERAL (
    SELECT
      (CURRENT_DATE + (n * 7) +
        ((t.day_of_week - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7)
      )::date as instance_date
    FROM generate_series(0, 7) n
  ) d
),
new_instances AS (
  -- Filter out instances that already exist
  SELECT
    ds.student_id,
    ds.provider_id,
    ds.day_of_week,
    ds.start_time,
    ds.end_time,
    ds.service_type,
    ds.instance_date as session_date,
    ds.delivered_by,
    ds.assigned_to_specialist_id,
    ds.assigned_to_sea_id,
    ds.manually_placed,
    ds.group_id,
    ds.group_name,
    ds.status,
    false as student_absent,
    false as outside_schedule_conflict,
    false as is_completed
  FROM date_series ds
  WHERE NOT EXISTS (
    SELECT 1
    FROM schedule_sessions existing
    WHERE existing.student_id = ds.student_id
      AND existing.session_date = ds.instance_date
      AND existing.start_time = ds.start_time
  )
)
-- Insert the new instances
INSERT INTO schedule_sessions (
  student_id,
  provider_id,
  day_of_week,
  start_time,
  end_time,
  service_type,
  session_date,
  delivered_by,
  assigned_to_specialist_id,
  assigned_to_sea_id,
  manually_placed,
  group_id,
  group_name,
  status,
  student_absent,
  outside_schedule_conflict,
  is_completed
)
SELECT * FROM new_instances
-- Note: This relies on the 'unique_session_per_date' constraint
-- which creates a unique index on (student_id, session_date, start_time)
ON CONFLICT (student_id, session_date, start_time)
DO NOTHING;

-- Show summary
SELECT
  COUNT(*) FILTER (WHERE session_date IS NULL AND day_of_week IS NOT NULL) as template_count,
  COUNT(*) FILTER (WHERE session_date IS NOT NULL) as instance_count
FROM schedule_sessions;
