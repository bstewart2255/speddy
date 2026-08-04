-- SPE-361: multi-school providers can't see special activities at their
-- non-primary schools.
--
-- `special_activities_select` scoped school-wide reads through
-- `profiles.school_id` only — the caller's single "primary" school — so an
-- itinerant provider assigned to three schools saw teacher-created special
-- activities (PE, music, library, assemblies) at exactly one of them. Those
-- activities are the constraints the scheduler is supposed to schedule
-- around, so planning at a non-primary site worked off an incomplete picture
-- of when classes are unavailable.
--
-- `get_my_school_ids()` (SECURITY DEFINER, STABLE, granted to `authenticated`)
-- already unions `profiles.school_id` with the caller's `provider_schools`
-- rows. `bell_schedules` SELECT has unioned `provider_schools` for this same
-- reason since 20251216; bell schedules and special activities are the same
-- class of school-level scheduling constraint, and the inconsistency between
-- them was the bug.
--
-- SELECT only. INSERT/UPDATE/DELETE on special_activities key off
-- provider_id / created_by_id / admin_permissions, never the profile-school
-- branch, and are deliberately left untouched.

DROP POLICY IF EXISTS "special_activities_select" ON special_activities;

CREATE POLICY "special_activities_select" ON special_activities
  FOR SELECT TO authenticated
  USING (
    -- Users can view their own activities (as provider)
    provider_id = (SELECT auth.uid())
    OR
    -- Teachers can view their activities
    provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
    OR
    -- Users can view activities at ANY school they are assigned to —
    -- their profile school unioned with provider_schools, not primary alone
    school_id::text IN (SELECT school_id FROM get_my_school_ids())
    OR
    -- Teachers can view activities at their school
    school_id::text IN (SELECT teachers.school_id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
  );
