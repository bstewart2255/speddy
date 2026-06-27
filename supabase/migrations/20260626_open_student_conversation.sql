-- SPE-197 (Phase 1): open_student_conversation(p_student_id) RPC.
--
-- Creation of a student_group conversation was done client-side (select-or-
-- insert against public.conversations, gated by the conversations_insert RLS
-- WITH CHECK). In production that insert intermittently failed with
-- "new row violates row-level security policy [42501]" for valid team members,
-- even though the equivalent insert succeeds when run directly in SQL and the
-- caller passes every membership check — a fragile client/RLS interaction on the
-- table-insert path.
--
-- This RPC is the single, reliable write path: it is SECURITY DEFINER (so the
-- INSERT runs as the owner and does not depend on the table's INSERT policy),
-- but it performs the SAME authorization itself — is_chat_eligible + the
-- chat_is_student_participant team check — and forces created_by = auth.uid().
-- That is equivalent to (and no weaker than) the RLS policy, and mirrors the
-- SECURITY DEFINER pattern already used for the chat membership functions and
-- planned for Phase-2 DM creation. The one-chat-per-student invariant
-- (ux_conversations_student_group) still holds, with the create race handled via
-- ON CONFLICT.
--
-- Returns the conversation id (existing or newly created).
-- Idempotent (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.open_student_conversation(p_student_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conversation_id uuid;
  v_school_id varchar;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_chat_eligible(v_uid) THEN
    RAISE EXCEPTION 'Not eligible for chat' USING ERRCODE = '42501';
  END IF;

  IF NOT public.chat_is_student_participant(p_student_id, v_uid) THEN
    RAISE EXCEPTION 'Not on this student''s team' USING ERRCODE = '42501';
  END IF;

  -- Already exists? (one student_group conversation per student)
  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE type = 'student_group' AND student_id = p_student_id;
  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;

  INSERT INTO public.conversations (type, student_id, school_id, created_by)
  VALUES ('student_group', p_student_id, v_school_id, v_uid)
  ON CONFLICT (student_id) WHERE (type = 'student_group')
  DO NOTHING
  RETURNING id INTO v_conversation_id;

  -- Lost a create race: re-read the winner.
  IF v_conversation_id IS NULL THEN
    SELECT id INTO v_conversation_id
    FROM public.conversations
    WHERE type = 'student_group' AND student_id = p_student_id;
  END IF;

  RETURN v_conversation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.open_student_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_student_conversation(uuid) TO authenticated, service_role;
