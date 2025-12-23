-- Fix provider profile visibility for teachers and other users
--
-- Issue: Teachers at Mt. Diablo can't see Blair Stewart's name because his
-- primary school is Bancroft, even though he serves Mt. Diablo as a secondary school.
--
-- Root cause: The provider_schools table has RLS that blocks teachers from
-- seeing provider_schools entries (only providers can see their own entries).
--
-- Solution: Create a SECURITY DEFINER helper function that bypasses RLS on
-- provider_schools to get provider IDs serving the user's schools.

-- Step 1: Create helper function to get providers serving my schools (bypasses RLS)
CREATE OR REPLACE FUNCTION get_providers_at_my_schools()
RETURNS TABLE (provider_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT ps.provider_id
  FROM provider_schools ps
  WHERE ps.school_id IN (SELECT school_id FROM get_my_school_ids())
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_providers_at_my_schools() TO authenticated;

-- Step 2: Drop the old policy
DROP POLICY IF EXISTS "Providers can view profiles at their school" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles at their schools" ON profiles;

-- Step 3: Create enhanced policy using the helper function
CREATE POLICY "Users can view profiles at their schools"
ON profiles
FOR SELECT
USING (
  -- Allow if target's primary school matches my schools
  school_id IN (SELECT school_id FROM get_my_school_ids())

  OR

  -- Allow if target is a provider who serves one of my schools (uses SECURITY DEFINER)
  id IN (SELECT provider_id FROM get_providers_at_my_schools())
);
