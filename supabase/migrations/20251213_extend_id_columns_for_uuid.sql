-- Migration: Extend ID columns to support UUIDs
--
-- This migration extends varchar(20) columns to varchar(36) to accommodate UUIDs.
-- Existing NCES IDs (like '0761754') are preserved. New districts/schools will use UUIDs.
--
-- PostgreSQL requires dropping RLS policies and views that reference columns
-- before altering their type, even for compatible changes like varchar(20) → varchar(36).

-- ============================================================================
-- STEP 1: Drop RLS policies that reference district_id/school_id columns
-- ============================================================================

DROP POLICY IF EXISTS "District admins can view profiles in their district" ON profiles;
DROP POLICY IF EXISTS "District admins can view teachers in their district" ON teachers;
DROP POLICY IF EXISTS "District admins can view provider_schools in their district" ON provider_schools;
DROP POLICY IF EXISTS "Users can view holidays for their school" ON holidays;
DROP POLICY IF EXISTS "Users can delete holidays" ON holidays;
DROP POLICY IF EXISTS "Users can update holidays" ON holidays;
DROP POLICY IF EXISTS "Eligible roles can create holidays" ON holidays;
DROP POLICY IF EXISTS "Users can view share requests for their schools" ON schedule_share_requests;
DROP POLICY IF EXISTS "Users can create share requests for their schools" ON schedule_share_requests;
DROP POLICY IF EXISTS "Site admins can delete teachers" ON teachers;
DROP POLICY IF EXISTS "School-level teacher visibility" ON teachers;
DROP POLICY IF EXISTS "Users can view accessible students" ON students;
DROP POLICY IF EXISTS "Users can view accessible activities" ON special_activities;
DROP POLICY IF EXISTS "Users can create teachers" ON teachers;
DROP POLICY IF EXISTS "Users can update teachers" ON teachers;
DROP POLICY IF EXISTS "Users can view exit ticket results in their org" ON exit_ticket_results;
DROP POLICY IF EXISTS "Users can create exit ticket results in their org" ON exit_ticket_results;

-- ============================================================================
-- STEP 2: Drop view that depends on school_id column
-- ============================================================================

DROP VIEW IF EXISTS unmatched_student_teachers;

-- ============================================================================
-- STEP 3: Extend column lengths to varchar(36) for UUID support
-- ============================================================================

-- Primary keys
ALTER TABLE districts ALTER COLUMN id TYPE varchar(36);
ALTER TABLE schools ALTER COLUMN id TYPE varchar(36);

-- Foreign key references
ALTER TABLE schools ALTER COLUMN district_id TYPE varchar(36);
ALTER TABLE profiles ALTER COLUMN district_id TYPE varchar(36);
ALTER TABLE profiles ALTER COLUMN school_id TYPE varchar(36);
ALTER TABLE admin_permissions ALTER COLUMN district_id TYPE varchar(36);
ALTER TABLE admin_permissions ALTER COLUMN school_id TYPE varchar(36);
ALTER TABLE bell_schedules ALTER COLUMN district_id TYPE varchar(36);
ALTER TABLE bell_schedules ALTER COLUMN school_id TYPE varchar(36);
ALTER TABLE provider_schools ALTER COLUMN district_id TYPE varchar(36);
ALTER TABLE provider_schools ALTER COLUMN school_id TYPE varchar(36);
ALTER TABLE students ALTER COLUMN district_id TYPE varchar(36);
ALTER TABLE students ALTER COLUMN school_id TYPE varchar(36);
ALTER TABLE teachers ALTER COLUMN school_id TYPE varchar(36);

-- ============================================================================
-- STEP 4: Recreate the view
-- ============================================================================

CREATE VIEW unmatched_student_teachers AS
SELECT
    id AS student_id,
    initials,
    grade_level,
    teacher_name,
    school_site,
    school_district,
    school_id,
    created_at
FROM students s
WHERE teacher_name IS NOT NULL AND teacher_name <> ''
  AND teacher_id IS NULL
ORDER BY school_site, teacher_name;

-- ============================================================================
-- STEP 5: Recreate RLS policies
-- ============================================================================

CREATE POLICY "District admins can view profiles in their district" ON profiles
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_permissions ap
  JOIN schools s ON s.district_id = ap.district_id
  WHERE ap.admin_id = auth.uid()
    AND ap.role = 'district_admin'
    AND s.id = profiles.school_id
));

CREATE POLICY "District admins can view teachers in their district" ON teachers
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_permissions ap
  JOIN schools s ON s.district_id = ap.district_id
  WHERE ap.admin_id = auth.uid()
    AND ap.role = 'district_admin'
    AND s.id = teachers.school_id
));

CREATE POLICY "District admins can view provider_schools in their district" ON provider_schools
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_permissions ap
  JOIN schools s ON s.district_id = ap.district_id
  WHERE ap.admin_id = auth.uid()
    AND ap.role = 'district_admin'
    AND s.id = provider_schools.school_id
));

CREATE POLICY "Users can view holidays for their school" ON holidays
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.id = auth.uid()
    AND ((profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
      OR (profiles.school_id = holidays.school_id AND holidays.school_id IS NOT NULL)
      OR (profiles.district_id = holidays.district_id AND holidays.district_id IS NOT NULL))
));

CREATE POLICY "Users can delete holidays" ON holidays
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.id = auth.uid()
    AND ((profiles.role IN ('resource', 'admin')
        AND ((profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
          OR (profiles.school_id = holidays.school_id AND holidays.school_id IS NOT NULL)
          OR (profiles.district_id = holidays.district_id AND holidays.district_id IS NOT NULL))
        AND (holidays.date >= CURRENT_DATE OR profiles.role = 'admin'))
      OR (profiles.role = 'sea'
        AND ((profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
          OR (profiles.school_id = holidays.school_id AND holidays.school_id IS NOT NULL)
          OR (profiles.district_id = holidays.district_id AND holidays.district_id IS NOT NULL))
        AND (holidays.date >= CURRENT_DATE OR profiles.role = 'admin')))
));

CREATE POLICY "Users can update holidays" ON holidays
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.id = auth.uid()
    AND profiles.role IN ('resource', 'sea', 'admin')
    AND ((profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
      OR (profiles.school_id = holidays.school_id AND holidays.school_id IS NOT NULL)
      OR (profiles.district_id = holidays.district_id AND holidays.district_id IS NOT NULL))
))
WITH CHECK (
  updated_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('resource', 'sea', 'admin')
      AND ((profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
        OR (profiles.school_id = holidays.school_id AND holidays.school_id IS NOT NULL)
        OR (profiles.district_id = holidays.district_id AND holidays.district_id IS NOT NULL))
  )
);

CREATE POLICY "Eligible roles can create holidays" ON holidays
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('resource', 'sea', 'admin')
      AND ((profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
        OR (profiles.school_id = holidays.school_id AND holidays.school_id IS NOT NULL)
        OR (profiles.district_id = holidays.district_id AND holidays.district_id IS NOT NULL))
  )
);

CREATE POLICY "Users can view share requests for their schools" ON schedule_share_requests
FOR SELECT TO authenticated
USING (school_id IN (
  SELECT profiles.school_id FROM profiles WHERE profiles.id = auth.uid()
  UNION
  SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = auth.uid()
));

CREATE POLICY "Users can create share requests for their schools" ON schedule_share_requests
FOR INSERT TO authenticated
WITH CHECK (
  sharer_id = auth.uid()
  AND school_id IN (
    SELECT profiles.school_id FROM profiles WHERE profiles.id = auth.uid()
    UNION
    SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = auth.uid()
  )
);

CREATE POLICY "Site admins can delete teachers" ON teachers
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_permissions
  WHERE admin_permissions.admin_id = auth.uid()
    AND admin_permissions.role = 'site_admin'
    AND admin_permissions.school_id = teachers.school_id
));

CREATE POLICY "School-level teacher visibility" ON teachers
FOR SELECT TO authenticated
USING (
  school_id IN (SELECT profiles.school_id FROM profiles WHERE profiles.id = auth.uid())
  OR school_id IN (SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = auth.uid())
  OR account_id = auth.uid()
);

CREATE POLICY "Users can view accessible students" ON students
FOR SELECT TO authenticated
USING (
  provider_id = auth.uid()
  OR teacher_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = auth.uid())
  OR EXISTS (SELECT 1 FROM schedule_sessions WHERE schedule_sessions.student_id = students.id AND schedule_sessions.assigned_to_sea_id = auth.uid())
  OR (school_id IN (SELECT profiles.school_id FROM profiles WHERE profiles.id = auth.uid())
      AND auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = 'sea'))
  OR EXISTS (SELECT 1 FROM admin_permissions WHERE admin_permissions.admin_id = auth.uid() AND admin_permissions.role = 'site_admin')
);

CREATE POLICY "Users can view accessible activities" ON special_activities
FOR SELECT TO authenticated
USING (
  provider_id IN (SELECT teachers.id FROM teachers WHERE teachers.account_id = auth.uid())
  OR provider_id = auth.uid()
  OR school_id IN (SELECT profiles.school_id FROM profiles WHERE profiles.id = auth.uid())
  OR school_id IN (SELECT teachers.school_id FROM teachers WHERE teachers.account_id = auth.uid())
);

CREATE POLICY "Users can create teachers" ON teachers
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM admin_permissions WHERE admin_permissions.admin_id = auth.uid() AND admin_permissions.role = 'site_admin' AND admin_permissions.school_id = teachers.school_id)
  OR school_id IN (SELECT profiles.school_id FROM profiles WHERE profiles.id = auth.uid())
);

CREATE POLICY "Users can update teachers" ON teachers
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM admin_permissions WHERE admin_permissions.admin_id = auth.uid() AND admin_permissions.role = 'site_admin' AND admin_permissions.school_id = teachers.school_id)
  OR account_id = auth.uid()
);

CREATE POLICY "Users can view exit ticket results in their org" ON exit_ticket_results
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM students s
  WHERE s.id = exit_ticket_results.student_id
    AND (s.school_id = (SELECT profiles.school_id FROM profiles WHERE profiles.id = auth.uid())
      OR s.district_id = (SELECT profiles.district_id FROM profiles WHERE profiles.id = auth.uid())
      OR s.state_id = (SELECT profiles.state_id FROM profiles WHERE profiles.id = auth.uid()))
));

CREATE POLICY "Users can create exit ticket results in their org" ON exit_ticket_results
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = exit_ticket_results.student_id
      AND (s.school_id = (SELECT profiles.school_id FROM profiles WHERE profiles.id = auth.uid())
        OR s.district_id = (SELECT profiles.district_id FROM profiles WHERE profiles.id = auth.uid())
        OR s.state_id = (SELECT profiles.state_id FROM profiles WHERE profiles.id = auth.uid()))
  )
  AND graded_by = auth.uid()
);
