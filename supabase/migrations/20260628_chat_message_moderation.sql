-- SPE-199 (Phase 3, PR1): chat message moderation — soft-delete only, no edit.
--
-- Design of record: docs/CHAT_MODULE_DESIGN.md §8 (FERPA / retention / audit),
-- §10 (resolved decisions). Locked 2026-06-27:
--   * A sender may SOFT-DELETE their own message.
--   * A site admin may SOFT-DELETE any message in a conversation they can access.
--   * NO editing (keeps the audit trail clean). messages.edited_at stays
--     provisioned but unused.
--
-- This migration does two things:
--   1. Tightens away the Phase-0 `messages_update_own` UPDATE policy and the
--      table-level UPDATE grant. Phase 0 let a sender UPDATE their own row
--      (including `body`) — i.e. client-side editing was possible, which the
--      "no edit" decision forbids. Removing the policy AND revoking the grant
--      makes delete_chat_message the SOLE moderation write path (and the only
--      route for the site-admin case, which isn't own-message-scoped).
--   2. Adds delete_chat_message(p_message_id), a SECURITY DEFINER RPC that does
--      its own authorization and stamps deleted_at = now() as the owner.
--
-- Realtime needs NO change here: supabase_realtime already publishes UPDATE and
-- `messages` is already in the publication (Phase 1). RLS still gates delivery
-- via messages_select → can_access_conversation, and the soft-delete UPDATE
-- carries the full new row (default replica identity is sufficient; under RLS
-- the `old` record only ever carries the PK even with REPLICA IDENTITY FULL).
--
-- Idempotent / re-runnable (DROP POLICY IF EXISTS, CREATE OR REPLACE, idempotent
-- REVOKE/GRANT).

-- ---------------------------------------------------------------------------
-- 1. No client-side UPDATE on messages — the RPC is the sole moderation path.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS messages_update_own ON public.messages;

-- Phase 0 granted UPDATE to authenticated; remove it (anon never had a real
-- grant but is revoked for parity). SELECT + INSERT are untouched, so reading
-- and sending still work; the messages_guard_immutable trigger still pins
-- conversation_id/sender_id/created_at on the definer's UPDATE below.
REVOKE UPDATE ON public.messages FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. delete_chat_message(p_message_id): soft-delete a single message.
--
-- Authorization (done inside the RPC, owner-privileged):
--   * the SENDER may soft-delete their own message; OR
--   * a SITE ADMIN of the conversation's school may soft-delete any message in a
--     conversation they can access (can_access_conversation). For a student_group
--     this is the school-scoped admin who is already a derived participant; for a
--     direct DM, an admin is not a participant so can_access fails — only the
--     sender can delete, which is correct.
--
-- Soft delete is idempotent: re-deleting an already-deleted message is a no-op
-- (the deleted_at timestamp is not moved). No editing — `body` is never touched.
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
  v_school_id       varchar;
  v_already_deleted boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Definer bypasses RLS, so read the message + its conversation scope directly.
  SELECT m.sender_id, m.conversation_id, (m.deleted_at IS NOT NULL), c.school_id
    INTO v_sender_id, v_conversation_id, v_already_deleted, v_school_id
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE m.id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    v_sender_id = v_uid
    OR (
      public.can_access_conversation(v_conversation_id, v_uid)
      AND EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = v_uid
          AND ap.role = 'site_admin'
          AND ap.school_id = v_school_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not allowed to delete this message' USING ERRCODE = '42501';
  END IF;

  -- Only stamp the first delete (don't move the timestamp on re-call).
  IF NOT v_already_deleted THEN
    UPDATE public.messages
    SET deleted_at = now()
    WHERE id = p_message_id;
  END IF;
END;
$$;

-- Same lock-down posture as the other chat RPCs: no PUBLIC/anon execute.
REVOKE EXECUTE ON FUNCTION public.delete_chat_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_chat_message(uuid) TO authenticated, service_role;
