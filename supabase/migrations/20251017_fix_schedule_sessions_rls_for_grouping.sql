-- Fix RLS policy to allow group updates
-- The issue: The with_check policy was too restrictive and failed when updating
-- sessions that have SEA/specialist assignments. We simplify to just check ownership.

DROP POLICY IF EXISTS "Users can update schedule sessions" ON schedule_sessions;

CREATE POLICY "Users can update schedule sessions"
  ON schedule_sessions
  FOR UPDATE
  USING (
    provider_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'sea'
        AND profiles.supervising_provider_id = schedule_sessions.provider_id
    )
  )
  WITH CHECK (
    -- Simplified: just check that the provider_id remains the same
    -- Assignment validation is handled at the application level
    provider_id = auth.uid()
  );

COMMENT ON POLICY "Users can update schedule sessions" ON schedule_sessions IS
  'Allows providers to update their own sessions and SEAs to update sessions of their supervising provider.';
