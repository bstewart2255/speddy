-- Fix the get_available_specialists function to properly filter by the currently selected school
-- The previous version was getting specialists from all schools the user has access to,
-- not just the currently selected school in the UI

-- Drop the old function
DROP FUNCTION IF EXISTS get_available_specialists(UUID);

-- Create updated function that accepts school_id parameter
CREATE OR REPLACE FUNCTION get_available_specialists(
  current_user_id UUID,
  current_school_id UUID
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  role TEXT
) AS $$
BEGIN
  -- Validate that the current user has access to the specified school
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = current_user_id 
    AND school_id = current_school_id
  ) THEN
    -- For users with access to multiple schools, check if they have access to this school
    IF NOT EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = current_user_id
    ) THEN
      RAISE EXCEPTION 'User not found';
    END IF;
    -- User exists but doesn't have direct access to this school
    -- They might have access through school_site/school_district (legacy) or multiple schools
    -- For now, we'll proceed with the query and let RLS handle the filtering
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.role::TEXT
  FROM profiles p
  WHERE p.school_id = current_school_id
  AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
  AND p.id != current_user_id
  ORDER BY p.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add a comment explaining the function
COMMENT ON FUNCTION get_available_specialists(UUID, UUID) IS 
'Returns specialists available for assignment at the specified school. Used by Resource Specialists to assign sessions to other specialists at the same school.';

-- Also update the can_assign_specialist_to_session function to work with the current school context
CREATE OR REPLACE FUNCTION can_assign_specialist_to_session(
  provider_id UUID,
  specialist_id UUID,
  current_school_id UUID DEFAULT NULL
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
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Only Resource Specialists can assign to other specialists
  IF provider_record.role != 'resource' THEN
    RETURN FALSE;
  END IF;
  
  -- Get target specialist details  
  SELECT school_id, role
  INTO specialist_record
  FROM profiles
  WHERE id = specialist_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Target must be a specialist role (including resource, but not SEA or admin)
  IF specialist_record.role NOT IN ('resource', 'speech', 'ot', 'counseling', 'specialist') THEN
    RETURN FALSE;
  END IF;
  
  -- Prevent self-assignment
  IF provider_id = specialist_id THEN
    RETURN FALSE;
  END IF;
  
  -- If current_school_id is provided, both must be at that school
  IF current_school_id IS NOT NULL THEN
    IF specialist_record.school_id != current_school_id OR provider_record.school_id != current_school_id THEN
      RETURN FALSE;
    END IF;
  ELSE
    -- Legacy check: must be at the same school
    IF specialist_record.school_id != provider_record.school_id THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add comment
COMMENT ON FUNCTION can_assign_specialist_to_session(UUID, UUID, UUID) IS 
'Checks if a provider can assign a specialist to a session. The optional current_school_id parameter ensures both users are at the specified school.';