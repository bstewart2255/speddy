-- Fix SELECT policy: All users should see all bell schedules at their school
-- Bell schedules are school-wide resources used for scheduling/conflict detection

-- Drop the current SELECT policy
DROP POLICY IF EXISTS "Users can view bell schedules" ON bell_schedules;

-- New SELECT policy: Users can see all bell schedules at schools they work at
CREATE POLICY "Users can view bell schedules"
ON bell_schedules FOR SELECT
USING (
  -- User is the provider who created it
  provider_id = auth.uid()
  OR
  -- User is the creator (site admin)
  created_by_id = auth.uid()
  OR
  -- User works at this school (via provider_schools)
  EXISTS (
    SELECT 1 FROM provider_schools ps
    WHERE ps.provider_id = auth.uid()
    AND ps.school_id = bell_schedules.school_id
  )
  OR
  -- User's primary school matches (via profiles)
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.school_id = bell_schedules.school_id
  )
  OR
  -- User is a site admin for this school
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = auth.uid()
    AND ap.role = 'site_admin'
    AND ap.school_id = bell_schedules.school_id
  )
);
