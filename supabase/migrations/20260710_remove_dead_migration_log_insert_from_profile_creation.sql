-- Remove the dead school_migration_log INSERT from create_profile_for_new_user.
--
-- The SEA-only logging branch (added in 20250826_update_profile_creation_with_ids)
-- inserts into school_migration_log, but that table does not exist in the live
-- database (the 20250807 migration that created it is not in the recorded
-- history, and no schema contains it). The branch therefore throws
-- `relation "school_migration_log" does not exist` on EVERY SEA profile
-- creation, breaking SEA account creation through all admin routes that call
-- this RPC (providers/teachers/site-admin/create-admin-account). Surfaced by
-- the sim district's first live seed on its SEA persona.
--
-- This redefinition is byte-identical to the live function except the dead
-- INSERT block is removed. CREATE OR REPLACE preserves ownership and the
-- existing grants (service-role-only: anon revoked in 20260529201326,
-- authenticated revoked in 20260531012347).

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user(user_id uuid, user_email text, user_metadata jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_state_name TEXT;
  v_district_name TEXT;
  v_school_name TEXT;
  v_state_id VARCHAR(2);
  v_district_id VARCHAR(20);
  v_school_id VARCHAR(20);
  v_confidence FLOAT;
BEGIN
  -- Extract names from metadata
  v_state_name := COALESCE(user_metadata->>'state', '');
  v_district_name := COALESCE(user_metadata->>'school_district', '');
  v_school_name := COALESCE(user_metadata->>'school_site', '');

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

  -- If this was an SEA profile and we couldn't match schools, log a warning
  IF COALESCE(user_metadata->>'role', 'resource') = 'sea' AND v_school_id IS NULL THEN
    RAISE WARNING 'SEA profile created without school IDs for user %: state=%, district=%, school=%',
      user_id, v_state_name, v_district_name, v_school_name;
  END IF;
END;
$function$;
