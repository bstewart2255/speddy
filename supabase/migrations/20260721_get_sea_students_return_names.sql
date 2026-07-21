-- SPE-286: get_sea_students returned only iep_goals from student_details, so SEA
-- (view-only) users still saw initials-only on the shared Students page — providers
-- already see full names via getStudents after SPE-284. Return first_name/last_name
-- from the LEFT JOIN on student_details that the function already performs, so the
-- Students page can show the name for the SEA's assigned students.
--
-- Scope is UNCHANGED: rows are still restricted to ss.assigned_to_sea_id = auth.uid()
-- AND ss.delivered_by = 'sea', so an SEA only ever sees names for students they are
-- actually assigned to serve. Only the two name columns are added.
--
-- Changing the RETURNS TABLE shape is a return-type change, which CREATE OR REPLACE
-- cannot do, so this DROPs and re-creates. Body reproduced verbatim from the live
-- definition. ACL reproduced exactly (authenticated + service_role; no anon/PUBLIC).
-- search_path left as-is — SECURITY DEFINER search_path hardening is tracked in SPE-289.

DROP FUNCTION IF EXISTS public.get_sea_students(character varying, text, text);

CREATE OR REPLACE FUNCTION public.get_sea_students(
  p_school_id character varying DEFAULT NULL::character varying,
  p_school_site text DEFAULT NULL::text,
  p_school_district text DEFAULT NULL::text
)
 RETURNS TABLE(id uuid, initials text, grade_level text, teacher_name text, teacher_id uuid, sessions_per_week integer, minutes_per_session integer, school_id character varying, provider_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, iep_goals text[], first_name text, last_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Return unique students that have sessions assigned to the CURRENT authenticated SEA
  -- Uses auth.uid() to prevent passing arbitrary user IDs from client (security)
  -- Supports both school_id (migrated) and school_site+school_district (legacy) filtering
  RETURN QUERY
  SELECT DISTINCT
    s.id,
    s.initials,
    s.grade_level,
    s.teacher_name,
    s.teacher_id,
    s.sessions_per_week,
    s.minutes_per_session,
    s.school_id,
    s.provider_id,
    s.created_at,
    s.updated_at,
    COALESCE(sd.iep_goals, '{}'::TEXT[]) as iep_goals,
    sd.first_name,
    sd.last_name
  FROM students s
  INNER JOIN schedule_sessions ss ON ss.student_id = s.id
  LEFT JOIN student_details sd ON sd.student_id = s.id
  WHERE ss.assigned_to_sea_id = auth.uid()  -- Use auth.uid() instead of parameter
    AND ss.delivered_by = 'sea'
    AND (
      -- No school filter provided - return all students
      (p_school_id IS NULL AND p_school_site IS NULL AND p_school_district IS NULL)
      OR
      -- Match by school_id if both student and filter have it (migrated schools)
      (p_school_id IS NOT NULL AND s.school_id IS NOT NULL AND s.school_id = p_school_id)
      OR
      -- Match by school_site + school_district (legacy schools or fallback during migration)
      (p_school_site IS NOT NULL AND p_school_district IS NOT NULL
       AND s.school_site = p_school_site AND s.school_district = p_school_district)
    )
  ORDER BY s.initials;
END;
$function$;

-- Reproduce the exact ACL (no anon / PUBLIC on this view-only SEA path).
REVOKE ALL ON FUNCTION public.get_sea_students(character varying, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sea_students(character varying, text, text) TO authenticated, service_role;
