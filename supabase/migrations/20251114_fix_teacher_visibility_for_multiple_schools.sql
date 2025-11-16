-- Fix RLS policy for teacher visibility to support users who work at multiple schools
-- This allows resource specialists assigned to multiple schools via provider_schools
-- to see teachers at all their assigned schools

-- Drop the existing policy
DROP POLICY IF EXISTS "School-level teacher visibility" ON teachers;

-- Create updated policy that checks provider_schools table
CREATE POLICY "School-level teacher visibility" ON teachers
  FOR SELECT
  USING (
    -- Teacher's own account
    account_id = auth.uid()
    OR
    -- Resource specialists at the same primary school
    (
      EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = auth.uid()
        AND p.school_id::text = teachers.school_id::text
        AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
      )
    )
    OR
    -- Resource specialists who work at multiple schools (check provider_schools)
    (
      EXISTS (
        SELECT 1
        FROM profiles p
        JOIN provider_schools ps ON ps.provider_id = p.id
        WHERE p.id = auth.uid()
        AND ps.school_id::text = teachers.school_id::text
        AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
      )
    )
    OR
    -- Site admins
    (
      EXISTS (
        SELECT 1
        FROM admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'site_admin'
        AND ap.school_id = teachers.school_id::text
      )
    )
    OR
    -- District admins (for teachers with linked accounts)
    (
      EXISTS (
        SELECT 1
        FROM admin_permissions ap
        JOIN profiles p ON p.id = teachers.account_id
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'district_admin'
        AND ap.district_id = p.district_id::text
      )
    )
  );
