-- Update upsert_students_atomic to NOT create sessions for updates
-- Session syncing for updates will be handled by updateExistingSessionsForStudent in the API
-- This ensures file imports use the same session sync logic as manual UI updates

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
  v_new_sessions_per_week integer;
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

          -- Create unscheduled sessions for NEW students only
          v_new_sessions_per_week := (v_student->>'sessionsPerWeek')::integer;

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
          -- Security: Verify student belongs to this provider
          -- Note: We use p_provider_id (not auth.uid()) because this function is called from
          -- server-side API routes via service role. The API layer (withAuth middleware)
          -- handles authentication and passes the verified user ID as p_provider_id.
          IF NOT EXISTS (
            SELECT 1 FROM public.students
            WHERE id = v_student_id AND provider_id = p_provider_id
          ) THEN
            RAISE EXCEPTION 'Student % not found or not owned by provider', v_student_id;
          END IF;

          -- Update students table (only non-null fields from the request)
          -- NOTE: Session syncing is handled by updateExistingSessionsForStudent in the API
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

          v_updated := v_updated + 1;
          v_result := jsonb_build_object(
            'action', 'updated',
            'studentId', v_student_id,
            'initials', v_student->>'initials',
            'success', true
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
   For inserts: Creates student, details, and unscheduled sessions atomically.
   For updates: Updates student and details only. Session syncing is handled by the API.
   Returns summary counts and detailed results for each student.';
