-- Fix infinite recursion in schedule_sessions RLS policy
--
-- The previous policy had self-referential queries that caused infinite recursion
-- when trying to check if assignment fields were unchanged.
--
-- Solution: Remove the self-referential SELECTs from the policy and use a simpler
-- approach that validates permissions via triggers instead.

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users and assigned members can update sessions with permission checks" ON schedule_sessions;

-- Create a simpler policy without self-referential queries
CREATE POLICY "Users and assigned members can update sessions"
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
    -- When updating, user must still be authorized
    (
      provider_id = auth.uid()
      OR
      assigned_to_specialist_id = auth.uid()
      OR
      assigned_to_sea_id = auth.uid()
    )
  );

-- Add comment for documentation
COMMENT ON POLICY "Users and assigned members can update sessions" ON schedule_sessions IS
'Allows session updates by the provider or users explicitly assigned to the session (specialists/SEAs).
Assignment permission validation is handled by triggers to avoid RLS recursion.';

-- Create a trigger function to validate assignment permissions
-- This runs SECURITY DEFINER to bypass RLS when checking permissions
CREATE OR REPLACE FUNCTION validate_session_assignment_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only validate if assignment fields are actually changing
  -- Check SEA assignment permission only if it's being changed
  IF NEW.assigned_to_sea_id IS DISTINCT FROM OLD.assigned_to_sea_id THEN
    IF NEW.assigned_to_sea_id IS NOT NULL THEN
      -- Validate the new SEA assignment
      IF NOT can_assign_sea_to_session(auth.uid(), NEW.assigned_to_sea_id) THEN
        RAISE EXCEPTION 'You do not have permission to assign this SEA to the session';
      END IF;
    END IF;
  END IF;

  -- Check specialist assignment permission only if it's being changed
  IF NEW.assigned_to_specialist_id IS DISTINCT FROM OLD.assigned_to_specialist_id THEN
    IF NEW.assigned_to_specialist_id IS NOT NULL THEN
      -- Validate the new specialist assignment
      IF NOT can_assign_specialist_to_session(auth.uid(), NEW.assigned_to_specialist_id) THEN
        RAISE EXCEPTION 'You do not have permission to assign this specialist to the session';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_validate_session_assignment_permissions ON schedule_sessions;

-- Create trigger to validate assignment permissions
CREATE TRIGGER trg_validate_session_assignment_permissions
  BEFORE UPDATE ON schedule_sessions
  FOR EACH ROW
  WHEN (
    -- Only fire when assignment fields are changing
    NEW.assigned_to_sea_id IS DISTINCT FROM OLD.assigned_to_sea_id
    OR NEW.assigned_to_specialist_id IS DISTINCT FROM OLD.assigned_to_specialist_id
  )
  EXECUTE FUNCTION validate_session_assignment_permissions();

COMMENT ON FUNCTION validate_session_assignment_permissions IS
'Validates that users have permission to assign SEAs and specialists to sessions.
Runs with SECURITY DEFINER to bypass RLS and prevent recursion.
Only validates when assignment fields are actually changing.';
