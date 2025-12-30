-- Migration: Fix profiles_update RLS policy to prevent privilege escalation
-- Issue: #514 - Users can modify their own profile.role to bypass RLS restrictions
--
-- Problem: The profiles_update policy allows authenticated users to update
-- their own profile row with no column restrictions. A malicious user could
-- escalate privileges by changing their role or is_speddy_admin flag.
--
-- Solution: Restrict updates so users cannot modify sensitive columns:
-- - role
-- - is_speddy_admin
-- - school_id
-- - district_id

-- Drop the existing vulnerable policy
DROP POLICY IF EXISTS "profiles_update" ON profiles;

-- Create new policy with column restrictions
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR auth.role() = 'service_role')
  WITH CHECK (
    -- Service role can update anything
    auth.role() = 'service_role'
    OR (
      -- Regular users can only update their own row
      auth.uid() = id
      -- AND cannot change sensitive columns
      AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
      AND is_speddy_admin IS NOT DISTINCT FROM (SELECT p.is_speddy_admin FROM profiles p WHERE p.id = auth.uid())
      AND school_id IS NOT DISTINCT FROM (SELECT p.school_id FROM profiles p WHERE p.id = auth.uid())
      AND district_id IS NOT DISTINCT FROM (SELECT p.district_id FROM profiles p WHERE p.id = auth.uid())
    )
  );

-- Add comment explaining the policy
COMMENT ON POLICY "profiles_update" ON profiles IS
  'Users can update their own profile but cannot modify role, is_speddy_admin, school_id, or district_id. Service role can update all columns.';
