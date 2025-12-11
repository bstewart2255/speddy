-- Migration: District Admin RLS Policies
-- Date: 2025-12-11
-- Description: Allow district admins to view profiles and teachers at schools in their district

-- Allow district admins to see profiles at schools in their district
CREATE POLICY "District admins can view profiles in their district"
ON profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    JOIN schools s ON s.district_id = ap.district_id
    WHERE ap.admin_id = auth.uid()
      AND ap.role = 'district_admin'
      AND s.id = profiles.school_id
  )
);

-- Allow district admins to see teachers at schools in their district
CREATE POLICY "District admins can view teachers in their district"
ON teachers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    JOIN schools s ON s.district_id = ap.district_id
    WHERE ap.admin_id = auth.uid()
      AND ap.role = 'district_admin'
      AND s.id = teachers.school_id
  )
);
