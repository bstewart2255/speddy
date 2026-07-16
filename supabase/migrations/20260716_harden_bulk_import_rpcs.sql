-- SPE-261: Harden the bulk-import SECURITY DEFINER RPCs.
--
-- Follow-up to SPE-259 (merge_iep_goals). Two bulk-import RPCs share the same
-- shape as the function hardened there: SECURITY DEFINER (RLS-bypassing) with
-- ownership enforced only via the caller-supplied p_provider_id, and no binding
-- to auth.uid(). anon EXECUTE was already revoked in SPE-10 (migration
-- 20260529), so the residual exposure is an *authenticated* client calling the
-- RPC directly with another provider's id to write to students it doesn't own.
--
--   * upsert_students_atomic(uuid, jsonb) -- the active bulk write. Its only
--     caller is /api/import-students/confirm, which runs as the authenticated
--     user via the JWT (cookie) client, so auth.uid() is populated and equals
--     the p_provider_id it passes. Bind p_provider_id to auth.uid() (same guard
--     as merge_iep_goals) — legitimate calls are unaffected.
--   * import_student_atomic(...) -- dead. SPE-229 replaced the per-student write
--     with the batched upsert_students_atomic; nothing in the app, scripts, edge
--     functions, or any other DB object calls it. Drop it rather than guard an
--     unused RLS-bypassing function (removes the surface entirely).

-- ---------------------------------------------------------------------------
-- 1) Guard the active bulk upsert. Body is unchanged from the current
--    definition except for the auth.uid() guard added at the top of BEGIN and
--    the corrected ownership comment in the 'update' branch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_students_atomic(p_provider_id uuid, p_students jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- anon was already revoked in SPE-10; CREATE OR REPLACE preserves grants, but
-- re-assert the intended matrix explicitly (idempotent): only authenticated may
-- call it; postgres (owner) and service_role retain access.
REVOKE ALL ON FUNCTION public.upsert_students_atomic(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_students_atomic(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Drop the dead per-student import RPC. Superseded by the batched
--    upsert_students_atomic (SPE-229); no caller remains in the app, scripts,
--    edge functions, or any other DB object. Dropping removes an unused
--    RLS-bypassing SECURITY DEFINER function rather than guarding it.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.import_student_atomic(
  uuid, text, text, text, text, text, text, text, text, text[], integer, integer, uuid
);
