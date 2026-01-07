-- Fix RLS Performance Warnings
-- 1. auth_rls_initplan: Wrap auth.uid() in (select auth.uid()) for single evaluation
-- 2. multiple_permissive_policies: Consolidate duplicate policies

-- ============================================
-- PROFILES TABLE
-- ============================================
-- Fix: profiles_update and site_admins_can_reset_passwords are both UPDATE policies
-- Consolidate into single policy + fix auth.uid() calls

DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "site_admins_can_reset_passwords" ON profiles;

CREATE POLICY "profiles_update" ON profiles
FOR UPDATE TO authenticated
USING (
  -- User can update own profile OR service_role OR site_admin for password reset
  ((select auth.uid()) = id)
  OR ((select auth.role()) = 'service_role')
  OR (EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
    AND ap.school_id::text = profiles.school_id::text
  ))
)
WITH CHECK (
  -- Service role can do anything
  ((select auth.role()) = 'service_role')
  -- User can update own profile but cannot change protected fields
  OR (
    (select auth.uid()) = id
    AND role = (SELECT p.role FROM profiles p WHERE p.id = (select auth.uid()))
    AND NOT (is_speddy_admin IS DISTINCT FROM (SELECT p.is_speddy_admin FROM profiles p WHERE p.id = (select auth.uid())))
    AND NOT (school_id::text IS DISTINCT FROM (SELECT p.school_id FROM profiles p WHERE p.id = (select auth.uid()))::text)
    AND NOT (district_id::text IS DISTINCT FROM (SELECT p.district_id FROM profiles p WHERE p.id = (select auth.uid()))::text)
  )
  -- Site admin can update password fields for users at their school
  OR (EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
    AND ap.school_id::text = profiles.school_id::text
  ))
);

-- ============================================
-- LESSON_ADJUSTMENT_QUEUE TABLE
-- ============================================
DROP POLICY IF EXISTS "Providers can insert adjustments for their students" ON lesson_adjustment_queue;
DROP POLICY IF EXISTS "Providers can update adjustments for their students" ON lesson_adjustment_queue;

CREATE POLICY "Providers can insert adjustments for their students" ON lesson_adjustment_queue
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = lesson_adjustment_queue.student_id
    AND s.provider_id = (select auth.uid())
  )
);

CREATE POLICY "Providers can update adjustments for their students" ON lesson_adjustment_queue
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = lesson_adjustment_queue.student_id
    AND s.provider_id = (select auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = lesson_adjustment_queue.student_id
    AND s.provider_id = (select auth.uid())
  )
);

-- ============================================
-- LESSON_PERFORMANCE_HISTORY TABLE
-- ============================================
DROP POLICY IF EXISTS "Providers can insert performance for their students" ON lesson_performance_history;
DROP POLICY IF EXISTS "Providers can update performance for their students" ON lesson_performance_history;

CREATE POLICY "Providers can insert performance for their students" ON lesson_performance_history
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = lesson_performance_history.student_id
    AND s.provider_id = (select auth.uid())
  )
);

CREATE POLICY "Providers can update performance for their students" ON lesson_performance_history
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = lesson_performance_history.student_id
    AND s.provider_id = (select auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = lesson_performance_history.student_id
    AND s.provider_id = (select auth.uid())
  )
);

-- ============================================
-- STUDENT_PERFORMANCE_METRICS TABLE
-- ============================================
DROP POLICY IF EXISTS "Providers can insert metrics for their students" ON student_performance_metrics;
DROP POLICY IF EXISTS "Providers can update metrics for their students" ON student_performance_metrics;

CREATE POLICY "Providers can insert metrics for their students" ON student_performance_metrics
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_performance_metrics.student_id
    AND s.provider_id = (select auth.uid())
  )
);

CREATE POLICY "Providers can update metrics for their students" ON student_performance_metrics
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_performance_metrics.student_id
    AND s.provider_id = (select auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_performance_metrics.student_id
    AND s.provider_id = (select auth.uid())
  )
);

-- ============================================
-- ACTIVITY_TYPE_AVAILABILITY TABLE
-- Fix auth.uid() + consolidate SELECT policies
-- ============================================
DROP POLICY IF EXISTS "Resource specialists can view activity availability" ON activity_type_availability;
DROP POLICY IF EXISTS "Site admins can view activity availability" ON activity_type_availability;
DROP POLICY IF EXISTS "Site admins can delete activity availability" ON activity_type_availability;
DROP POLICY IF EXISTS "Site admins can insert activity availability" ON activity_type_availability;
DROP POLICY IF EXISTS "Site admins can update activity availability" ON activity_type_availability;

-- Consolidated SELECT policy
CREATE POLICY "Users can view activity availability for their school" ON activity_type_availability
FOR SELECT TO authenticated
USING (
  -- Resource specialists can view their school's availability
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (select auth.uid())
    AND p.school_id::text = activity_type_availability.school_id
    AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
  )
  -- Site admins can view their school's availability
  OR EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
    AND ap.school_id::text = activity_type_availability.school_id
  )
);

CREATE POLICY "Site admins can insert activity availability" ON activity_type_availability
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
    AND ap.school_id::text = activity_type_availability.school_id
  )
);

CREATE POLICY "Site admins can update activity availability" ON activity_type_availability
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
    AND ap.school_id::text = activity_type_availability.school_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
    AND ap.school_id::text = activity_type_availability.school_id
  )
);

CREATE POLICY "Site admins can delete activity availability" ON activity_type_availability
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
    AND ap.school_id::text = activity_type_availability.school_id
  )
);

-- ============================================
-- SCHOOL_YEAR_CONFIG TABLE
-- ============================================
DROP POLICY IF EXISTS "Site admins can insert school year config" ON school_year_config;
DROP POLICY IF EXISTS "Site admins can update their school year config" ON school_year_config;
DROP POLICY IF EXISTS "Site admins can view their school year config" ON school_year_config;

CREATE POLICY "Site admins can view their school year config" ON school_year_config
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.school_id::text = school_year_config.school_id
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can insert school year config" ON school_year_config
FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.school_id::text = school_year_config.school_id
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can update their school year config" ON school_year_config
FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.school_id::text = school_year_config.school_id
    AND ap.role = 'site_admin'
  )
);

-- ============================================
-- ROTATION_ACTIVITY_PAIRS TABLE
-- ============================================
DROP POLICY IF EXISTS "Site admins can view their rotation pairs" ON rotation_activity_pairs;
DROP POLICY IF EXISTS "Site admins can insert rotation pairs" ON rotation_activity_pairs;
DROP POLICY IF EXISTS "Site admins can update their rotation pairs" ON rotation_activity_pairs;
DROP POLICY IF EXISTS "Site admins can delete their rotation pairs" ON rotation_activity_pairs;

CREATE POLICY "Site admins can view their rotation pairs" ON rotation_activity_pairs
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.school_id::text = rotation_activity_pairs.school_id
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can insert rotation pairs" ON rotation_activity_pairs
FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.school_id::text = rotation_activity_pairs.school_id
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can update their rotation pairs" ON rotation_activity_pairs
FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.school_id::text = rotation_activity_pairs.school_id
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can delete their rotation pairs" ON rotation_activity_pairs
FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = (select auth.uid())
    AND ap.school_id::text = rotation_activity_pairs.school_id
    AND ap.role = 'site_admin'
  )
);

-- ============================================
-- ROTATION_GROUPS TABLE
-- ============================================
DROP POLICY IF EXISTS "Site admins can view their rotation groups" ON rotation_groups;
DROP POLICY IF EXISTS "Site admins can insert rotation groups" ON rotation_groups;
DROP POLICY IF EXISTS "Site admins can update their rotation groups" ON rotation_groups;
DROP POLICY IF EXISTS "Site admins can delete their rotation groups" ON rotation_groups;

CREATE POLICY "Site admins can view their rotation groups" ON rotation_groups
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM rotation_activity_pairs rap
    JOIN admin_permissions ap ON ap.school_id::text = rap.school_id
    WHERE rap.id = rotation_groups.pair_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can insert rotation groups" ON rotation_groups
FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM rotation_activity_pairs rap
    JOIN admin_permissions ap ON ap.school_id::text = rap.school_id
    WHERE rap.id = rotation_groups.pair_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can update their rotation groups" ON rotation_groups
FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM rotation_activity_pairs rap
    JOIN admin_permissions ap ON ap.school_id::text = rap.school_id
    WHERE rap.id = rotation_groups.pair_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can delete their rotation groups" ON rotation_groups
FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM rotation_activity_pairs rap
    JOIN admin_permissions ap ON ap.school_id::text = rap.school_id
    WHERE rap.id = rotation_groups.pair_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
  )
);

-- ============================================
-- ROTATION_GROUP_MEMBERS TABLE
-- ============================================
DROP POLICY IF EXISTS "Site admins can view their rotation group members" ON rotation_group_members;
DROP POLICY IF EXISTS "Site admins can insert rotation group members" ON rotation_group_members;
DROP POLICY IF EXISTS "Site admins can update their rotation group members" ON rotation_group_members;
DROP POLICY IF EXISTS "Site admins can delete their rotation group members" ON rotation_group_members;

CREATE POLICY "Site admins can view their rotation group members" ON rotation_group_members
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM rotation_groups rg
    JOIN rotation_activity_pairs rap ON rap.id = rg.pair_id
    JOIN admin_permissions ap ON ap.school_id::text = rap.school_id
    WHERE rg.id = rotation_group_members.group_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can insert rotation group members" ON rotation_group_members
FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM rotation_groups rg
    JOIN rotation_activity_pairs rap ON rap.id = rg.pair_id
    JOIN admin_permissions ap ON ap.school_id::text = rap.school_id
    WHERE rg.id = rotation_group_members.group_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can update their rotation group members" ON rotation_group_members
FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM rotation_groups rg
    JOIN rotation_activity_pairs rap ON rap.id = rg.pair_id
    JOIN admin_permissions ap ON ap.school_id::text = rap.school_id
    WHERE rg.id = rotation_group_members.group_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can delete their rotation group members" ON rotation_group_members
FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM rotation_groups rg
    JOIN rotation_activity_pairs rap ON rap.id = rg.pair_id
    JOIN admin_permissions ap ON ap.school_id::text = rap.school_id
    WHERE rg.id = rotation_group_members.group_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
  )
);

-- ============================================
-- ROTATION_WEEK_ASSIGNMENTS TABLE
-- ============================================
DROP POLICY IF EXISTS "Site admins can view their rotation week assignments" ON rotation_week_assignments;
DROP POLICY IF EXISTS "Site admins can insert rotation week assignments" ON rotation_week_assignments;
DROP POLICY IF EXISTS "Site admins can update their rotation week assignments" ON rotation_week_assignments;
DROP POLICY IF EXISTS "Site admins can delete their rotation week assignments" ON rotation_week_assignments;

CREATE POLICY "Site admins can view their rotation week assignments" ON rotation_week_assignments
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM rotation_activity_pairs rap
    JOIN admin_permissions ap ON ap.school_id::text = rap.school_id
    WHERE rap.id = rotation_week_assignments.pair_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can insert rotation week assignments" ON rotation_week_assignments
FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM rotation_activity_pairs rap
    JOIN admin_permissions ap ON ap.school_id::text = rap.school_id
    WHERE rap.id = rotation_week_assignments.pair_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can update their rotation week assignments" ON rotation_week_assignments
FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM rotation_activity_pairs rap
    JOIN admin_permissions ap ON ap.school_id::text = rap.school_id
    WHERE rap.id = rotation_week_assignments.pair_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
  )
);

CREATE POLICY "Site admins can delete their rotation week assignments" ON rotation_week_assignments
FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM rotation_activity_pairs rap
    JOIN admin_permissions ap ON ap.school_id::text = rap.school_id
    WHERE rap.id = rotation_week_assignments.pair_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'site_admin'
  )
);

-- ============================================
-- CARE_CASE_STATUS_HISTORY TABLE
-- Consolidate SELECT policies + fix auth.uid()
-- ============================================
DROP POLICY IF EXISTS "Users can view status history for cases they can access" ON care_case_status_history;
DROP POLICY IF EXISTS "District admins can view care_case_status_history in their dist" ON care_case_status_history;
DROP POLICY IF EXISTS "Users can insert status history for accessible cases" ON care_case_status_history;

-- Consolidated SELECT policy
CREATE POLICY "Users can view status history for accessible cases" ON care_case_status_history
FOR SELECT TO public
USING (
  -- Users at the school/district of the case
  EXISTS (
    SELECT 1 FROM care_cases cc
    JOIN care_referrals cr ON cc.referral_id = cr.id
    WHERE cc.id = care_case_status_history.case_id
    AND (
      cr.school_id::text IN (SELECT school_id FROM profiles WHERE id = (select auth.uid()))
      OR cr.district_id::text IN (SELECT district_id FROM profiles WHERE id = (select auth.uid()))
    )
  )
  -- District admins
  OR EXISTS (
    SELECT 1 FROM care_cases c
    JOIN care_referrals cr ON c.referral_id = cr.id
    JOIN schools s ON s.id::text = cr.school_id::text
    JOIN admin_permissions ap ON ap.district_id::text = s.district_id::text
    WHERE c.id = care_case_status_history.case_id
    AND ap.admin_id = (select auth.uid())
    AND ap.role = 'district_admin'
  )
);

CREATE POLICY "Users can insert status history for accessible cases" ON care_case_status_history
FOR INSERT TO public
WITH CHECK (
  changed_by = (select auth.uid())
  AND EXISTS (
    SELECT 1 FROM care_cases cc
    JOIN care_referrals cr ON cc.referral_id = cr.id
    WHERE cc.id = care_case_status_history.case_id
    AND (
      cr.school_id::text IN (SELECT school_id FROM profiles WHERE id = (select auth.uid()))
      OR cr.district_id::text IN (SELECT district_id FROM profiles WHERE id = (select auth.uid()))
    )
  )
);

-- ============================================
-- ADMIN_PERMISSIONS TABLE
-- Consolidate INSERT policies
-- ============================================
DROP POLICY IF EXISTS "Only service role can insert admin permissions" ON admin_permissions;
DROP POLICY IF EXISTS "admin_permissions_insert" ON admin_permissions;

-- Single INSERT policy combining both conditions
CREATE POLICY "admin_permissions_insert" ON admin_permissions
FOR INSERT TO authenticated
WITH CHECK (
  -- Speddy admins can insert
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
    AND profiles.is_speddy_admin = true
  )
);

-- ============================================
-- CARE_ACTION_ITEMS TABLE
-- Consolidate SELECT policies
-- ============================================
DROP POLICY IF EXISTS "care_action_items_select" ON care_action_items;
DROP POLICY IF EXISTS "District admins can view care_action_items in their district" ON care_action_items;

CREATE POLICY "care_action_items_select" ON care_action_items
FOR SELECT TO authenticated
USING (
  -- Users at the school
  case_id IN (
    SELECT c.id FROM care_cases c
    JOIN care_referrals r ON c.referral_id = r.id
    WHERE r.school_id::text IN (
      SELECT school_id FROM profiles WHERE id = (select auth.uid())
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = (select auth.uid())
    )
  )
  -- District admins
  OR case_id IN (
    SELECT c.id FROM care_cases c
    JOIN care_referrals cr ON c.referral_id = cr.id
    JOIN schools s ON s.id::text = cr.school_id::text
    JOIN admin_permissions ap ON ap.district_id::text = s.district_id::text
    WHERE ap.admin_id = (select auth.uid())
    AND ap.role = 'district_admin'
  )
);

-- ============================================
-- CARE_CASES TABLE
-- Consolidate SELECT policies
-- ============================================
DROP POLICY IF EXISTS "care_cases_select" ON care_cases;
DROP POLICY IF EXISTS "District admins can view care_cases in their district" ON care_cases;

CREATE POLICY "care_cases_select" ON care_cases
FOR SELECT TO authenticated
USING (
  -- Users at the school
  referral_id IN (
    SELECT id FROM care_referrals
    WHERE school_id::text IN (
      SELECT school_id FROM profiles WHERE id = (select auth.uid())
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = (select auth.uid())
    )
  )
  -- District admins
  OR referral_id IN (
    SELECT cr.id FROM care_referrals cr
    JOIN schools s ON s.id::text = cr.school_id::text
    JOIN admin_permissions ap ON ap.district_id::text = s.district_id::text
    WHERE ap.admin_id = (select auth.uid())
    AND ap.role = 'district_admin'
  )
);

-- ============================================
-- CARE_MEETING_NOTES TABLE
-- Consolidate SELECT policies
-- ============================================
DROP POLICY IF EXISTS "care_meeting_notes_select" ON care_meeting_notes;
DROP POLICY IF EXISTS "District admins can view care_meeting_notes in their district" ON care_meeting_notes;

CREATE POLICY "care_meeting_notes_select" ON care_meeting_notes
FOR SELECT TO authenticated
USING (
  -- Users at the school
  case_id IN (
    SELECT c.id FROM care_cases c
    JOIN care_referrals r ON c.referral_id = r.id
    WHERE r.school_id::text IN (
      SELECT school_id FROM profiles WHERE id = (select auth.uid())
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = (select auth.uid())
    )
  )
  -- District admins
  OR case_id IN (
    SELECT c.id FROM care_cases c
    JOIN care_referrals cr ON c.referral_id = cr.id
    JOIN schools s ON s.id::text = cr.school_id::text
    JOIN admin_permissions ap ON ap.district_id::text = s.district_id::text
    WHERE ap.admin_id = (select auth.uid())
    AND ap.role = 'district_admin'
  )
);

-- ============================================
-- CARE_REFERRALS TABLE
-- Consolidate SELECT policies
-- ============================================
DROP POLICY IF EXISTS "care_referrals_select" ON care_referrals;
DROP POLICY IF EXISTS "District admins can view care_referrals in their district" ON care_referrals;

CREATE POLICY "care_referrals_select" ON care_referrals
FOR SELECT TO authenticated
USING (
  -- Non-teachers at the school
  (
    (SELECT role FROM profiles WHERE id = (select auth.uid())) <> 'teacher'
    AND school_id::text IN (
      SELECT school_id FROM profiles WHERE id = (select auth.uid())
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = (select auth.uid())
    )
  )
  -- Teachers can see referrals for their students or ones they created
  OR (
    (SELECT role FROM profiles WHERE id = (select auth.uid())) = 'teacher'
    AND (
      teacher_id IN (SELECT id FROM teachers WHERE account_id = (select auth.uid()))
      OR referring_user_id = (select auth.uid())
    )
  )
  -- District admins
  OR EXISTS (
    SELECT 1 FROM admin_permissions ap
    JOIN schools s ON s.district_id::text = ap.district_id::text
    WHERE ap.admin_id = (select auth.uid())
    AND ap.role = 'district_admin'
    AND s.id::text = care_referrals.school_id::text
  )
);
