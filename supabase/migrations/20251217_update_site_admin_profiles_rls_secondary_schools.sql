-- Add RLS policy for site admins to view profiles at their school
-- This fixes issue #473: Site admin shows '0' providers
-- This fixes issue #474: Site admin sees 'Unknown' for bell schedule creators
--
-- Root cause: The existing RLS policies only allowed users to see their own profile,
-- and district admins could see profiles in their district. Site admins had no policy
-- to view profiles at their school.
--
-- This policy checks BOTH:
-- 1. Users whose primary school matches (profiles.school_id)
-- 2. Users who work at the school as secondary (via provider_schools table)
--
-- Note: This policy requires the companion provider_schools RLS policy
-- (20251217_add_site_admin_provider_schools_rls.sql) to work correctly for
-- secondary school lookups.

-- Drop any existing policy (for idempotency)
DROP POLICY IF EXISTS "Site admins can view profiles at their school" ON profiles;

-- Create policy that checks both primary and secondary schools
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
    AND (
      -- Primary school match
      ap.school_id = profiles.school_id
      OR
      -- Secondary school match via provider_schools
      EXISTS (
        SELECT 1
        FROM provider_schools ps
        WHERE ps.provider_id = profiles.id
        AND ps.school_id = ap.school_id
      )
    )
  )
);

COMMENT ON POLICY "Site admins can view profiles at their school" ON profiles IS
'Allows site administrators to view profiles of users who work at their school, either as primary or secondary school assignment.';
