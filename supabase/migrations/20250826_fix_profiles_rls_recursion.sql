-- Fix the recursive RLS policy issue on profiles table that's causing 500 errors
-- The current policy causes infinite recursion by referencing profiles table within itself

-- First, drop the problematic policy
DROP POLICY IF EXISTS "Users can view team members in same school" ON profiles;

-- Create a security definer function to get the current user's school_id
-- This avoids recursion by executing with elevated privileges
CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    user_school_id uuid;
BEGIN
    SELECT school_id INTO user_school_id
    FROM profiles
    WHERE id = auth.uid()
    LIMIT 1;
    
    RETURN user_school_id;
END;
$$;

-- Grant execute permission to authenticated users
REVOKE ALL ON FUNCTION public.get_user_school_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_school_id() TO authenticated;

-- Create a non-recursive policy using the security definer function
CREATE POLICY "Users can view team members in same school" 
ON profiles
FOR SELECT 
USING (
    -- Allow users to view their own profile
    auth.uid() = id
    OR
    -- Allow viewing profiles in the same school using the security definer function
    (school_id IS NOT NULL AND school_id = public.get_user_school_id())
);

COMMENT ON POLICY "Users can view team members in same school" ON profiles IS 
'Non-recursive policy that uses a security definer function to avoid infinite recursion when checking school membership.';