-- SPE-278: Harden get_scheduling_data_batch — bind p_provider_id to auth.uid().
--
-- public.get_scheduling_data_batch(uuid, text) is SECURITY DEFINER (owner
-- postgres, so it bypasses RLS) and authenticated holds EXECUTE, so it is
-- reachable at POST /rest/v1/rpc/get_scheduling_data_batch. The body filters
-- only by the two caller-supplied arguments and performs no auth.uid() check —
-- any signed-in user could pass another provider's p_provider_id and read that
-- provider's caseload and sessions (students, schedule_sessions incl.
-- session_notes, bell schedules, school hours, etc.).
--
-- Fix (Option 3 from the 0029 advisor lint): keep the function exposed to
-- authenticated but validate the caller — reject any p_provider_id that isn't
-- the authenticated user, and fail closed when there is no JWT. Same guard
-- already shipped on the sibling SECURITY DEFINER RPCs merge_iep_goals
-- (SPE-259) and upsert_students_atomic (SPE-261).
--
-- Behavior-preserving: every call site passes the caller's own id. The only
-- caller is SchedulingDataManager.loadAllData (lib/scheduling/
-- scheduling-data-manager.ts), whose providerId is set by initialize(...), and
-- every initialize()/OptimizedScheduler(...) construction in the app passes
-- user.id (use-scheduling-data.ts, use-auto-schedule.ts). The app also falls
-- back to parallel queries if the RPC errors (SPE-56), so even the error path
-- is graceful.
--
-- The body below is reproduced verbatim from the live prod definition
-- (pg_get_functiondef) — prod has drifted from 20250815_scheduling_batch_rpc.sql
-- (CTE rewrite, search_path pin, added students/metadata keys; see SPE-116) —
-- so only the guard is added and the current behavior is not regressed.
--
-- NOTE: the reproduced body carries a known, pre-existing defect — the
-- work_schedule CTE compares user_site_schedules.site_id (uuid) to p_school_site
-- (text), so the RPC errors at plan time and the app falls back to parallel
-- queries (SPE-56). That is deliberately left unchanged here to keep this a
-- behavior-preserving security fix; the body bug is tracked in SPE-305.

CREATE OR REPLACE FUNCTION public.get_scheduling_data_batch(p_provider_id uuid, p_school_site text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- Defense-in-depth (SPE-278): SECURITY DEFINER bypasses RLS, so bind to caller.
  IF auth.uid() IS NULL OR p_provider_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  WITH
  work_schedule AS (
    SELECT json_agg(
      json_build_object(
        'day_of_week', uss.day_of_week,
        'site_id', uss.site_id
      )
    ) as data
    FROM user_site_schedules uss
    WHERE uss.user_id = p_provider_id
      AND uss.site_id = p_school_site
  ),
  bell_schedules AS (
    SELECT json_agg(row_to_json(bs.*)) as data
    FROM bell_schedules bs
    WHERE bs.provider_id = p_provider_id
      AND bs.school_site = p_school_site
  ),
  special_activities AS (
    SELECT json_agg(row_to_json(sa.*)) as data
    FROM special_activities sa
    WHERE sa.provider_id = p_provider_id
      AND sa.school_site = p_school_site
  ),
  existing_sessions AS (
    SELECT json_agg(
      json_build_object(
        'id', ss.id,
        'student_id', ss.student_id,
        'day_of_week', ss.day_of_week,
        'start_time', ss.start_time,
        'end_time', ss.end_time,
        'service_type', ss.service_type,
        'assigned_to_sea_id', ss.assigned_to_sea_id,
        'delivered_by', ss.delivered_by,
        'completed_at', ss.completed_at,
        'completed_by', ss.completed_by,
        'session_notes', ss.session_notes,
        'provider_id', ss.provider_id,
        'created_at', ss.created_at,
        'updated_at', ss.updated_at,
        'student_grade', s.grade_level,
        'student_school', s.school_site
      )
    ) as data
    FROM schedule_sessions ss
    INNER JOIN students s ON ss.student_id = s.id
    WHERE ss.provider_id = p_provider_id
      AND s.school_site = p_school_site
      AND ss.session_date IS NULL -- Only recurring sessions
  ),
  school_hours AS (
    SELECT json_agg(row_to_json(sh.*)) as data
    FROM school_hours sh
    WHERE sh.provider_id = p_provider_id
      AND sh.school_site = p_school_site
  ),
  students AS (
    SELECT json_agg(
      json_build_object(
        'id', s.id,
        'grade_level', s.grade_level,
        'teacher_name', s.teacher_name,
        'school_site', s.school_site
      )
    ) as data
    FROM students s
    WHERE s.provider_id = p_provider_id
      AND s.school_site = p_school_site
  )
  SELECT json_build_object(
    'work_schedule', COALESCE(ws.data, '[]'::json),
    'bell_schedules', COALESCE(bs.data, '[]'::json),
    'special_activities', COALESCE(sa.data, '[]'::json),
    'existing_sessions', COALESCE(es.data, '[]'::json),
    'school_hours', COALESCE(sh.data, '[]'::json),
    'students', COALESCE(st.data, '[]'::json),
    'metadata', json_build_object(
      'provider_id', p_provider_id,
      'school_site', p_school_site,
      'fetched_at', NOW()
    )
  ) INTO result
  FROM
    (SELECT 1) dummy
    LEFT JOIN work_schedule ws ON true
    LEFT JOIN bell_schedules bs ON true
    LEFT JOIN special_activities sa ON true
    LEFT JOIN existing_sessions es ON true
    LEFT JOIN school_hours sh ON true
    LEFT JOIN students st ON true;

  RETURN result;
END;
$function$;

-- Re-assert the intended grant matrix (idempotent; CREATE OR REPLACE preserves
-- existing grants). anon EXECUTE was already revoked in SPE-10; only
-- authenticated is granted here, and postgres (owner) + service_role retain it.
REVOKE ALL ON FUNCTION public.get_scheduling_data_batch(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scheduling_data_batch(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.get_scheduling_data_batch(uuid, text) IS
  'Fetches all scheduling-related data for a provider and school in a single efficient query. Used to prevent N+1 query issues in the auto-scheduler. SPE-278: p_provider_id is bound to auth.uid() (SECURITY DEFINER RLS-bypass hardening).';
