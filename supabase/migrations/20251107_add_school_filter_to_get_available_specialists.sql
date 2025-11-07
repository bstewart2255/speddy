-- Add school filtering to get_available_specialists function
--
-- Problem: When viewing a specific school's schedule, the session assignment popup
-- shows specialists from ALL schools the user works at, not just the currently viewed school.
--
-- Solution: Add optional filter_school_id parameter to filter specialists by the
-- currently viewed school in the UI, while maintaining backward compatibility for
-- permission checking scenarios where all schools should be returned.

CREATE OR REPLACE FUNCTION get_available_specialists(
  current_user_id UUID,
  filter_school_id VARCHAR DEFAULT NULL
)
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

  -- If filter_school_id is provided, filter to that specific school only
  IF filter_school_id IS NOT NULL THEN
    RETURN QUERY
    SELECT DISTINCT
      p.id,
      p.full_name,
      p.role::TEXT
    FROM profiles p
    WHERE p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
      AND p.id != current_user_id
      AND (
        -- Specialist's primary school matches the filter
        p.school_id = filter_school_id
        OR
        -- Multi-school specialist who works at the filtered school
        (p.works_at_multiple_schools = true AND EXISTS (
          SELECT 1
          FROM provider_schools ps
          WHERE ps.provider_id = p.id
            AND ps.school_id = filter_school_id
        ))
      )
    ORDER BY p.full_name;
    RETURN;
  END IF;

  -- Original logic: If user works at multiple schools, get all their schools
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

COMMENT ON FUNCTION get_available_specialists(UUID, VARCHAR) IS
'Returns specialists that the current user can assign sessions to.
When filter_school_id is provided: Returns specialists at that specific school only (for UI filtering).
When filter_school_id is NULL: Returns specialists at ALL user''s schools (for permission checking).
Supports both school_id (migrated schools) and school_district+school_site (legacy schools) matching.';
