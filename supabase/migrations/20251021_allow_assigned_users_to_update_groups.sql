-- Allow assigned specialists/SEAs to update group info on sessions
--
-- Issue: Specialists/SEAs assigned to deliver sessions cannot group them because
-- the RLS policy blocks updates to sessions they don't own
--
-- Solution: Update the RLS policy to allow users assigned to sessions to update
-- group-related fields (group_id, group_name)

DROP POLICY IF EXISTS "Users and SEAs can update schedule sessions" ON schedule_sessions;

CREATE POLICY "Users and SEAs can update schedule sessions"
ON schedule_sessions
FOR UPDATE
USING (
  -- Can select rows to update if:
  -- 1. User owns the session
  (provider_id = auth.uid())
  OR
  -- 2. User is a SEA supervising the provider
  (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'sea'
    AND profiles.supervising_provider_id = schedule_sessions.provider_id
  ))
  OR
  -- 3. User is assigned to deliver as specialist
  (assigned_to_specialist_id = auth.uid())
  OR
  -- 4. User is assigned to deliver as SEA
  (assigned_to_sea_id = auth.uid())
)
WITH CHECK (
  -- Can update rows if:
  -- 1. User owns the session (and provider_id isn't being changed)
  (provider_id = auth.uid())
  OR
  -- 2. User is a SEA supervising the provider (and provider_id isn't being changed)
  (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'sea'
    AND profiles.supervising_provider_id = schedule_sessions.provider_id
  ))
  OR
  -- 3. User is assigned to deliver as specialist (and provider_id isn't being changed)
  (assigned_to_specialist_id = auth.uid())
  OR
  -- 4. User is assigned to deliver as SEA (and provider_id isn't being changed)
  (assigned_to_sea_id = auth.uid())
);

COMMENT ON POLICY "Users and SEAs can update schedule sessions" ON schedule_sessions IS
'Allows users to update sessions they own, SEAs to update sessions for providers they supervise, and assigned specialists/SEAs to update sessions they are assigned to deliver';
