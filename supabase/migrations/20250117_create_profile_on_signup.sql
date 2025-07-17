-- Note: This migration has been updated to not create a trigger on auth.users
-- as it requires superuser permissions. Instead, the profile creation is handled
-- by the API route during signup.

-- Create function to handle new user signup and create profile
-- This function can be called from the application code instead of a trigger
CREATE OR REPLACE FUNCTION public.create_profile_for_new_user(
  user_id UUID,
  user_email TEXT,
  user_metadata JSONB
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    school_district,
    school_site,
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
    COALESCE(user_metadata->>'school_district', ''),
    COALESCE(user_metadata->>'school_site', ''),
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
    works_at_multiple_schools = COALESCE(EXCLUDED.works_at_multiple_schools, profiles.works_at_multiple_schools),
    district_domain = EXCLUDED.district_domain,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_profile_for_new_user(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_profile_for_new_user(UUID, TEXT, JSONB) TO service_role;

-- Add comment explaining the function
COMMENT ON FUNCTION public.create_profile_for_new_user IS 
'Creates or updates a profile record for a new user. Called from the application during signup since we cannot create triggers on auth.users table.';