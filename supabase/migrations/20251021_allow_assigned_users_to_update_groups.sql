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
TO authenticated
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
);

COMMENT ON POLICY "Users and SEAs can update schedule sessions" ON schedule_sessions IS
'Allows users to update sessions they own, SEAs to update sessions for providers they supervise, and assigned specialists/SEAs to update sessions they are assigned to deliver';

-- Restrict which columns authenticated users can UPDATE at the privilege layer
-- First revoke broad UPDATE privileges, then grant only specific columns
REVOKE UPDATE ON schedule_sessions FROM authenticated;
GRANT UPDATE (group_id, group_name, updated_at) ON schedule_sessions TO authenticated;

-- Enforce provider_id immutability at the database level
-- This prevents any user from changing session ownership
CREATE OR REPLACE FUNCTION forbid_provider_id_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.provider_id IS DISTINCT FROM OLD.provider_id THEN
    RAISE EXCEPTION 'provider_id is immutable and cannot be changed';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_forbid_provider_id_change ON schedule_sessions;
CREATE TRIGGER trg_forbid_provider_id_change
  BEFORE UPDATE ON schedule_sessions
  FOR EACH ROW EXECUTE FUNCTION forbid_provider_id_change();
