-- Add specialist assignment fields to schedule_sessions table
ALTER TABLE schedule_sessions 
ADD COLUMN IF NOT EXISTS assigned_to_specialist_id UUID REFERENCES profiles(id);

-- Add comment for documentation
COMMENT ON COLUMN schedule_sessions.assigned_to_specialist_id IS 'ID of the specialist (resource, speech, OT, counseling) assigned to deliver this session';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_schedule_sessions_assigned_specialist 
ON schedule_sessions(assigned_to_specialist_id);

-- Update delivered_by column to include 'specialist' option
-- First, check if we need to modify the constraint
DO $$ 
BEGIN
  -- Drop the old check constraint if it exists
  ALTER TABLE schedule_sessions 
  DROP CONSTRAINT IF EXISTS schedule_sessions_delivered_by_check;
  
  -- Add the new check constraint with 'specialist' option
  ALTER TABLE schedule_sessions 
  ADD CONSTRAINT schedule_sessions_delivered_by_check 
  CHECK (delivered_by IN ('provider', 'sea', 'specialist'));
END $$;

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