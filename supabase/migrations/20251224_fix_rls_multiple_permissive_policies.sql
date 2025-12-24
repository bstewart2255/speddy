-- Fix Multiple Permissive Policies warnings by consolidating SELECT policies
-- Multiple permissive policies get OR'd together which can slow down queries
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

-- =====================================================
-- PROFILES: Consolidate multiple SELECT policies into one
-- =====================================================
-- Drop existing SELECT policies
DROP POLICY IF EXISTS "District admins can view profiles in their district" ON profiles;
DROP POLICY IF EXISTS "Site admins can view profiles at their school" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles at their schools" ON profiles;
DROP POLICY IF EXISTS "profiles_select_users" ON profiles;

-- Create consolidated SELECT policy
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
-- SCHEDULE_SESSIONS: Consolidate multiple SELECT policies into one
-- =====================================================
-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Teachers can view sessions for their students" ON schedule_sessions;
DROP POLICY IF EXISTS "Users can view accessible sessions" ON schedule_sessions;

-- Create consolidated SELECT policy
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
-- STUDENT_ASSESSMENTS: Consolidate multiple SELECT policies into one
-- =====================================================
-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Service role has full access to student_assessments" ON student_assessments;
DROP POLICY IF EXISTS "Users can view assessments for their students" ON student_assessments;

-- Create consolidated SELECT policy (service_role has bypass anyway)
CREATE POLICY "student_assessments_select" ON student_assessments
  FOR SELECT TO public
  USING (
    -- Service role bypass (handled by Supabase but explicit for clarity)
    ((SELECT auth.jwt()) ->> 'role' = 'service_role')
    OR
    -- Users can view assessments for their students
    EXISTS (SELECT 1 FROM students WHERE students.id = student_assessments.student_id AND students.provider_id = (SELECT auth.uid()))
  );

-- Also need to keep service role policies for other operations
DROP POLICY IF EXISTS "Service role has full access to student_assessments" ON student_assessments;

-- =====================================================
-- PROVIDER_SCHOOLS: Consolidate multiple SELECT policies into one
-- =====================================================
-- Drop existing SELECT policies
DROP POLICY IF EXISTS "District admins can view provider_schools in their district" ON provider_schools;
DROP POLICY IF EXISTS "Site admins can view provider_schools at their school" ON provider_schools;
DROP POLICY IF EXISTS "Users can view provider_schools for accessible schools" ON provider_schools;

-- Create consolidated SELECT policy
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

-- =====================================================
-- SPECIAL_ACTIVITIES: Fix overlapping ALL and SELECT policies
-- The ALL policy already covers SELECT, so we just need to handle the extra SELECT conditions
-- =====================================================
-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage own activities" ON special_activities;
DROP POLICY IF EXISTS "Users can view accessible activities" ON special_activities;

-- Create separate policies for different operations to avoid overlap
CREATE POLICY "special_activities_select" ON special_activities
  FOR SELECT TO public
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
  FOR INSERT TO public
  WITH CHECK (
    provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
    OR provider_id = (SELECT auth.uid())
  );

CREATE POLICY "special_activities_update" ON special_activities
  FOR UPDATE TO public
  USING (
    provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
    OR provider_id = (SELECT auth.uid())
  )
  WITH CHECK (
    provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
    OR provider_id = (SELECT auth.uid())
  );

CREATE POLICY "special_activities_delete" ON special_activities
  FOR DELETE TO public
  USING (
    provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid()))
    OR provider_id = (SELECT auth.uid())
  );

-- =====================================================
-- STUDENTS: Consolidate multiple SELECT policies into one
-- =====================================================
-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Specialists can view students from assigned sessions" ON students;
DROP POLICY IF EXISTS "Users can view accessible students" ON students;

-- Create consolidated SELECT policy
CREATE POLICY "students_select" ON students
  FOR SELECT TO public
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
    -- Site admins can view students
    EXISTS (SELECT 1 FROM admin_permissions WHERE admin_permissions.admin_id = (SELECT auth.uid()) AND admin_permissions.role = 'site_admin')
  );

-- =====================================================
-- TEACHERS: Consolidate multiple SELECT policies into one
-- =====================================================
-- Drop existing SELECT policies
DROP POLICY IF EXISTS "District admins can view teachers in their district" ON teachers;
DROP POLICY IF EXISTS "School-level teacher visibility" ON teachers;

-- Create consolidated SELECT policy
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

-- =====================================================
-- ADMIN_PERMISSIONS: Check if consolidation needed
-- Only has one SELECT policy, but ensure it uses optimized pattern
-- =====================================================
DROP POLICY IF EXISTS "Admins can view their own permissions" ON admin_permissions;
CREATE POLICY "admin_permissions_select" ON admin_permissions
  FOR SELECT TO public
  USING (admin_id = (SELECT auth.uid()));
