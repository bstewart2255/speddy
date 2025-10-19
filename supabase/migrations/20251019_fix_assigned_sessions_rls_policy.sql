-- Fix RLS policy for schedule_sessions to include assigned sessions
-- This allows specialists and SEAs to see sessions assigned to them

-- Drop the existing SELECT policy that only checks provider_id
DROP POLICY IF EXISTS "Users and SEAs can view sessions" ON schedule_sessions;

-- Create new policy that includes assigned sessions
CREATE POLICY "Users and SEAs can view sessions" ON schedule_sessions
  FOR SELECT USING (
    -- User is the provider
    provider_id = (SELECT auth.uid())
    -- OR User is a SEA supervising this provider
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'sea'
        AND profiles.supervising_provider_id = schedule_sessions.provider_id
    )
    -- OR Session is assigned to this user as a specialist
    OR assigned_to_specialist_id = (SELECT auth.uid())
    -- OR Session is assigned to this user as a SEA
    OR assigned_to_sea_id = (SELECT auth.uid())
  );
