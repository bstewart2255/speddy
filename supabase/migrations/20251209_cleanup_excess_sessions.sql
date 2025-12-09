-- Cleanup migration: Remove excess sessions that were created due to RLS bug
-- The bug: session-requirement-sync.ts used browser client in server context,
-- causing RLS to return 0 sessions, and then creating new sessions for every sync

-- This migration keeps the correct number of sessions (sessions_per_week) per student
-- Priority: Keep scheduled/completed sessions, delete unscheduled duplicates

DO $$
DECLARE
  v_student RECORD;
  v_sessions_to_delete uuid[];
  v_total_deleted integer := 0;
  v_students_affected integer := 0;
BEGIN
  -- Loop through students with excess sessions
  FOR v_student IN
    SELECT
      s.id as student_id,
      s.initials,
      s.sessions_per_week,
      COUNT(ss.id) FILTER (WHERE ss.is_completed = false) as active_sessions
    FROM students s
    LEFT JOIN schedule_sessions ss ON s.id = ss.student_id
    WHERE s.sessions_per_week IS NOT NULL
    GROUP BY s.id, s.initials, s.sessions_per_week
    HAVING COUNT(ss.id) FILTER (WHERE ss.is_completed = false) > s.sessions_per_week
  LOOP
    -- Find excess sessions to delete for this student
    -- Priority: Delete unscheduled active sessions first, then scheduled active sessions (later days/times first)
    -- Keep completed sessions as they represent actual delivered services
    WITH sessions_ranked AS (
      SELECT
        ss.id,
        ss.day_of_week,
        ss.start_time,
        ss.is_completed,
        ROW_NUMBER() OVER (
          ORDER BY
            -- Priority 1: Keep completed sessions (rank them first so they're kept)
            CASE WHEN ss.is_completed THEN 0 ELSE 1 END,
            -- Priority 2: Keep scheduled sessions over unscheduled
            CASE WHEN ss.day_of_week IS NOT NULL THEN 0 ELSE 1 END,
            -- Priority 3: Keep earlier days
            COALESCE(ss.day_of_week, 99),
            -- Priority 4: Keep earlier times
            COALESCE(ss.start_time, '23:59:59'),
            -- Priority 5: Keep older sessions
            ss.created_at
        ) as keep_rank
      FROM schedule_sessions ss
      WHERE ss.student_id = v_student.student_id
        AND ss.is_completed = false  -- Only consider active sessions for deletion
    )
    SELECT array_agg(id) INTO v_sessions_to_delete
    FROM sessions_ranked
    WHERE keep_rank > v_student.sessions_per_week;

    -- Delete the excess sessions
    IF v_sessions_to_delete IS NOT NULL AND array_length(v_sessions_to_delete, 1) > 0 THEN
      DELETE FROM schedule_sessions WHERE id = ANY(v_sessions_to_delete);

      v_total_deleted := v_total_deleted + array_length(v_sessions_to_delete, 1);
      v_students_affected := v_students_affected + 1;

      RAISE NOTICE 'Student % (%): Deleted % excess sessions (had %, keeping %)',
        v_student.initials,
        v_student.student_id,
        array_length(v_sessions_to_delete, 1),
        v_student.active_sessions,
        v_student.sessions_per_week;
    END IF;
  END LOOP;

  RAISE NOTICE '=== CLEANUP COMPLETE ===';
  RAISE NOTICE 'Total sessions deleted: %', v_total_deleted;
  RAISE NOTICE 'Students affected: %', v_students_affected;
END $$;
