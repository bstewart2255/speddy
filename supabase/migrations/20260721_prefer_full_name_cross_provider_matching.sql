-- SPE-290: prefer full name for cross-provider student matching.
--
-- SPE-284 made the student's full name the identity anchor, but cross-provider
-- recognition (the grey "other-provider" bands + the SPE-255 double-book warning)
-- still matched only on initials + grade + teacher + school, ignoring the name.
-- That can over-match two different children who share initials/grade/teacher.
--
-- New rule (owner decision 2026-07-21 — "match on full name wherever possible"):
--   * same school_id is always required;
--   * if BOTH students have a full name  -> match iff the normalized names are equal
--     AND grade matches (name is authoritative: different names => different kids,
--     even if initials coincide);
--   * if EITHER name is missing          -> fall back to today's initials + grade +
--     teacher heuristic.
-- Graceful: the name path only activates once both providers have re-uploaded names;
-- until then the fallback preserves current behavior. No backfill needed.
--
-- Both RPCs are refactored to delegate matching to ONE shared SECURITY DEFINER
-- helper (matching_provider_student_ids), so the bands and the warning can never
-- disagree. The helper keeps the caller-owns-the-student check; the RPCs inherit it.
-- Privacy: the helper reads student_details for both providers (definer bypasses RLS)
-- but only for matching — no name is ever returned. search_path left as the existing
-- functions had it (hardening tracked in SPE-289).

-- 1. Name normalization: "first last" lowercased, trimmed, whitespace-collapsed;
--    NULL when either part is blank (i.e. "no usable full name").
CREATE OR REPLACE FUNCTION public.norm_student_name(p_first text, p_last text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN COALESCE(btrim(p_first), '') = '' OR COALESCE(btrim(p_last), '') = '' THEN NULL
    ELSE regexp_replace(lower(btrim(p_first) || ' ' || btrim(p_last)), '\s+', ' ', 'g')
  END;
$function$;

REVOKE ALL ON FUNCTION public.norm_student_name(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.norm_student_name(text, text) TO authenticated, service_role;

-- 2. Shared matcher: the OTHER-provider student ids that are the "same child" as
--    p_student_id, by the name-preferred rule above. SECURITY DEFINER + owner check.
--    Internal helper only — not granted to authenticated/anon, so it is not exposed
--    over the API; the two SECURITY DEFINER RPCs below (owned by postgres) call it.
CREATE OR REPLACE FUNCTION public.matching_provider_student_ids(p_student_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  -- Security: only the student's owner may resolve matches.
  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND provider_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id
  FROM students s
  JOIN students source ON source.id = p_student_id
  LEFT JOIN student_details src_d ON src_d.student_id = source.id
  LEFT JOIN student_details cand_d ON cand_d.student_id = s.id
  WHERE s.id <> p_student_id
    AND s.provider_id <> source.provider_id
    AND s.school_id IS NOT NULL
    AND s.school_id = source.school_id
    AND (
      -- Name-authoritative path: both sides named -> names (+ grade) must agree.
      (
        norm_student_name(src_d.first_name, src_d.last_name) IS NOT NULL
        AND norm_student_name(cand_d.first_name, cand_d.last_name) IS NOT NULL
        AND norm_student_name(src_d.first_name, src_d.last_name)
            = norm_student_name(cand_d.first_name, cand_d.last_name)
        AND s.grade_level = source.grade_level
      )
      OR
      -- Fallback path: a name is missing on at least one side -> initials + grade + teacher.
      (
        (
          norm_student_name(src_d.first_name, src_d.last_name) IS NULL
          OR norm_student_name(cand_d.first_name, cand_d.last_name) IS NULL
        )
        AND LOWER(s.initials) = LOWER(source.initials)
        AND s.grade_level = source.grade_level
        AND (
          (s.teacher_id IS NOT NULL AND source.teacher_id IS NOT NULL AND s.teacher_id = source.teacher_id)
          OR (
            (s.teacher_id IS NULL OR source.teacher_id IS NULL)
            AND LOWER(COALESCE(s.teacher_name, '')) = LOWER(COALESCE(source.teacher_name, ''))
            AND COALESCE(s.teacher_name, '') <> ''
          )
        )
      )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.matching_provider_student_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.matching_provider_student_ids(uuid) TO service_role;

-- 3. find_matching_provider_sessions: delegate matching to the shared helper.
--    Session predicates unchanged (templates only, scheduled, not soft-deleted — SPE-255).
CREATE OR REPLACE FUNCTION public.find_matching_provider_sessions(p_student_id uuid)
RETURNS TABLE(day_of_week integer, start_time time without time zone, end_time time without time zone, provider_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ss.day_of_week::INTEGER,
    ss.start_time::TIME,
    ss.end_time::TIME,
    p.role AS provider_role
  FROM students s
  JOIN profiles p ON p.id = s.provider_id
  JOIN schedule_sessions ss ON ss.student_id = s.id
  WHERE s.id IN (SELECT mid FROM public.matching_provider_student_ids(p_student_id) AS mid)
    AND ss.session_date IS NULL
    AND ss.start_time IS NOT NULL
    AND ss.end_time IS NOT NULL
    AND ss.deleted_at IS NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.find_matching_provider_sessions(uuid) TO authenticated;

-- 4. find_matching_provider_roles: delegate matching to the shared helper.
CREATE OR REPLACE FUNCTION public.find_matching_provider_roles(p_student_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  result TEXT[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT p.role ORDER BY p.role)
  INTO result
  FROM students s
  JOIN profiles p ON p.id = s.provider_id
  WHERE s.id IN (SELECT mid FROM public.matching_provider_student_ids(p_student_id) AS mid);

  RETURN COALESCE(result, ARRAY[]::TEXT[]);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.find_matching_provider_roles(uuid) TO authenticated;
