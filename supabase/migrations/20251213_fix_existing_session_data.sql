-- Data migration to fix existing session data issues
-- See GitHub issue #459 for full context
--
-- This migration fixes two issues:
-- 1. Sessions with wrong service_type (doesn't match provider's role)
-- 2. Students with missing template sessions (template_count < sessions_per_week)

-- Part 1: Fix service_type to match provider's role
-- This updates all sessions where service_type doesn't match the provider's role
UPDATE schedule_sessions ss
SET service_type = p.role
FROM students s
JOIN profiles p ON s.provider_id = p.id
WHERE ss.student_id = s.id
  AND ss.service_type != p.role
  AND p.role IS NOT NULL;

-- Part 2: Create missing template sessions for student EN (Kim McCorkell's account)
-- EN has 1 template but sessions_per_week = 5, so needs 4 more
-- Student ID: 644aaf99-5c66-4d32-b108-f0b7ca8fc76e
-- Provider ID: (Kim McCorkell's ID)
INSERT INTO schedule_sessions (
  student_id,
  provider_id,
  day_of_week,
  start_time,
  end_time,
  service_type,
  status,
  delivered_by
)
SELECT
  s.id,
  s.provider_id,
  NULL,  -- Unscheduled
  NULL,
  NULL,
  p.role,  -- Use provider's role
  'active',
  'provider'
FROM students s
JOIN profiles p ON s.provider_id = p.id
CROSS JOIN generate_series(1,
  s.sessions_per_week - (
    SELECT COUNT(*)
    FROM schedule_sessions ss
    WHERE ss.student_id = s.id
      AND ss.session_date IS NULL
      AND ss.is_completed = false
  )
) AS missing
WHERE s.id = '644aaf99-5c66-4d32-b108-f0b7ca8fc76e'
  AND s.sessions_per_week > (
    SELECT COUNT(*)
    FROM schedule_sessions ss
    WHERE ss.student_id = s.id
      AND ss.session_date IS NULL
      AND ss.is_completed = false
  );

-- Add comment documenting this fix
COMMENT ON TABLE schedule_sessions IS 'Session schedule records. service_type should match the provider role from profiles table.';
