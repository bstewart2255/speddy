-- Create improved team matching function that handles both ID-based and text-based matching
-- This function provides a hybrid approach during the migration period

DROP FUNCTION IF EXISTS find_all_team_members_v2(UUID);

CREATE OR REPLACE FUNCTION find_all_team_members_v2(current_user_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  display_name TEXT,
  role TEXT,
  school_district TEXT,
  school_site TEXT,
  state_id VARCHAR(2),
  district_id VARCHAR(20),
  school_id VARCHAR(20),
  grade_level TEXT,
  subject TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  matching_method TEXT -- 'exact_id', 'text_fuzzy', 'hybrid'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_school_id VARCHAR(20);
  user_district_id VARCHAR(20);
  user_state_id VARCHAR(2);
  user_school_district TEXT;
  user_school_site TEXT;
  school_name TEXT;
  district_name TEXT;
BEGIN
  -- Get current user's school information
  SELECT 
    p.school_id,
    p.district_id,
    p.state_id,
    p.school_district,
    p.school_site
  INTO 
    user_school_id,
    user_district_id,
    user_state_id,
    user_school_district,
    user_school_site
  FROM profiles p
  WHERE p.id = current_user_id;

  -- If user has school_id, get the school and district names for hybrid matching
  IF user_school_id IS NOT NULL THEN
    SELECT s.name, d.name
    INTO school_name, district_name
    FROM schools s
    JOIN districts d ON s.district_id = d.id
    WHERE s.id = user_school_id;
  END IF;

  RETURN QUERY
  WITH matched_users AS (
    -- Primary: Exact ID matching for users with school_id
    SELECT DISTINCT
      p.id,
      p.email,
      p.display_name,
      p.role,
      p.school_district,
      p.school_site,
      p.state_id,
      p.district_id,
      p.school_id,
      p.grade_level,
      p.subject,
      p.bio,
      p.avatar_url,
      p.created_at,
      'exact_id'::TEXT as matching_method
    FROM profiles p
    WHERE user_school_id IS NOT NULL
      AND p.school_id = user_school_id
      AND p.id != current_user_id
    
    UNION
    
    -- Hybrid: Match text-based users to ID-based school
    SELECT DISTINCT
      p.id,
      p.email,
      p.display_name,
      p.role,
      p.school_district,
      p.school_site,
      p.state_id,
      p.district_id,
      p.school_id,
      p.grade_level,
      p.subject,
      p.bio,
      p.avatar_url,
      p.created_at,
      'hybrid'::TEXT as matching_method
    FROM profiles p
    WHERE user_school_id IS NOT NULL
      AND p.school_id IS NULL
      AND p.school_site IS NOT NULL
      AND p.school_district IS NOT NULL
      AND p.id != current_user_id
      AND (
        -- Fuzzy match on school name
        similarity(LOWER(TRIM(p.school_site)), LOWER(school_name)) > 0.7
        OR LOWER(TRIM(p.school_site)) LIKE '%' || LOWER(school_name) || '%'
        OR LOWER(school_name) LIKE '%' || LOWER(TRIM(p.school_site)) || '%'
      )
      AND (
        -- Fuzzy match on district name
        similarity(LOWER(TRIM(p.school_district)), LOWER(district_name)) > 0.6
        OR LOWER(TRIM(p.school_district)) LIKE '%' || LOWER(district_name) || '%'
        OR LOWER(district_name) LIKE '%' || LOWER(TRIM(p.school_district)) || '%'
      )
    
    UNION
    
    -- Fallback: Text-based fuzzy matching for users without school_id
    SELECT DISTINCT
      p.id,
      p.email,
      p.display_name,
      p.role,
      p.school_district,
      p.school_site,
      p.state_id,
      p.district_id,
      p.school_id,
      p.grade_level,
      p.subject,
      p.bio,
      p.avatar_url,
      p.created_at,
      'text_fuzzy'::TEXT as matching_method
    FROM profiles p
    WHERE user_school_id IS NULL
      AND user_school_site IS NOT NULL
      AND user_school_district IS NOT NULL
      AND p.school_site IS NOT NULL
      AND p.school_district IS NOT NULL
      AND p.id != current_user_id
      AND normalize_school_name(p.school_site) = normalize_school_name(user_school_site)
      AND (
        normalize_school_name(p.school_district) = normalize_school_name(user_school_district)
        OR similarity(LOWER(TRIM(p.school_district)), LOWER(TRIM(user_school_district))) > 0.8
      )
  )
  SELECT * FROM matched_users
  ORDER BY 
    CASE matching_method
      WHEN 'exact_id' THEN 1
      WHEN 'hybrid' THEN 2
      WHEN 'text_fuzzy' THEN 3
    END,
    created_at DESC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION find_all_team_members_v2(UUID) TO authenticated;

-- Create helper function to get migration statistics
CREATE OR REPLACE FUNCTION get_school_migration_stats()
RETURNS TABLE (
  total_users BIGINT,
  migrated_users BIGINT,
  unmigrated_users BIGINT,
  migration_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_users,
    COUNT(CASE WHEN school_id IS NOT NULL THEN 1 END)::BIGINT as migrated_users,
    COUNT(CASE WHEN school_id IS NULL THEN 1 END)::BIGINT as unmigrated_users,
    ROUND(
      (COUNT(CASE WHEN school_id IS NOT NULL THEN 1 END)::NUMERIC / 
       NULLIF(COUNT(*)::NUMERIC, 0)) * 100, 
      2
    ) as migration_percentage
  FROM profiles
  WHERE school_site IS NOT NULL OR school_id IS NOT NULL;
END;
$$;

-- Grant execute permission to admin users only
GRANT EXECUTE ON FUNCTION get_school_migration_stats() TO authenticated;