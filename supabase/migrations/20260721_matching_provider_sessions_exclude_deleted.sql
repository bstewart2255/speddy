-- SPE-255: find_matching_provider_sessions returned archived (soft-deleted)
-- other-provider templates. deleteOrArchiveTemplate sets deleted_at when a
-- template with instances is removed, and template reads must exclude those rows
-- (own-provider checks already do — SessionUpdateService.checkStudentSessionOverlap
-- filters `deleted_at IS NULL`). Without the filter, the new cross-provider
-- double-book warning — and the existing grey "other provider" bands, which use
-- this same RPC — surface a removed session as if the slot were taken.
--
-- Add `ss.deleted_at IS NULL`. Reproduced verbatim from the live definition;
-- only the new predicate is added.

CREATE OR REPLACE FUNCTION public.find_matching_provider_sessions(p_student_id uuid)
RETURNS TABLE(day_of_week integer, start_time time without time zone, end_time time without time zone, provider_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  caller_id UUID;
BEGIN
  -- Get the authenticated user's ID
  caller_id := auth.uid();

  -- Security check: Verify the caller owns this student
  IF NOT EXISTS (
    SELECT 1 FROM students
    WHERE id = p_student_id
    AND provider_id = caller_id
  ) THEN
    -- Return empty result if caller doesn't own the student
    RETURN;
  END IF;

  -- Find schedule sessions from matching students of other providers
  RETURN QUERY
  SELECT
    ss.day_of_week::INTEGER,
    ss.start_time::TIME,
    ss.end_time::TIME,
    p.role AS provider_role
  FROM students s
  JOIN students source ON source.id = p_student_id
  JOIN profiles p ON p.id = s.provider_id
  JOIN schedule_sessions ss ON ss.student_id = s.id
  WHERE s.id != p_student_id
    AND s.provider_id != source.provider_id
    AND LOWER(s.initials) = LOWER(source.initials)
    AND s.grade_level = source.grade_level
    AND s.school_id IS NOT NULL
    AND s.school_id = source.school_id
    AND (
      -- Match by teacher_id if both have it
      (s.teacher_id IS NOT NULL AND source.teacher_id IS NOT NULL AND s.teacher_id = source.teacher_id)
      -- Otherwise match by teacher_name (case-insensitive)
      OR (
        (s.teacher_id IS NULL OR source.teacher_id IS NULL)
        AND LOWER(COALESCE(s.teacher_name, '')) = LOWER(COALESCE(source.teacher_name, ''))
        AND COALESCE(s.teacher_name, '') != ''
      )
    )
    -- Only template sessions (not specific date instances)
    AND ss.session_date IS NULL
    -- Only scheduled sessions with times
    AND ss.start_time IS NOT NULL
    AND ss.end_time IS NOT NULL
    -- SPE-255: exclude archived (soft-deleted) templates
    AND ss.deleted_at IS NULL;
END;
$function$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.find_matching_provider_sessions(uuid) TO authenticated;
