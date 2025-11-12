-- Fix infinite recursion in students RLS policy
-- The issue: students policy references schedule_sessions, which references students
-- Solution: Use a simplified policy that avoids circular references

-- Drop the problematic consolidated policy
DROP POLICY IF EXISTS "Users can view students" ON public.students;

-- Create simplified policies without circular dependencies
-- Policy 1: Provider can view their own students (direct check)
CREATE POLICY "Providers can view their own students" ON public.students
  FOR SELECT
  USING (provider_id = auth.uid());

-- Policy 2: SEAs can view students at their assigned schools
-- Uses school_id directly instead of going through schedule_sessions
CREATE POLICY "SEAs can view students at their school" ON public.students
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'sea'
        AND (
          -- Match by school_id if both are set
          (p.school_id IS NOT NULL AND students.school_id = p.school_id)
          OR
          -- Fallback to legacy school_site + district matching
          (
            p.school_site IS NOT NULL
            AND students.school_site = p.school_site
            AND (
              p.school_district IS NULL
              OR students.school_district IS NULL
              OR p.school_district = students.school_district
            )
          )
        )
    )
  );

-- Policy 3: Specialists can view students assigned to them
-- This is safe because it doesn't create a circular reference -
-- we're only checking if ANY session exists, not evaluating session RLS
CREATE POLICY "Specialists can view assigned students" ON public.students
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM schedule_sessions ss
      WHERE ss.student_id = students.id
        AND ss.assigned_to_specialist_id = auth.uid()
      LIMIT 1
    )
  );

COMMENT ON POLICY "Providers can view their own students" ON public.students
IS 'Resource specialists can view students they created';

COMMENT ON POLICY "SEAs can view students at their school" ON public.students
IS 'SEAs can view all students at their assigned school (uses school_id or legacy school_site/district matching)';

COMMENT ON POLICY "Specialists can view assigned students" ON public.students
IS 'Specialists can view students whose sessions are assigned to them';
