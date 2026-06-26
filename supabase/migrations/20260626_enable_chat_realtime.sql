-- SPE-197 (Phase 1): enable Supabase Realtime on chat messages.
--
-- Adds public.messages to the `supabase_realtime` publication so clients can
-- subscribe to INSERTs and stream new messages live. RLS still gates which rows
-- each subscriber receives (messages_select → can_access_conversation), so a
-- subscriber only ever sees messages in conversations they can access.
--
-- Only INSERTs are needed for live message delivery, so the default REPLICA
-- IDENTITY is sufficient (the new row is delivered in full on INSERT).
--
-- Idempotent / re-runnable.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
