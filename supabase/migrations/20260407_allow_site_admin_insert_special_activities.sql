-- Allow site admins to insert special activities.
-- Previously, the INSERT policy only allowed rows where provider_id matched the
-- current user. Site admins create activities with provider_id = NULL, which
-- caused an RLS violation. This adds the same admin_permissions check already
-- used by the UPDATE and DELETE policies.

DROP POLICY IF EXISTS "special_activities_insert" ON "public"."special_activities";

CREATE POLICY "special_activities_insert" ON "public"."special_activities"
FOR INSERT
TO authenticated
WITH CHECK (
  (provider_id IN (
    SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid())
  ))
  OR (provider_id = (SELECT auth.uid()))
  OR (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = (SELECT auth.uid())
        AND ap.role = 'site_admin'
        AND (ap.school_id)::text = (special_activities.school_id)::text
    )
  )
);
