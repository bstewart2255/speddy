-- Migration to fix existing SEA profiles that are missing school IDs
-- This will attempt to populate school_id, district_id, and state_id for existing SEA profiles

-- Create a temporary function to migrate existing SEA profiles
CREATE OR REPLACE FUNCTION migrate_existing_sea_profiles()
RETURNS TABLE (
  profile_id UUID,
  email TEXT,
  status TEXT,
  matched_state_id VARCHAR(2),
  matched_district_id VARCHAR(20),
  matched_school_id VARCHAR(20),
  confidence FLOAT
) AS $$
DECLARE
  sea_profile RECORD;
  v_state_id VARCHAR(2);
  v_district_id VARCHAR(20);
  v_school_id VARCHAR(20);
  v_confidence FLOAT;
  v_status TEXT;
  v_count INTEGER := 0;
  v_fixed INTEGER := 0;
BEGIN
  -- Find all SEA profiles that are missing any ID fields
  FOR sea_profile IN 
    SELECT 
      p.id,
      p.email,
      p.school_district,
      p.school_site,
      u.raw_user_meta_data->>'state' as state_name
    FROM profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'sea'
      AND (p.school_id IS NULL OR p.district_id IS NULL OR p.state_id IS NULL)
  LOOP
    v_count := v_count + 1;
    v_status := 'not_matched';
    
    -- Try to find matching IDs
    SELECT 
      f.matched_state_id,
      f.matched_district_id,
      f.matched_school_id,
      f.confidence_score
    INTO 
      v_state_id,
      v_district_id,
      v_school_id,
      v_confidence
    FROM public.find_school_ids_by_names(
      sea_profile.school_site,
      sea_profile.school_district,
      sea_profile.state_name
    ) f;
    
    -- Update the profile if we found matches
    IF v_school_id IS NOT NULL OR v_district_id IS NOT NULL OR v_state_id IS NOT NULL THEN
      UPDATE profiles
      SET 
        state_id = COALESCE(v_state_id, state_id),
        district_id = COALESCE(v_district_id, district_id),
        school_id = COALESCE(v_school_id, school_id),
        updated_at = NOW()
      WHERE id = sea_profile.id;
      
      v_status := 'updated';
      v_fixed := v_fixed + 1;
      
      -- Log the migration
      INSERT INTO school_migration_log (
        profile_id,
        original_district,
        original_school,
        matched_state_id,
        matched_district_id,
        matched_school_id,
        confidence_score,
        migration_type,
        notes
      ) VALUES (
        sea_profile.id,
        sea_profile.school_district,
        sea_profile.school_site,
        v_state_id,
        v_district_id,
        v_school_id,
        v_confidence,
        'migration',
        'Batch migration for existing SEA profiles'
      );
    ELSE
      -- Log failed migration attempts
      INSERT INTO school_migration_log (
        profile_id,
        original_district,
        original_school,
        matched_state_id,
        matched_district_id,
        matched_school_id,
        confidence_score,
        migration_type,
        notes
      ) VALUES (
        sea_profile.id,
        sea_profile.school_district,
        sea_profile.school_site,
        NULL,
        NULL,
        NULL,
        0,
        'migration_failed',
        'Could not find matching schools for SEA profile'
      );
    END IF;
    
    -- Return status for this profile
    RETURN QUERY
    SELECT 
      sea_profile.id,
      sea_profile.email,
      v_status,
      v_state_id,
      v_district_id,
      v_school_id,
      v_confidence;
  END LOOP;
  
  -- Log summary
  IF v_count > 0 THEN
    RAISE NOTICE 'SEA Profile Migration: Processed % profiles, fixed % profiles', v_count, v_fixed;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Run the migration
DO $$
DECLARE
  migration_results RECORD;
  total_count INTEGER := 0;
  success_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting SEA profile migration...';
  
  FOR migration_results IN 
    SELECT * FROM migrate_existing_sea_profiles()
  LOOP
    total_count := total_count + 1;
    IF migration_results.status = 'updated' THEN
      success_count := success_count + 1;
      RAISE NOTICE 'Updated profile % (%) with confidence %', 
        migration_results.profile_id, 
        migration_results.email,
        migration_results.confidence;
    ELSE
      RAISE WARNING 'Could not match schools for profile % (%)', 
        migration_results.profile_id,
        migration_results.email;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Migration complete: % of % SEA profiles updated', success_count, total_count;
END $$;

-- Drop the temporary function
DROP FUNCTION IF EXISTS migrate_existing_sea_profiles();

-- Create an index to help identify profiles needing manual review
CREATE INDEX IF NOT EXISTS idx_profiles_missing_school_ids 
ON profiles(id) 
WHERE role = 'sea' AND (school_id IS NULL OR district_id IS NULL OR state_id IS NULL);