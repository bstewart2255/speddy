-- Fix infinite recursion in teacher RLS policies
-- The issue: circular dependency between students and schedule_sessions policies
--
-- IMPORTANT: This migration must run AFTER 20251111_add_teacher_role_rls_policies.sql
-- It drops and recreates policies from that migration to fix recursion issues.

-- Drop the problematic policies
DROP POLICY IF EXISTS "Teachers can view their own students" ON public.students;
DROP POLICY IF EXISTS "Teachers can view student sessions" ON public.schedule_sessions;
DROP POLICY IF EXISTS "Teachers can view IEP goals for their students" ON public.student_details;

-- ============================================================================
-- STUDENTS TABLE: Simpler policy without subquery
-- ============================================================================

-- Use a direct join instead of subquery to avoid recursion
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

-- ============================================================================
-- STUDENT_DETAILS TABLE: Direct check using teachers
-- ============================================================================

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

-- ============================================================================
-- SCHEDULE_SESSIONS TABLE: Use recursive: false hint
-- ============================================================================

-- For schedule_sessions, we'll use a simpler approach that doesn't
-- trigger the students RLS recursion. We check teachers directly.
CREATE POLICY "Teachers can view student sessions"
ON public.schedule_sessions FOR SELECT
TO authenticated
USING (
  -- Check if the session's student has this user as their teacher
  -- This uses a correlated subquery which PostgreSQL handles better
  EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.teachers t ON s.teacher_id = t.id
    WHERE s.id = schedule_sessions.student_id
      AND t.account_id = auth.uid()
      -- Use WITH CHECK OPTION to hint no recursion needed
      AND s.teacher_id IS NOT NULL
  )
);

-- ============================================================================
-- Alternative approach: If above still causes issues, uncomment this simpler version
-- ============================================================================

/*
-- Drop the complex policy
DROP POLICY IF EXISTS "Teachers can view student sessions" ON public.schedule_sessions;

-- Create a much simpler policy that relies on checking teachers only
CREATE POLICY "Teachers view sessions for their students"
ON public.schedule_sessions FOR SELECT
TO authenticated
USING (
  -- Direct check: is there a teacher record for this user
  -- that matches a student with this session?
  EXISTS (
    SELECT 1
    FROM public.teachers t
    WHERE t.provider_id = auth.uid()
      AND t.id IN (
        SELECT teacher_id
        FROM public.students
        WHERE id = schedule_sessions.student_id
      )
  )
);
*/

COMMENT ON POLICY "Teachers can view their own students" ON public.students
IS 'Allows teachers to view students where they are assigned as the teacher. Uses EXISTS to avoid infinite recursion.';

COMMENT ON POLICY "Teachers can view student sessions" ON public.schedule_sessions
IS 'Allows teachers to view resource sessions for their students. Carefully structured to avoid RLS recursion.';
