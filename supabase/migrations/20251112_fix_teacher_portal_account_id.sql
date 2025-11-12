-- Fix teacher portal and RLS policies to use account_id instead of provider_id
-- This addresses critical PR 381 review comments

-- ============================================================================
-- 1. Fix RLS policies for teacher access (use account_id not provider_id)
-- ============================================================================

-- Drop existing policies that use provider_id
DROP POLICY IF EXISTS "Teachers can view their own students" ON public.students;
DROP POLICY IF EXISTS "Teachers can view IEP goals for their students" ON public.student_details;
DROP POLICY IF EXISTS "Teachers can view student sessions" ON public.schedule_sessions;

-- Recreate with account_id
CREATE POLICY "Teachers can view their own students"
ON public.students FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.teachers t
    WHERE t.id = students.teacher_id
    AND t.account_id = auth.uid()
  )
);

CREATE POLICY "Teachers can view IEP goals for their students"
ON public.student_details FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.students s
    INNER JOIN public.teachers t ON s.teacher_id = t.id
    WHERE s.id = student_details.student_id
    AND t.account_id = auth.uid()
  )
);

CREATE POLICY "Teachers can view student sessions"
ON public.schedule_sessions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.teachers t ON s.teacher_id = t.id
    WHERE s.id = schedule_sessions.student_id
      AND t.account_id = auth.uid()
      AND s.teacher_id IS NOT NULL
  )
);

-- ============================================================================
-- 2. Fix specialist teacher creation policy (remove null school_id bypass)
-- ============================================================================

-- Drop the policy that allows null school_id
DROP POLICY IF EXISTS "Resource specialists can create teachers" ON public.teachers;

-- Recreate with proper school scoping
CREATE POLICY "Resource specialists can create teachers"
ON public.teachers FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
        -- Can only create teachers at their own school
        AND p.school_id = school_id
    )
);

-- Add comments
COMMENT ON POLICY "Teachers can view their own students" ON public.students
IS 'Allows teachers to view students where they are the assigned teacher. Uses account_id to link to the teacher''s profile.';

COMMENT ON POLICY "Teachers can view IEP goals for their students" ON public.student_details
IS 'Allows teachers to view IEP goals for their assigned students. Uses account_id for authentication.';

COMMENT ON POLICY "Teachers can view student sessions" ON public.schedule_sessions
IS 'Allows teachers to view resource sessions for their students. Uses account_id for authentication.';

COMMENT ON POLICY "Resource specialists can create teachers" ON public.teachers
IS 'Allows resource specialists to create teacher records only at their assigned school. Prevents cross-school teacher creation.';
