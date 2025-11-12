-- Add RLS policies for teacher role to support teacher portal
-- Teachers can view their students, IEP goals, schedules, and manage special activities

-- ============================================================================
-- STUDENTS TABLE: Teachers can view their own students
-- ============================================================================

-- Policy: Teachers can view students assigned to them
CREATE POLICY "Teachers can view their own students"
ON public.students FOR SELECT
TO authenticated
USING (
  -- Check if current user is a teacher viewing their students
  teacher_id IN (
    SELECT id FROM public.teachers
    WHERE provider_id = auth.uid()
  )
);

-- ============================================================================
-- STUDENT_DETAILS TABLE: Teachers can view IEP details for their students
-- ============================================================================

-- Policy: Teachers can view IEP goals for their students
CREATE POLICY "Teachers can view IEP goals for their students"
ON public.student_details FOR SELECT
TO authenticated
USING (
  student_id IN (
    SELECT s.id FROM public.students s
    INNER JOIN public.teachers t ON s.teacher_id = t.id
    WHERE t.provider_id = auth.uid()
  )
);

-- ============================================================================
-- SCHEDULE_SESSIONS TABLE: Teachers can view sessions for their students
-- ============================================================================

-- Policy: Teachers can view resource sessions for their students
CREATE POLICY "Teachers can view student sessions"
ON public.schedule_sessions FOR SELECT
TO authenticated
USING (
  student_id IN (
    SELECT s.id FROM public.students s
    INNER JOIN public.teachers t ON s.teacher_id = t.id
    WHERE t.provider_id = auth.uid()
  )
);

-- ============================================================================
-- SPECIAL_ACTIVITIES TABLE: Teachers can manage their own activities
-- ============================================================================

-- Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Users can manage own special activities" ON public.special_activities;

-- Policy: Users can manage their own special activities (resource specialists)
CREATE POLICY "Resource specialists can manage own activities"
ON public.special_activities FOR ALL
TO authenticated
USING (
  provider_id = auth.uid() AND (created_by_role = 'resource' OR created_by_role IS NULL)
)
WITH CHECK (
  provider_id = auth.uid()
);

-- Policy: Teachers can manage their own special activities
CREATE POLICY "Teachers can manage own activities"
ON public.special_activities FOR ALL
TO authenticated
USING (
  created_by_id = auth.uid() AND created_by_role = 'teacher'
)
WITH CHECK (
  created_by_id = auth.uid() AND created_by_role = 'teacher'
);

-- Policy: Teachers can view their own + RS-created activities at their school
CREATE POLICY "Teachers can view own and RS activities"
ON public.special_activities FOR SELECT
TO authenticated
USING (
  -- Teacher viewing their own activities
  (created_by_id = auth.uid() AND created_by_role = 'teacher')
  OR
  -- Teacher viewing RS activities at their school
  (
    created_by_role = 'resource'
    AND school_id IN (
      SELECT t.school_id
      FROM public.teachers t
      WHERE t.provider_id = auth.uid()
    )
  )
);

-- ============================================================================
-- TEACHERS TABLE: Teachers can view and update their own record
-- ============================================================================

-- Drop existing policies to recreate them with teacher support
DROP POLICY IF EXISTS "Users can view teachers for their provider" ON public.teachers;
DROP POLICY IF EXISTS "Users can update teachers for their provider" ON public.teachers;
DROP POLICY IF EXISTS "Users can insert teachers for their provider" ON public.teachers;
DROP POLICY IF EXISTS "Users can delete teachers for their provider" ON public.teachers;

-- Policy: Resource specialists can manage teachers
CREATE POLICY "Resource specialists can manage teachers"
ON public.teachers FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('resource', 'specialist')
  )
);

-- Policy: Teachers can view their own record
CREATE POLICY "Teachers can view own record"
ON public.teachers FOR SELECT
TO authenticated
USING (
  provider_id = auth.uid()
);

-- Policy: Teachers can update their own record
CREATE POLICY "Teachers can update own record"
ON public.teachers FOR UPDATE
TO authenticated
USING (
  provider_id = auth.uid()
)
WITH CHECK (
  provider_id = auth.uid()
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Teachers can view their own students" ON public.students IS 'Allows teachers to view students assigned to them';
COMMENT ON POLICY "Teachers can view IEP goals for their students" ON public.student_details IS 'Allows teachers to view IEP goals for their students';
COMMENT ON POLICY "Teachers can view student sessions" ON public.schedule_sessions IS 'Allows teachers to view resource sessions for their students';
COMMENT ON POLICY "Teachers can manage own activities" ON public.special_activities IS 'Allows teachers to create/update/delete their own special activities';
COMMENT ON POLICY "Teachers can view own and RS activities" ON public.special_activities IS 'Allows teachers to view their own activities and RS-created activities at their school';
