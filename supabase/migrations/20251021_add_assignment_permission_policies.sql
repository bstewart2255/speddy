-- Add RLS policies to enforce SEA and specialist assignment permissions
-- These policies validate that assignments use the can_assign_sea_to_session()
-- and can_assign_specialist_to_session() functions

-- Drop the comprehensive policy if it exists (for idempotency)
DROP POLICY IF EXISTS "Users and assigned members can update sessions with permission checks" ON schedule_sessions;

-- Create a comprehensive update policy that includes assignment permission checks
CREATE POLICY "Users and assigned members can update sessions with permission checks"
  ON schedule_sessions
  FOR UPDATE
  USING (
    -- User can update if they are:
    -- 1. The provider who owns the session
    provider_id = auth.uid()
    OR
    -- 2. Assigned as specialist to this session
    assigned_to_specialist_id = auth.uid()
    OR
    -- 3. Assigned as SEA to this session
    assigned_to_sea_id = auth.uid()
  )
  WITH CHECK (
    -- When updating, validate the assignment permissions
    (
      -- User must still be authorized to update (same as USING clause)
      provider_id = auth.uid()
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
'Allows session updates by the provider or users explicitly assigned to the session (specialists/SEAs).
Enforces school-based assignment permissions using can_assign_sea_to_session() and can_assign_specialist_to_session() functions.';
