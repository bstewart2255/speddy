-- Reset all sessions to active status to clear false positives
-- The original migration was too aggressive in detecting conflicts
-- Teacher scheduling conflicts were flagged incorrectly (students from same class having sessions at the same time is normal)

UPDATE public.schedule_sessions
SET status = 'active',
    conflict_reason = NULL;

-- Now only flag ACTUAL conflicts:

-- Conflict type 1: Same student has overlapping sessions on the same day
WITH student_overlaps AS (
  SELECT DISTINCT ss1.id, 'Overlaps with another session for this student' as reason
  FROM public.schedule_sessions ss1
  INNER JOIN public.schedule_sessions ss2
    ON ss1.student_id = ss2.student_id
    AND ss1.day_of_week = ss2.day_of_week
    AND ss1.id != ss2.id
  WHERE
    ss1.start_time < ss2.end_time
    AND ss1.end_time > ss2.start_time
)
UPDATE public.schedule_sessions
SET
  status = 'needs_attention',
  conflict_reason = student_overlaps.reason
FROM student_overlaps
WHERE schedule_sessions.id = student_overlaps.id;

-- Conflict type 2: Session extends beyond 5:00 PM
UPDATE public.schedule_sessions
SET
  status = 'needs_attention',
  conflict_reason = CASE
    WHEN conflict_reason IS NOT NULL THEN conflict_reason || ' AND Session extends beyond 5:00 PM'
    ELSE 'Session extends beyond 5:00 PM'
  END
WHERE
  end_time > '17:00:00'::time;

-- Add comment
COMMENT ON TABLE public.schedule_sessions IS
  'Updated: Fixed false positive conflict detection. Only flags actual conflicts (same student overlaps, sessions after 5 PM).';
