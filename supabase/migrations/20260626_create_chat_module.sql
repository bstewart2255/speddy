-- SPE-196: Chat module — Phase 0 foundation (schema, RLS, membership/eligibility functions)
--
-- Design of record: docs/CHAT_MODULE_DESIGN.md (§5 data model, §6 access control).
--
-- Two conversation types:
--   * 'direct'        — 1:1 DM; the two participants are stored explicitly in
--                       conversation_participants, and deduped via a normalized
--                       dm_key (race-safe unique index).
--   * 'student_group' — one chat per student; membership is NOT stored, it is
--                       DERIVED live from current assignments by
--                       chat_is_student_participant() and re-evaluated on every
--                       access. Roster is not hand-editable.
--
-- Key decisions encoded here:
--   * Access follows CURRENT linkage for the whole conversation (history
--     included): lose your link -> lose access; gain a link -> see full history.
--     This falls out of chat_is_student_participant() being re-evaluated per
--     request; nothing is stored or deleted on membership change.
--   * SEAs / paraprofessionals are excluded from the entire module. Enforced at
--     the authorization layer via is_chat_eligible() (false for role 'sea'),
--     which is a factor of can_access_conversation() — gating every read/write
--     path — not just the UI.
--   * Schedule-derived membership uses ACTIVE TEMPLATE rows only
--     (is_template = true / deleted_at is null), never historical dated
--     instances, so a former assignee does not linger in the roster.
--
-- Hardening (from PR #667 review):
--   * get_student_chat_participants() requires the CALLER to be on the student's
--     team (no roster disclosure to arbitrary authenticated callers).
--   * messages are immutable except body/edited_at/deleted_at (trigger), so a
--     message cannot be relocated into another conversation.
--   * DIRECT conversations + participant rows are NOT client-insertable in
--     Phase 0; they come from the Phase 2 SECURITY DEFINER creation RPC, which
--     enforces same-site + the 1:1 cap. anon EXECUTE is revoked on all helpers.
--
-- No UI and no realtime in this migration (realtime publication lands in Phase 1).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('direct', 'student_group')),
  -- set for student_group (the spine); null for direct
  student_id  UUID REFERENCES public.students(id) ON DELETE CASCADE,
  -- scope; for student_group this mirrors the student's school
  school_id   VARCHAR(20) REFERENCES public.schools(id) ON DELETE SET NULL,
  -- normalized "lo:hi" profile-id pair for direct DMs; null for student_group
  dm_key      TEXT,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- shape: student_group is student-anchored with no dm_key; direct is the inverse
  CONSTRAINT conversations_shape_chk CHECK (
    (type = 'student_group' AND student_id IS NOT NULL AND dm_key IS NULL)
    OR
    (type = 'direct' AND student_id IS NULL AND dm_key IS NOT NULL)
  )
);

-- one chat per student
CREATE UNIQUE INDEX IF NOT EXISTS ux_conversations_student_group
  ON public.conversations (student_id)
  WHERE type = 'student_group';

-- DM dedupe: the unique index on the normalized pair is the source of truth
-- (race-safe under concurrent creation); a pre-insert lookup is only an
-- optimization (docs/CHAT_MODULE_DESIGN.md §5).
CREATE UNIQUE INDEX IF NOT EXISTS ux_conversations_dm_key
  ON public.conversations (dm_key)
  WHERE type = 'direct';

COMMENT ON TABLE public.conversations IS
  'Chat conversations. type=direct (1:1, participants stored) or student_group (one per student, membership derived live). See docs/CHAT_MODULE_DESIGN.md.';
COMMENT ON COLUMN public.conversations.dm_key IS
  'Normalized sorted profile-id pair "lo:hi" for direct DMs; enforces 1:1 dedupe via ux_conversations_dm_key.';


CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  -- nullable + SET NULL so history survives if a sender profile is deleted
  sender_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  body            TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

-- stable monotonic cursor for reconnect backfill + ordered reads (§7)
CREATE INDEX IF NOT EXISTS ix_messages_conversation_created
  ON public.messages (conversation_id, created_at, id);

COMMENT ON TABLE public.messages IS
  'Chat messages. Append-only in spirit; deleted_at soft-deletes a single message. Messages belong to the conversation and are never removed on membership change.';


-- DM-only: exactly two rows per direct conversation. student_group chats store
-- NO rows here (their membership is the chat_is_student_participant() function).
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE INDEX IF NOT EXISTS ix_conversation_participants_profile
  ON public.conversation_participants (profile_id);

COMMENT ON TABLE public.conversation_participants IS
  'Explicit membership for DIRECT conversations only (2 rows each). student_group membership is derived, not stored here.';


-- per-user read cursor, drives unread badges; one row per (conversation, opener)
CREATE TABLE IF NOT EXISTS public.conversation_read_state (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, profile_id)
);

COMMENT ON TABLE public.conversation_read_state IS
  'Per-user last-read cursor for unread counts. A user may only read/write their own row.';


-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they bypass RLS on the source tables
-- and avoid recursive RLS evaluation). All STABLE, search_path pinned.
-- ---------------------------------------------------------------------------

-- Role-level eligibility for the entire chat module. Currently excludes 'sea'
-- (SEAs / paraprofessionals get no chat). Returns false for unknown users.
CREATE OR REPLACE FUNCTION public.is_chat_eligible(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_uid
      AND p.role <> 'sea'
  );
$$;

-- Live membership test for a student group chat: is p_uid currently linked to
-- p_student_id? Union of the four link sources (docs §4). Schedule sources use
-- ACTIVE TEMPLATE rows only; assigned_to_sea_id is intentionally excluded.
CREATE OR REPLACE FUNCTION public.chat_is_student_participant(p_student_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    -- case manager / resource specialist
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id AND s.provider_id = p_uid

    UNION ALL
    -- linked classroom teacher (only if the teacher has an account)
    SELECT 1
    FROM public.students s
    JOIN public.teachers t ON t.id = s.teacher_id
    WHERE s.id = p_student_id AND t.account_id = p_uid

    UNION ALL
    -- assigned providers / specialists on ACTIVE TEMPLATE sessions (NOT SEAs)
    SELECT 1 FROM public.schedule_sessions ss
    WHERE ss.student_id = p_student_id
      AND ss.is_template = TRUE
      AND ss.deleted_at IS NULL
      AND (ss.provider_id = p_uid OR ss.assigned_to_specialist_id = p_uid)

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

-- Distinct, chat-eligible participant ids for a student group chat. For display
-- and the "N of M team members have accounts" coverage note. Excludes SEAs and
-- anyone without a profile via is_chat_eligible().
--
-- AUTHORIZATION: the caller must themselves currently be on the student's team,
-- or the function returns an empty set. SECURITY DEFINER bypasses RLS on the
-- source tables, so without this gate any authenticated user could read the
-- roster for an arbitrary student_id (e.g. a reassigned user who kept the UUID).
-- auth.uid() is the request's JWT subject even under SECURITY DEFINER; a NULL
-- caller (e.g. service_role with no JWT) therefore also gets an empty set.
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
    SELECT ss.assigned_to_specialist_id
    FROM public.schedule_sessions ss
    WHERE ss.student_id = p_student_id
      AND ss.is_template = TRUE AND ss.deleted_at IS NULL
      AND ss.assigned_to_specialist_id IS NOT NULL

    UNION
    SELECT ap.admin_id
    FROM public.students s
    JOIN public.admin_permissions ap ON ap.school_id = s.school_id
    WHERE s.id = p_student_id AND ap.role = 'site_admin'
  ) u
  WHERE public.is_chat_eligible(u.uid)
    AND public.chat_is_student_participant(p_student_id, auth.uid());
$$;

-- Single access gate for a conversation. is_chat_eligible() first (excludes
-- SEAs even if a participant row exists for them), then type-specific membership.
CREATE OR REPLACE FUNCTION public.can_access_conversation(p_conversation_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_chat_eligible(p_uid)
     AND EXISTS (
       SELECT 1 FROM public.conversations c
       WHERE c.id = p_conversation_id
         AND (
           (c.type = 'direct' AND EXISTS (
              SELECT 1 FROM public.conversation_participants cp
              WHERE cp.conversation_id = c.id AND cp.profile_id = p_uid
           ))
           OR
           (c.type = 'student_group' AND public.chat_is_student_participant(c.student_id, p_uid))
         )
     );
$$;

-- Immutability guard for messages: only body / edited_at / deleted_at may change
-- on UPDATE. This prevents a sender from relocating a message into another
-- conversation (changing conversation_id) or spoofing sender_id / created_at —
-- a stronger guarantee than an RLS WITH CHECK, which cannot see the OLD row.
CREATE OR REPLACE FUNCTION public.chat_messages_guard_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.conversation_id <> OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'messages.conversation_id, sender_id and created_at are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_guard_immutable ON public.messages;
CREATE TRIGGER messages_guard_immutable
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_guard_immutable();

-- Lock down execution to authenticated app users + service_role (matches the
-- repo's current security posture: no PUBLIC / anon execute on SECURITY DEFINER
-- helpers). anon is revoked explicitly because Supabase grants it EXECUTE via
-- default privileges, which a bare "FROM PUBLIC" revoke does not remove.
REVOKE EXECUTE ON FUNCTION public.is_chat_eligible(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_is_student_participant(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_student_chat_participants(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_conversation(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_chat_eligible(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_is_student_participant(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_chat_participants(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_conversation(UUID, UUID) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.conversations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_read_state  ENABLE ROW LEVEL SECURITY;

-- Base privileges (RLS still gates every row). No DELETE for authenticated:
-- conversations/messages are removed only by cascade (student deletion) or the
-- service role; message removal is a soft delete via UPDATE.
GRANT SELECT, INSERT, UPDATE ON public.conversations           TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.messages                TO authenticated;
GRANT SELECT                 ON public.conversation_participants TO authenticated; -- inserts via Phase 2 definer RPC only
GRANT SELECT, INSERT, UPDATE ON public.conversation_read_state  TO authenticated;
-- belt-and-suspenders: ensure clients never hold INSERT on participants
-- (no-op on a fresh DB; clears the grant from an earlier apply of this file)
REVOKE INSERT ON public.conversation_participants FROM authenticated;

-- Policies are dropped-then-created so this migration is safely re-runnable
-- (idempotent) regardless of how it reaches the database.

-- conversations -------------------------------------------------------------
DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations
  FOR SELECT TO authenticated
  USING (public.can_access_conversation(id, auth.uid()));

-- Phase 0: clients may create ONLY student_group chats, and only if the creator
-- is currently on the student's team. DIRECT conversations are NOT client-
-- insertable here — they are created exclusively by the Phase 2 SECURITY DEFINER
-- creation RPC, which atomically validates the participant pair, enforces the
-- same-site rule and the 1:1 cap, and computes dm_key. Keeping direct creation
-- out of client-facing RLS prevents a client from reserving arbitrary dm_keys or
-- bypassing the same-site invariant.
DROP POLICY IF EXISTS conversations_insert ON public.conversations;
CREATE POLICY conversations_insert ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    type = 'student_group'
    AND created_by = auth.uid()
    AND public.is_chat_eligible(auth.uid())
    AND public.chat_is_student_participant(student_id, auth.uid())
  );

-- messages ------------------------------------------------------------------
DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (public.can_access_conversation(conversation_id, auth.uid()));

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_conversation(conversation_id, auth.uid())
  );

-- A sender may edit / soft-delete only their own messages, and only while they
-- still have access to the conversation. (Admin moderation is deferred — §10.)
-- WITH CHECK re-validates access to the post-update conversation; the
-- messages_guard_immutable trigger additionally pins conversation_id/sender_id/
-- created_at so a message cannot be relocated into another conversation.
DROP POLICY IF EXISTS messages_update_own ON public.messages;
CREATE POLICY messages_update_own ON public.messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    AND public.can_access_conversation(conversation_id, auth.uid())
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_conversation(conversation_id, auth.uid())
  );

-- conversation_participants -------------------------------------------------
DROP POLICY IF EXISTS conversation_participants_select ON public.conversation_participants;
CREATE POLICY conversation_participants_select ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (public.can_access_conversation(conversation_id, auth.uid()));

-- Phase 0: NO client INSERT policy on conversation_participants. Rows are only
-- ever written for DIRECT conversations, which are created exclusively by the
-- Phase 2 SECURITY DEFINER RPC (it enforces chat-eligibility of both members,
-- the same-site rule, and the 1:1 cap, and bypasses RLS as definer). With RLS
-- enabled and no INSERT policy, clients cannot write participant rows at all.
DROP POLICY IF EXISTS conversation_participants_insert ON public.conversation_participants;

-- conversation_read_state ---------------------------------------------------
-- A user may only see and write their own read cursor.
DROP POLICY IF EXISTS conversation_read_state_select ON public.conversation_read_state;
CREATE POLICY conversation_read_state_select ON public.conversation_read_state
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS conversation_read_state_insert ON public.conversation_read_state;
CREATE POLICY conversation_read_state_insert ON public.conversation_read_state
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND public.can_access_conversation(conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS conversation_read_state_update ON public.conversation_read_state;
CREATE POLICY conversation_read_state_update ON public.conversation_read_state
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
