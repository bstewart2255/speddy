-- Allow site admins to DELETE and UPDATE bell schedules and special activities
-- at their school, not just records they created.

-- =============================================================================
-- bell_schedules: UPDATE policy
-- =============================================================================
DROP POLICY IF EXISTS "Users can update their own bell schedules" ON bell_schedules;

CREATE POLICY "Users can update their own bell schedules" ON bell_schedules
  FOR UPDATE TO authenticated
  USING (
    (created_by_id = (SELECT auth.uid()))
    OR ((provider_id = (SELECT auth.uid())) AND (created_by_id IS NULL))
    OR (EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = (SELECT auth.uid())
        AND ap.role = 'site_admin'
        AND (ap.school_id)::text = (bell_schedules.school_id)::text
    ))
  );

-- =============================================================================
-- bell_schedules: DELETE policy
-- =============================================================================
DROP POLICY IF EXISTS "Users can delete their own bell schedules" ON bell_schedules;

CREATE POLICY "Users can delete their own bell schedules" ON bell_schedules
  FOR DELETE TO authenticated
  USING (
    (created_by_id = (SELECT auth.uid()))
    OR ((provider_id = (SELECT auth.uid())) AND (created_by_id IS NULL))
    OR (EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = (SELECT auth.uid())
        AND ap.role = 'site_admin'
        AND (ap.school_id)::text = (bell_schedules.school_id)::text
    ))
  );

-- =============================================================================
-- special_activities: UPDATE policy
-- =============================================================================
DROP POLICY IF EXISTS "special_activities_update" ON special_activities;

CREATE POLICY "special_activities_update" ON special_activities
  FOR UPDATE TO authenticated
  USING (
    (provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid())))
    OR (provider_id = (SELECT auth.uid()))
    OR (EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = (SELECT auth.uid())
        AND ap.role = 'site_admin'
        AND (ap.school_id)::text = (special_activities.school_id)::text
    ))
  )
  WITH CHECK (
    (provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid())))
    OR (provider_id = (SELECT auth.uid()))
    OR (EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = (SELECT auth.uid())
        AND ap.role = 'site_admin'
        AND (ap.school_id)::text = (special_activities.school_id)::text
    ))
  );

-- =============================================================================
-- special_activities: DELETE policy
-- =============================================================================
DROP POLICY IF EXISTS "special_activities_delete" ON special_activities;

CREATE POLICY "special_activities_delete" ON special_activities
  FOR DELETE TO authenticated
  USING (
    (provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid())))
    OR (provider_id = (SELECT auth.uid()))
    OR (EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = (SELECT auth.uid())
        AND ap.role = 'site_admin'
        AND (ap.school_id)::text = (special_activities.school_id)::text
    ))
  );
