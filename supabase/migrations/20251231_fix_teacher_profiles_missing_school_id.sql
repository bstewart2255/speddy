-- Fix teacher profiles that have null school_id
-- by syncing from the teachers table which has the correct school_id
--
-- Root cause: When teacher accounts were created, the profiles.school_id
-- was not always set, causing RLS policies to block site admins from
-- seeing/managing those teacher profiles (e.g., reset password fails with "user not found")

-- Update profiles to have the correct school_id from teachers table
UPDATE profiles p
SET school_id = t.school_id
FROM teachers t
WHERE p.id = t.account_id
  AND t.account_id IS NOT NULL
  AND p.school_id IS NULL
  AND t.school_id IS NOT NULL;
