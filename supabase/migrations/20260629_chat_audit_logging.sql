-- SPE-199 (Phase 3, PR2): server-side chat audit logging.
--
-- Design of record: docs/CHAT_MODULE_DESIGN.md §8. Chat is the FIRST real
-- consumer of audit_logs (SPE-169; the table was scaffolded but empty/unwired —
-- the client-side logAccess() was never called). Decided (Phase 3): log message
-- sends, conversation opens, and deletes SERVER-SIDE so they can't be skipped or
-- spoofed by a client. Rows are kept forever. This is access logging, NOT a
-- teacher "scorecard" — there is no analytics/read surface; only the pre-existing
-- "view own audit logs" SELECT policy applies.
--
-- audit_logs(id, user_id, action, resource_type, resource_id, metadata,
-- timestamp, created_at). `timestamp` is NOT NULL with no default, so every
-- insert sets it to now(). RLS is enabled on audit_logs with NO insert policy,
-- so every writer below is SECURITY DEFINER (owner postgres): it bypasses RLS
-- and always records, which is exactly the "can't be skipped" guarantee. (A
-- SECURITY INVOKER path would be blocked by RLS and would break sends.)
--
-- Ordered after 20260628_chat_message_moderation.sql: it redefines
-- delete_chat_message (CREATE OR REPLACE) to add audit, so it must run last.
-- Idempotent / re-runnable.

-- ---------------------------------------------------------------------------
-- 1. message_sent — AFTER INSERT trigger on messages -> chat.message_sent.
--    Event-level only (no body): resource_id links to the message; metadata
--    carries the conversation context (incl. student_id for the FERPA "whose
--    data" question on student-group chats; null for DMs).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_audit_message_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_type text; v_student uuid; v_school varchar;
BEGIN
  SELECT c.type, c.student_id, c.school_id
    INTO v_type, v_student, v_school
  FROM public.conversations c WHERE c.id = NEW.conversation_id;

  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata, "timestamp")
  VALUES (
    NEW.sender_id, 'chat.message_sent', 'chat_message', NEW.id::text,
    jsonb_build_object(
      'conversation_id', NEW.conversation_id,
      'conversation_type', v_type,
      'student_id', v_student,
      'school_id', v_school
    ),
    now()
  );
  RETURN NULL; -- AFTER trigger: return value ignored
END;
$$;

DROP TRIGGER IF EXISTS messages_audit_sent ON public.messages;
CREATE TRIGGER messages_audit_sent
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_audit_message_sent();

-- ---------------------------------------------------------------------------
-- 2. conversation_opened — RPC called once on thread open -> chat.conversation_opened.
--    Gated on can_access so a client can't forge access events for conversations
--    it can't see; a failed gate is a silent no-op (the call is fire-and-forget).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_conversation_open(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_type text; v_student uuid; v_school varchar;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_conversation(p_conversation_id, v_uid) THEN
    RETURN;
  END IF;

  SELECT c.type, c.student_id, c.school_id
    INTO v_type, v_student, v_school
  FROM public.conversations c WHERE c.id = p_conversation_id;

  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata, "timestamp")
  VALUES (
    v_uid, 'chat.conversation_opened', 'chat_conversation', p_conversation_id::text,
    jsonb_build_object('conversation_type', v_type, 'student_id', v_student, 'school_id', v_school),
    now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_conversation_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_conversation_open(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. message_deleted — redefine delete_chat_message (from the moderation
--    migration) to ALSO record chat.message_deleted, capturing the ORIGINAL body
--    into the server-only audit log before the row is scrubbed. The audit insert
--    is guarded by FOUND so a concurrent caller (whose UPDATE matched 0 rows)
--    can't double-log. Everything else is unchanged from the moderation migration.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_chat_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid             uuid := auth.uid();
  v_sender_id       uuid;
  v_conversation_id uuid;
  v_type            text;
  v_student         uuid;
  v_school_id       varchar;
  v_body            text;
  v_already_deleted boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT m.sender_id, m.conversation_id, c.type, c.student_id, c.school_id, m.body, (m.deleted_at IS NOT NULL)
    INTO v_sender_id, v_conversation_id, v_type, v_student, v_school_id, v_body, v_already_deleted
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE m.id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found' USING ERRCODE = 'P0002';
  END IF;

  -- Sender may delete own (any type); admin moderation is STUDENT GROUP only
  -- (DMs are private 1:1 — own-delete only). See the moderation migration.
  IF NOT (
    v_sender_id = v_uid
    OR (
      v_type = 'student_group'
      AND public.can_access_conversation(v_conversation_id, v_uid)
      AND EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = v_uid AND ap.role = 'site_admin' AND ap.school_id = v_school_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not allowed to delete this message' USING ERRCODE = '42501';
  END IF;

  IF NOT v_already_deleted THEN
    UPDATE public.messages
    SET deleted_at = now(), body = '[deleted]'
    WHERE id = p_message_id AND deleted_at IS NULL;

    -- Only audit a delete that actually happened (FOUND guards against a
    -- concurrent caller double-logging). This row carries the ORIGINAL body
    -- (retained for FERPA/moderation review), so it must NOT be client-readable:
    -- user_id is left NULL precisely so the "view own audit logs" policy
    -- (user_id = auth.uid()) can never surface it to the deleter — otherwise the
    -- deleter could recover the scrubbed content from their own audit history.
    -- Only service_role (RLS-bypass) reads it; the actor is in metadata.deleted_by.
    IF FOUND THEN
      INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata, "timestamp")
      VALUES (
        NULL, 'chat.message_deleted', 'chat_message', p_message_id::text,
        jsonb_build_object(
          'conversation_id', v_conversation_id,
          'conversation_type', v_type,
          'student_id', v_student,
          'school_id', v_school_id,
          'sender_id', v_sender_id,
          'deleted_by', v_uid,
          'original_body', v_body
        ),
        now()
      );
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_chat_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_chat_message(uuid) TO authenticated, service_role;
