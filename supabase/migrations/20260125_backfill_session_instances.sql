-- Backfill session instances through June 30, 2026
-- Run this migration to generate instances for all existing templates

WITH date_series AS (
  SELECT generate_series(
    CURRENT_DATE,
    '2026-06-30'::date,
    '1 day'::interval
  )::date as instance_date
),
templates AS (
  SELECT *
  FROM schedule_sessions
  WHERE session_date IS NULL
    AND day_of_week IS NOT NULL
    AND start_time IS NOT NULL
    AND end_time IS NOT NULL
    AND student_id IS NOT NULL
    AND provider_id IS NOT NULL
),
dates_to_create AS (
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
  FROM templates t
  CROSS JOIN date_series d
  WHERE EXTRACT(DOW FROM d.instance_date) = t.day_of_week
),
new_instances AS (
  SELECT dtc.*
  FROM dates_to_create dtc
  WHERE NOT EXISTS (
    SELECT 1 FROM schedule_sessions ss
    WHERE ss.student_id = dtc.student_id
      AND ss.provider_id = dtc.provider_id
      AND ss.day_of_week = dtc.day_of_week
      AND ss.start_time = dtc.start_time
      AND ss.end_time = dtc.end_time
      AND ss.service_type = dtc.service_type
      AND ss.session_date = dtc.instance_date
  )
)
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
  is_completed,
  template_id,
  is_template
)
SELECT
  student_id,
  provider_id,
  day_of_week,
  start_time,
  end_time,
  service_type,
  instance_date,
  delivered_by,
  assigned_to_specialist_id,
  assigned_to_sea_id,
  manually_placed,
  group_id,
  group_name,
  status,
  false,
  false,
  false,
  template_id,
  false
FROM new_instances;
