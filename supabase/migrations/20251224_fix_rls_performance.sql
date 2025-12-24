-- Fix RLS Performance Issues
-- 1. Auth RLS Initplan: Wrap auth.uid() in (SELECT auth.uid()) to prevent per-row re-evaluation
-- 2. Multiple Permissive Policies: Consolidate SELECT policies into single policies using OR logic
--
-- See:
-- - https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
-- - https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

-- =====================================================
-- BELL_SCHEDULES: Fix auth.uid() (no consolidation needed)
-- =====================================================
DROP POLICY IF EXISTS "Users can delete their own bell schedules" ON bell_schedules;
CREATE POLICY "Users can delete their own bell schedules" ON bell_schedules
  FOR DELETE TO public
  USING (created_by_id = (SELECT auth.uid()) OR (provider_id = (SELECT auth.uid()) AND created_by_id IS NULL));

DROP POLICY IF EXISTS "Users can update their own bell schedules" ON bell_schedules;
CREATE POLICY "Users can update their own bell schedules" ON bell_schedules
  FOR UPDATE TO public
  USING (created_by_id = (SELECT auth.uid()) OR (provider_id = (SELECT auth.uid()) AND created_by_id IS NULL));

DROP POLICY IF EXISTS "Users can insert bell schedules" ON bell_schedules;
CREATE POLICY "Users can insert bell schedules" ON bell_schedules
  FOR INSERT TO public
  WITH CHECK (
    (provider_id = (SELECT auth.uid()) AND created_by_role = 'provider' AND
      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.school_id::text = bell_schedules.school_id::text)
       OR EXISTS (SELECT 1 FROM provider_schools ps WHERE ps.provider_id = (SELECT auth.uid()) AND ps.school_id::text = bell_schedules.school_id::text)))
    OR
    (created_by_id = (SELECT auth.uid()) AND created_by_role = 'site_admin' AND
      EXISTS (SELECT 1 FROM admin_permissions ap WHERE ap.admin_id = (SELECT auth.uid()) AND ap.role = 'site_admin' AND ap.school_id::text = bell_schedules.school_id::text))
  );

DROP POLICY IF EXISTS "Users can view bell schedules" ON bell_schedules;
CREATE POLICY "Users can view bell schedules" ON bell_schedules
  FOR SELECT TO public
  USING (
    provider_id = (SELECT auth.uid()) OR
    EXISTS (SELECT 1 FROM provider_schools ps WHERE ps.provider_id = (SELECT auth.uid()) AND ps.school_id::text = bell_schedules.school_id::text) OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.school_id::text = bell_schedules.school_id::text) OR
    EXISTS (SELECT 1 FROM admin_permissions ap WHERE ap.admin_id = (SELECT auth.uid()) AND ap.role = 'site_admin' AND ap.school_id::text = bell_schedules.school_id::text)
  );

-- =====================================================
-- CARE_ACTION_ITEMS: Fix auth.uid() (no consolidation needed)
-- =====================================================
DROP POLICY IF EXISTS "care_action_items_delete" ON care_action_items;
CREATE POLICY "care_action_items_delete" ON care_action_items
  FOR DELETE TO authenticated
  USING (case_id IN (
    SELECT c.id FROM care_cases c
    JOIN care_referrals r ON c.referral_id = r.id
    WHERE r.school_id::text IN (
      SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
    )
  ));

DROP POLICY IF EXISTS "care_action_items_insert" ON care_action_items;
CREATE POLICY "care_action_items_insert" ON care_action_items
  FOR INSERT TO authenticated
  WITH CHECK (case_id IN (
    SELECT c.id FROM care_cases c
    JOIN care_referrals r ON c.referral_id = r.id
    WHERE r.school_id::text IN (
      SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
    )
  ));

DROP POLICY IF EXISTS "care_action_items_select" ON care_action_items;
CREATE POLICY "care_action_items_select" ON care_action_items
  FOR SELECT TO authenticated
  USING (case_id IN (
    SELECT c.id FROM care_cases c
    JOIN care_referrals r ON c.referral_id = r.id
    WHERE r.school_id::text IN (
      SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
    )
  ));

DROP POLICY IF EXISTS "care_action_items_update" ON care_action_items;
CREATE POLICY "care_action_items_update" ON care_action_items
  FOR UPDATE TO authenticated
  USING (case_id IN (
    SELECT c.id FROM care_cases c
    JOIN care_referrals r ON c.referral_id = r.id
    WHERE r.school_id::text IN (
      SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
    )
  ));

-- =====================================================
-- CARE_CASES: Fix auth.uid() (no consolidation needed)
-- =====================================================
DROP POLICY IF EXISTS "care_cases_delete" ON care_cases;
CREATE POLICY "care_cases_delete" ON care_cases
  FOR DELETE TO authenticated
  USING (referral_id IN (
    SELECT care_referrals.id FROM care_referrals
    WHERE care_referrals.school_id::text IN (
      SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
    )
  ));

DROP POLICY IF EXISTS "care_cases_insert" ON care_cases;
CREATE POLICY "care_cases_insert" ON care_cases
  FOR INSERT TO authenticated
  WITH CHECK (referral_id IN (
    SELECT care_referrals.id FROM care_referrals
    WHERE care_referrals.school_id::text IN (
      SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
    )
  ));

DROP POLICY IF EXISTS "care_cases_select" ON care_cases;
CREATE POLICY "care_cases_select" ON care_cases
  FOR SELECT TO authenticated
  USING (referral_id IN (
    SELECT care_referrals.id FROM care_referrals
    WHERE care_referrals.school_id::text IN (
      SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
    )
  ));

DROP POLICY IF EXISTS "care_cases_update" ON care_cases;
CREATE POLICY "care_cases_update" ON care_cases
  FOR UPDATE TO authenticated
  USING (referral_id IN (
    SELECT care_referrals.id FROM care_referrals
    WHERE care_referrals.school_id::text IN (
      SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
    )
  ));

-- =====================================================
-- CARE_MEETING_NOTES: Fix auth.uid() (no consolidation needed)
-- =====================================================
DROP POLICY IF EXISTS "care_meeting_notes_delete" ON care_meeting_notes;
CREATE POLICY "care_meeting_notes_delete" ON care_meeting_notes
  FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "care_meeting_notes_insert" ON care_meeting_notes;
CREATE POLICY "care_meeting_notes_insert" ON care_meeting_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid()) AND
    case_id IN (
      SELECT c.id FROM care_cases c
      JOIN care_referrals r ON c.referral_id = r.id
      WHERE r.school_id::text IN (
        SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
        UNION
        SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "care_meeting_notes_select" ON care_meeting_notes;
CREATE POLICY "care_meeting_notes_select" ON care_meeting_notes
  FOR SELECT TO authenticated
  USING (case_id IN (
    SELECT c.id FROM care_cases c
    JOIN care_referrals r ON c.referral_id = r.id
    WHERE r.school_id::text IN (
      SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
    )
  ));

DROP POLICY IF EXISTS "care_meeting_notes_update" ON care_meeting_notes;
CREATE POLICY "care_meeting_notes_update" ON care_meeting_notes
  FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- =====================================================
-- CARE_REFERRALS: Fix auth.uid() (no consolidation needed)
-- =====================================================
DROP POLICY IF EXISTS "care_referrals_delete" ON care_referrals;
CREATE POLICY "care_referrals_delete" ON care_referrals
  FOR DELETE TO authenticated
  USING (school_id::text IN (
    SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
    UNION
    SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "care_referrals_insert" ON care_referrals;
CREATE POLICY "care_referrals_insert" ON care_referrals
  FOR INSERT TO authenticated
  WITH CHECK (
    referring_user_id = (SELECT auth.uid()) AND
    school_id::text IN (
      SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "care_referrals_select" ON care_referrals;
CREATE POLICY "care_referrals_select" ON care_referrals
  FOR SELECT TO authenticated
  USING (school_id::text IN (
    SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
    UNION
    SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "care_referrals_update" ON care_referrals;
CREATE POLICY "care_referrals_update" ON care_referrals
  FOR UPDATE TO authenticated
  USING (school_id::text IN (
    SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
    UNION
    SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
  ));

-- =====================================================
-- CURRICULUM_TRACKING: Fix auth.uid() (no consolidation needed)
-- =====================================================
DROP POLICY IF EXISTS "Providers can delete their own curriculum tracking" ON curriculum_tracking;
CREATE POLICY "Providers can delete their own curriculum tracking" ON curriculum_tracking
  FOR DELETE TO public
  USING (session_id IN (
    SELECT schedule_sessions.id FROM schedule_sessions
    WHERE schedule_sessions.provider_id = (SELECT auth.uid())
      OR schedule_sessions.assigned_to_specialist_id = (SELECT auth.uid())
      OR schedule_sessions.assigned_to_sea_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Providers can insert their own curriculum tracking" ON curriculum_tracking;
CREATE POLICY "Providers can insert their own curriculum tracking" ON curriculum_tracking
  FOR INSERT TO public
  WITH CHECK (session_id IN (
    SELECT schedule_sessions.id FROM schedule_sessions
    WHERE schedule_sessions.provider_id = (SELECT auth.uid())
      OR schedule_sessions.assigned_to_specialist_id = (SELECT auth.uid())
      OR schedule_sessions.assigned_to_sea_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Providers can update their own curriculum tracking" ON curriculum_tracking;
CREATE POLICY "Providers can update their own curriculum tracking" ON curriculum_tracking
  FOR UPDATE TO public
  USING (session_id IN (
    SELECT schedule_sessions.id FROM schedule_sessions
    WHERE schedule_sessions.provider_id = (SELECT auth.uid())
      OR schedule_sessions.assigned_to_specialist_id = (SELECT auth.uid())
      OR schedule_sessions.assigned_to_sea_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Providers can view their own curriculum tracking" ON curriculum_tracking;
CREATE POLICY "Providers can view their own curriculum tracking" ON curriculum_tracking
  FOR SELECT TO public
  USING (session_id IN (
    SELECT schedule_sessions.id FROM schedule_sessions
    WHERE schedule_sessions.provider_id = (SELECT auth.uid())
      OR schedule_sessions.assigned_to_specialist_id = (SELECT auth.uid())
      OR schedule_sessions.assigned_to_sea_id = (SELECT auth.uid())
  ));

-- =====================================================
-- HOLIDAYS: Fix auth.uid() (no consolidation needed)
-- =====================================================
DROP POLICY IF EXISTS "Eligible roles can create holidays" ON holidays;
CREATE POLICY "Eligible roles can create holidays" ON holidays
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid()) AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['resource', 'sea', 'admin'])
        AND (
          (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district) OR
          (profiles.school_id::text = holidays.school_id AND holidays.school_id IS NOT NULL) OR
          (profiles.district_id::text = holidays.district_id AND holidays.district_id IS NOT NULL)
        )
    )
  );

DROP POLICY IF EXISTS "Users can delete holidays" ON holidays;
CREATE POLICY "Users can delete holidays" ON holidays
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND (
          (profiles.role = ANY(ARRAY['resource', 'admin']) AND
            ((profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district) OR
             (profiles.school_id::text = holidays.school_id AND holidays.school_id IS NOT NULL) OR
             (profiles.district_id::text = holidays.district_id AND holidays.district_id IS NOT NULL)) AND
            (holidays.date >= CURRENT_DATE OR profiles.role = 'admin'))
          OR
          (profiles.role = 'sea' AND
            ((profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district) OR
             (profiles.school_id::text = holidays.school_id AND holidays.school_id IS NOT NULL) OR
             (profiles.district_id::text = holidays.district_id AND holidays.district_id IS NOT NULL)) AND
            (holidays.date >= CURRENT_DATE OR profiles.role = 'admin'))
        )
    )
  );

DROP POLICY IF EXISTS "Users can update holidays" ON holidays;
CREATE POLICY "Users can update holidays" ON holidays
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['resource', 'sea', 'admin'])
        AND (
          (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district) OR
          (profiles.school_id::text = holidays.school_id AND holidays.school_id IS NOT NULL) OR
          (profiles.district_id::text = holidays.district_id AND holidays.district_id IS NOT NULL)
        )
    )
  )
  WITH CHECK (
    updated_by = (SELECT auth.uid()) AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['resource', 'sea', 'admin'])
        AND (
          (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district) OR
          (profiles.school_id::text = holidays.school_id AND holidays.school_id IS NOT NULL) OR
          (profiles.district_id::text = holidays.district_id AND holidays.district_id IS NOT NULL)
        )
    )
  );

DROP POLICY IF EXISTS "Users can view holidays for their school" ON holidays;
CREATE POLICY "Users can view holidays for their school" ON holidays
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND (
          (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district) OR
          (profiles.school_id::text = holidays.school_id AND holidays.school_id IS NOT NULL) OR
          (profiles.district_id::text = holidays.district_id AND holidays.district_id IS NOT NULL)
        )
    )
  );

-- =====================================================
-- EXIT_TICKET_RESULTS: Fix auth.uid() (no consolidation needed)
-- =====================================================
DROP POLICY IF EXISTS "Users can create exit ticket results in their org" ON exit_ticket_results;
CREATE POLICY "Users can create exit ticket results in their org" ON exit_ticket_results
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = exit_ticket_results.student_id
        AND (
          s.school_id::text = (SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))::text OR
          s.district_id::text = (SELECT profiles.district_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))::text OR
          s.state_id::text = (SELECT profiles.state_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))::text
        )
    ) AND graded_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Users can view exit ticket results in their org" ON exit_ticket_results;
CREATE POLICY "Users can view exit ticket results in their org" ON exit_ticket_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = exit_ticket_results.student_id
        AND (
          s.school_id::text = (SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))::text OR
          s.district_id::text = (SELECT profiles.district_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))::text OR
          s.state_id::text = (SELECT profiles.state_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))::text
        )
    )
  );

-- =====================================================
-- PROFILES: Consolidate SELECT policies + fix auth.uid()
-- =====================================================
DROP POLICY IF EXISTS "District admins can view profiles in their district" ON profiles;
DROP POLICY IF EXISTS "Site admins can view profiles at their school" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles at their schools" ON profiles;
DROP POLICY IF EXISTS "profiles_select_users" ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO public
  USING (
    -- Users can always view their own profile
    id = (SELECT auth.uid())
    OR
    -- Users can view profiles at their schools (via function)
    (school_id::text IN (SELECT get_my_school_ids.school_id FROM get_my_school_ids() get_my_school_ids(school_id)))
    OR
    -- Users can view providers at their schools (via function)
    (id IN (SELECT get_providers_at_my_schools.provider_id FROM get_providers_at_my_schools() get_providers_at_my_schools(provider_id)))
    OR
    -- District admins can view profiles in their district
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      JOIN schools s ON s.district_id::text = ap.district_id::text
      WHERE ap.admin_id = (SELECT auth.uid()) AND ap.role = 'district_admin' AND s.id::text = profiles.school_id::text
    )
    OR
    -- Site admins can view profiles at their school (including providers)
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = (SELECT auth.uid())
        AND ap.role = 'site_admin'
        AND (
          ap.school_id::text = profiles.school_id::text OR
          EXISTS (SELECT 1 FROM provider_schools ps WHERE ps.provider_id = profiles.id AND ps.school_id::text = ap.school_id::text)
        )
    )
  );

-- =====================================================
-- SCHEDULE_SESSIONS: Consolidate SELECT policies + fix auth.uid()
-- =====================================================
DROP POLICY IF EXISTS "Teachers can view sessions for their students" ON schedule_sessions;
DROP POLICY IF EXISTS "Users can view accessible sessions" ON schedule_sessions;

CREATE POLICY "schedule_sessions_select" ON schedule_sessions
  FOR SELECT TO public
  USING (
    -- Provider owns the session
    provider_id = (SELECT auth.uid())
    OR
    -- User is assigned as specialist
    assigned_to_specialist_id = (SELECT auth.uid())
    OR
    -- User is assigned as SEA
    assigned_to_sea_id = (SELECT auth.uid())
    OR
    -- Teachers can view sessions for their students
    student_id IN (SELECT get_teacher_student_ids((SELECT auth.uid())))
  );

-- =====================================================
-- STUDENT_ASSESSMENTS: Consolidate SELECT policies + fix auth.uid()
-- =====================================================
DROP POLICY IF EXISTS "Service role has full access to student_assessments" ON student_assessments;
DROP POLICY IF EXISTS "Users can view assessments for their students" ON student_assessments;
DROP POLICY IF EXISTS "Users can delete assessments for their students" ON student_assessments;
DROP POLICY IF EXISTS "Users can insert assessments for their students" ON student_assessments;
DROP POLICY IF EXISTS "Users can update assessments for their students" ON student_assessments;

-- Consolidated SELECT policy (service_role bypasses RLS anyway)
CREATE POLICY "student_assessments_select" ON student_assessments
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM students WHERE students.id = student_assessments.student_id AND students.provider_id = (SELECT auth.uid())));

CREATE POLICY "student_assessments_insert" ON student_assessments
  FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM students WHERE students.id = student_assessments.student_id AND students.provider_id = (SELECT auth.uid())));

CREATE POLICY "student_assessments_update" ON student_assessments
  FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM students WHERE students.id = student_assessments.student_id AND students.provider_id = (SELECT auth.uid())));

CREATE POLICY "student_assessments_delete" ON student_assessments
  FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM students WHERE students.id = student_assessments.student_id AND students.provider_id = (SELECT auth.uid())));

-- =====================================================
-- PROVIDER_SCHOOLS: Consolidate SELECT policies + fix auth.uid()
-- =====================================================
DROP POLICY IF EXISTS "District admins can view provider_schools in their district" ON provider_schools;
DROP POLICY IF EXISTS "Site admins can view provider_schools at their school" ON provider_schools;
DROP POLICY IF EXISTS "Users can view provider_schools for accessible schools" ON provider_schools;
DROP POLICY IF EXISTS "Users can delete their own schools" ON provider_schools;
DROP POLICY IF EXISTS "Users can insert their own schools" ON provider_schools;
DROP POLICY IF EXISTS "Users can update their own schools" ON provider_schools;

CREATE POLICY "provider_schools_select" ON provider_schools
  FOR SELECT TO public
  USING (
    -- Users can view their own provider_schools
    provider_id = (SELECT auth.uid())
    OR
    -- Site admins can view provider_schools at their school
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = (SELECT auth.uid()) AND ap.role = 'site_admin' AND ap.school_id::text = provider_schools.school_id::text
    )
    OR
    -- District admins can view provider_schools in their district
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      JOIN schools s ON s.district_id::text = ap.district_id::text
      WHERE ap.admin_id = (SELECT auth.uid()) AND ap.role = 'district_admin' AND s.id::text = provider_schools.school_id::text
    )
  );

CREATE POLICY "provider_schools_insert" ON provider_schools
  FOR INSERT TO public
  WITH CHECK (provider_id = (SELECT auth.uid()));

CREATE POLICY "provider_schools_update" ON provider_schools
  FOR UPDATE TO public
  USING (provider_id = (SELECT auth.uid()));

CREATE POLICY "provider_schools_delete" ON provider_schools
  FOR DELETE TO public
  USING (provider_id = (SELECT auth.uid()));

-- =====================================================
-- SPECIAL_ACTIVITIES: Consolidate + fix auth.uid()
-- =====================================================
DROP POLICY IF EXISTS "Users can manage own activities" ON special_activities;
DROP POLICY IF EXISTS "Users can view accessible activities" ON special_activities;

CREATE POLICY "special_activities_select" ON special_activities
  FOR SELECT TO authenticated
  USING (
    -- Users can view their own activities (as provider)
    provider_id = (SELECT auth.uid())
    OR
    -- Teachers can view their activities
    provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
    OR
    -- Users at the same school can view activities
    school_id::text IN (SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))
    OR
    -- Teachers can view activities at their school
    school_id::text IN (SELECT teachers.school_id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
  );

CREATE POLICY "special_activities_insert" ON special_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
    OR provider_id = (SELECT auth.uid())
  );

CREATE POLICY "special_activities_update" ON special_activities
  FOR UPDATE TO authenticated
  USING (
    provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
    OR provider_id = (SELECT auth.uid())
  )
  WITH CHECK (
    provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
    OR provider_id = (SELECT auth.uid())
  );

CREATE POLICY "special_activities_delete" ON special_activities
  FOR DELETE TO authenticated
  USING (
    provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
    OR provider_id = (SELECT auth.uid())
  );

-- =====================================================
-- STUDENTS: Consolidate SELECT policies + fix auth.uid()
-- =====================================================
DROP POLICY IF EXISTS "Specialists can view students from assigned sessions" ON students;
DROP POLICY IF EXISTS "Users can view accessible students" ON students;
DROP POLICY IF EXISTS "Users can delete their own students" ON students;
DROP POLICY IF EXISTS "Users can insert their own students" ON students;
DROP POLICY IF EXISTS "Users can update their own students" ON students;

CREATE POLICY "students_select" ON students
  FOR SELECT TO authenticated
  USING (
    -- Provider owns the student
    provider_id = (SELECT auth.uid())
    OR
    -- Teachers can view their students
    teacher_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
    OR
    -- Specialists can view students from assigned sessions
    EXISTS (SELECT 1 FROM schedule_sessions WHERE schedule_sessions.student_id = students.id AND schedule_sessions.assigned_to_specialist_id = (SELECT auth.uid()))
    OR
    -- SEAs can view students from assigned sessions
    EXISTS (SELECT 1 FROM schedule_sessions WHERE schedule_sessions.student_id = students.id AND schedule_sessions.assigned_to_sea_id = (SELECT auth.uid()))
    OR
    -- SEAs at the same school can view students
    (school_id::text IN (SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())) AND
     (SELECT auth.uid()) IN (SELECT profiles.id FROM profiles WHERE profiles.role = 'sea'))
    OR
    -- Site admins can view students at their school
    EXISTS (SELECT 1 FROM admin_permissions WHERE admin_permissions.admin_id = (SELECT auth.uid()) AND admin_permissions.role = 'site_admin' AND admin_permissions.school_id::text = students.school_id::text)
  );

CREATE POLICY "students_insert" ON students
  FOR INSERT TO authenticated
  WITH CHECK (provider_id = (SELECT auth.uid()));

CREATE POLICY "students_update" ON students
  FOR UPDATE TO authenticated
  USING (provider_id = (SELECT auth.uid()));

CREATE POLICY "students_delete" ON students
  FOR DELETE TO authenticated
  USING (provider_id = (SELECT auth.uid()));

-- =====================================================
-- TEACHERS: Consolidate SELECT policies + fix auth.uid()
-- =====================================================
DROP POLICY IF EXISTS "District admins can view teachers in their district" ON teachers;
DROP POLICY IF EXISTS "School-level teacher visibility" ON teachers;
DROP POLICY IF EXISTS "Site admins can delete teachers" ON teachers;
DROP POLICY IF EXISTS "Users can create teachers" ON teachers;
DROP POLICY IF EXISTS "Users can update teachers" ON teachers;

CREATE POLICY "teachers_select" ON teachers
  FOR SELECT TO authenticated
  USING (
    -- User is the teacher account
    account_id = (SELECT auth.uid())
    OR
    -- Users at the same school can view teachers
    school_id::text IN (SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))
    OR
    -- Providers at the school can view teachers
    school_id::text IN (SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid()))
    OR
    -- District admins can view teachers in their district
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      JOIN schools s ON s.district_id::text = ap.district_id::text
      WHERE ap.admin_id = (SELECT auth.uid()) AND ap.role = 'district_admin' AND s.id::text = teachers.school_id::text
    )
  );

CREATE POLICY "teachers_insert" ON teachers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_permissions
      WHERE admin_permissions.admin_id = (SELECT auth.uid())
        AND admin_permissions.role = 'site_admin'
        AND admin_permissions.school_id::text = teachers.school_id::text
    ) OR
    school_id::text IN (SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))
  );

CREATE POLICY "teachers_update" ON teachers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_permissions
      WHERE admin_permissions.admin_id = (SELECT auth.uid())
        AND admin_permissions.role = 'site_admin'
        AND admin_permissions.school_id::text = teachers.school_id::text
    ) OR
    account_id = (SELECT auth.uid())
  );

CREATE POLICY "teachers_delete" ON teachers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_permissions
      WHERE admin_permissions.admin_id = (SELECT auth.uid())
        AND admin_permissions.role = 'site_admin'
        AND admin_permissions.school_id::text = teachers.school_id::text
    )
  );

-- =====================================================
-- ADMIN_PERMISSIONS: Fix auth.uid()
-- =====================================================
DROP POLICY IF EXISTS "Admins can view their own permissions" ON admin_permissions;
DROP POLICY IF EXISTS "Speddy admins can create admin permissions" ON admin_permissions;

CREATE POLICY "admin_permissions_select" ON admin_permissions
  FOR SELECT TO public
  USING (admin_id = (SELECT auth.uid()));

CREATE POLICY "admin_permissions_insert" ON admin_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_speddy_admin = true
    )
  );
