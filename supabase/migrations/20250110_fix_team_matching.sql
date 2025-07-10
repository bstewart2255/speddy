-- Create a comprehensive function to find all team members at a school
-- This function finds all users at the same normalized school, regardless of spelling variations
CREATE OR REPLACE FUNCTION find_all_team_members(
  p_school_site TEXT,
  p_school_district TEXT,
  p_exclude_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  role TEXT,
  school_site TEXT,
  school_district TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH normalized_input AS (
    SELECT 
      normalize_school_name(p_school_site) as norm_site,
      normalize_district_name(p_school_district) as norm_district
  ),
  -- Find all users from profiles table at this normalized school
  profile_users AS (
    SELECT 
      p.id,
      p.full_name,
      p.role,
      p.school_site,
      p.school_district
    FROM profiles p, normalized_input n
    WHERE 
      normalize_school_name(p.school_site) = n.norm_site
      AND normalize_district_name(p.school_district) = n.norm_district
      AND (p_exclude_user_id IS NULL OR p.id != p_exclude_user_id)
  ),
  -- Find all users from provider_schools table at this normalized school
  provider_school_users AS (
    SELECT DISTINCT
      p.id,
      p.full_name,
      p.role,
      ps.school_site,
      ps.school_district
    FROM provider_schools ps
    JOIN profiles p ON p.id = ps.provider_id, normalized_input n
    WHERE 
      normalize_school_name(ps.school_site) = n.norm_site
      AND normalize_district_name(ps.school_district) = n.norm_district
      AND (p_exclude_user_id IS NULL OR p.id != p_exclude_user_id)
  )
  -- Combine both sets, keeping the user's actual school spelling from their profile
  SELECT DISTINCT ON (u.id)
    u.id,
    u.full_name,
    u.role,
    COALESCE(pu.school_site, u.school_site) as school_site,
    COALESCE(pu.school_district, u.school_district) as school_district
  FROM (
    SELECT * FROM profile_users
    UNION ALL
    SELECT * FROM provider_school_users
  ) u
  LEFT JOIN profile_users pu ON pu.id = u.id
  ORDER BY u.id, u.role, u.full_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION find_all_team_members IS 'Finds all team members at a school using fuzzy matching, returning each user only once with their profile school spelling preferred';
