-- Update the profile creation function to populate school IDs
-- This replaces the existing function to include school ID lookups

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user(
  user_id UUID,
  user_email TEXT,
  user_metadata JSONB
)
RETURNS void AS $$
DECLARE
  v_state_name TEXT;
  v_district_name TEXT;
  v_school_name TEXT;
  v_state_id VARCHAR(2);
  v_district_id VARCHAR(20);
  v_school_id VARCHAR(20);
  v_confidence FLOAT;
BEGIN
  -- Extract names from metadata (trim whitespace and handle both snake_case and camelCase)
  v_state_name := TRIM(COALESCE(user_metadata->>'state', ''));
  v_district_name := TRIM(COALESCE(
    user_metadata->>'school_district', 
    user_metadata->>'schoolDistrict', 
    ''
  ));
  v_school_name := TRIM(COALESCE(
    user_metadata->>'school_site', 
    user_metadata->>'schoolSite', 
    ''
  ));
  
  -- Try to find matching IDs
  IF v_state_name != '' OR v_district_name != '' OR v_school_name != '' THEN
    SELECT 
      matched_state_id,
      matched_district_id,
      matched_school_id,
      confidence_score
    INTO 
      v_state_id,
      v_district_id,
      v_school_id,
      v_confidence
    FROM public.find_school_ids_by_names(
      v_school_name,
      v_district_name,
      v_state_name
    );
    
    -- Log the matching attempt for SEA profiles
    IF COALESCE(user_metadata->>'role', 'resource') = 'sea' THEN
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
        user_id,
        v_district_name,
        v_school_name,
        v_state_id,
        v_district_id,
        v_school_id,
        v_confidence,
        'auto',
        'Automatic matching during profile creation'
      );
    END IF;
  END IF;
  
  -- Insert or update the profile with the found IDs
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    school_district,
    school_site,
    state_id,
    district_id,
    school_id,
    works_at_multiple_schools,
    district_domain,
    created_at,
    updated_at
  )
  VALUES (
    user_id,
    user_email,
    COALESCE(user_metadata->>'full_name', ''),
    COALESCE(user_metadata->>'role', 'resource'),
    v_district_name,
    v_school_name,
    v_state_id,
    v_district_id,
    v_school_id,
    COALESCE((user_metadata->>'works_at_multiple_schools')::boolean, false),
    SPLIT_PART(user_email, '@', 2),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = COALESCE(EXCLUDED.role, profiles.role),
    school_district = COALESCE(EXCLUDED.school_district, profiles.school_district),
    school_site = COALESCE(EXCLUDED.school_site, profiles.school_site),
    state_id = COALESCE(EXCLUDED.state_id, profiles.state_id),
    district_id = COALESCE(EXCLUDED.district_id, profiles.district_id),
    school_id = COALESCE(EXCLUDED.school_id, profiles.school_id),
    works_at_multiple_schools = COALESCE(EXCLUDED.works_at_multiple_schools, profiles.works_at_multiple_schools),
    district_domain = EXCLUDED.district_domain,
    updated_at = NOW();
    
  -- If this was an SEA profile and we couldn't match schools, log a warning with confidence score
  IF COALESCE(user_metadata->>'role', 'resource') = 'sea' AND v_school_id IS NULL THEN
    RAISE WARNING 'SEA profile created without school IDs for user %: state=%, district=%, school=%, confidence=%', 
      user_id, v_state_name, v_district_name, v_school_name, v_confidence;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure permissions are still granted
GRANT EXECUTE ON FUNCTION public.create_profile_for_new_user(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_profile_for_new_user(UUID, TEXT, JSONB) TO service_role;

-- Update comment
COMMENT ON FUNCTION public.create_profile_for_new_user IS 
'Creates or updates a profile record for a new user, automatically matching school names to IDs. Called from the application during signup.';