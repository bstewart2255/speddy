-- Add specialist assignment fields to schedule_sessions table
ALTER TABLE schedule_sessions 
ADD COLUMN IF NOT EXISTS assigned_to_specialist_id UUID REFERENCES profiles(id);

-- Add manually_placed column with default value
ALTER TABLE schedule_sessions
ADD COLUMN IF NOT EXISTS manually_placed BOOLEAN DEFAULT false NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN schedule_sessions.assigned_to_specialist_id IS 'ID of the specialist (speech, OT, counseling) assigned to deliver this session';
COMMENT ON COLUMN schedule_sessions.manually_placed IS 'Whether this session was manually placed by the user';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_schedule_sessions_assigned_specialist 
ON schedule_sessions(assigned_to_specialist_id);

-- Step 1: Clean up any existing inconsistent data
-- Convert any rows with delivered_by='specialist' but NULL assigned_to_specialist_id back to 'provider'
UPDATE schedule_sessions 
SET delivered_by = 'provider' 
WHERE delivered_by = 'specialist' AND assigned_to_specialist_id IS NULL;

-- Also ensure SEA assignments are consistent
UPDATE schedule_sessions 
SET delivered_by = 'provider' 
WHERE delivered_by = 'sea' AND assigned_to_sea_id IS NULL;

-- Step 2: Drop the old constraint if it exists
ALTER TABLE schedule_sessions 
DROP CONSTRAINT IF EXISTS schedule_sessions_delivered_by_check;

-- Step 3: Add enhanced check constraint that enforces assignment consistency
-- This ensures:
-- 1. delivered_by can only be 'provider', 'sea', or 'specialist'
-- 2. If delivered_by='specialist', then assigned_to_specialist_id must NOT be NULL
-- 3. If delivered_by='sea', then assigned_to_sea_id must NOT be NULL
ALTER TABLE schedule_sessions 
ADD CONSTRAINT schedule_sessions_delivered_by_check 
CHECK (
  delivered_by IN ('provider', 'sea', 'specialist') 
  AND (delivered_by != 'specialist' OR assigned_to_specialist_id IS NOT NULL)
  AND (delivered_by != 'sea' OR assigned_to_sea_id IS NOT NULL)
);

-- Create function to check if a specialist can be assigned to a session
CREATE OR REPLACE FUNCTION can_assign_specialist_to_session(
  provider_id UUID,
  specialist_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  provider_record RECORD;
  specialist_record RECORD;
BEGIN
  -- Get provider details
  SELECT school_id, role
  INTO provider_record
  FROM profiles
  WHERE id = provider_id;
  
  -- Only Resource Specialists can assign to other specialists
  IF provider_record.role != 'resource' THEN
    RETURN FALSE;
  END IF;
  
  -- Get target specialist details  
  SELECT school_id, role
  INTO specialist_record
  FROM profiles
  WHERE id = specialist_id;
  
  -- Target must be a specialist role (not SEA or admin)
  IF specialist_record.role NOT IN ('resource', 'speech', 'ot', 'counseling', 'specialist') THEN
    RETURN FALSE;
  END IF;
  
  -- Prevent self-assignment
  IF provider_id = specialist_id THEN
    RETURN FALSE;
  END IF;
  
  -- Must be at the same school
  IF specialist_record.school_id = provider_record.school_id THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add RLS policy for specialist assignment
CREATE POLICY "Resource Specialists can assign sessions to same-school specialists"
  ON schedule_sessions
  FOR UPDATE
  USING (provider_id = auth.uid())
  WITH CHECK (
    CASE 
      WHEN assigned_to_specialist_id IS NULL THEN TRUE
      ELSE can_assign_specialist_to_session(auth.uid(), assigned_to_specialist_id)
    END
  );

-- Add function to get available specialists at the same school
CREATE OR REPLACE FUNCTION get_available_specialists(current_user_id UUID)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  role TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.role::TEXT
  FROM profiles p
  WHERE p.school_id = (
    SELECT school_id 
    FROM profiles 
    WHERE id = current_user_id
  )
  AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
  AND p.id != current_user_id
  ORDER BY p.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the new functions
GRANT EXECUTE ON FUNCTION can_assign_specialist_to_session TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_specialists TO authenticated;