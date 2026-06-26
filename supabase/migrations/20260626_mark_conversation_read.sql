-- SPE-197 (Phase 1): mark_conversation_read(p_conversation_id)
--
-- Persists the current user's read cursor for a conversation using the SERVER
-- clock (now()), not the browser's. Message timestamps are server-generated, so
-- comparing them against a device-supplied last_read_at skews unread state: a
-- fast client clock can suppress real unread badges, a slow one can leave read
-- messages marked unread. Writing the cursor server-side keeps both on the same
-- clock.
--
-- profile_id is forced to auth.uid(), so a caller can only ever mark their own
-- read state. SECURITY INVOKER (the default) keeps the existing RLS gating: the
-- conversation_read_state INSERT policy already requires
-- can_access_conversation(conversation_id, auth.uid()), so this can't write a
-- cursor for a conversation the caller isn't a participant of. ON CONFLICT
-- targets the (conversation_id, profile_id) primary key, matching the prior
-- client upsert.
--
-- The conflict/UPDATE branch is gated too: Postgres applies the INSERT policy's
-- WITH CHECK to the *proposed* row of an INSERT ... ON CONFLICT DO UPDATE even
-- when the statement resolves to the UPDATE path, so a caller who has lost
-- access cannot advance a stale read cursor — the can_access_conversation check
-- fails and the write is rejected. Verified empirically against the live DB.
--
-- Idempotent.
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  INSERT INTO public.conversation_read_state (conversation_id, profile_id, last_read_at)
  VALUES (p_conversation_id, auth.uid(), now())
  ON CONFLICT (conversation_id, profile_id)
  DO UPDATE SET last_read_at = now();
$$;

REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated, service_role;
