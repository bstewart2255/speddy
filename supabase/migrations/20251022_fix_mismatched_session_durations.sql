-- Fix existing sessions where duration doesn't match student requirements
-- Recalculates end_time for all sessions based on current student.minutes_per_session
-- Marks any resulting conflicts as 'needs_attention'

-- Function to recalculate session end time based on student's current requirements
CREATE OR REPLACE FUNCTION recalculate_session_end_time(
  p_start_time time,
  p_minutes_per_session integer
)
RETURNS time
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_start_minutes integer;
  v_end_minutes integer;
  v_hours integer;
  v_minutes integer;
BEGIN
  -- Convert start time to total minutes since midnight
  v_start_minutes := (EXTRACT(HOUR FROM p_start_time) * 60) + EXTRACT(MINUTE FROM p_start_time);

  -- Add session duration
  v_end_minutes := v_start_minutes + p_minutes_per_session;

  -- Handle wrap-around past midnight (shouldn't happen in practice)
  IF v_end_minutes >= 1440 THEN
    v_end_minutes := 1439; -- Cap at 23:59
  END IF;

  -- Convert back to hours and minutes
  v_hours := v_end_minutes / 60;
  v_minutes := v_end_minutes % 60;

  -- Return as time
  RETURN make_time(v_hours, v_minutes, 0);
END;
$$;

-- Update all sessions to match current student requirements
UPDATE public.schedule_sessions ss
SET
  end_time = recalculate_session_end_time(ss.start_time::time, s.minutes_per_session),
  status = 'active', -- Reset to active, will detect conflicts next
  conflict_reason = NULL
FROM public.students s
WHERE ss.student_id = s.id
  AND s.minutes_per_session IS NOT NULL;

-- Detect and mark sessions that now have conflicts
-- Conflict type 1: Session overlaps with another session for the same student
WITH overlapping_sessions AS (
  SELECT DISTINCT ss1.id
  FROM public.schedule_sessions ss1
  INNER JOIN public.schedule_sessions ss2
    ON ss1.student_id = ss2.student_id
    AND ss1.day_of_week = ss2.day_of_week
    AND ss1.id != ss2.id
  WHERE
    -- Check if time ranges overlap
    ss1.start_time < ss2.end_time
    AND ss1.end_time > ss2.start_time
)
UPDATE public.schedule_sessions
SET
  status = 'needs_attention',
  conflict_reason = 'Overlaps with another session for this student'
WHERE id IN (SELECT id FROM overlapping_sessions);

-- Conflict type 2: Session extends beyond reasonable school hours (after 5 PM)
UPDATE public.schedule_sessions
SET
  status = 'needs_attention',
  conflict_reason = 'Session extends beyond 5:00 PM'
WHERE
  end_time > '17:00:00'::time
  AND status = 'active'; -- Don't overwrite existing conflict reasons

-- Teacher conflict detection removed: recognized as a false positive
-- It's normal for multiple students from the same classroom teacher to have
-- sessions at the same time (that's when they're pulled out of class)

-- Add comment
COMMENT ON FUNCTION recalculate_session_end_time IS
  'Helper function to recalculate session end time based on start time and duration in minutes';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION recalculate_session_end_time TO authenticated;
