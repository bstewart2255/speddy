-- EMERGENCY FIX: Resolve infinite recursion in profiles table RLS policy
-- This is causing 500 errors throughout the application

-- First, drop ALL existing policies on profiles to stop the recursion
DROP POLICY IF EXISTS "Users can view team members in same school" ON profiles;
DROP POLICY IF EXISTS "Users can view team members in their schools" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles in their schools" ON profiles;

-- Drop any existing functions that might be causing issues
DROP FUNCTION IF EXISTS public.get_user_school_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_school_ids() CASCADE;

-- Create a SIMPLE, NON-RECURSIVE security definer function
-- This function runs with elevated privileges to avoid recursion
CREATE OR REPLACE FUNCTION public.auth_user_school_ids()
RETURNS TABLE(school_id varchar)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    -- Direct query without recursion - uses auth.uid() directly
    SELECT DISTINCT school_id::varchar
    FROM (
        -- Get primary school from profiles
        SELECT p.school_id
        FROM public.profiles p
        WHERE p.id = auth.uid() 
        AND p.school_id IS NOT NULL
        
        UNION
        
        -- Get additional schools from provider_schools
        SELECT ps.school_id
        FROM public.provider_schools ps
        WHERE ps.provider_id = auth.uid() 
        AND ps.school_id IS NOT NULL
    ) schools
    WHERE school_id IS NOT NULL;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.auth_user_school_ids() TO authenticated;

-- Create SIMPLE, NON-RECURSIVE policies

-- Policy 1: Users can view their own profile (no recursion possible)
CREATE POLICY "Users can view own profile" 
ON profiles
FOR SELECT 
USING (auth.uid() = id);

-- Policy 2: Users can update their own profile (no recursion possible)
CREATE POLICY "Users can update own profile" 
ON profiles
FOR UPDATE 
USING (auth.uid() = id);

-- Policy 3: Users can view profiles of people in their schools
-- This uses the security definer function to avoid recursion
CREATE POLICY "Users can view profiles in their schools" 
ON profiles
FOR SELECT 
USING (
    -- User's own profile is already handled by the first policy
    auth.uid() != id 
    AND 
    -- Check if the profile's school is in user's schools
    school_id IN (SELECT * FROM public.auth_user_school_ids())
);

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Add helpful comments
COMMENT ON FUNCTION public.auth_user_school_ids() IS 
'Security definer function that returns school IDs for the current user. 
Uses SQL language (not plpgsql) and SECURITY DEFINER to avoid infinite recursion.
This function executes with elevated privileges and does not trigger RLS policies.';

COMMENT ON POLICY "Users can view own profile" ON profiles IS 
'Simple policy allowing users to view their own profile without any recursion.';

COMMENT ON POLICY "Users can update own profile" ON profiles IS 
'Simple policy allowing users to update their own profile without any recursion.';

COMMENT ON POLICY "Users can view profiles in their schools" ON profiles IS 
'Policy allowing users to view profiles of other users in their schools.
Uses security definer function to avoid infinite recursion when checking school membership.';