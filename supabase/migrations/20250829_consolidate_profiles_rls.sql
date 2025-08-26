-- Consolidate and fix profile RLS policies to avoid conflicts
-- This migration ensures a single, consistent set of policies and helper functions

BEGIN;

-- Drop all potentially conflicting policies
DROP POLICY IF EXISTS "Users can view team members in same school" ON profiles;
DROP POLICY IF EXISTS "Users can view team members in their schools" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles in their schools" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Drop all potentially conflicting functions
DROP FUNCTION IF EXISTS public.get_user_school_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_school_ids() CASCADE;
DROP FUNCTION IF EXISTS public.auth_user_school_ids() CASCADE;

-- Create a single, authoritative security definer function for getting user's schools
-- This handles both single school (profiles.school_id) and multiple schools (provider_schools)
CREATE OR REPLACE FUNCTION public.user_accessible_school_ids()
RETURNS TABLE(school_id uuid)
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

-- Revoke public access and grant to authenticated users only
REVOKE ALL ON FUNCTION public.user_accessible_school_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_accessible_school_ids() TO authenticated;

-- Create consolidated RLS policies for profiles table

-- Policy 1: Users can view their own profile
CREATE POLICY "profiles_view_own" 
ON profiles
FOR SELECT 
USING (auth.uid() = id);

-- Policy 2: Users can update their own profile
CREATE POLICY "profiles_update_own" 
ON profiles
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy 3: Users can view profiles of people in their accessible schools
CREATE POLICY "profiles_view_same_schools" 
ON profiles
FOR SELECT 
USING (
    auth.uid() != id 
    AND school_id IN (SELECT * FROM public.user_accessible_school_ids())
);

-- Policy 4: Users can insert their own profile (for initial setup)
CREATE POLICY "profiles_insert_own"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Policy 5: Service role can do everything (for admin operations)
CREATE POLICY "profiles_service_role_all"
ON profiles
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Add helpful comments
COMMENT ON FUNCTION public.user_accessible_school_ids() IS 
'Consolidated security definer function that returns all school IDs accessible to the current user.
Includes both the primary school from profiles and any additional schools from provider_schools.
Uses SQL language and SECURITY DEFINER to avoid infinite recursion in RLS policies.';

COMMENT ON POLICY "profiles_view_own" ON profiles IS 
'Allow users to view their own profile without any school checks.';

COMMENT ON POLICY "profiles_update_own" ON profiles IS 
'Allow users to update only their own profile with strict checking.';

COMMENT ON POLICY "profiles_view_same_schools" ON profiles IS 
'Allow users to view profiles of other users in their accessible schools.';

COMMENT ON POLICY "profiles_insert_own" ON profiles IS 
'Allow users to create their initial profile during signup.';

COMMENT ON POLICY "profiles_service_role_all" ON profiles IS 
'Allow service role full access for administrative operations.';

COMMIT;