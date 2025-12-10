-- Fix profiles RLS policy to allow viewing SEAs and specialists at same school
--
-- Issue: The user_accessible_school_ids() function was missing, and the RLS policy
-- on profiles only allowed users to see their own profile (id = auth.uid()).
-- This prevented specialists from seeing SEAs in the assignment dropdown.
--
-- Fixes GitHub issues #446 and #447

-- 1. Create the helper function (if not exists)
CREATE OR REPLACE FUNCTION public.user_accessible_school_ids()
RETURNS TABLE(school_id varchar)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT DISTINCT school_id FROM (
        -- User's primary school from profiles
        SELECT p.school_id
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.school_id IS NOT NULL

        UNION

        -- Additional schools from provider_schools
        SELECT ps.school_id
        FROM public.provider_schools ps
        WHERE ps.provider_id = auth.uid()
        AND ps.school_id IS NOT NULL
    ) schools
    WHERE school_id IS NOT NULL;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.user_accessible_school_ids() TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.user_accessible_school_ids() IS
'Returns all school IDs accessible to the current user. Includes both the primary school from profiles and any additional schools from provider_schools.';

-- 2. Update the RLS policy to use the function
DROP POLICY IF EXISTS profiles_select_users ON public.profiles;

CREATE POLICY profiles_select_users ON public.profiles
  FOR SELECT
  USING (
    -- User can see their own profile
    (auth.uid() = id)
    OR
    -- User can see profiles in their accessible schools (by primary school_id)
    (
      (auth.uid() <> id)
      AND (school_id)::text IN (
        SELECT school_id FROM user_accessible_school_ids()
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
            SELECT school_id FROM user_accessible_school_ids()
          )
      )
    )
    OR
    -- Service role can see everything
    (auth.role() = 'service_role'::text)
  );

-- Add helpful comment
COMMENT ON POLICY profiles_select_users ON public.profiles IS
'Allows users to view their own profile and profiles of users at the same school(s). This enables session assignment to SEAs and specialists.';
