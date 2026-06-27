-- SPE-197 (Phase 1): get_my_chat_students(p_school_id)
--
-- Returns the current user's chat-eligible students — the ones they are actually
-- on the team for (the same four link sources as chat_is_student_participant),
-- optionally scoped to a single school. Powers the "New chat" student picker so
-- it lists only students the user can actually open a chat for, not every
-- student RLS lets them see (e.g. shared / co-taught students they don't serve),
-- and so it respects the active school selected in the school dropdown.
--
-- Idempotent.
CREATE OR REPLACE FUNCTION public.get_my_chat_students(p_school_id varchar DEFAULT NULL)
RETURNS TABLE(id uuid, initials text, grade_level text, school_id varchar)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH participant_ids AS (
    -- case manager / resource specialist
    SELECT s.id FROM public.students s WHERE s.provider_id = auth.uid()
    UNION
    -- linked classroom teacher (with an account)
    SELECT s.id FROM public.students s
      JOIN public.teachers t ON t.id = s.teacher_id
      WHERE t.account_id = auth.uid()
    UNION
    -- a provider who actually delivers an ACTIVE TEMPLATE session for the student
    -- (this is how speech/OT/etc. providers link to students they serve). NOT
    -- assigned_to_specialist_id (lesson-planning delegation) and NOT SEAs.
    SELECT ss.student_id FROM public.schedule_sessions ss
      WHERE ss.student_id IS NOT NULL
        AND ss.is_template = TRUE AND ss.deleted_at IS NULL
        AND ss.provider_id = auth.uid()
    UNION
    -- site admin scoped to the student's school
    SELECT s.id FROM public.students s
      JOIN public.admin_permissions ap ON ap.school_id = s.school_id
      WHERE ap.admin_id = auth.uid() AND ap.role = 'site_admin'
  )
  SELECT s.id, s.initials, s.grade_level, s.school_id
  FROM public.students s
  JOIN participant_ids pi ON pi.id = s.id
  WHERE public.is_chat_eligible(auth.uid())
    AND (p_school_id IS NULL OR s.school_id = p_school_id)
  ORDER BY s.initials;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_chat_students(varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_chat_students(varchar) TO authenticated, service_role;
