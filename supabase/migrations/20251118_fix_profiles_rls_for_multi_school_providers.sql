-- Fix profiles RLS policy to allow teachers to see multi-school resource specialists
--
-- Issue: Teachers couldn't see resource specialists assigned to their students
-- because the RLS policy only checked the provider's PRIMARY school_id,
-- not their additional schools in the provider_schools table.
--
-- Solution: Add a condition to check if the provider serves any school
-- that the viewing user has access to via provider_schools table.

-- Drop existing policy
DROP POLICY IF EXISTS profiles_select_users ON public.profiles;

-- Recreate policy with multi-school provider support
CREATE POLICY profiles_select_users ON public.profiles
  FOR SELECT
  USING (
    -- User can see their own profile
    (auth.uid() = id)
    OR
    -- User can see profiles in their accessible schools (primary school_id)
    (
      (auth.uid() <> id)
      AND (school_id)::text IN (
        SELECT school_id
        FROM user_accessible_school_ids()
      )
    )
    OR
    -- User can see profiles of providers who serve their accessible schools
    -- (even if provider's primary school is different)
    (
      (auth.uid() <> id)
      AND EXISTS (
        SELECT 1
        FROM public.provider_schools ps
        WHERE ps.provider_id = profiles.id
          AND ps.school_id IN (
            SELECT school_id
            FROM user_accessible_school_ids()
          )
      )
    )
    OR
    -- Service role can see everything
    (auth.role() = 'service_role'::text)
  );
