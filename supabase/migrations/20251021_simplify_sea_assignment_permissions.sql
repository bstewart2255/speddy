-- Simplify SEA assignment permissions to pure school-based matching
-- Any Resource Specialist can assign sessions to any SEA at the same school

-- Drop and recreate the function with simplified logic
DROP FUNCTION IF EXISTS can_assign_sea_to_session(UUID, UUID);

CREATE OR REPLACE FUNCTION can_assign_sea_to_session(
  provider_id UUID,
  sea_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  provider_record RECORD;
  sea_record RECORD;
BEGIN
  -- Get provider details
  SELECT school_district, school_site, school_id, role
  INTO provider_record
  FROM profiles
  WHERE id = provider_id;

  -- Only Resource Specialists can assign SEAs
  IF provider_record.role != 'resource' THEN
    RETURN FALSE;
  END IF;

  -- Get SEA details
  SELECT school_district, school_site, school_id, role
  INTO sea_record
  FROM profiles
  WHERE id = sea_id;

  -- Verify it's actually an SEA
  IF sea_record.role != 'sea' THEN
    RETURN FALSE;
  END IF;

  -- Check if they're at the same school
  -- Prefer school_id matching if available (migrated schools)
  IF provider_record.school_id IS NOT NULL AND sea_record.school_id IS NOT NULL THEN
    IF provider_record.school_id = sea_record.school_id THEN
      RETURN TRUE;
    END IF;
  -- Fallback to legacy school_district + school_site matching if either school_id is NULL
  ELSIF provider_record.school_district IS NOT NULL AND provider_record.school_site IS NOT NULL THEN
    IF provider_record.school_district = sea_record.school_district
       AND provider_record.school_site = sea_record.school_site THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Not at the same school
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the simplified logic
COMMENT ON FUNCTION can_assign_sea_to_session(UUID, UUID) IS
'Validates that a Resource Specialist can assign a session to an SEA.
Returns TRUE if:
1. Provider has role=resource
2. SEA has role=sea
3. Both are at the same school (matched by school_id or school_district+school_site)
Note: supervising_provider_id and shared_at_school fields are no longer required for permissions.';
