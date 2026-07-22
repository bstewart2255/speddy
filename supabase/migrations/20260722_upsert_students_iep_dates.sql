-- SPE-303: make bulk-import write the SEIS "IEP Dates" report's two compliance
-- dates into student_details (upcoming_iep_date, upcoming_triennial_date).
--
-- Background: the unified import now accepts a 4th file type — the SEIS "IEP
-- Dates" report — which fills in each matched student's Upcoming IEP Date (Date
-- of Next Annual Plan Review) and Upcoming Triennial IEP Date (Date of Next
-- Reevaluation). The confirm route carries the two dates on each student row,
-- ISO YYYY-MM-DD, presence-keyed: a date field is present only when the file
-- supplied a parseable value.
--
-- Fix: write both columns in the insert branch (a new student created from the
-- goals file may also match the IEP Dates file) and, presence-keyed like the
-- teacher columns, in the update branch's student_details upsert. "File wins":
-- when a date IS present it overwrites the stored value; when absent, the stored
-- value is left untouched, so an import WITHOUT this file never nulls a date.
--
-- Both columns already exist on public.student_details (type date, nullable), so
-- this is a function replacement only — no schema change. Everything else in this
-- function is reproduced verbatim from the current live definition (SPE-284
-- student_details upsert, post-SPE-261 auth binding, post-SPE-251 teacher_name,
-- and the SPE-289 `pg_temp`-last search_path pin — preserved here since this
-- CREATE OR REPLACE runs after that ALTER and would otherwise silently drop it).

CREATE OR REPLACE FUNCTION public.upsert_students_atomic(
  p_provider_id uuid,
  p_students jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  v_provider_role text;
BEGIN
  -- Defense-in-depth (SPE-261): this SECURITY DEFINER function bypasses RLS, so
  -- bind it to the caller — reject any p_provider_id that isn't the authenticated
  -- user, and fail closed when there is no JWT. The confirm route (the only
  -- caller) passes the authenticated user's id via the JWT-authenticated client,
  -- so legitimate calls are unaffected; this stops a signed-in client from
  -- calling the RPC directly with someone else's provider id.
  IF auth.uid() IS NULL OR p_provider_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Look up the provider's role to use as service_type
  SELECT role INTO v_provider_role
  FROM public.profiles
  WHERE id = p_provider_id;

  -- Default to 'resource' if role not found
  v_provider_role := COALESCE(v_provider_role, 'resource');

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

          -- Insert student_details record (SPE-303: carry the IEP Dates report's
          -- two dates when the new student also matched that file; NULL otherwise).
          INSERT INTO public.student_details (
            student_id,
            first_name,
            last_name,
            iep_goals,
            upcoming_iep_date,
            upcoming_triennial_date
          )
          VALUES (
            v_new_student_id,
            v_student->>'firstName',
            v_student->>'lastName',
            ARRAY(SELECT jsonb_array_elements_text(v_student->'goals')),
            (v_student->>'upcomingIepDate')::date,
            (v_student->>'upcomingTriennialDate')::date
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
              v_provider_role,  -- Use provider's role instead of hardcoded value
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
          -- Ownership: only the caller's own students may be updated. p_provider_id
          -- is bound to auth.uid() at the top of this function (SPE-261), so this
          -- also confirms the row belongs to the authenticated caller.
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

          -- Upsert student_details (SPE-284). A plain UPDATE dropped the incoming
          -- name for any student with no details row yet (pre-existing rows, plus
          -- roster-template / manual-add students). INSERT ... ON CONFLICT ensures
          -- the row exists so enrichment names persist. Name COALESCE and the
          -- goals-only-when-provided rule are unchanged; a fresh insert with no
          -- goals defaults to an empty array (matching the insert branch).
          --
          -- SPE-303: the IEP Dates report's two dates are presence-keyed like the
          -- teacher columns above — a present date overwrites (file wins); an
          -- absent one preserves the stored value. On the fresh-insert side of the
          -- conflict, an absent key resolves to NULL, matching the insert branch.
          INSERT INTO public.student_details (
            student_id,
            first_name,
            last_name,
            iep_goals,
            upcoming_iep_date,
            upcoming_triennial_date
          )
          VALUES (
            v_student_id,
            v_student->>'firstName',
            v_student->>'lastName',
            CASE
              WHEN v_student ? 'goals' AND jsonb_array_length(v_student->'goals') > 0
              THEN ARRAY(SELECT jsonb_array_elements_text(v_student->'goals'))
              ELSE '{}'::text[]
            END,
            (v_student->>'upcomingIepDate')::date,
            (v_student->>'upcomingTriennialDate')::date
          )
          ON CONFLICT (student_id) DO UPDATE
          SET
            first_name = COALESCE(EXCLUDED.first_name, student_details.first_name),
            last_name = COALESCE(EXCLUDED.last_name, student_details.last_name),
            iep_goals = CASE
              WHEN v_student ? 'goals' AND jsonb_array_length(v_student->'goals') > 0
              THEN EXCLUDED.iep_goals
              ELSE student_details.iep_goals
            END,
            upcoming_iep_date = CASE
              WHEN v_student ? 'upcomingIepDate' THEN (v_student->>'upcomingIepDate')::date
              ELSE student_details.upcoming_iep_date
            END,
            upcoming_triennial_date = CASE
              WHEN v_student ? 'upcomingTriennialDate' THEN (v_student->>'upcomingTriennialDate')::date
              ELSE student_details.upcoming_triennial_date
            END,
            updated_at = now();

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

COMMENT ON FUNCTION public.upsert_students_atomic(uuid, jsonb) IS
  'Atomically processes an array of student upsert operations (insert, update, or skip).
   Each student object should have an "action" field and appropriate data fields.
   Update upserts student_details so an added name persists even when the row had
   none (SPE-284). Insert and update now also write the SEIS IEP Dates report''s
   upcoming_iep_date / upcoming_triennial_date, presence-keyed so an import without
   that file never nulls them (SPE-303). Returns summary counts and detailed
   results for each student.';

GRANT EXECUTE ON FUNCTION public.upsert_students_atomic(uuid, jsonb) TO authenticated;
