-- Add RLS policies to enforce SEA and specialist assignment permissions
-- These policies validate that assignments use the can_assign_sea_to_session()
-- and can_assign_specialist_to_session() functions

-- Drop the existing update policy if it exists
DROP POLICY IF EXISTS "Users and SEAs can update schedule sessions" ON schedule_sessions;

-- Create a comprehensive update policy that includes assignment permission checks
CREATE POLICY "Users and assigned members can update sessions with permission checks"
  ON schedule_sessions
  FOR UPDATE
  USING (
    -- User can update if they are:
    -- 1. The provider who owns the session
    provider_id = auth.uid()
    OR
    -- 2. A SEA supervising the provider
    (EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'sea'
        AND profiles.supervising_provider_id = schedule_sessions.provider_id
    ))
    OR
    -- 3. Assigned as specialist to this session
    assigned_to_specialist_id = auth.uid()
    OR
    -- 4. Assigned as SEA to this session
    assigned_to_sea_id = auth.uid()
  )
  WITH CHECK (
    -- When updating, validate the assignment permissions
    (
      -- User must still be authorized to update (same as USING clause)
      provider_id = auth.uid()
      OR
      (EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = 'sea'
          AND profiles.supervising_provider_id = schedule_sessions.provider_id
      ))
      OR
      assigned_to_specialist_id = auth.uid()
      OR
      assigned_to_sea_id = auth.uid()
    )
    AND
    -- Validate SEA assignment if being set
    (
      assigned_to_sea_id IS NULL
      OR can_assign_sea_to_session(auth.uid(), assigned_to_sea_id)
    )
    AND
    -- Validate specialist assignment if being set
    (
      assigned_to_specialist_id IS NULL
      OR can_assign_specialist_to_session(auth.uid(), assigned_to_specialist_id)
    )
  );

-- Add comment for documentation
COMMENT ON POLICY "Users and assigned members can update sessions with permission checks" ON schedule_sessions IS
'Allows session updates by the provider, supervising SEAs, or assigned specialists/SEAs.
Enforces assignment permissions using can_assign_sea_to_session() and can_assign_specialist_to_session() functions.';
