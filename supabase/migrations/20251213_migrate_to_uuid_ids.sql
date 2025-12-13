-- Migration: Convert from NCES IDs to UUIDs
--
-- This migration:
-- 1. Drops RLS policies that reference district_id/school_id columns
-- 2. Increases varchar column lengths to accommodate UUIDs (36 chars)
-- 3. Recreates the RLS policies
-- 4. Deletes all data except Mt. Diablo Unified district
-- 5. Generates new UUIDs for Mt. Diablo district and its schools
-- 6. Updates all FK references
-- 7. Deletes all unused NCES data

-- Step 0a: Drop RLS policies that reference district_id/school_id columns
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

-- Step 0a2: Drop view that depends on school_id column
DROP VIEW IF EXISTS unmatched_student_teachers;

-- Step 0b: Increase column lengths for UUID storage (36 characters)
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

-- Step 0b2: Recreate the view
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

-- Step 0c: Recreate RLS policies
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

CREATE POLICY "Users can view share requests for their schools" ON schedule_share_requests
FOR SELECT TO authenticated
USING (school_id IN (
  SELECT profiles.school_id FROM profiles WHERE profiles.id = auth.uid()
  UNION
  SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = auth.uid()
));

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

CREATE POLICY "Users can create teachers" ON teachers
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM admin_permissions WHERE admin_permissions.admin_id = auth.uid() AND admin_permissions.role = 'site_admin' AND admin_permissions.school_id = teachers.school_id)
  OR school_id IN (SELECT profiles.school_id FROM profiles WHERE profiles.id = auth.uid())
);

-- Step 1: Delete profiles not in Mt. Diablo Unified
DELETE FROM profiles
WHERE district_id != '0761754'
   OR district_id IS NULL;

-- Step 2: Delete admin_permissions not in Mt. Diablo Unified
DELETE FROM admin_permissions
WHERE district_id != '0761754';

-- Step 3: Create temporary mapping table for ID conversion
CREATE TEMP TABLE id_mapping (
    entity_type TEXT,
    old_id TEXT,
    new_id TEXT
);

-- Generate new UUID for Mt. Diablo district
INSERT INTO id_mapping (entity_type, old_id, new_id)
VALUES ('district', '0761754', gen_random_uuid()::text);

-- Generate new UUIDs for all Mt. Diablo schools
INSERT INTO id_mapping (entity_type, old_id, new_id)
SELECT 'school', id, gen_random_uuid()::text
FROM schools
WHERE district_id = '0761754';

-- Step 4: Update profiles with new district_id
UPDATE profiles p
SET district_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'district'
  AND p.district_id = m.old_id;

-- Step 5: Update profiles with new school_id
UPDATE profiles p
SET school_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'school'
  AND p.school_id = m.old_id;

-- Step 6: Update admin_permissions with new district_id
UPDATE admin_permissions ap
SET district_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'district'
  AND ap.district_id = m.old_id;

-- Step 7: Update admin_permissions with new school_id
UPDATE admin_permissions ap
SET school_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'school'
  AND ap.school_id = m.old_id;

-- Step 7a: Update provider_schools with new district_id
UPDATE provider_schools ps
SET district_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'district'
  AND ps.district_id = m.old_id;

-- Step 7b: Update provider_schools with new school_id
UPDATE provider_schools ps
SET school_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'school'
  AND ps.school_id = m.old_id;

-- Step 7c: Update students with new district_id
UPDATE students s
SET district_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'district'
  AND s.district_id = m.old_id;

-- Step 7d: Update students with new school_id
UPDATE students s
SET school_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'school'
  AND s.school_id = m.old_id;

-- Step 7e: Update teachers with new school_id
UPDATE teachers t
SET school_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'school'
  AND t.school_id = m.old_id;

-- Step 7f: Update unmatched_student_teachers with new school_id
UPDATE unmatched_student_teachers ust
SET school_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'school'
  AND ust.school_id = m.old_id;

-- Step 8: Delete all schools not in Mt. Diablo district
DELETE FROM schools WHERE district_id != '0761754';

-- Step 9: Update schools.district_id with new district UUID
UPDATE schools s
SET district_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'district'
  AND s.district_id = m.old_id;

-- Step 10: Update schools.id with new UUIDs
-- Need to do this carefully - update each school individually
DO $$
DECLARE
    mapping RECORD;
BEGIN
    FOR mapping IN SELECT old_id, new_id FROM id_mapping WHERE entity_type = 'school'
    LOOP
        UPDATE schools SET id = mapping.new_id WHERE id = mapping.old_id;
    END LOOP;
END $$;

-- Step 11: Delete all other districts
DELETE FROM districts WHERE id != '0761754';

-- Step 12: Update Mt. Diablo district ID to new UUID
UPDATE districts d
SET id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'district'
  AND d.id = m.old_id;

-- Step 13: Clean up - drop temp table
DROP TABLE id_mapping;

-- Verification: Show what we migrated
DO $$
DECLARE
    district_count INT;
    school_count INT;
    profile_count INT;
BEGIN
    SELECT COUNT(*) INTO district_count FROM districts;
    SELECT COUNT(*) INTO school_count FROM schools;
    SELECT COUNT(*) INTO profile_count FROM profiles WHERE district_id IS NOT NULL;

    RAISE NOTICE 'Migration complete: % district(s), % school(s), % profile(s) with district',
        district_count, school_count, profile_count;
END $$;
