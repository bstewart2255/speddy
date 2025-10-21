-- Update specialist assignment permissions to support both school_id and legacy school matching
-- Any Resource Specialist can assign sessions to any other specialist at the same school

-- Drop and recreate the function with improved school matching logic
DROP FUNCTION IF EXISTS can_assign_specialist_to_session(UUID, UUID);

CREATE OR REPLACE FUNCTION can_assign_specialist_to_session(
  provider_id UUID,
  specialist_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  provider_record RECORD;
  specialist_record RECORD;
BEGIN
  -- Get provider details
  SELECT school_district, school_site, school_id, role
  INTO provider_record
  FROM profiles
  WHERE id = provider_id;

  -- Only Resource Specialists can assign to other specialists
  IF provider_record.role != 'resource' THEN
    RETURN FALSE;
  END IF;

  -- Get target specialist details
  SELECT school_district, school_site, school_id, role
  INTO specialist_record
  FROM profiles
  WHERE id = specialist_id;

  -- Target must be a specialist role (resource, speech, OT, counseling, or specialist)
  IF specialist_record.role NOT IN ('resource', 'speech', 'ot', 'counseling', 'specialist') THEN
    RETURN FALSE;
  END IF;

  -- Prevent self-assignment
  IF provider_id = specialist_id THEN
    RETURN FALSE;
  END IF;

  -- Check if they're at the same school
  -- Prefer school_id matching if available (migrated schools)
  IF provider_record.school_id IS NOT NULL AND specialist_record.school_id IS NOT NULL THEN
    IF provider_record.school_id = specialist_record.school_id THEN
      RETURN TRUE;
    END IF;
  ELSE
    -- Fallback to legacy school_district + school_site matching
    IF provider_record.school_district = specialist_record.school_district
       AND provider_record.school_site = specialist_record.school_site THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Not at the same school
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the logic
COMMENT ON FUNCTION can_assign_specialist_to_session(UUID, UUID) IS
'Validates that a Resource Specialist can assign a session to another specialist.
Returns TRUE if:
1. Provider has role=resource
2. Target has a specialist role (resource, speech, ot, counseling, specialist)
3. Provider and target are at the same school (matched by school_id or school_district+school_site)
4. Not a self-assignment (provider_id != specialist_id)';

-- Update the get_available_specialists function to also support legacy schools
DROP FUNCTION IF EXISTS get_available_specialists(UUID);

CREATE OR REPLACE FUNCTION get_available_specialists(current_user_id UUID)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  role TEXT
) AS $$
DECLARE
  user_school_id VARCHAR;
  user_school_district TEXT;
  user_school_site TEXT;
BEGIN
  -- Get current user's school information
  SELECT
    p.school_id,
    p.school_district,
    p.school_site
  INTO
    user_school_id,
    user_school_district,
    user_school_site
  FROM profiles p
  WHERE p.id = current_user_id;

  -- Return specialists at the same school
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.role::TEXT
  FROM profiles p
  WHERE (
    -- Match by school_id if available
    (user_school_id IS NOT NULL AND p.school_id = user_school_id)
    OR
    -- Fallback to school_district + school_site for legacy schools
    (user_school_id IS NULL AND p.school_district = user_school_district AND p.school_site = user_school_site)
  )
  AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
  AND p.id != current_user_id
  ORDER BY p.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_available_specialists(UUID) IS
'Returns all specialists at the same school as the current user, excluding the current user.
Supports both school_id (migrated schools) and school_district+school_site (legacy schools) matching.';
