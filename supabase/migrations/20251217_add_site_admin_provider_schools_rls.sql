-- Add RLS policy for site admins to view provider_schools at their school
-- This is needed because the profiles RLS policy checks provider_schools,
-- and that inner query is also subject to RLS.
--
-- Without this, site admins can't see profiles of providers who have
-- their school as a secondary school (via provider_schools).

CREATE POLICY "Site admins can view provider_schools at their school"
ON provider_schools
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM admin_permissions ap
    WHERE ap.admin_id = auth.uid()
    AND ap.role = 'site_admin'
    AND ap.school_id = provider_schools.school_id
  )
);

COMMENT ON POLICY "Site admins can view provider_schools at their school" ON provider_schools IS
'Allows site administrators to view provider_schools entries for their school. This enables the profiles RLS policy to correctly identify providers who work at the school as secondary assignment.';
