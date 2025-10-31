-- Fix specialist assignment permissions for users working at multiple schools
--
-- Problem: can_assign_specialist_to_session() only checks primary schools from profiles table,
-- ignoring provider_schools table that tracks all schools for multi-school users.
--
-- Solution: Check all schools both users work at (via provider_schools table) when either
-- user has works_at_multiple_schools=true.

-- Update the function to support multi-school assignments
CREATE OR REPLACE FUNCTION can_assign_specialist_to_session(
  provider_id UUID,
  specialist_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  provider_record RECORD;
  specialist_record RECORD;
  provider_schools_array VARCHAR[];
  specialist_schools_array VARCHAR[];
  common_schools VARCHAR[];
BEGIN
  -- Get provider details
  SELECT school_district, school_site, school_id, role, works_at_multiple_schools
  INTO provider_record
  FROM profiles
  WHERE id = provider_id;

  -- Only Resource Specialists can assign to other specialists
  IF provider_record.role != 'resource' THEN
    RETURN FALSE;
  END IF;

  -- Get target specialist details
  SELECT school_district, school_site, school_id, role, works_at_multiple_schools
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

  -- If either user works at multiple schools, check provider_schools table
  IF provider_record.works_at_multiple_schools = true OR specialist_record.works_at_multiple_schools = true THEN
    -- Get all schools for provider
    IF provider_record.works_at_multiple_schools = true THEN
      SELECT array_agg(school_id)
      INTO provider_schools_array
      FROM provider_schools
      WHERE provider_schools.provider_id = can_assign_specialist_to_session.provider_id
        AND school_id IS NOT NULL;
    ELSE
      -- Single school user - use their primary school
      provider_schools_array := ARRAY[provider_record.school_id];
    END IF;

    -- Get all schools for specialist
    IF specialist_record.works_at_multiple_schools = true THEN
      SELECT array_agg(school_id)
      INTO specialist_schools_array
      FROM provider_schools
      WHERE provider_schools.provider_id = can_assign_specialist_to_session.specialist_id
        AND school_id IS NOT NULL;
    ELSE
      -- Single school user - use their primary school
      specialist_schools_array := ARRAY[specialist_record.school_id];
    END IF;

    -- Check if they share any common school
    SELECT array_agg(school)
    INTO common_schools
    FROM unnest(provider_schools_array) AS school
    WHERE school = ANY(specialist_schools_array);

    IF common_schools IS NOT NULL AND array_length(common_schools, 1) > 0 THEN
      RETURN TRUE;
    END IF;

    -- No common schools found
    RETURN FALSE;
  END IF;

  -- Neither user works at multiple schools - use original logic
  -- Check if they're at the same school
  -- Prefer school_id matching if available (migrated schools)
  IF provider_record.school_id IS NOT NULL AND specialist_record.school_id IS NOT NULL THEN
    IF provider_record.school_id = specialist_record.school_id THEN
      RETURN TRUE;
    END IF;
  -- Fallback to legacy school_district + school_site matching if either school_id is NULL
  ELSIF provider_record.school_district IS NOT NULL AND provider_record.school_site IS NOT NULL THEN
    IF provider_record.school_district = specialist_record.school_district
       AND provider_record.school_site = specialist_record.school_site THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Not at the same school
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update comment to reflect new functionality
COMMENT ON FUNCTION can_assign_specialist_to_session(UUID, UUID) IS
'Validates that a Resource Specialist can assign a session to another specialist.
Returns TRUE if:
1. Provider has role=resource
2. Target has a specialist role (resource, speech, ot, counseling, specialist)
3. Provider and target work at the same school:
   - For multi-school users: checks provider_schools table for any common school
   - For single-school users: checks school_id or school_district+school_site
4. Not a self-assignment (provider_id != specialist_id)';

-- Update get_available_specialists to support multi-school users
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
  user_works_multiple_schools BOOLEAN;
  user_schools_array VARCHAR[];
BEGIN
  -- Get current user's school information
  SELECT
    p.school_id,
    p.school_district,
    p.school_site,
    p.works_at_multiple_schools
  INTO
    user_school_id,
    user_school_district,
    user_school_site,
    user_works_multiple_schools
  FROM profiles p
  WHERE p.id = current_user_id;

  -- If user works at multiple schools, get all their schools
  IF user_works_multiple_schools = true THEN
    SELECT array_agg(school_id)
    INTO user_schools_array
    FROM provider_schools
    WHERE provider_id = current_user_id
      AND school_id IS NOT NULL;

    -- Return specialists at any of the user's schools
    RETURN QUERY
    SELECT DISTINCT
      p.id,
      p.full_name,
      p.role::TEXT
    FROM profiles p
    WHERE p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
      AND p.id != current_user_id
      AND (
        -- Specialist's primary school matches one of user's schools
        p.school_id = ANY(user_schools_array)
        OR
        -- Specialist also works at multiple schools and shares a common school
        (p.works_at_multiple_schools = true AND EXISTS (
          SELECT 1
          FROM provider_schools ps
          WHERE ps.provider_id = p.id
            AND ps.school_id = ANY(user_schools_array)
        ))
      )
    ORDER BY p.full_name;
  ELSE
    -- Single school user - use original logic
    RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.role::TEXT
    FROM profiles p
    WHERE (
      -- Match by school_id if both users have it
      (user_school_id IS NOT NULL AND p.school_id IS NOT NULL AND p.school_id = user_school_id)
      OR
      -- Fallback to school_district + school_site only when both lack school_id
      (user_school_id IS NULL AND p.school_id IS NULL AND p.school_district = user_school_district AND p.school_site = user_school_site)
      OR
      -- Also include multi-school specialists who work at this user's school
      (p.works_at_multiple_schools = true AND EXISTS (
        SELECT 1
        FROM provider_schools ps
        WHERE ps.provider_id = p.id
          AND ps.school_id = user_school_id
      ))
    )
    AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
    AND p.id != current_user_id
    ORDER BY p.full_name;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION get_available_specialists(UUID) IS
'Returns all specialists that the current user can assign sessions to.
For multi-school users: Returns specialists at ANY of their schools.
For single-school users: Returns specialists at their primary school.
Supports both school_id (migrated schools) and school_district+school_site (legacy schools) matching.';
