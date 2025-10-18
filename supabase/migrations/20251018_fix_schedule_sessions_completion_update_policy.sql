-- Fix RLS policy for schedule_sessions UPDATE to allow SEAs to mark sessions as complete
--
-- Issue: The previous policy's WITH CHECK clause only allowed updates where provider_id = auth.uid()
-- This prevented SEAs from marking sessions as complete for providers they supervise
--
-- Solution: Update the WITH CHECK clause to match the USING clause, allowing both:
-- 1. Providers to update their own sessions
-- 2. SEAs to update sessions for providers they supervise

-- Drop the existing restrictive update policy
DROP POLICY IF EXISTS "Users can update schedule sessions" ON schedule_sessions;
DROP POLICY IF EXISTS "Users and SEAs can update schedule sessions" ON schedule_sessions;

-- Create a new policy that allows both providers and SEAs to update sessions
CREATE POLICY "Users and SEAs can update schedule sessions"
ON schedule_sessions
FOR UPDATE
USING (
  -- Can select rows to update if:
  -- 1. User owns the session
  -- 2. User is a SEA supervising the provider
  (provider_id = auth.uid())
  OR
  (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'sea'
    AND profiles.supervising_provider_id = schedule_sessions.provider_id
  ))
)
WITH CHECK (
  -- Can update rows if:
  -- 1. User owns the session (and provider_id isn't being changed)
  -- 2. User is a SEA supervising the provider (and provider_id isn't being changed)
  (provider_id = auth.uid())
  OR
  (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'sea'
    AND profiles.supervising_provider_id = schedule_sessions.provider_id
  ))
);
