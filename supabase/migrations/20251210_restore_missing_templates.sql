-- Migration: Restore missing templates after Dec 8-9 data corruption
-- Issue: GitHub #440
--
-- Root cause:
--   Dec 8: Backfill migration only counted status='active' sessions, creating excess unscheduled
--   Dec 9: Cleanup migration deleted templates instead of just unscheduled sessions
--
-- This migration:
--   1. Resets incorrectly completed templates
--   2. Converts dated instances back to templates to fill gaps
--   3. Creates unscheduled sessions for any remaining gaps

-- =============================================================================
-- STEP 1: Reset incorrectly completed templates
-- =============================================================================
-- Templates should never be is_completed = true (only dated instances can be completed)

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM schedule_sessions
  WHERE session_date IS NULL
    AND day_of_week IS NOT NULL
    AND is_completed = true;

  IF v_count > 0 THEN
    UPDATE schedule_sessions
    SET is_completed = false, completed_at = NULL, completed_by = NULL
    WHERE session_date IS NULL
      AND day_of_week IS NOT NULL
      AND is_completed = true;

    RAISE NOTICE 'Step 1: Reset % incorrectly completed templates', v_count;
  ELSE
    RAISE NOTICE 'Step 1: No completed templates found to reset';
  END IF;
END $$;

-- =============================================================================
-- STEP 2: Convert dated instances to templates
-- =============================================================================
-- For students missing templates, convert earliest dated instances back to templates
-- This preserves the existing schedule positions (day/time)

DO $$
DECLARE
  v_student RECORD;
  v_instance RECORD;
  v_templates_needed integer;
  v_converted integer := 0;
  v_total_converted integer := 0;
BEGIN
  -- Find students with missing templates (counting BOTH scheduled AND unscheduled)
  -- Only convert instances if total templates < sessions_per_week
  FOR v_student IN
    SELECT
      s.id as student_id,
      s.initials,
      s.sessions_per_week,
      s.sessions_per_week - (
        COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NOT NULL AND ss.is_completed = false)
        + COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NULL)
      ) as templates_needed
    FROM students s
    LEFT JOIN schedule_sessions ss ON s.id = ss.student_id
    WHERE s.sessions_per_week IS NOT NULL AND s.sessions_per_week > 0
    GROUP BY s.id, s.initials, s.sessions_per_week
    HAVING s.sessions_per_week > (
      COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NOT NULL AND ss.is_completed = false)
      + COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NULL)
    )
  LOOP
    v_templates_needed := v_student.templates_needed;
    v_converted := 0;

    -- Convert dated instances to templates (earliest dates first)
    -- Group by day_of_week/start_time to avoid creating duplicate templates
    FOR v_instance IN
      SELECT DISTINCT ON (day_of_week, start_time)
        id, day_of_week, start_time, session_date
      FROM schedule_sessions
      WHERE student_id = v_student.student_id
        AND session_date IS NOT NULL  -- Is a dated instance
        AND day_of_week IS NOT NULL
        AND start_time IS NOT NULL
        -- Don't convert if a template already exists for this slot
        AND NOT EXISTS (
          SELECT 1 FROM schedule_sessions t
          WHERE t.student_id = v_student.student_id
            AND t.session_date IS NULL
            AND t.day_of_week = schedule_sessions.day_of_week
            AND t.start_time = schedule_sessions.start_time
        )
      ORDER BY day_of_week, start_time, session_date ASC  -- Earliest date first
      LIMIT v_templates_needed
    LOOP
      -- Convert this dated instance to a template
      UPDATE schedule_sessions
      SET session_date = NULL,
          is_completed = false,
          completed_at = NULL,
          completed_by = NULL
      WHERE id = v_instance.id;

      v_converted := v_converted + 1;
    END LOOP;

    IF v_converted > 0 THEN
      RAISE NOTICE 'Step 2: Student %: Converted % dated instances to templates (needed %)',
        v_student.initials, v_converted, v_templates_needed;
      v_total_converted := v_total_converted + v_converted;
    END IF;
  END LOOP;

  RAISE NOTICE 'Step 2: Total converted: % dated instances to templates', v_total_converted;
END $$;

-- =============================================================================
-- STEP 3: Create unscheduled sessions for remaining gaps
-- =============================================================================
-- If any students still have fewer templates than sessions_per_week, create unscheduled

DO $$
DECLARE
  v_student RECORD;
  v_sessions_to_create integer;
  v_total_created integer := 0;
BEGIN
  FOR v_student IN
    SELECT
      s.id as student_id,
      s.initials,
      s.provider_id,
      s.sessions_per_week,
      s.sessions_per_week - (
        COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NOT NULL AND ss.is_completed = false)
        + COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NULL)
      ) as gap
    FROM students s
    LEFT JOIN schedule_sessions ss ON s.id = ss.student_id
    WHERE s.sessions_per_week IS NOT NULL AND s.sessions_per_week > 0
    GROUP BY s.id, s.initials, s.provider_id, s.sessions_per_week
    HAVING s.sessions_per_week > (
      COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NOT NULL AND ss.is_completed = false)
      + COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NULL)
    )
  LOOP
    v_sessions_to_create := v_student.gap;

    INSERT INTO schedule_sessions (
      student_id,
      provider_id,
      day_of_week,
      start_time,
      end_time,
      service_type,
      status,
      delivered_by,
      is_completed
    )
    SELECT
      v_student.student_id,
      v_student.provider_id,
      NULL,  -- unscheduled
      NULL,
      NULL,
      'resource',
      'active',
      'provider',
      false
    FROM generate_series(1, v_sessions_to_create);

    RAISE NOTICE 'Step 3: Student %: Created % unscheduled sessions',
      v_student.initials, v_sessions_to_create;
    v_total_created := v_total_created + v_sessions_to_create;
  END LOOP;

  IF v_total_created > 0 THEN
    RAISE NOTICE 'Step 3: Total created: % unscheduled sessions', v_total_created;
  ELSE
    RAISE NOTICE 'Step 3: No unscheduled sessions needed (all gaps filled by Step 2)';
  END IF;
END $$;

-- =============================================================================
-- VERIFICATION: Check results
-- =============================================================================

DO $$
DECLARE
  v_mismatched integer;
BEGIN
  SELECT COUNT(*) INTO v_mismatched
  FROM (
    SELECT s.id, s.initials, s.sessions_per_week,
      COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NOT NULL AND ss.is_completed = false)
      + COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NULL) as total
    FROM students s
    LEFT JOIN schedule_sessions ss ON s.id = ss.student_id
    WHERE s.sessions_per_week IS NOT NULL AND s.sessions_per_week > 0
    GROUP BY s.id, s.initials, s.sessions_per_week
    HAVING s.sessions_per_week != (
      COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NOT NULL AND ss.is_completed = false)
      + COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NULL)
    )
  ) mismatched;

  IF v_mismatched = 0 THEN
    RAISE NOTICE '✓ VERIFICATION PASSED: All students have correct session counts';
  ELSE
    RAISE WARNING '✗ VERIFICATION FAILED: % students still have mismatched counts', v_mismatched;
  END IF;
END $$;
