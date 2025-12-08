-- Update upsert_students_atomic to create unscheduled sessions when schedule requirements increase
-- This fixes the issue where updating sessions_per_week didn't create actual session records

CREATE OR REPLACE FUNCTION public.upsert_students_atomic(
  p_provider_id uuid,
  p_students jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student jsonb;
  v_action text;
  v_student_id uuid;
  v_new_student_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_errors integer := 0;
  v_current_session_count integer;
  v_new_sessions_per_week integer;
  v_sessions_to_create integer;
  v_minutes_per_session integer;
BEGIN
  -- Loop through each student in the array
  FOR v_student IN SELECT * FROM jsonb_array_elements(p_students)
  LOOP
    v_action := v_student->>'action';
    v_student_id := (v_student->>'studentId')::uuid;

    BEGIN
      CASE v_action
        WHEN 'insert' THEN
          -- Insert new student record
          INSERT INTO public.students (
            provider_id,
            initials,
            grade_level,
            school_site,
            school_id,
            district_id,
            state_id,
            sessions_per_week,
            minutes_per_session,
            teacher_id,
            teacher_name
          )
          VALUES (
            p_provider_id,
            v_student->>'initials',
            v_student->>'gradeLevel',
            v_student->>'schoolSite',
            v_student->>'schoolId',
            v_student->>'districtId',
            v_student->>'stateId',
            (v_student->>'sessionsPerWeek')::integer,
            (v_student->>'minutesPerSession')::integer,
            (v_student->>'teacherId')::uuid,
            v_student->>'teacherName'
          )
          RETURNING id INTO v_new_student_id;

          -- Insert student_details record
          INSERT INTO public.student_details (
            student_id,
            first_name,
            last_name,
            iep_goals
          )
          VALUES (
            v_new_student_id,
            v_student->>'firstName',
            v_student->>'lastName',
            ARRAY(SELECT jsonb_array_elements_text(v_student->'goals'))
          );

          -- Create unscheduled sessions for new students
          v_new_sessions_per_week := (v_student->>'sessionsPerWeek')::integer;
          v_minutes_per_session := COALESCE((v_student->>'minutesPerSession')::integer, 30);

          IF v_new_sessions_per_week IS NOT NULL AND v_new_sessions_per_week > 0 THEN
            INSERT INTO public.schedule_sessions (
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
              v_new_student_id,
              p_provider_id,
              NULL,
              NULL,
              NULL,
              'speech_therapy',
              'active',
              'provider'
            FROM generate_series(1, v_new_sessions_per_week);
          END IF;

          v_inserted := v_inserted + 1;
          v_result := jsonb_build_object(
            'action', 'inserted',
            'studentId', v_new_student_id,
            'initials', v_student->>'initials',
            'success', true
          );

        WHEN 'update' THEN
          -- Verify student belongs to this provider (security check)
          IF NOT EXISTS (
            SELECT 1 FROM public.students
            WHERE id = v_student_id AND provider_id = p_provider_id
          ) THEN
            RAISE EXCEPTION 'Student % not found or not owned by provider', v_student_id;
          END IF;

          -- Get current active session count for this student
          SELECT COUNT(*) INTO v_current_session_count
          FROM public.schedule_sessions
          WHERE student_id = v_student_id AND status = 'active';

          -- Update students table (only non-null fields from the request)
          UPDATE public.students
          SET
            grade_level = COALESCE(v_student->>'gradeLevel', grade_level),
            sessions_per_week = COALESCE((v_student->>'sessionsPerWeek')::integer, sessions_per_week),
            minutes_per_session = COALESCE((v_student->>'minutesPerSession')::integer, minutes_per_session),
            teacher_id = CASE
              WHEN v_student ? 'teacherId' THEN (v_student->>'teacherId')::uuid
              ELSE teacher_id
            END,
            teacher_name = CASE
              WHEN v_student ? 'teacherName' THEN v_student->>'teacherName'
              ELSE teacher_name
            END,
            updated_at = now()
          WHERE id = v_student_id;

          -- Update student_details (goals are always replaced when provided)
          UPDATE public.student_details
          SET
            first_name = COALESCE(v_student->>'firstName', first_name),
            last_name = COALESCE(v_student->>'lastName', last_name),
            iep_goals = CASE
              WHEN v_student ? 'goals' AND jsonb_array_length(v_student->'goals') > 0
              THEN ARRAY(SELECT jsonb_array_elements_text(v_student->'goals'))
              ELSE iep_goals
            END,
            updated_at = now()
          WHERE student_id = v_student_id;

          -- Create additional unscheduled sessions if sessions_per_week increased
          v_new_sessions_per_week := (v_student->>'sessionsPerWeek')::integer;

          IF v_new_sessions_per_week IS NOT NULL AND v_new_sessions_per_week > v_current_session_count THEN
            v_sessions_to_create := v_new_sessions_per_week - v_current_session_count;

            INSERT INTO public.schedule_sessions (
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
              v_student_id,
              p_provider_id,
              NULL,
              NULL,
              NULL,
              'speech_therapy',
              'active',
              'provider'
            FROM generate_series(1, v_sessions_to_create);
          END IF;

          v_updated := v_updated + 1;
          v_result := jsonb_build_object(
            'action', 'updated',
            'studentId', v_student_id,
            'initials', v_student->>'initials',
            'success', true,
            'sessionsCreated', COALESCE(v_sessions_to_create, 0)
          );

        WHEN 'skip' THEN
          v_skipped := v_skipped + 1;
          v_result := jsonb_build_object(
            'action', 'skipped',
            'studentId', v_student_id,
            'initials', v_student->>'initials',
            'success', true
          );

        ELSE
          RAISE EXCEPTION 'Unknown action: %', v_action;
      END CASE;

    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
        v_result := jsonb_build_object(
          'action', v_action,
          'studentId', COALESCE(v_student_id, v_new_student_id),
          'initials', v_student->>'initials',
          'success', false,
          'error', SQLERRM
        );
    END;

    v_results := v_results || v_result;
  END LOOP;

  -- Return summary with detailed results
  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', v_errors,
    'results', v_results
  );
END;
$$;

-- Update comment
COMMENT ON FUNCTION public.upsert_students_atomic(uuid, jsonb) IS
  'Atomically processes an array of student upsert operations (insert, update, or skip).
   Now creates unscheduled session records when sessions_per_week is set or increased.
   Returns summary counts and detailed results for each student.';

-- Backfill: Create missing unscheduled sessions for students who have sessions_per_week
-- but fewer actual session records than required
DO $$
DECLARE
  v_student RECORD;
  v_sessions_to_create integer;
BEGIN
  FOR v_student IN
    SELECT
      s.id as student_id,
      s.provider_id,
      s.sessions_per_week,
      COUNT(ss.id) as current_count
    FROM students s
    LEFT JOIN schedule_sessions ss ON s.id = ss.student_id AND ss.status = 'active'
    WHERE s.sessions_per_week IS NOT NULL
      AND s.sessions_per_week > 0
    GROUP BY s.id, s.provider_id, s.sessions_per_week
    HAVING COUNT(ss.id) < s.sessions_per_week
  LOOP
    v_sessions_to_create := v_student.sessions_per_week - v_student.current_count;

    INSERT INTO public.schedule_sessions (
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
      v_student.student_id,
      v_student.provider_id,
      NULL,
      NULL,
      NULL,
      'speech_therapy',
      'active',
      'provider'
    FROM generate_series(1, v_sessions_to_create);

    RAISE NOTICE 'Created % sessions for student %', v_sessions_to_create, v_student.student_id;
  END LOOP;
END;
$$;
