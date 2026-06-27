-- SPE-200: get_my_conversations(p_school_id) — DB-side conversation list.
--
-- Replaces the client-side approach (fetch all conversations, then fetch EVERY
-- non-deleted message for them and reduce in the browser to find the latest per
-- conversation, plus separate read-state and profile lookups). That scaled with
-- total message history. This single RPC returns one row per conversation the
-- caller can access — student group chats and DMs — with the latest message
-- (DISTINCT ON), the unread flag computed server-side against the caller's read
-- cursor, and the display fields for both kinds.
--
-- SECURITY DEFINER so it can read the display fields (student initials, the other
-- DM participant's profile) without per-table RLS, while gating membership itself
-- via is_chat_eligible + chat_is_student_participant + direct-participant check —
-- the same predicates as can_access_conversation. Output is equivalent to the
-- prior client builders. Idempotent.
CREATE OR REPLACE FUNCTION public.get_my_conversations(p_school_id varchar DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  kind text,
  student_id uuid,
  school_id varchar,
  student_initials text,
  student_grade text,
  other_id uuid,
  other_name text,
  other_role text,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz,
  unread boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH my_convos AS (
    SELECT c.id, c.type, c.student_id, c.school_id, c.created_at
    FROM public.conversations c
    WHERE public.is_chat_eligible(auth.uid())
      AND (p_school_id IS NULL OR c.school_id = p_school_id)
      AND (
        (c.type = 'student_group'
          AND public.chat_is_student_participant(c.student_id, auth.uid()))
        OR
        (c.type = 'direct' AND EXISTS (
          SELECT 1 FROM public.conversation_participants cp
          WHERE cp.conversation_id = c.id AND cp.profile_id = auth.uid()))
      )
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.body, m.created_at
    FROM public.messages m
    WHERE m.conversation_id IN (SELECT mc.id FROM my_convos mc)
      AND m.deleted_at IS NULL
    ORDER BY m.conversation_id, m.created_at DESC, m.id DESC
  ),
  reads AS (
    SELECT crs.conversation_id, crs.last_read_at
    FROM public.conversation_read_state crs
    WHERE crs.profile_id = auth.uid()
      AND crs.conversation_id IN (SELECT mc.id FROM my_convos mc)
  ),
  other AS (
    SELECT cp.conversation_id, cp.profile_id AS other_id
    FROM public.conversation_participants cp
    JOIN my_convos mc ON mc.id = cp.conversation_id AND mc.type = 'direct'
    WHERE cp.profile_id <> auth.uid()
  )
  SELECT
    mc.id,
    CASE WHEN mc.type = 'student_group' THEN 'student' ELSE 'direct' END AS kind,
    mc.student_id,
    mc.school_id,
    s.initials AS student_initials,
    s.grade_level AS student_grade,
    o.other_id,
    op.full_name AS other_name,
    op.role AS other_role,
    lm.created_at AS last_message_at,
    lm.body AS last_message_preview,
    mc.created_at,
    (lm.created_at IS NOT NULL
      AND (r.last_read_at IS NULL OR lm.created_at > r.last_read_at)) AS unread
  FROM my_convos mc
  LEFT JOIN public.students s ON s.id = mc.student_id
  LEFT JOIN other o ON o.conversation_id = mc.id
  LEFT JOIN public.profiles op ON op.id = o.other_id
  LEFT JOIN last_msg lm ON lm.conversation_id = mc.id
  LEFT JOIN reads r ON r.conversation_id = mc.id
  ORDER BY COALESCE(lm.created_at, mc.created_at) DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_conversations(varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_conversations(varchar) TO authenticated, service_role;
