-- Recreate Sara Harris account using proper Supabase user creation
-- Previous manual creation caused schema inconsistencies with auth.users

-- Step 1: Delete existing Sara Harris records
DELETE FROM public.admin_permissions WHERE admin_id = '7cabcb2b-a072-4cb2-bfd4-908e41fbc434';
DELETE FROM public.profiles WHERE id = '7cabcb2b-a072-4cb2-bfd4-908e41fbc434';
DELETE FROM auth.users WHERE id = '7cabcb2b-a072-4cb2-bfd4-908e41fbc434';

-- Step 2: Create user properly using Supabase Auth's admin function
-- Note: This uses Supabase's internal auth.create_user function which properly initializes all fields
SELECT auth.admin_create_user(
  json_build_object(
    'email', 'harrissara@mdusd.org',
    'password', 'SaraHarris27!',
    'email_confirm', true,
    'user_metadata', json_build_object('full_name', 'Sara Harris')
  )
);

-- Step 3: Get the newly created user ID
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  SELECT id INTO new_user_id
  FROM auth.users
  WHERE email = 'harrissara@mdusd.org';

  IF new_user_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create Sara Harris auth user';
  END IF;

  -- Step 4: Create profile
  INSERT INTO public.profiles (
    id, email, full_name, role,
    school_id, school_site, district_id, district_domain
  ) VALUES (
    new_user_id,
    'harrissara@mdusd.org',
    'Sara Harris',
    'site_admin',
    '062271002458',
    'Mt Diablo Elementary',
    '0761754',
    'mdusd.org'
  );

  -- Step 5: Grant admin permissions
  INSERT INTO public.admin_permissions (
    admin_id, role, school_id, district_id, state_id
  ) VALUES (
    new_user_id,
    'site_admin',
    '062271002458',
    '0761754',
    'ca'
  );

  RAISE NOTICE 'Successfully recreated Sara Harris with user_id: %', new_user_id;
END $$;
