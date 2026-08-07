-- SPE-336: `get_sea_students` reports the child's TEACHER SET, not one column.
--
-- The RPC's return shape is deliberately unchanged — same columns, same types,
-- same order — so `lib/supabase/queries/sea-students.ts` and every consumer of
-- it keep compiling and rendering exactly as they do today. What changes is
-- where the two teacher columns come from:
--
--   * `teacher_name` — every linked teacher, joined "Davis / Winbery", the way
--     elementary class lists are written (the same separator SPE-337 uses on
--     the students page). One teacher renders identically to before.
--   * `teacher_id`   — the FIRST link (oldest, id as tiebreak), which is the
--     same row the legacy-column mirror calls "first listed". A caller that
--     opens a teacher by id therefore opens the same teacher it did before.
--
-- The SEA UI does not display a teacher today, so this is groundwork rather
-- than a visible change; keeping the shape minimal is deliberate (SPE-336),
-- not an oversight. When the SEA surface does want the full set, it should
-- read `student_teachers` directly rather than growing this signature.
--
-- Both columns fall back to the row's own legacy values when the child has no
-- links at all. That covers the one production caseload row carrying a
-- hand-typed `teacher_name` with no `teacher_id` — SPE-334 deliberately leaves
-- it alone, and losing the only teacher its provider ever recorded would be a
-- visible regression for that row's SEA.
--
-- Everything else — the SECURITY DEFINER posture, the
-- `assigned_to_sea_id = auth.uid() AND delivered_by = 'sea'` gate (SPE-384's
-- narrowing), and the school filters — is verbatim.

CREATE OR REPLACE FUNCTION public.get_sea_students(
  p_school_id character varying DEFAULT NULL::character varying,
  p_school_site text DEFAULT NULL::text,
  p_school_district text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid, initials text, grade_level text, teacher_name text, teacher_id uuid,
  sessions_per_week integer, minutes_per_session integer, school_id character varying,
  provider_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone,
  iep_goals text[], first_name text, last_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    s.id,
    s.initials,
    s.grade_level,
    COALESCE(links.teacher_names, s.teacher_name) AS teacher_name,
    COALESCE(links.first_teacher_id, s.teacher_id) AS teacher_id,
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
  LEFT JOIN LATERAL (
    SELECT
      NULLIF(
        string_agg(
          NULLIF(btrim(concat_ws(' ', t.first_name, t.last_name)), ''),
          ' / ' ORDER BY st.created_at, st.id
        ),
        ''
      ) AS teacher_names,
      (array_agg(st.teacher_id ORDER BY st.created_at, st.id))[1] AS first_teacher_id
    FROM public.student_teachers st
    JOIN public.teachers t ON t.id = st.teacher_id
    WHERE st.child_id = s.child_id
  ) links ON TRUE
  WHERE ss.assigned_to_sea_id = auth.uid()
    AND ss.delivered_by = 'sea'
    AND (
      (p_school_id IS NULL AND p_school_site IS NULL AND p_school_district IS NULL)
      OR
      (p_school_id IS NOT NULL AND s.school_id IS NOT NULL AND s.school_id = p_school_id)
      OR
      (p_school_site IS NOT NULL AND p_school_district IS NOT NULL
       AND s.school_site = p_school_site AND s.school_district = p_school_district)
    )
  ORDER BY s.initials;
END;
$function$;

DO $spe336_sea_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_sea_students'
      AND p.prosecdef
      AND pg_get_functiondef(p.oid) LIKE '%student_teachers%'
  ) THEN
    RAISE EXCEPTION 'SPE-336: get_sea_students still reads only the legacy teacher column';
  END IF;
END;
$spe336_sea_check$;
