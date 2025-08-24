-- Update functions to allow resource-to-resource assignments (but still prevent self-assignment)

-- Update the can_assign_specialist_to_session function
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
  
  -- Target must be a specialist role (including resource, but not SEA or admin)
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

-- Update the get_available_specialists function
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

-- Update comment to reflect that resource specialists can be assigned
COMMENT ON COLUMN schedule_sessions.assigned_to_specialist_id IS 'ID of the specialist (resource, speech, OT, counseling) assigned to deliver this session';
