-- Fix infinite recursion in schedule_sessions "Teachers can view student sessions" policy
--
-- Problem: The policy queries students table, which triggers students RLS,
-- which queries schedule_sessions, creating infinite recursion.
--
-- Solution: Use a security definer function that bypasses RLS on students lookup

-- ============================================================================
-- PART 1: Create security definer function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_teacher_for_student(
  p_student_id uuid,
  p_account_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  -- Check if the account_id belongs to a teacher assigned to this student
  -- SECURITY DEFINER bypasses RLS on students table to prevent circular dependency
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.teachers t ON s.teacher_id = t.id
    WHERE s.id = p_student_id
      AND t.account_id = p_account_id
      AND s.teacher_id IS NOT NULL
  );
$$;

COMMENT ON FUNCTION public.is_teacher_for_student(uuid, uuid)
IS 'Security definer function to check if an account belongs to a teacher assigned to a student. Used in RLS policies to prevent circular dependencies with students table.';

-- ============================================================================
-- PART 2: Recreate the teacher policy using security definer function
-- ============================================================================

-- Drop the problematic policy that causes recursion
DROP POLICY IF EXISTS "Teachers can view student sessions" ON public.schedule_sessions;

-- Recreate using security definer function (no RLS recursion)
CREATE POLICY "Teachers can view student sessions"
ON public.schedule_sessions FOR SELECT
TO authenticated
USING (
  -- Use security definer function to avoid triggering students RLS
  public.is_teacher_for_student(student_id, auth.uid())
);

COMMENT ON POLICY "Teachers can view student sessions" ON public.schedule_sessions
IS 'Allows teachers to view resource sessions for their students. Uses security definer function to avoid circular RLS dependency with students table.';

-- ============================================================================
-- PART 3: Grant execute permission
-- ============================================================================

-- Allow authenticated users to execute the function
GRANT EXECUTE ON FUNCTION public.is_teacher_for_student(uuid, uuid) TO authenticated;
