-- Update site admin RLS policy to include secondary school associations
-- This fixes issue #474: Site admin sees 'Unknown' for bell schedule creators
--
-- The previous policy only checked profiles.school_id (primary school).
-- This update also checks provider_schools for users who work at the school
-- as a secondary assignment (e.g., Blair Stewart at Mt Diablo Elementary).

-- Drop the existing policy
DROP POLICY IF EXISTS "Site admins can view profiles at their school" ON profiles;

-- Create updated policy that checks both primary and secondary schools
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
