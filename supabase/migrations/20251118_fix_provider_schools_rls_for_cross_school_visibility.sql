-- Fix provider_schools RLS to allow users to see which providers serve their schools
--
-- Issue: The profiles RLS policy couldn't check provider_schools because the
-- provider_schools SELECT policy only allowed users to see their own records.
-- This prevented teachers from seeing resource specialists who serve their school.
--
-- Solution: Allow users to view provider_schools records for schools they have access to.

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view their own schools" ON public.provider_schools;

-- Create new policy that allows viewing provider_schools for accessible schools
CREATE POLICY "Users can view provider_schools for accessible schools" ON public.provider_schools
  FOR SELECT
  USING (
    -- Users can see their own provider_schools
    (provider_id = auth.uid())
    OR
    -- Users can see provider_schools for schools they have access to
    (school_id IN (
      SELECT school_id
      FROM user_accessible_school_ids()
    ))
    OR
    -- Service role can see everything
    (auth.role() = 'service_role'::text)
  );
