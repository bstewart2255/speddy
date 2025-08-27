-- Create function to find school IDs by name matching
-- This function helps match school names to their corresponding IDs in the structured tables

-- First, enable pg_trgm extension for fuzzy matching if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create the lookup function
CREATE OR REPLACE FUNCTION public.find_school_ids_by_names(
  p_school_site_name TEXT,
  p_school_district_name TEXT,
  p_state_name TEXT
)
RETURNS TABLE (
  matched_state_id VARCHAR(2),
  matched_district_id VARCHAR(20),
  matched_school_id VARCHAR(20),
  confidence_score FLOAT
) AS $$
DECLARE
  v_state_id VARCHAR(2);
  v_district_id VARCHAR(20);
  v_school_id VARCHAR(20);
  v_confidence FLOAT;
  -- Define similarity thresholds as constants
  v_similarity_threshold CONSTANT FLOAT := 0.3;  -- Default threshold for fuzzy matching
  v_cross_district_threshold CONSTANT FLOAT := 0.4;  -- Higher threshold for cross-district matching
BEGIN
  -- Initialize confidence score
  v_confidence := 0.0;
  
  -- Step 1: Find the state
  -- Try exact match first (id is the state abbreviation like 'CA', 'NY')
  SELECT id INTO v_state_id
  FROM states
  WHERE LOWER(name) = LOWER(p_state_name)
     OR LOWER(full_name) = LOWER(p_state_name)
     OR LOWER(id) = LOWER(p_state_name)
  LIMIT 1;
  
  -- If no exact match, try fuzzy match
  IF v_state_id IS NULL AND p_state_name IS NOT NULL AND p_state_name != '' THEN
    SELECT id INTO v_state_id
    FROM states
    WHERE LOWER(name) ILIKE '%' || LOWER(p_state_name) || '%'
       OR LOWER(full_name) ILIKE '%' || LOWER(p_state_name) || '%'
       OR LOWER(id) ILIKE '%' || LOWER(p_state_name) || '%'
    ORDER BY 
      CASE 
        WHEN LOWER(id) = LOWER(p_state_name) THEN 1
        WHEN LOWER(name) = LOWER(p_state_name) THEN 2
        WHEN LOWER(full_name) = LOWER(p_state_name) THEN 3
        ELSE 4
      END
    LIMIT 1;
  END IF;
  
  -- Step 2: Find the district
  IF v_state_id IS NOT NULL AND p_school_district_name IS NOT NULL AND p_school_district_name != '' THEN
    -- Try exact match first
    SELECT id INTO v_district_id
    FROM districts
    WHERE state_id = v_state_id
      AND LOWER(name) = LOWER(p_school_district_name)
    LIMIT 1;
    
    -- If no exact match, try fuzzy match
    IF v_district_id IS NULL THEN
      -- Remove common suffixes for better matching
      SELECT id INTO v_district_id
      FROM districts
      WHERE state_id = v_state_id
        AND (
          LOWER(name) ILIKE '%' || LOWER(p_school_district_name) || '%'
          OR LOWER(p_school_district_name) ILIKE '%' || LOWER(name) || '%'
          OR similarity(LOWER(name), LOWER(p_school_district_name)) > v_similarity_threshold
        )
      ORDER BY similarity(LOWER(name), LOWER(p_school_district_name)) DESC
      LIMIT 1;
    END IF;
  END IF;
  
  -- Step 3: Find the school
  IF v_district_id IS NOT NULL AND p_school_site_name IS NOT NULL AND p_school_site_name != '' THEN
    -- Try exact match first
    SELECT id INTO v_school_id
    FROM schools
    WHERE district_id = v_district_id
      AND state_id = v_state_id
      AND LOWER(name) = LOWER(p_school_site_name)
    LIMIT 1;
    
    -- If no exact match, try fuzzy match
    IF v_school_id IS NULL THEN
      -- Try various matching strategies
      SELECT id INTO v_school_id
      FROM schools
      WHERE district_id = v_district_id
        AND state_id = v_state_id
        AND (
          LOWER(name) ILIKE '%' || LOWER(p_school_site_name) || '%'
          OR LOWER(p_school_site_name) ILIKE '%' || LOWER(name) || '%'
          OR similarity(LOWER(name), LOWER(p_school_site_name)) > v_similarity_threshold
        )
      ORDER BY similarity(LOWER(name), LOWER(p_school_site_name)) DESC
      LIMIT 1;
    END IF;
    
    -- If still no match, try searching without district constraint
    IF v_school_id IS NULL THEN
      SELECT id, district_id INTO v_school_id, v_district_id
      FROM schools
      WHERE state_id = v_state_id
        AND (
          LOWER(name) ILIKE '%' || LOWER(p_school_site_name) || '%'
          OR similarity(LOWER(name), LOWER(p_school_site_name)) > v_cross_district_threshold  -- Higher threshold for cross-district matching
        )
      ORDER BY similarity(LOWER(name), LOWER(p_school_site_name)) DESC
      LIMIT 1;
    END IF;
  END IF;
  
  -- Calculate confidence score based on what was matched
  IF v_state_id IS NOT NULL THEN
    v_confidence := v_confidence + 0.2;
  END IF;
  
  IF v_district_id IS NOT NULL THEN
    v_confidence := v_confidence + 0.3;
  END IF;
  
  IF v_school_id IS NOT NULL THEN
    v_confidence := v_confidence + 0.5;
  END IF;
  
  -- Return the results
  RETURN QUERY
  SELECT 
    v_state_id AS matched_state_id,
    v_district_id AS matched_district_id,
    v_school_id AS matched_school_id,
    v_confidence AS confidence_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.find_school_ids_by_names(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_school_ids_by_names(TEXT, TEXT, TEXT) TO service_role;

-- Add comment explaining the function
COMMENT ON FUNCTION public.find_school_ids_by_names IS 
'Finds school, district, and state IDs by matching text names. Returns matched IDs and a confidence score (0-1) indicating match quality.';