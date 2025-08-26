-- Fix the conflicting RLS policies and functions from PR 183 and local changes
-- This migration properly handles users with multiple schools via provider_schools

-- First, drop any existing policies and functions that might conflict
DROP POLICY IF EXISTS "Users can view team members in same school" ON profiles;
DROP POLICY IF EXISTS "Users can view team members in their schools" ON profiles;
DROP FUNCTION IF EXISTS public.get_user_school_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_school_ids() CASCADE;

-- Create the proper security definer function that returns all school IDs for a user
-- This supports both single school (profiles.school_id) and multiple schools (provider_schools)
CREATE OR REPLACE FUNCTION public.get_user_school_ids()
RETURNS TABLE(school_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    RETURN QUERY
    -- Get the user's primary school from profiles
    SELECT p.school_id
    FROM profiles p
    WHERE p.id = auth.uid() AND p.school_id IS NOT NULL
    
    UNION
    
    -- Get additional schools from provider_schools
    SELECT ps.school_id
    FROM provider_schools ps
    WHERE ps.provider_id = auth.uid() AND ps.school_id IS NOT NULL;
END;
$$;

-- Grant execute permission to authenticated users
REVOKE ALL ON FUNCTION public.get_user_school_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_school_ids() TO authenticated;

-- Create a non-recursive policy that handles both single and multiple schools
CREATE POLICY "Users can view team members in their schools" 
ON profiles
FOR SELECT 
USING (
    -- Allow users to view their own profile
    auth.uid() = id
    OR
    -- Allow viewing profiles in any of the user's schools
    (school_id IS NOT NULL AND school_id IN (SELECT * FROM public.get_user_school_ids()))
);

-- Ensure the profiles table has RLS enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Add comments for documentation
COMMENT ON FUNCTION public.get_user_school_ids() IS 
'Security definer function that returns all school IDs for the current user, including primary school from profiles and additional schools from provider_schools table. This avoids RLS recursion by using SECURITY DEFINER.';

COMMENT ON POLICY "Users can view team members in their schools" ON profiles IS 
'Non-recursive policy that allows users to view profiles of team members at any school they work at, using a security definer function to avoid infinite recursion when the profiles table references itself in RLS policies.';