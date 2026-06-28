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
--      its own authorization, then stamps deleted_at and scrubs the body as the
--      owner (so deleted content can't be recovered via a direct read).
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
-- 2. delete_chat_message(p_message_id): soft-delete + scrub a single message.
--
-- Authorization (done inside the RPC, owner-privileged):
--   * the SENDER may soft-delete their own message (any conversation type); OR
--   * admin moderation, STUDENT GROUP chats only: a SITE ADMIN of the student's
--     school may delete any message in a chat they can access. A direct DM is a
--     private 1:1 — own-delete only, no admin moderation (so an admin who happens
--     to be a site admin of the DM's shared school can't delete the other party's
--     message).
--
-- Deletion SCRUBS the body, not just hides it: messages_select still returns the
-- row to participants, so leaving `body` intact would let anyone recover the text
-- via a direct query (the UI tombstone is cosmetic). We overwrite body with a
-- sentinel (the body CHECK requires non-empty). PR2 will capture the original
-- body into the server-only audit log BEFORE this scrub.
--
-- Idempotent + concurrency-safe: the `deleted_at IS NULL` predicate on the UPDATE
-- is the real guard, so two concurrent calls can't both stamp / move deleted_at.
-- No editing — body is only ever overwritten by this delete path.
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
  v_school_id       varchar;
  v_already_deleted boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Definer bypasses RLS, so read the message + its conversation scope directly.
  SELECT m.sender_id, m.conversation_id, c.type, c.school_id, (m.deleted_at IS NOT NULL)
    INTO v_sender_id, v_conversation_id, v_type, v_school_id, v_already_deleted
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE m.id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    v_sender_id = v_uid
    OR (
      v_type = 'student_group'
      AND public.can_access_conversation(v_conversation_id, v_uid)
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

  IF NOT v_already_deleted THEN
    UPDATE public.messages
    SET deleted_at = now(),
        body       = '[deleted]'
    WHERE id = p_message_id
      AND deleted_at IS NULL;
  END IF;
END;
$$;

-- Same lock-down posture as the other chat RPCs: no PUBLIC/anon execute.
REVOKE EXECUTE ON FUNCTION public.delete_chat_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_chat_message(uuid) TO authenticated, service_role;
