-- SPE-197: refine chat membership — exclude lesson-planning-only assignments.
--
-- A specialist assigned to a session purely for lesson planning
-- (schedule_sessions.assigned_to_specialist_id) on a student owned by ANOTHER
-- case manager should NOT be on that student's chat team. Membership is the
-- student's actual team: the case manager (students.provider_id), providers who
-- deliver the student's sessions (schedule_sessions.provider_id — how speech/OT/
-- etc. link to students they serve), the linked classroom teacher, and the site
-- admin. We drop the assigned_to_specialist_id source (assigned_to_sea_id was
-- already excluded).
--
-- Redefines the Phase 0 functions; runs after 20260626_create_chat_module.sql.
-- Idempotent.

CREATE OR REPLACE FUNCTION public.chat_is_student_participant(p_student_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    -- case manager / owning provider
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id AND s.provider_id = p_uid

    UNION ALL
    -- linked classroom teacher (only if the teacher has an account)
    SELECT 1
    FROM public.students s
    JOIN public.teachers t ON t.id = s.teacher_id
    WHERE s.id = p_student_id AND t.account_id = p_uid

    UNION ALL
    -- a provider who delivers an ACTIVE TEMPLATE session for the student
    -- (NOT assigned_to_specialist_id / lesson planning, NOT SEAs)
    SELECT 1 FROM public.schedule_sessions ss
    WHERE ss.student_id = p_student_id
      AND ss.is_template = TRUE
      AND ss.deleted_at IS NULL
      AND ss.provider_id = p_uid

    UNION ALL
    -- site admin scoped to the student's school
    SELECT 1
    FROM public.students s
    JOIN public.admin_permissions ap ON ap.school_id = s.school_id
    WHERE s.id = p_student_id
      AND ap.admin_id = p_uid
      AND ap.role = 'site_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_student_chat_participants(p_student_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT uid
  FROM (
    SELECT s.provider_id AS uid
    FROM public.students s
    WHERE s.id = p_student_id AND s.provider_id IS NOT NULL

    UNION
    SELECT t.account_id
    FROM public.students s
    JOIN public.teachers t ON t.id = s.teacher_id
    WHERE s.id = p_student_id AND t.account_id IS NOT NULL

    UNION
    SELECT ss.provider_id
    FROM public.schedule_sessions ss
    WHERE ss.student_id = p_student_id
      AND ss.is_template = TRUE AND ss.deleted_at IS NULL
      AND ss.provider_id IS NOT NULL

    UNION
    SELECT ap.admin_id
    FROM public.students s
    JOIN public.admin_permissions ap ON ap.school_id = s.school_id
    WHERE s.id = p_student_id AND ap.role = 'site_admin'
  ) u
  WHERE public.is_chat_eligible(u.uid)
    AND public.chat_is_student_participant(p_student_id, auth.uid());
$$;
