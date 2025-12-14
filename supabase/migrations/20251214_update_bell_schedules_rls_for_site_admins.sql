-- Update RLS policies for bell_schedules to support site admins
-- Site admins can create/view/delete bell schedules at their school

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert their own bell schedules" ON bell_schedules;
DROP POLICY IF EXISTS "Users can view their own bell schedules" ON bell_schedules;
DROP POLICY IF EXISTS "Users can update their own bell schedules" ON bell_schedules;
DROP POLICY IF EXISTS "Users can delete their own bell schedules" ON bell_schedules;

-- SELECT: Providers see their own, Site admins see all at their school
CREATE POLICY "Users can view bell schedules"
ON bell_schedules FOR SELECT
USING (
  -- Providers can see their own schedules
  provider_id = auth.uid()
  OR
  -- Site admins can see all schedules at their school
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = auth.uid()
    AND ap.role = 'site_admin'
    AND ap.school_id = bell_schedules.school_id
  )
);

-- INSERT: Providers insert their own, Site admins insert for their school
CREATE POLICY "Users can insert bell schedules"
ON bell_schedules FOR INSERT
WITH CHECK (
  -- Providers: provider_id must match their user id
  (provider_id = auth.uid() AND created_by_role = 'provider')
  OR
  -- Site admins: must be site admin for this school, created_by_id must be them
  (
    created_by_id = auth.uid()
    AND created_by_role = 'site_admin'
    AND EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
      AND ap.school_id = bell_schedules.school_id
    )
  )
);

-- UPDATE: Only the creator can update
CREATE POLICY "Users can update their own bell schedules"
ON bell_schedules FOR UPDATE
USING (
  -- Created by this user (new records)
  created_by_id = auth.uid()
  OR
  -- Legacy records: provider_id matches and no created_by_id
  (provider_id = auth.uid() AND created_by_id IS NULL)
);

-- DELETE: Only the creator can delete
CREATE POLICY "Users can delete their own bell schedules"
ON bell_schedules FOR DELETE
USING (
  -- Created by this user (new records)
  created_by_id = auth.uid()
  OR
  -- Legacy records: provider_id matches and no created_by_id
  (provider_id = auth.uid() AND created_by_id IS NULL)
);
