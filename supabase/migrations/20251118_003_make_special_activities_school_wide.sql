-- Make special activities visible to all providers at the same school
--
-- Issue: Teacher-created special activities were only visible to the teacher who
-- created them, not to resource specialists or other providers. This caused
-- scheduling conflicts because providers couldn't see teacher activities during
-- auto-scheduling.
--
-- Solution:
-- 1. Update existing teacher activities to set provider_id = NULL (school-wide)
-- 2. Add RLS policy allowing providers to see all activities at their schools
-- 3. Update existing restrictive policies

-- Step 1: Migrate existing teacher-created activities
-- Set provider_id to NULL for activities created by teachers
-- This makes them school-wide rather than provider-specific
UPDATE public.special_activities
SET provider_id = NULL
WHERE created_by_role = 'teacher';

-- Step 2: Drop the old restrictive SELECT policy for resource specialists
-- This policy only allowed providers to see their own activities
DROP POLICY IF EXISTS "Resource specialists can manage own activities" ON public.special_activities;

-- Step 3: Create new policies with school-wide access

-- Allow resource specialists to manage (INSERT/UPDATE/DELETE) their own activities
CREATE POLICY "Resource specialists can manage own activities" ON public.special_activities
  FOR ALL
  TO authenticated
  USING (
    (provider_id = auth.uid() AND (created_by_role = 'resource' OR created_by_role IS NULL))
    OR
    (auth.role() = 'service_role'::text)
  )
  WITH CHECK (
    provider_id = auth.uid()
    OR
    (auth.role() = 'service_role'::text)
  );

-- Allow all providers to VIEW activities at schools where they have students
CREATE POLICY "Providers can view all activities at their schools" ON public.special_activities
  FOR SELECT
  TO authenticated
  USING (
    -- Providers can see activities at schools where they have students
    (school_id IN (
      SELECT DISTINCT school_id
      FROM public.students
      WHERE provider_id = auth.uid()
    ))
    OR
    -- Users can always see activities they created
    (created_by_id = auth.uid())
    OR
    -- Service role can see everything
    (auth.role() = 'service_role'::text)
  );
