-- Add RLS policy for site admins to view profiles at their school
-- This fixes issue #473: Site admin shows '0' providers
--
-- Root cause: The existing RLS policy only allowed users to see their own profile,
-- and district admins could see profiles in their district. Site admins had no policy
-- to view profiles at their school.

CREATE POLICY "Site admins can view profiles at their school"
ON profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM admin_permissions ap
    WHERE ap.admin_id = auth.uid()
    AND ap.role = 'site_admin'
    AND ap.school_id = profiles.school_id
  )
);

COMMENT ON POLICY "Site admins can view profiles at their school" ON profiles IS
'Allows site administrators to view all user profiles at schools they manage. This enables them to see providers and specialists working at their school.';
