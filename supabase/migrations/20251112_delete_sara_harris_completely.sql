-- Delete Sara Harris completely so she can be recreated via Supabase Dashboard
-- This cleans up the broken manually-created user

-- Step 1: Delete from admin_permissions (foreign key to profiles)
DELETE FROM public.admin_permissions
WHERE admin_id = '7cabcb2b-a072-4cb2-bfd4-908e41fbc434';

-- Step 2: Delete from profiles
DELETE FROM public.profiles
WHERE id = '7cabcb2b-a072-4cb2-bfd4-908e41fbc434';

-- Step 3: Delete from auth.users
DELETE FROM auth.users
WHERE id = '7cabcb2b-a072-4cb2-bfd4-908e41fbc434';

-- Verify deletion
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM auth.users
  WHERE email = 'harrissara@mdusd.org';

  IF remaining_count > 0 THEN
    RAISE EXCEPTION 'Failed to delete Sara Harris auth user';
  END IF;

  RAISE NOTICE 'Successfully deleted all Sara Harris records. Ready to recreate via Dashboard.';
END $$;
