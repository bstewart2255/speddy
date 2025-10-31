-- Migration: Cleanup duplicate sessions and enforce session count invariant
-- Purpose: Fix existing data where students have more sessions than their sessions_per_week requirement
-- This addresses a bug where the auto-scheduler was INSERTing new sessions instead of UPDATing unscheduled ones

-- Create a function to clean up duplicate sessions for a specific student
CREATE OR REPLACE FUNCTION cleanup_duplicate_sessions_for_student(
  p_student_id uuid,
  p_target_count integer
) RETURNS TABLE (
  deleted_count integer,
  session_ids_deleted uuid[]
) AS $$
DECLARE
  v_current_count integer;
  v_deleted_count integer;
  v_sessions_to_delete uuid[];
BEGIN
  -- Get current total session count
  SELECT COUNT(*)
  INTO v_current_count
  FROM schedule_sessions
  WHERE student_id = p_student_id
    AND is_completed = false;

  -- If count is correct or less, no cleanup needed
  IF v_current_count <= p_target_count THEN
    RETURN QUERY SELECT 0::integer, ARRAY[]::uuid[];
    RETURN;
  END IF;

  -- Calculate how many to delete
  v_deleted_count := v_current_count - p_target_count;

  -- Select sessions to delete (prioritize unscheduled first, then scheduled by day/time)
  -- This preserves already-scheduled sessions when possible
  SELECT ARRAY_AGG(id)
  INTO v_sessions_to_delete
  FROM (
    SELECT id
    FROM schedule_sessions
    WHERE student_id = p_student_id
      AND is_completed = false
    ORDER BY
      -- Prioritize deleting unscheduled sessions (day_of_week IS NULL)
      CASE WHEN day_of_week IS NULL THEN 0 ELSE 1 END,
      -- Among scheduled sessions, delete latest ones first
      day_of_week DESC NULLS FIRST,
      start_time DESC NULLS FIRST,
      created_at DESC
    LIMIT v_deleted_count
  ) sessions_to_remove;

  -- Delete the selected sessions
  DELETE FROM schedule_sessions
  WHERE id = ANY(v_sessions_to_delete);

  -- Return results
  RETURN QUERY SELECT v_deleted_count, v_sessions_to_delete;
END;
$$ LANGUAGE plpgsql;

-- Perform the cleanup for all students with excess sessions
DO $$
DECLARE
  v_student RECORD;
  v_result RECORD;
  v_total_students_cleaned integer := 0;
  v_total_sessions_deleted integer := 0;
BEGIN
  RAISE NOTICE 'Starting cleanup of duplicate sessions...';

  -- Find all students where total sessions > sessions_per_week
  FOR v_student IN
    SELECT
      s.id,
      s.initials,
      s.sessions_per_week,
      COUNT(ss.id) as current_session_count
    FROM students s
    INNER JOIN schedule_sessions ss ON ss.student_id = s.id
    WHERE s.sessions_per_week IS NOT NULL
      AND s.sessions_per_week > 0
      AND ss.is_completed = false
    GROUP BY s.id, s.initials, s.sessions_per_week
    HAVING COUNT(ss.id) > s.sessions_per_week
  LOOP
    -- Clean up this student's duplicate sessions
    SELECT * INTO v_result
    FROM cleanup_duplicate_sessions_for_student(
      v_student.id,
      v_student.sessions_per_week
    );

    IF v_result.deleted_count > 0 THEN
      v_total_students_cleaned := v_total_students_cleaned + 1;
      v_total_sessions_deleted := v_total_sessions_deleted + v_result.deleted_count;

      RAISE NOTICE 'Student %: Deleted % excess sessions (had %, needs %)',
        v_student.initials,
        v_result.deleted_count,
        v_student.current_session_count,
        v_student.sessions_per_week;
    END IF;
  END LOOP;

  RAISE NOTICE 'Cleanup complete: % students processed, % excess sessions deleted',
    v_total_students_cleaned,
    v_total_sessions_deleted;
END;
$$;

-- Add a helpful comment explaining the invariant
COMMENT ON TABLE schedule_sessions IS 'Sessions for students. Invariant: For each student, COUNT(sessions WHERE is_completed=false) should equal students.sessions_per_week';

-- Note: We intentionally do NOT add a database constraint here because:
-- 1. The constraint would need to be checked after every operation, which could impact performance
-- 2. There are valid temporary states during updates where the count might be off
-- 3. The application-level logic now enforces this invariant correctly
-- 4. A constraint would make legitimate bulk operations more complex

-- Clean up the helper function (no longer needed after migration)
DROP FUNCTION cleanup_duplicate_sessions_for_student(uuid, integer);
