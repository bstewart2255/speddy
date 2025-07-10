-- Create a function to normalize school district names
CREATE OR REPLACE FUNCTION normalize_district_name(district_name TEXT)
RETURNS TEXT AS $$
BEGIN
  IF district_name IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Convert to lowercase for comparison
  RETURN LOWER(
    -- Remove extra spaces
    TRIM(REGEXP_REPLACE(
      -- Normalize common abbreviations (with or without periods)
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              district_name,
              '\bMt\.?\b', 'mount', 'gi'
            ),
            '\bSt\.?\b', 'saint', 'gi'
          ),
          '\bDr\.?\b', 'drive', 'gi'
        ),
        '\bAve\.?\b', 'avenue', 'gi'
      ),
      '\s+', ' ', 'g'
    ))
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create a function to normalize school site names
CREATE OR REPLACE FUNCTION normalize_school_name(school_name TEXT)
RETURNS TEXT AS $$
BEGIN
  IF school_name IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Convert to lowercase for comparison
  RETURN LOWER(
    -- Remove extra spaces
    TRIM(REGEXP_REPLACE(
      -- Remove the word "School" at the end (with optional 's')
      REGEXP_REPLACE(
        -- Normalize common abbreviations (with or without periods)
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                school_name,
                '\bMt\.?\b', 'mount', 'gi'
              ),
              '\bSt\.?\b', 'saint', 'gi'
            ),
            '\bDr\.?\b', 'drive', 'gi'
          ),
          '\bAve\.?\b', 'avenue', 'gi'
        ),
        '\s+Schools?\s*$', '', 'i'
      ),
      '\s+', ' ', 'g'
    ))
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create indexes for better performance on normalized names
CREATE INDEX IF NOT EXISTS idx_profiles_normalized_district 
  ON profiles (normalize_district_name(school_district));
  
CREATE INDEX IF NOT EXISTS idx_profiles_normalized_school 
  ON profiles (normalize_school_name(school_site));

CREATE INDEX IF NOT EXISTS idx_provider_schools_normalized_district 
  ON provider_schools (normalize_district_name(school_district));
  
CREATE INDEX IF NOT EXISTS idx_provider_schools_normalized_school 
  ON provider_schools (normalize_school_name(school_site));

CREATE INDEX IF NOT EXISTS idx_students_normalized_district 
  ON students (normalize_district_name(school_district));
  
CREATE INDEX IF NOT EXISTS idx_students_normalized_school 
  ON students (normalize_school_name(school_site));

-- Create a function to find matching team members using normalized names
CREATE OR REPLACE FUNCTION find_team_members(
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
  SELECT 
    p.id,
    p.full_name,
    p.role,
    p.school_site,
    p.school_district
  FROM profiles p
  WHERE 
    normalize_school_name(p.school_site) = normalize_school_name(p_school_site)
    AND normalize_district_name(p.school_district) = normalize_district_name(p_school_district)
    AND (p_exclude_user_id IS NULL OR p.id != p_exclude_user_id)
  ORDER BY p.role, p.full_name;
END;
$$ LANGUAGE plpgsql;

-- Create a function to find matching team members from provider_schools
CREATE OR REPLACE FUNCTION find_team_members_multi_school(
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
  SELECT DISTINCT
    p.id,
    p.full_name,
    p.role,
    ps.school_site,
    ps.school_district
  FROM provider_schools ps
  JOIN profiles p ON p.id = ps.provider_id
  WHERE 
    normalize_school_name(ps.school_site) = normalize_school_name(p_school_site)
    AND normalize_district_name(ps.school_district) = normalize_district_name(p_school_district)
    AND (p_exclude_user_id IS NULL OR p.id != p_exclude_user_id)
  ORDER BY p.role, p.full_name;
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining the normalization
COMMENT ON FUNCTION normalize_district_name IS 'Normalizes district names by converting to lowercase, expanding abbreviations (Mt. -> mount, St. -> saint), and removing extra spaces';
COMMENT ON FUNCTION normalize_school_name IS 'Normalizes school names by converting to lowercase, expanding abbreviations, removing "School" suffix, and removing extra spaces';
