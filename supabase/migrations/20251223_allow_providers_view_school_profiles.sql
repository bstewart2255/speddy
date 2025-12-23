-- Allow providers to view other profiles at their school
-- This fixes the "referred by Unknown" issue in CARE where providers
-- couldn't see other users' names due to restrictive RLS policies
--
-- Uses a SECURITY DEFINER helper function to avoid RLS recursion

-- Step 1: Create a helper function to get current user's school IDs (bypasses RLS)
CREATE OR REPLACE FUNCTION get_my_school_ids()
RETURNS TABLE (school_id VARCHAR)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- Get primary school from profile
  SELECT p.school_id
  FROM profiles p
  WHERE p.id = auth.uid() AND p.school_id IS NOT NULL

  UNION

  -- Get secondary schools from provider_schools
  SELECT ps.school_id
  FROM provider_schools ps
  WHERE ps.provider_id = auth.uid()
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_my_school_ids() TO authenticated;

-- Step 2: Create the policy using the helper function
CREATE POLICY "Providers can view profiles at their school"
ON profiles
FOR SELECT
USING (
  school_id IN (SELECT school_id FROM get_my_school_ids())
);
