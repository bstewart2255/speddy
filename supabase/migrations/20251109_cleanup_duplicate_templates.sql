-- Migration: Cleanup duplicate template sessions
-- Description: Removes duplicate template sessions, keeping only the oldest template from each group
-- This fixes the issue where multiple templates exist for the same student/day/time

-- First, let's identify what we're about to delete (for logging)
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT id
    FROM schedule_sessions s
    WHERE session_date IS NULL
      AND day_of_week IS NOT NULL
      AND start_time IS NOT NULL
      AND id NOT IN (
        -- Keep the oldest template from each duplicate group
        SELECT DISTINCT ON (student_id, day_of_week, start_time, end_time, service_type)
          id
        FROM schedule_sessions
        WHERE session_date IS NULL
          AND day_of_week IS NOT NULL
          AND start_time IS NOT NULL
        ORDER BY student_id, day_of_week, start_time, end_time, service_type, created_at ASC NULLS LAST, id ASC
      )
      AND EXISTS (
        -- Only delete if there are actually duplicates for this combination
        SELECT 1
        FROM schedule_sessions s2
        WHERE s2.student_id = s.student_id
          AND s2.day_of_week = s.day_of_week
          AND s2.start_time = s.start_time
          AND s2.end_time = s.end_time
          AND s2.service_type = s.service_type
          AND s2.session_date IS NULL
        GROUP BY s2.student_id, s2.day_of_week, s2.start_time, s2.end_time, s2.service_type
        HAVING COUNT(*) > 1
      )
  ) duplicates;

  RAISE NOTICE 'Found % duplicate templates to delete', duplicate_count;
END $$;

-- Delete duplicate templates, keeping only the oldest one from each group
DELETE FROM schedule_sessions
WHERE id IN (
  SELECT id
  FROM schedule_sessions s
  WHERE session_date IS NULL
    AND day_of_week IS NOT NULL
    AND start_time IS NOT NULL
    AND id NOT IN (
      -- Keep the oldest template from each duplicate group
      SELECT DISTINCT ON (student_id, day_of_week, start_time, end_time, service_type)
        id
      FROM schedule_sessions
      WHERE session_date IS NULL
        AND day_of_week IS NOT NULL
        AND start_time IS NOT NULL
      ORDER BY student_id, day_of_week, start_time, end_time, service_type, created_at ASC NULLS LAST, id ASC
    )
    AND EXISTS (
      -- Only delete if there are actually duplicates for this combination
      SELECT 1
      FROM schedule_sessions s2
      WHERE s2.student_id = s.student_id
        AND s2.day_of_week = s.day_of_week
        AND s2.start_time = s.start_time
        AND s2.end_time = s.end_time
        AND s2.service_type = s.service_type
        AND s2.session_date IS NULL
      GROUP BY s2.student_id, s2.day_of_week, s2.start_time, s2.end_time, s2.service_type
      HAVING COUNT(*) > 1
    )
);

-- Show final counts
SELECT
  COUNT(*) FILTER (WHERE session_date IS NULL AND day_of_week IS NOT NULL) as remaining_templates,
  COUNT(*) FILTER (WHERE session_date IS NOT NULL) as total_instances
FROM schedule_sessions;
