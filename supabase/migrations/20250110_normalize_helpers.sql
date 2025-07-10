-- Create a function to help administrators normalize existing data
-- This is optional but can help clean up existing inconsistencies

CREATE OR REPLACE FUNCTION normalize_existing_school_data()
RETURNS TABLE(
  table_name TEXT,
  records_updated INTEGER
) AS $$
DECLARE
  profiles_updated INTEGER;
  provider_schools_updated INTEGER;
  students_updated INTEGER;
BEGIN
  -- Note: This function shows what WOULD be normalized but doesn't actually update
  -- To run the actual updates, uncomment the UPDATE statements below
  
  -- Count profiles that need normalization
  SELECT COUNT(*) INTO profiles_updated
  FROM profiles
  WHERE school_site IS NOT NULL 
    AND (
      school_site != normalize_school_name(school_site) 
      OR school_district != normalize_district_name(school_district)
    );
  
  -- Count provider_schools that need normalization  
  SELECT COUNT(*) INTO provider_schools_updated
  FROM provider_schools
  WHERE school_site IS NOT NULL
    AND (
      school_site != normalize_school_name(school_site)
      OR school_district != normalize_district_name(school_district)  
    );
    
  -- Count students that need normalization
  SELECT COUNT(*) INTO students_updated
  FROM students
  WHERE school_site IS NOT NULL
    AND (
      school_site != normalize_school_name(school_site)
      OR school_district != normalize_district_name(school_district)
    );
  
  -- Return results
  RETURN QUERY
  SELECT 'profiles'::TEXT, profiles_updated
  UNION ALL
  SELECT 'provider_schools'::TEXT, provider_schools_updated
  UNION ALL
  SELECT 'students'::TEXT, students_updated;
  
  -- OPTIONAL: Uncomment these to actually update the data
  -- WARNING: This will modify existing data - make sure to backup first!
  
  -- UPDATE profiles 
  -- SET 
  --   school_site = normalize_school_name(school_site),
  --   school_district = normalize_district_name(school_district)
  -- WHERE school_site IS NOT NULL;
  
  -- UPDATE provider_schools
  -- SET
  --   school_site = normalize_school_name(school_site),
  --   school_district = normalize_district_name(school_district)
  -- WHERE school_site IS NOT NULL;
  
  -- UPDATE students
  -- SET
  --   school_site = normalize_school_name(school_site),
  --   school_district = normalize_district_name(school_district)  
  -- WHERE school_site IS NOT NULL;
  
END;
$$ LANGUAGE plpgsql;

-- Add a comment explaining the function
COMMENT ON FUNCTION normalize_existing_school_data IS 
'Shows count of records that need school name normalization. Uncomment UPDATE statements to perform actual normalization.';

-- Create a view to easily see mismatched team members
CREATE OR REPLACE VIEW potential_team_matches AS
SELECT DISTINCT
  p1.full_name as user1_name,
  p1.role as user1_role,
  p1.school_site as user1_school,
  p1.school_district as user1_district,
  p2.full_name as user2_name,
  p2.role as user2_role,
  p2.school_site as user2_school,
  p2.school_district as user2_district
FROM profiles p1
CROSS JOIN profiles p2
WHERE p1.id < p2.id  -- Avoid duplicates and self-matches
  AND normalize_school_name(p1.school_site) = normalize_school_name(p2.school_site)
  AND normalize_district_name(p1.school_district) = normalize_district_name(p2.school_district)
  AND (p1.school_site != p2.school_site OR p1.school_district != p2.school_district);

-- Add comment explaining the view
COMMENT ON VIEW potential_team_matches IS 
'Shows users who should be on the same team based on normalized names but currently have different spellings';
