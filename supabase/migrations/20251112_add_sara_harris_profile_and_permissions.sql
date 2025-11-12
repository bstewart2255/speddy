-- Add profile and admin permissions for Sara Harris
-- User should be created via Supabase Dashboard first to ensure proper auth.users initialization

DO $$
DECLARE
  sara_user_id uuid;
BEGIN
  -- Get Sara's user ID from auth.users (created via dashboard)
  SELECT id INTO sara_user_id
  FROM auth.users
  WHERE email = 'harrissara@mdusd.org';

  IF sara_user_id IS NULL THEN
    RAISE EXCEPTION 'Sara Harris user not found in auth.users. Please create via Supabase Dashboard first.';
  END IF;

  -- Delete any existing profile/permissions (in case of re-run)
  DELETE FROM public.admin_permissions WHERE admin_id = sara_user_id;
  DELETE FROM public.profiles WHERE id = sara_user_id;

  -- Create profile
  INSERT INTO public.profiles (
    id, email, full_name, role,
    school_id, school_site, school_district, district_id, district_domain
  ) VALUES (
    sara_user_id,
    'harrissara@mdusd.org',
    'Sara Harris',
    'site_admin',
    '062271002458',
    'Mt Diablo Elementary',
    'Mt Diablo Unified',
    '0761754',
    'mdusd.org'
  );

  -- Grant admin permissions
  INSERT INTO public.admin_permissions (
    admin_id, role, school_id, district_id, state_id
  ) VALUES (
    sara_user_id,
    'site_admin',
    '062271002458',
    '0761754',
    'ca'
  );

  RAISE NOTICE 'Successfully added profile and admin permissions for Sara Harris (user_id: %)', sara_user_id;
END $$;
