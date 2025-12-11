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

-- Allow district admins to see provider_schools for schools in their district
CREATE POLICY "District admins can view provider_schools in their district"
ON provider_schools FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    JOIN schools s ON s.district_id = ap.district_id
    WHERE ap.admin_id = auth.uid()
      AND ap.role = 'district_admin'
      AND s.id = provider_schools.school_id
  )
);

-- Security definer function to fetch site admins for a school
-- This bypasses RLS to avoid circular dependency issues
CREATE OR REPLACE FUNCTION get_school_site_admins(p_school_id text)
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ap.admin_id as id, p.full_name, p.email
  FROM admin_permissions ap
  JOIN profiles p ON p.id = ap.admin_id
  WHERE ap.school_id = p_school_id
    AND ap.role = 'site_admin';
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_school_site_admins(text) TO authenticated;
