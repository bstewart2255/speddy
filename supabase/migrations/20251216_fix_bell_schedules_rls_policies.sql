-- Fix RLS policies for bell_schedules based on code review feedback
-- 1. Allow providers to see all bell schedules at their school (not just their own)
-- 2. Constrain school_id on INSERT to prevent cross-tenant injection

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view bell schedules" ON bell_schedules;
DROP POLICY IF EXISTS "Users can insert bell schedules" ON bell_schedules;
DROP POLICY IF EXISTS "Users can update their own bell schedules" ON bell_schedules;
DROP POLICY IF EXISTS "Users can delete their own bell schedules" ON bell_schedules;

-- SELECT: Providers see all at their school, Site admins see all at their school
CREATE POLICY "Users can view bell schedules"
ON bell_schedules FOR SELECT
USING (
  -- Legacy: Providers can see their own schedules (backwards compatibility)
  provider_id = auth.uid()
  OR
  -- Providers can see all schedules at schools they work at (via provider_schools)
  EXISTS (
    SELECT 1 FROM provider_schools ps
    WHERE ps.provider_id = auth.uid()
    AND ps.school_id = bell_schedules.school_id
  )
  OR
  -- Providers can see schedules at their primary school (via profiles)
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.school_id = bell_schedules.school_id
  )
  OR
  -- Site admins can see all schedules at their school
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = auth.uid()
    AND ap.role = 'site_admin'
    AND ap.school_id = bell_schedules.school_id
  )
);

-- INSERT: Providers insert only for their schools, Site admins insert for their school
CREATE POLICY "Users can insert bell schedules"
ON bell_schedules FOR INSERT
WITH CHECK (
  -- Providers: provider_id must match their user id AND school_id must be one of their schools
  (
    provider_id = auth.uid()
    AND created_by_role = 'provider'
    AND (
      -- School is their primary school
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.school_id = bell_schedules.school_id
      )
      OR
      -- School is in their provider_schools list
      EXISTS (
        SELECT 1 FROM provider_schools ps
        WHERE ps.provider_id = auth.uid()
        AND ps.school_id = bell_schedules.school_id
      )
    )
  )
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
